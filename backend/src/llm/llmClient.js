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
Database: PostgreSQL — Order-to-Cash ERP system (SAP-like data)

Tables and columns:

customers(id TEXT PK, name TEXT, country TEXT, region TEXT, city TEXT, postal_code TEXT, street TEXT)
products(id TEXT PK, description TEXT, category TEXT, unit TEXT)
sales_orders(id TEXT PK, customer_id TEXT FK→customers, order_date DATE, delivery_date DATE, status TEXT, sales_org TEXT, distribution_channel TEXT, division TEXT, total_net_value NUMERIC, currency TEXT)
sales_order_items(id TEXT PK, order_id TEXT FK→sales_orders, product_id TEXT FK→products, item_number TEXT, quantity NUMERIC, unit TEXT, net_value NUMERIC, net_price NUMERIC, currency TEXT, plant TEXT, storage_location TEXT)
deliveries(id TEXT PK, order_id TEXT FK→sales_orders, customer_id TEXT FK→customers, actual_delivery_date DATE, planned_delivery_date DATE, ship_to_party TEXT, shipping_point TEXT, plant TEXT, delivery_type TEXT, overall_status TEXT)
delivery_items(id TEXT PK, delivery_id TEXT FK→deliveries, order_item_id TEXT, product_id TEXT FK→products, delivered_quantity NUMERIC, unit TEXT, plant TEXT, storage_location TEXT)
billing_documents(id TEXT PK, order_id TEXT FK→sales_orders, delivery_id TEXT FK→deliveries, customer_id TEXT FK→customers, billing_date DATE, net_amount NUMERIC, tax_amount NUMERIC, currency TEXT, billing_type TEXT, company_code TEXT)
billing_items(id TEXT PK, billing_doc_id TEXT FK→billing_documents, product_id TEXT FK→products, quantity NUMERIC, net_value NUMERIC, currency TEXT, plant TEXT)
journal_entries(id TEXT PK, billing_doc_id TEXT FK→billing_documents, company_code TEXT, fiscal_year TEXT, gl_account TEXT, reference_document TEXT, cost_center TEXT, profit_center TEXT, transaction_currency TEXT, amount_in_transaction_currency NUMERIC, company_code_currency TEXT, amount_in_company_code_currency NUMERIC, posting_date DATE, document_date DATE, accounting_document_type TEXT, accounting_document_item TEXT)
payments(id TEXT PK, billing_doc_id TEXT FK→billing_documents, customer_id TEXT FK→customers, payment_date DATE, amount NUMERIC, currency TEXT, payment_method TEXT, clearing_document TEXT)

Key relationships:
- Customer → places → Sales Order → has → Sales Order Items → reference → Products
- Sales Order → fulfilled_by → Delivery → invoiced_from → Billing Document
- Billing Document → posted_to → Journal Entry (accounting_document_type='RV' means billing, 'DZ' means payment)
- Billing Document → cleared_by → Payment
- journal_entries.reference_document links back to billing_documents.id
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
  const systemPrompt = `You are an expert PostgreSQL query generator for an SAP-like Order-to-Cash ERP system.

${SCHEMA_DEFINITION}

Rules you MUST follow:
1. Return ONLY valid PostgreSQL SQL. No markdown, no code fences, no explanation, no preamble.
2. Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE or any data-modifying statement.
3. Always add LIMIT 100 unless the query is an aggregate (COUNT, SUM, AVG, etc.).
4. For "trace the full flow" queries, JOIN: sales_orders → deliveries → billing_documents → journal_entries.
5. For incomplete flows, use LEFT JOINs and filter WHERE the right-side id IS NULL.
6. If the question references a specific ID (like a billing document number), use WHERE id = 'that_number' or WHERE reference_document = 'that_number'.
7. Use lowercase table/column names exactly as defined above.
8. If the question cannot be answered with the available schema, return exactly: CANNOT_ANSWER
9. Cast dates to ::text when selecting them to avoid serialization issues.
10. For "which products have most billing documents", JOIN billing_items → products, GROUP BY product, ORDER BY COUNT DESC.`;

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
