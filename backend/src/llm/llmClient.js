/**
 * llmClient.js
 * Three-stage pipeline:
 *   1. Guardrail classifier — fast check, rejects off-topic queries
 *   2. SQL generator — NL → PostgreSQL via Groq llama-3.3-70b
 *   3. Answer synthesizer — SQL result rows → natural language
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

// ── Full schema definition for the SQL generator prompt ────────────────────
const SCHEMA_DEFINITION = `
Database: PostgreSQL — SAP Order-to-Cash ERP system (real production data, company code: ABCD, currency: INR)

Tables and columns (all column names are snake_case):

customers(id TEXT PK, name TEXT, country TEXT, region TEXT, city TEXT, postal_code TEXT, street TEXT)
  -- id = businessPartner / customer number e.g. '310000108', '320000083'

products(id TEXT PK, description TEXT, category TEXT, unit TEXT)
  -- id = product/material number e.g. '3001456', 'B8907367002246'
  -- description = human-readable product name e.g. 'WB-CG CHARCOAL GANG'
  -- category = productGroup e.g. 'ZPKG004', 'ZFG1001'

sales_orders(id TEXT PK, customer_id TEXT FK→customers, order_date DATE, status TEXT, currency TEXT)
  -- id = salesDocument/referenceSdDocument e.g. '740556'
  -- NOTE: sales_orders are stubs created from delivery/billing references; most fields may be null

deliveries(id TEXT PK, order_id TEXT FK→sales_orders, actual_delivery_date DATE, planned_delivery_date DATE, shipping_point TEXT, delivery_type TEXT, overall_status TEXT)
  -- id = deliveryDocument e.g. '80737721', '80738076'
  -- overall_status: 'A'=not started, 'B'=partial, 'C'=complete

delivery_items(id TEXT PK, delivery_id TEXT FK→deliveries, order_item_id TEXT, product_id TEXT FK→products, delivered_quantity NUMERIC, unit TEXT, plant TEXT, storage_location TEXT)
  -- id = 'deliveryDocument-deliveryDocumentItem' e.g. '80737721-000010'

billing_documents(id TEXT PK, delivery_id TEXT FK→deliveries, customer_id TEXT FK→customers, billing_date DATE, net_amount NUMERIC, currency TEXT, billing_type TEXT, company_code TEXT, accounting_document TEXT)
  -- id = billingDocument e.g. '90504248', '90628265'
  -- billing_type: 'F2'=standard invoice, 'S1'=cancellation
  -- accounting_document links to journal_entries (e.g. '9400000249')
  -- net_amount is in INR

billing_items(id TEXT PK, billing_doc_id TEXT FK→billing_documents, product_id TEXT FK→products, quantity NUMERIC, net_value NUMERIC, currency TEXT)
  -- id = 'billingDocument-billingDocumentItem'

journal_entries(id TEXT PK, billing_doc_id TEXT FK→billing_documents, company_code TEXT, fiscal_year TEXT, gl_account TEXT, reference_document TEXT, profit_center TEXT, transaction_currency TEXT, amount_in_transaction_currency NUMERIC, company_code_currency TEXT, amount_in_company_code_currency NUMERIC, posting_date DATE, document_date DATE, accounting_document_type TEXT, accounting_document_item TEXT)
  -- id = 'accountingDocument-accountingDocumentItem' e.g. '9400000249-1'
  -- reference_document = billingDocument id (FK back to billing_documents.id)
  -- accounting_document_type: 'RV'=billing invoice, 'DZ'=incoming payment
  -- gl_account: '15500020' = accounts receivable

payments(id TEXT PK, customer_id TEXT FK→customers, payment_date DATE, amount NUMERIC, currency TEXT, clearing_document TEXT)
  -- id = 'accountingDocument-accountingDocumentItem'
  -- clearing_document = the accounting document that cleared this payment
  -- amount may be negative (credit) or positive (debit)

Key relationships and how to JOIN:
1. Delivery → Billing: billing_documents.delivery_id = deliveries.id
2. Billing → Journal Entry: journal_entries.reference_document = billing_documents.id
3. Billing → Journal (alt): journal_entries.billing_doc_id = billing_documents.id
4. Customer → Billing: billing_documents.customer_id = customers.id
5. Customer → Payment: payments.customer_id = customers.id
6. Billing Item → Product: billing_items.product_id = products.id
7. Delivery Item → Product: delivery_items.product_id = products.id

Flow trace query pattern (Delivery → Billing → Journal Entry):
  SELECT d.id as delivery, bd.id as billing_doc, bd.net_amount, je.id as journal_entry, je.amount_in_transaction_currency
  FROM deliveries d
  LEFT JOIN billing_documents bd ON bd.delivery_id = d.id
  LEFT JOIN journal_entries je ON je.reference_document = bd.id
  WHERE d.id = '<id>'

Incomplete flow detection:
  -- Delivered but not billed: LEFT JOIN billing_documents ON delivery_id, WHERE billing_documents.id IS NULL
  -- Billed but no journal entry: LEFT JOIN journal_entries ON reference_document, WHERE journal_entries.id IS NULL
`;

// ── Stage 1: Guardrail classifier ──────────────────────────────────────────
export async function classifyQuery(userMessage) {
  const prompt = `You are a strict domain classifier for an SAP Order-to-Cash ERP analytics system.
The system only answers questions about: sales orders, deliveries, billing documents, invoice numbers, journal entries, payments, customers, products, materials, plants, company codes, fiscal years, accounting documents, and related ERP business process data.

Classify the user message as:
- RELEVANT: Any question about business entities, transactions, flows, amounts, dates, statuses, or analysis within the Order-to-Cash domain described above.
- IRRELEVANT: General knowledge, creative writing, coding help, math problems, personal questions, weather, news, or anything unrelated to the ERP dataset.

User message: "${userMessage}"

Respond with ONLY one word: RELEVANT or IRRELEVANT`;

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 5,
    temperature: 0,
  });
  return res.choices[0]?.message?.content?.trim().toUpperCase() === 'RELEVANT';
}

// ── Stage 2: SQL generator ─────────────────────────────────────────────────
export async function generateSQL(userQuestion, conversationHistory = []) {
  const systemPrompt = `You are an expert PostgreSQL query generator for a real SAP Order-to-Cash ERP system.

${SCHEMA_DEFINITION}

Rules you MUST follow:
1. Return ONLY valid PostgreSQL SQL. No markdown, no code fences, no explanation, no preamble.
2. Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE or any data-modifying statement.
3. Always add LIMIT 100 unless the query is a pure aggregate (COUNT, SUM, AVG, MAX, MIN).
4. Column names are always snake_case (e.g. net_amount, billing_date, reference_document).
5. For "trace full flow" of a billing document: JOIN deliveries ON billing_documents.delivery_id = deliveries.id, then JOIN journal_entries ON journal_entries.reference_document = billing_documents.id.
6. For incomplete flows: use LEFT JOIN and filter WHERE the right-side id IS NULL.
7. For product-level analysis: JOIN billing_items ON billing_doc_id, then JOIN products ON product_id.
8. When referencing a specific ID the user provides, use WHERE id = 'that_id' or WHERE reference_document = 'that_id'.
9. Cast date columns to ::text when selecting (e.g. billing_date::text) to avoid serialization issues.
10. The main join between billing and journal: journal_entries.reference_document = billing_documents.id.
11. If a question cannot be answered with the schema, return exactly: CANNOT_ANSWER
12. For "total amount" queries always SUM(net_amount) or SUM(amount_in_transaction_currency) and include currency.
13. Do not reference tables or columns that don't exist in the schema above.`;

  const messages = [
    ...conversationHistory.slice(-4).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: `Generate SQL for: ${userQuestion}` }
  ];

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 600,
    temperature: 0.1,
  });

  let sql = res.choices[0]?.message?.content?.trim() || '';
  // Strip any accidental markdown fences
  sql = sql.replace(/```sql/gi, '').replace(/```/g, '').trim();
  return sql;
}

// ── Stage 3: Answer synthesizer ────────────────────────────────────────────
export async function synthesizeAnswer(userQuestion, sql, queryResults, rowCount) {
  const systemPrompt = `You are a concise business analyst answering questions about an Order-to-Cash ERP dataset.
You have access to query results from a PostgreSQL database.
Rules:
- Answer in 2–4 sentences max, unless listing items.
- Be specific: include actual IDs, amounts, dates, and counts from the data.
- If results are empty, say "No matching records found" and briefly explain why.
- Do not make up data not present in the results.
- Format amounts with their currency where available.
- For flow traces, describe the chain: Sales Order → Delivery → Billing → Journal Entry.`;

  const resultSummary = rowCount === 0
    ? 'No rows returned.'
    : `${rowCount} rows returned. First ${Math.min(rowCount, 10)} rows:\n${JSON.stringify(queryResults.slice(0, 10), null, 2)}`;

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `User asked: "${userQuestion}"\n\nSQL executed:\n${sql}\n\nResults:\n${resultSummary}\n\nProvide a clear, data-backed answer.` }
    ],
    max_tokens: 400,
    temperature: 0.3,
  });
  return res.choices[0]?.message?.content?.trim() || 'Unable to generate answer.';
}

// ── Streaming answer synthesizer (bonus feature) ───────────────────────────
export async function* synthesizeAnswerStream(userQuestion, sql, queryResults, rowCount) {
  const resultSummary = rowCount === 0
    ? 'No rows returned.'
    : `${rowCount} rows. Sample:\n${JSON.stringify(queryResults.slice(0, 10), null, 2)}`;

  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are a concise ERP business analyst. Answer based ONLY on the provided query results. 2-4 sentences. Include specific IDs, amounts, dates.' },
      { role: 'user', content: `Question: "${userQuestion}"\nSQL: ${sql}\nResults: ${resultSummary}\nAnswer:` }
    ],
    max_tokens: 400,
    temperature: 0.3,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) yield delta;
  }
}
