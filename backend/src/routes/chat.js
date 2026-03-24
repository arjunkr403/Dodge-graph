import express from 'express';
import pool from '../config/db.js';
import { classifyQuery, generateSQL, synthesizeAnswer, synthesizeAnswerStream } from '../llm/llmClient.js';

const router = express.Router();

// POST /api/chat — main chat endpoint (non-streaming)
router.post('/', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // ── Stage 1: Guardrail ──────────────────────────────────
    const isRelevant = await classifyQuery(message);
    if (!isRelevant) {
      return res.json({
        answer: "This system is designed to answer questions related to the Order-to-Cash ERP dataset only. Please ask about sales orders, deliveries, billing documents, payments, customers, or products.",
        sql: null,
        rows: [],
        rowCount: 0,
        blocked: true,
      });
    }

    // ── Stage 2: Generate SQL ───────────────────────────────
    const sql = await generateSQL(message, history);

    if (sql === 'CANNOT_ANSWER') {
      return res.json({
        answer: "I couldn't find a way to answer that with the available data. Try rephrasing or asking about specific IDs, dates, or entity types.",
        sql: null,
        rows: [],
        rowCount: 0,
      });
    }

    // Safety check — block any mutating SQL that slipped through
    const normalized = sql.toUpperCase();
    if (/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)/.test(normalized)) {
      return res.status(400).json({ error: 'Only read queries are permitted.' });
    }

    // ── Stage 3: Execute SQL ────────────────────────────────
    let rows = [], rowCount = 0;
    try {
      const result = await pool.query(sql);
      rows = result.rows;
      rowCount = result.rowCount;
    } catch (dbErr) {
      // If SQL has errors, try to recover with a simpler fallback
      console.error('SQL execution error:', dbErr.message, '\nSQL:', sql);
      return res.json({
        answer: `I generated a query but it had an issue: ${dbErr.message}. Please try rephrasing your question.`,
        sql,
        rows: [],
        rowCount: 0,
        error: dbErr.message,
      });
    }

    // ── Stage 4: Synthesize answer ──────────────────────────
    const answer = await synthesizeAnswer(message, sql, rows, rowCount);

    res.json({ answer, sql, rows: rows.slice(0, 50), rowCount });

  } catch (err) {
    console.error('Chat pipeline error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// POST /api/chat/stream — streaming version (bonus feature)
router.post('/stream', async (req, res) => {
  const { message, history = [] } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const isRelevant = await classifyQuery(message);
    if (!isRelevant) {
      send('blocked', { message: "This system is designed to answer questions related to the Order-to-Cash ERP dataset only." });
      res.end();
      return;
    }

    const sql = await generateSQL(message, history);
    send('sql', { sql });

    if (sql === 'CANNOT_ANSWER') {
      send('done', { answer: "I couldn't find a way to answer that with the available data." });
      res.end();
      return;
    }

    let rows = [], rowCount = 0;
    try {
      const result = await pool.query(sql);
      rows = result.rows;
      rowCount = result.rowCount;
    } catch (dbErr) {
      send('error', { message: dbErr.message });
      res.end();
      return;
    }

    send('results', { rows: rows.slice(0, 50), rowCount });

    // Stream the answer token by token
    send('answer_start', {});
    for await (const token of synthesizeAnswerStream(message, sql, rows, rowCount)) {
      send('token', { text: token });
    }
    send('done', {});
    res.end();

  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
});

// GET /api/chat/suggestions — example queries for the UI
router.get('/suggestions', (req, res) => {
  res.json([
    "Which products are associated with the highest number of billing documents?",
    "Trace the full flow of billing document 91150187",
    "Show sales orders that were delivered but never billed",
    "What is the total billed amount per customer?",
    "Which deliveries have no corresponding billing document?",
    "Show me all journal entries for billing document 91150187",
    "Which sales orders have the highest net value?",
    "List payments received in the last fiscal year",
    "What are the top 10 products by quantity ordered?",
    "Show sales orders billed without a delivery",
  ]);
});

export default router;
