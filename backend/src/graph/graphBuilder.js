/**
 * graphBuilder.js
 * Reads PostgreSQL and constructs a force-graph compatible {nodes, links} object.
 * Updated to match real SAP O2C schema — no sales_order_items table in real data.
 */

import pool from '../config/db.js';

const NODE_COLORS = {
  customer:          '#1D9E75',  // teal
  product:           '#1D9E75',
  sales_order:       '#7F77DD',  // purple
  sales_order_item:  '#AFA9EC',  // light purple
  delivery:          '#D85A30',  // coral
  delivery_item:     '#F0997B',
  billing_document:  '#D85A30',
  billing_item:      '#F0997B',
  journal_entry:     '#BA7517',  // amber
  payment:           '#EF9F27',
};

const NODE_SIZES = {
  customer: 9, product: 6,
  sales_order: 7, sales_order_item: 3,
  delivery: 7, delivery_item: 3,
  billing_document: 8, billing_item: 3,
  journal_entry: 6, payment: 6,
};

let cachedGraph = null;
let lastBuilt = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildGraph() {
  const nodes = [];
  const links = [];
  const nodeSet = new Set();
  const linkSet = new Set();

  function addNode(id, type, label, data = {}) {
    if (!id || nodeSet.has(id)) return;
    nodeSet.add(id);
    nodes.push({ id, type, label: label || id, color: NODE_COLORS[type] || '#888', size: NODE_SIZES[type] || 5, data });
  }

  function addLink(source, target, relation) {
    if (!source || !target) return;
    const key = `${source}→${target}`;
    if (linkSet.has(key)) return;
    linkSet.add(key);
    links.push({ source, target, relation });
  }

  // ── Customers ──────────────────────────────────────────────
  const customers = await pool.query(`SELECT id, name, country, city FROM customers LIMIT 500`);
  for (const r of customers.rows) {
    addNode(r.id, 'customer', r.name || `Customer ${r.id}`, r);
  }

  // ── Products ───────────────────────────────────────────────
  const products = await pool.query(`SELECT id, description, category, unit FROM products LIMIT 500`);
  for (const r of products.rows) {
    addNode(r.id, 'product', r.description || r.id, r);
  }

  // ── Sales Orders (real data from sales_order_headers) ─────
  const orders = await pool.query(`
    SELECT id, customer_id, order_date::text, status, currency, total_net_value
    FROM sales_orders WHERE total_net_value IS NOT NULL LIMIT 300
  `);
  for (const r of orders.rows) {
    addNode(r.id, 'sales_order', `SO ${r.id}`, r);
    if (r.customer_id) addLink(r.customer_id, r.id, 'placed');
  }

  // ── Sales Order Items ─────────────────────────────────────
  const soItems = await pool.query(`
    SELECT id, order_id, product_id, quantity, net_value, unit
    FROM sales_order_items LIMIT 300
  `);
  for (const r of soItems.rows) {
    addNode(r.id, 'sales_order_item', `SOI ${r.id}`, r);
    if (r.order_id) addLink(r.order_id, r.id, 'has_item');
    if (r.product_id) addLink(r.id, r.product_id, 'orders_product');
  }

  // ── Deliveries ─────────────────────────────────────────────
  const deliveries = await pool.query(`
    SELECT id, order_id, actual_delivery_date::text, shipping_point, overall_status
    FROM deliveries LIMIT 500
  `);
  for (const r of deliveries.rows) {
    addNode(r.id, 'delivery', `DEL ${r.id}`, r);
    if (r.order_id) addLink(r.order_id, r.id, 'fulfilled_by');
  }

  // ── Delivery Items → Products ──────────────────────────────
  const delItems = await pool.query(`
    SELECT di.id, di.delivery_id, di.product_id, di.delivered_quantity, di.unit
    FROM delivery_items di LIMIT 500
  `);
  for (const r of delItems.rows) {
    addNode(r.id, 'delivery_item', `DI ${r.id}`, r);
    addLink(r.delivery_id, r.id, 'contains');
    if (r.product_id) addLink(r.id, r.product_id, 'item_product');
  }

  // ── Billing Documents ──────────────────────────────────────
  const billings = await pool.query(`
    SELECT id, delivery_id, customer_id, billing_date::text, net_amount, currency, billing_type, company_code, accounting_document
    FROM billing_documents LIMIT 500
  `);
  for (const r of billings.rows) {
    addNode(r.id, 'billing_document', `BILL ${r.id}`, r);
    if (r.delivery_id) addLink(r.delivery_id, r.id, 'invoiced_as');
    if (r.customer_id) addLink(r.customer_id, r.id, 'billed_to');
  }

  // ── Billing Items → Products ───────────────────────────────
  const billItems = await pool.query(`
    SELECT bi.id, bi.billing_doc_id, bi.product_id, bi.quantity, bi.net_value, bi.currency
    FROM billing_items bi LIMIT 500
  `);
  for (const r of billItems.rows) {
    addNode(r.id, 'billing_item', `BI ${r.id}`, r);
    addLink(r.billing_doc_id, r.id, 'line_item');
    if (r.product_id) addLink(r.id, r.product_id, 'billed_product');
  }

  // ── Journal Entries ────────────────────────────────────────
  const journals = await pool.query(`
    SELECT id, billing_doc_id, reference_document, gl_account,
           amount_in_transaction_currency, transaction_currency,
           posting_date::text, accounting_document_type
    FROM journal_entries LIMIT 500
  `);
  for (const r of journals.rows) {
    addNode(r.id, 'journal_entry', `JE ${r.id}`, r);
    // Link via reference_document (billing doc id) if billing_doc_id is missing
    const billingLink = r.billing_doc_id || r.reference_document;
    if (billingLink) addLink(billingLink, r.id, 'posted_to_gl');
  }

  // ── Payments ───────────────────────────────────────────────
  const payments = await pool.query(`
    SELECT id, customer_id, payment_date::text, amount, currency, clearing_document
    FROM payments LIMIT 500
  `);
  for (const r of payments.rows) {
    addNode(r.id, 'payment', `PAY ${r.id}`, r);
    if (r.customer_id) addLink(r.customer_id, r.id, 'paid_by');
  }

  return {
    nodes,
    links,
    meta: { nodeCount: nodes.length, linkCount: links.length, builtAt: new Date().toISOString() }
  };
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

export async function getNodeNeighborhood(nodeId, nodeType) {
  const queries = {
    customer: `
      SELECT 'billing_document' as type, id FROM billing_documents WHERE customer_id=$1 LIMIT 15
      UNION ALL
      SELECT 'sales_order', id FROM sales_orders WHERE customer_id=$1 LIMIT 10
      UNION ALL
      SELECT 'payment', id FROM payments WHERE customer_id=$1 LIMIT 10
    `,
    delivery: `
      SELECT 'billing_document' as type, id FROM billing_documents WHERE delivery_id=$1 LIMIT 10
      UNION ALL
      SELECT 'delivery_item', id FROM delivery_items WHERE delivery_id=$1 LIMIT 20
    `,
    billing_document: `
      SELECT 'journal_entry' as type, id FROM journal_entries WHERE reference_document=$1 LIMIT 10
      UNION ALL
      SELECT 'billing_item', id FROM billing_items WHERE billing_doc_id=$1 LIMIT 20
    `,
    sales_order: `
      SELECT 'delivery' as type, id FROM deliveries WHERE order_id=$1 LIMIT 10
      UNION ALL
      SELECT 'sales_order_item', id FROM sales_order_items WHERE order_id=$1 LIMIT 15
    `,
    product: `
      SELECT 'billing_item' as type, id FROM billing_items WHERE product_id=$1 LIMIT 15
      UNION ALL
      SELECT 'delivery_item', id FROM delivery_items WHERE product_id=$1 LIMIT 15
    `,
  };

  const q = queries[nodeType];
  if (!q) return { nodes: [], links: [] };

  const result = await pool.query(q, [nodeId]);
  const nodes = result.rows.map(r => ({
    id: r.id, type: r.type,
    label: `${r.type.replace(/_/g, ' ')} ${r.id}`,
    color: NODE_COLORS[r.type] || '#888',
    size: NODE_SIZES[r.type] || 5,
  }));
  const links = result.rows.map(r => ({ source: nodeId, target: r.id, relation: 'neighbor' }));
  return { nodes, links };
}
