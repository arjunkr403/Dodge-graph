# Dodge Graph — Order to Cash

A graph-based data modeling and query system over SAP-like ERP data, with an LLM-powered conversational interface.

---

## Architecture

### Stack
- **Backend**: Node.js + Express (ESM)
- **Database**: PostgreSQL
- **LLM**: Groq (`llama-3.3-70b-versatile`) — free tier, ~300 tokens/s
- **Frontend**: React + Vite + `react-force-graph-2d`

### Why PostgreSQL over a graph DB?

The data is fundamentally relational with shallow traversal depth (≤5 hops: Customer → SO → Delivery → Billing → Journal). PostgreSQL with proper foreign keys _is_ a relational graph. Benefits:

- LLMs generate accurate SQL; Cypher generation is far less reliable
- JOIN-based path traversal is fast at this data scale
- Free tier on Supabase/Railway, zero additional infrastructure
- The graph is built **at runtime** in memory from DB reads — best of both worlds

An in-memory adjacency structure (`graphBuilder.js`) is constructed from DB queries and served to the frontend. It's cached for 5 minutes and refreshed on demand.

### LLM Pipeline (3 stages)

```
User Input
    │
    ▼
[Stage 1] Guardrail Classifier
    │  Fast binary check (5 tokens, temp=0)
    │  IRRELEVANT → reject with domain message
    ▼
[Stage 2] NL → SQL Generator
    │  Full schema injected in system prompt
    │  Returns raw PostgreSQL only (no markdown)
    │  Handles: aggregates, JOINs, flow traces, LEFT JOINs for gaps
    ▼
[Stage 3] SQL Execution (PostgreSQL)
    │  Read-only guard before execution
    │  Returns rows[]
    ▼
[Stage 4] Answer Synthesizer
    │  Rows + original question → natural language
    │  Grounded: only references data in results
    ▼
Response { answer, sql, rows, rowCount }
```

**Bonus**: `/api/chat/stream` SSE endpoint streams answer tokens in real time.

### Guardrails

Two layers of protection:

1. **LLM classifier** (Stage 1): A zero-temperature binary classification prompt using 5 tokens. Catches off-topic prompts before expensive SQL generation.
2. **Server-side SQL guard**: Regex check blocks any mutating SQL (`INSERT/UPDATE/DELETE/DROP`) that might slip through prompt injection.

Domain scope: Sales Orders, Deliveries, Billing Documents, Journal Entries, Payments, Customers, Products.

### Graph Model

```
Customer ──────────────────────► Sales Order ──► Sales Order Item ──► Product
    │                                  │
    │                                  ▼
    └──────────────────────────► Delivery ──────────────────────────┐
                                                                      ▼
                                                             Billing Document
                                                              │           │
                                                              ▼           ▼
                                                        Journal Entry   Payment
```

Nodes are colored by domain:
- 🟢 Teal: Master data (Customer, Product)
- 🟣 Purple: Order flow (Sales Order, SO Item)
- 🟠 Coral: Fulfillment (Delivery, Billing Doc)
- 🟡 Amber: Finance (Journal Entry, Payment)

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (local or [Railway](https://railway.app) / [Supabase](https://supabase.com) free tier)
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone & install

```bash
git clone <your-repo>
cd dodge-graph

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://user:pass@host:5432/dodge_graph
#   GROQ_API_KEY=gsk_...
#   PORT=3001
```

### 3. Place your data

```bash
# Copy all .jsonl files into:
backend/data/
```

File naming hints (for load-order sorting):
- `customers.jsonl`, `products.jsonl`
- `sales_orders.jsonl`, `sales_order_items.jsonl`
- `deliveries.jsonl`, `delivery_items.jsonl`
- `billing_documents.jsonl`, `billing_items.jsonl`
- `journal_entries.jsonl`
- `payments.jsonl`

### 4. Initialize DB and ingest data

```bash
cd backend
npm run ingest
```

This will:
1. Run `schema.sql` to create all tables and indexes
2. Auto-detect entity type from each JSONL record
3. Upsert all records with FK safety (stubs inserted as needed)

### 5. Start the servers

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

App runs at **http://localhost:5173**

---

## Deployment (Render + Railway — both free tiers)

### Backend on Render
- Build command: `cd backend && npm install`
- Start command: `cd backend && npm start`
- Add env vars: `DATABASE_URL`, `GROQ_API_KEY`, `FRONTEND_URL`

### Frontend on Vercel / Netlify
- Root: `frontend/`
- Build: `npm run build`
- Output: `dist/`
- Add env var: `VITE_API_URL=https://your-backend.onrender.com`
- Update `vite.config.js` proxy to use `VITE_API_URL`

---

## Example Queries

| Question | What it tests |
|---|---|
| "Which products have the most billing documents?" | Aggregate + JOIN |
| "Trace the full flow of billing document 91150187" | Multi-table JOIN chain |
| "Show sales orders delivered but never billed" | LEFT JOIN gap detection |
| "What is total billed amount per customer?" | GROUP BY + SUM |
| "List all journal entries for fiscal year 2025" | Date filter |
| "Write me a poem" | Guardrail rejection |
| "What is the capital of France?" | Guardrail rejection |

---

## Bonus Features Implemented

- **Streaming responses** — `/api/chat/stream` SSE endpoint
- **Node highlight** — chat responses highlight matching nodes on graph
- **Expand on click** — node detail panel with "Expand Neighbors" loads 1-hop neighborhood
- **Conversation memory** — last 6 exchanges passed as context to SQL generator
- **SQL transparency** — every response shows the generated SQL (expandable)
- **Data table** — raw result rows viewable inline in chat

---

## AI Coding Session

Built with Claude (Anthropic) as the primary AI coding assistant. Session logs included in `ai-session-log.md`.
