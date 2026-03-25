# AI Coding Session Log

**Tools**: Claude (claude.ai) → VS Code Inline Agent (Claude Sonnet) → Claude (claude.ai)
**Date**: March 2026
**Assignment**: Forward Deployed Engineer Take-Home — Graph-Based Data Modeling & Query System

---

## Phase 1 — Architecture & Initial Build (Claude.ai)

**Tool**: claude.ai — conversational session

Uploaded the assignment PDF and reference screenshots directly into Claude.ai and started with architecture before writing any code.

---

**Prompt 1**
> "I am applying for a Forward Deployed Engineer role at Dodge AI. The take-home requires building a Graph-Based Data Modeling & Query System over SAP ERP data. Before writing any code, give me: a full system architecture decision with DB choice and explicit tradeoffs, the folder structure, the graph data model with nodes and edges, and the LLM prompting strategy for NL→SQL including guardrails. Approach this the way a senior engineer would — prioritize correctness and maintainability. We'll build feature by feature after the architecture is locked."

Key decisions Claude made:
- **PostgreSQL over MongoDB/Neo4j** — data is relational, LLMs generate SQL far more reliably than Mongo pipelines or Cypher; graph is built in-memory at runtime from DB reads
- **react-force-graph-2d** — wraps D3 force simulation in a clean React API, matches the reference screenshot aesthetic
- **Groq llama-3.3-70b** — free tier, ~300 tok/s, accurate enough for SQL on a well-defined schema
- **3-stage LLM pipeline**: zero-temp guardrail classifier → NL→SQL generator → answer synthesizer grounded in result rows

---

**Prompt 2**
> "Now design the full entity relationship model for SAP Order-to-Cash. Define every node type, every edge type with its direction and semantic meaning, and the exact color coding per domain. Use the reference screenshot I've attached as the visual target."

Claude designed the full graph schema: Customer, Product, Sales Order, Delivery, Delivery Item, Billing Document, Billing Item, Journal Entry, Payment — with color coding by domain (teal=master data, purple=order flow, coral=fulfillment/billing, amber=finance).

---

**Prompt 3**
> "Design the exact system prompts for both the guardrail classifier and the SQL generator. The classifier must be fast — single token output, zero temperature, binary decision only. The SQL generator must handle: multi-table JOIN chains for flow traces, LEFT JOIN patterns for incomplete flow detection, lookups by specific document IDs, and must never produce INSERT, UPDATE, DELETE or DDL statements under any circumstance."

Claude produced two system prompts: a 5-token zero-temperature binary classifier that rejects off-topic queries before SQL generation runs, and a full SQL generator prompt with the complete schema injected, explicit JOIN patterns for flow traces, LEFT JOIN patterns for gap detection, and a hard block on any mutating statements.

**Files generated in Phase 1**: full backend (schema, ingest, graphBuilder, llmClient, routes, server) + complete React frontend (App, GraphCanvas, ChatPanel, NodeDetail, hooks, API client).

---

## Phase 2 — Containerization, Data Ingestion & Bug Fixes (VS Code Inline Agent)

**Tool**: VS Code with Claude Haiku 4.5 inline agent
**Context**: Opened the Phase 1 codebase in VS Code and switched to the inline agent for local development.

---

**Prompt 1**
> "Act as a senior software engineer. Index the entire backend codebase first, understand the architecture, then fix the following bugs."
*(attached 2 screenshots: PostgreSQL ECONNREFUSED on ::1:5432 and 127.0.0.1:5432, /api/graph returning 500)*

Claude analyzed the full backend, identified the connection pooling issue, added connection state tracking to `db.js`, and fixed the graph route to return proper 503 responses when the database is unavailable instead of crashing with 500.

---

**Prompt 2**
> "I don't have PostgreSQL installed locally — can I use Docker just for the database?"

Claude confirmed Docker works as a drop-in replacement and suggested going further.

