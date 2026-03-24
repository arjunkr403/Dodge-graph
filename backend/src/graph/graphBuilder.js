/**
 * graphBuilder.js
 * Reads PostgreSQL and constructs a force-graph compatible {nodes, links} object.
 * Nodes = business entities. Links = foreign key relationships.
 * Cached in memory, refreshed on demand.
 */

import pool from '../config/db.js';

// Color palette per entity type (matches frontend legend)
const NODE_COLORS = {
  customer:          '#1D9E75',  // teal
  product:           '#1D9E75',
  sales_order:       '#7F77DD',  // purple
  sales_order_item:  '#AFA9EC',
  delivery:          '#D85A30',  // coral
  delivery_item:     '#F0997B',
  billing_document:  '#D85A30',
  billing_item:      '#F0997B',
  journal_entry:     '#BA7517',  // amber
  payment:           '#EF9F27',
};

const NODE_SIZES = {
  customer: 8, product: 6,
  sales_order: 7, sales_order_item: 4,
  delivery: 7, delivery_item: 4,
  billing_document: 7, billing_item: 4,
  journal_entry: 6, payment: 6,
};

let cachedGraph = null;
let lastBuilt = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function buildGraph() {
  const nodes = [];
  const links = [];
  const nodeSet = new Set();

  function addNode(id, type, label, data = {}) {
    if (nodeSet.has(id)) return;
    nodeSet.add(id);
    nodes.push({
      id,
      type,
      label: label || id,
      color: NODE_COLORS[type] || '#888',
      size: NODE_SIZES[type] || 5,
      data,
    });
  }

  function addLink(source, target, relation) {
    if (!source || !target) return;
    links.push({ source, target, relation });
  }

  // ── Customers ──────────────────────────────────────────────
  const customers = await pool.query(`SELECT id, name, country, region FROM customers LIMIT 500`);
  for (const r of customers.rows) {
    addNode(r.id, 'customer', r.name || r.id, r);
  }

  // ── Products ───────────────────────────────────────────────
  const products = await pool.query(`SELECT id, description, category FROM products LIMIT 500`);
  for (const r of products.rows) {
    addNode(r.id, 'product', r.description || r.id, r);
  }

  // ── Sales Orders ───────────────────────────────────────────
  const orders = await pool.query(`
    SELECT id, customer_id, order_date, status, total_net_value, currency
    FROM sales_orders LIMIT 1000
  `);
  for (const r of orders.rows) {
    addNode(r.id, 'sales_order', `SO ${r.id}`, r);
    addLink(r.customer_id, r.id, 'placed');
  }

  // ── Sales Order Items ──────────────────────────────────────
  const soItems = await pool.query(`
    SELECT id, order_id, product_id, quantity, net_value FROM sales_order_items LIMIT 2000
  `);
  for (const r of soItems.rows) {
    addNode(r.id, 'sales_order_item', `Item ${r.id.split('-')[1] || r.id}`, r);
    addLink(r.order_id, r.id, 'has_item');
    if (r.product_id) addLink(r.id, r.product_id, 'ordered_product');
  }

  // ── Deliveries ─────────────────────────────────────────────
  const deliveries = await pool.query(`
    SELECT id, order_id, customer_id, actual_delivery_date, plant, overall_status
    FROM deliveries LIMIT 1000
  `);
  for (const r of deliveries.rows) {
    addNode(r.id, 'delivery', `DEL ${r.id}`, r);
    if (r.order_id) addLink(r.order_id, r.id, 'fulfilled_by');
    if (r.customer_id) addLink(r.customer_id, r.id, 'delivered_to');
  }

  // ── Billing Documents ──────────────────────────────────────
  const billings = await pool.query(`
    SELECT id, order_id, delivery_id, customer_id, billing_date, net_amount, currency, billing_type
    FROM billing_documents LIMIT 1000
  `);
  for (const r of billings.rows) {
    addNode(r.id, 'billing_document', `BILL ${r.id}`, r);
    if (r.order_id) addLink(r.order_id, r.id, 'billed_as');
    if (r.delivery_id) addLink(r.delivery_id, r.id, 'invoiced_from');
  }

  // ── Journal Entries ────────────────────────────────────────
  const journals = await pool.query(`
    SELECT id, billing_doc_id, gl_account, amount_in_transaction_currency,
           transaction_currency, posting_date, accounting_document_type
    FROM journal_entries LIMIT 2000
  `);
  for (const r of journals.rows) {
    addNode(r.id, 'journal_entry', `JE ${r.id}`, r);
    if (r.billing_doc_id) addLink(r.billing_doc_id, r.id, 'posted_to');
  }

  // ── Payments ───────────────────────────────────────────────
  const payments = await pool.query(`
    SELECT id, billing_doc_id, customer_id, payment_date, amount, currency
    FROM payments LIMIT 1000
  `);
  for (const r of payments.rows) {
    addNode(r.id, 'payment', `PAY ${r.id}`, r);
    if (r.billing_doc_id) addLink(r.billing_doc_id, r.id, 'cleared_by');
    if (r.customer_id) addLink(r.customer_id, r.id, 'paid_by');
  }

  return { nodes, links, meta: { nodeCount: nodes.length, linkCount: links.length, builtAt: new Date().toISOString() } };
}

export async function getGraph(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedGraph && lastBuilt && (now - lastBuilt) < CACHE_TTL_MS) {
    return cachedGraph;
  }
  cachedGraph = await buildGraph();
  lastBuilt = now;
  return cachedGraph;
}

// Get 1-hop neighborhood of a node for expand-on-click
export async function getNodeNeighborhood(nodeId, nodeType) {
  const tables = {
    sales_order: `
      SELECT 'sales_order_item' as type, id, order_id as parent_id FROM sales_order_items WHERE order_id=$1
      UNION ALL
      SELECT 'delivery', id, order_id FROM deliveries WHERE order_id=$1
      UNION ALL
      SELECT 'billing_document', id, order_id FROM billing_documents WHERE order_id=$1
    `,
    delivery: `
      SELECT 'billing_document' as type, id, delivery_id as parent_id FROM billing_documents WHERE delivery_id=$1
    `,
    billing_document: `
      SELECT 'journal_entry' as type, id, billing_doc_id as parent_id FROM journal_entries WHERE billing_doc_id=$1
      UNION ALL
      SELECT 'payment', id, billing_doc_id FROM payments WHERE billing_doc_id=$1
    `,
    customer: `
      SELECT 'sales_order' as type, id, customer_id as parent_id FROM sales_orders WHERE customer_id=$1 LIMIT 20
      UNION ALL
      SELECT 'delivery', id, customer_id FROM deliveries WHERE customer_id=$1 LIMIT 20
    `,
  };

  const q = tables[nodeType];
  if (!q) return { nodes: [], links: [] };

  const result = await pool.query(q, [nodeId]);
  const nodes = result.rows.map(r => ({
    id: r.id,
    type: r.type,
    label: `${r.type.replace('_', ' ').toUpperCase()} ${r.id}`,
    color: NODE_COLORS[r.type] || '#888',
    size: NODE_SIZES[r.type] || 5,
  }));
  const links = result.rows.map(r => ({ source: nodeId, target: r.id, relation: 'related' }));
  return { nodes, links };
}