> "In that case, containerize the entire project for environment consistency — backend, frontend, database, and reverse proxy."

Claude generated `docker-compose.yml` with 4 services (postgres, backend, frontend, nginx), backend and frontend Dockerfiles, nginx reverse proxy config routing `/api/*` to the backend and `/*` to the frontend, and health checks on all services.

---

**Prompt 3**
> "The data hasn't been ingested yet. Index the `/backend/data` directory, validate that the files are ready for ingestion, preprocess or normalize anything that needs it, then ingest."
*(Error showing was `relation "customers" does not exist`)*

Claude scanned the data directory, found 48 JSONL files organized in named subdirectories, identified the camelCase SAP field naming convention, and completely rewrote `ingest.js` with recursive directory discovery, folder-name-based handler dispatch, dependency-ordered upserts (master data before transactions), FK stub insertion to avoid constraint violations, and automatic schema initialization on startup.

---

**Prompt 4**
> "The graph canvas is stuck at 800×600 regardless of window size, and the default zoom is so far out the nodes are barely visible. Fix both — the canvas must fill the full viewport minus the chat panel, and the initial zoom should make the node cluster clearly readable without any manual interaction."

Fixed by adding a `ResizeObserver` on a wrapper div with `position: absolute; inset: 0`, replacing the static initial dimensions, and adjusting the zoom sequence to `zoomToFit` with tight padding followed by an additional zoom multiplier.

---

**Prompt 5**
> "The ingest is still failing on the real SAP dataset. The files are in named subdirectories — `billing_document_headers/`, `outbound_delivery_headers/`, `journal_entry_items_accounts_receivable/` — and every field name is camelCase SAP convention. Rewrite the ingest script to handle this exact folder structure and field mapping."

Claude rewrote the handler for each folder, mapping exact camelCase SAP fields (`billingDocument`, `soldToParty`, `referenceSdDocument`, `glAccount`) to the snake_case database schema with proper null handling and multi-line JSONL buffer support.

---

**Prompt 6**
> "The graph builder is referencing `sales_order_items` and `billing_documents.order_id` — neither exists in the actual ingested data. Audit every table and column reference in `graphBuilder.js` against the real schema and fix all mismatches."

Claude updated `graphBuilder.js` to remove the non-existent table references, join billing to delivery via `billing_documents.delivery_id`, link journal entries via `reference_document = billing_documents.id`, and added a `linkSet` for deduplication.

---

**Prompt 7**
> "Add prewritten query chips to the chat panel that are visible immediately on load before the user types anything. Ground them in real IDs from the actual dataset — not placeholder data. They should disappear after the first message is sent and execute the query immediately on click without requiring a separate send action."

Claude added a `QueryChips` component with 12 queries referencing real IDs from the dataset (billing document `90504248`, customer `320000083`, delivery `740556`). Chips are visible on load, disappear after the first message, and send immediately on click.

---

**Prompt 8**
> "The LLM is generating SQL that references columns and tables that don't exist in our schema. Rewrite the schema definition in the SQL generator system prompt to exactly match the real table structure — include explicit JOIN patterns for the billing→delivery→journal chain, and document the `accounting_document_type` values so the model understands RV vs DZ."

Claude rewrote `SCHEMA_DEFINITION` in `llmClient.js` with exact column lists per table, real example IDs as context, explicit JOIN pattern documentation, and notes on `accounting_document_type` values (`RV`=billing, `DZ`=payment).

*(Hit inline agent token limit — switched back to claude.ai)*

---

## Phase 3 — Graph Interactivity & UX Fixes (Claude.ai)

**Tool**: claude.ai — back to conversational session after hitting VS Code inline agent context limit

Shared screen recordings and screenshots directly into the conversation to describe issues visually.

---

**Prompt 9**
> "Three issues to fix together: (1) Clicking a node should highlight all its direct neighbors with directional arrows showing relationship flow — currently nothing happens visually. (2) The Expand Neighbors button in the detail panel does nothing when clicked. (3) The legend needs a distinct color per entity type — we have 10 types now and they're being grouped into 4."

Claude diagnosed two bugs: `highlightedNeighbors` prop wasn't being passed to GraphCanvas so the neighbor set was always empty; link source/target become objects after force-graph processing so the ID extraction needed `typeof l.source === 'object' ? l.source.id : l.source`. Rewrote the legend from 4 grouped entries to 10 individual entries in a 2-column grid with distinct colors per type.

---

**Prompt 10**
> "The particle flow on the graph links starts on page load but stops completely after a few seconds — it looks like the visualization broke. The data flow effect should run indefinitely at a low ambient level, never stopping."

Root cause: `cooldownTicks={120}` was stopping the D3 simulation which also killed `linkDirectionalParticles`. Fixed with a perpetual `requestAnimationFrame` loop driving a `pulseRef.phase` counter independently of D3, so the particle effect never stops regardless of simulation state.

---

**Prompt 11**
> "Two fixes needed: (1) The initial graph load animation is jarring — nodes scatter and jump before settling. It should feel smooth and intentional from the first frame. (2) The prewritten query chips are populating the input field instead of submitting directly — a single click should immediately run the query."

Fixed with `warmupTicks={80}` to pre-run the simulation before first paint, delayed zoom to 1200ms, `d3AlphaDecay=0.008` for a smoother deceleration curve. Chip fix: changed `handleChipClick` from `setInput(query)` to `onSend(query)` directly.

---

**Prompt 12**
> "When a node is selected, the edges connecting it to its neighbors need to show directional arrows so the relationship direction is immediately readable — e.g. Customer → Sales Order, not just a line between them."

Added a custom `linkCanvasObject` painter that draws filled triangle arrowheads pointing at the target node, offset by the node radius so it sits cleanly at the boundary. Non-neighbor links dim to near-invisible when a selection is active.

---

## Phase 4 — Final Polish (Claude.ai continued)

---

**Prompt 13**
> "Several issues from the latest screen recording: (1) The canvas is no longer full size — it's shrunk back to a small area. (2) The pulsating effect I want is on the link data flow, not node opacity — nodes should always be fully opaque. (3) Expand Neighbors still shows no visual change after clicking. (4) Directional arrows on selected node connections should persist until I explicitly close the detail panel, not reset on interaction. (5) The default zoom is still too far out — on load, the central node cluster should fill the majority of the canvas."

Five root causes identified and fixed:
1. **Canvas**: `useState({width:800,height:600})` → `useLayoutEffect` reading real DOM dimensions synchronously before first paint
2. **Pulse**: `pulsePhase` RAF now drives only `linkCanvasObject` line brightness and `linkDirectionalParticleWidth` — node `globalAlpha` is always `1.0`
3. **Expand Neighbors**: dedup key was producing `[object Object]-[object Object]` after force-graph converts links to node objects — normalized with `typeof l.source === 'object' ? l.source.id : l.source`
4. **Arrow persistence**: `selectedNodeId` passed as prop to GraphCanvas; `paintLink` checks it directly so arrows persist until the NodeDetail panel is closed
5. **Zoom**: single `zoomToFit(600, 20)` with 20px padding maps the node bounding box directly to the viewport on load

---

## Bonus Features

| Feature | Detail |
|---|---|
| Streaming SSE | `/api/chat/stream` — answer tokens stream in real time |
| Node highlight from chat | Chat response IDs highlight matching nodes on graph |
| Expand on click | NodeDetail "Expand Neighbors" fetches 1-hop from DB |
| SQL transparency | Every response shows the generated SQL (collapsible) |
| Conversation memory | Last 6 exchanges passed as context to SQL generator |
| Prewritten query chips | 12 real queries, execute immediately on click |
| Docker + nginx | Full containerized deployment with health checks |