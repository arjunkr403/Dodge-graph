/**
 * ingest.js — reads all JSONL files from ./data/ and loads into PostgreSQL.
 * Handles SAP field name conventions (PascalCase) and maps to our schema.
 * Run: node src/loaders/ingest.js
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

// Detect entity type from JSONL record fields
function detectEntityType(record) {
  const keys = Object.keys(record);
  if (keys.includes('SalesOrder') && keys.includes('SoldToParty') && !keys.includes('SalesOrderItem')) return 'sales_order';
  if (keys.includes('SalesOrder') && keys.includes('SalesOrderItem')) return 'sales_order_item';
  if (keys.includes('DeliveryDocument') && !keys.includes('DeliveryDocumentItem')) return 'delivery';
  if (keys.includes('DeliveryDocument') && keys.includes('DeliveryDocumentItem')) return 'delivery_item';
  if (keys.includes('BillingDocument') && !keys.includes('BillingDocumentItem')) return 'billing_document';
  if (keys.includes('BillingDocument') && keys.includes('BillingDocumentItem')) return 'billing_item';
  if (keys.includes('AccountingDocument') || keys.includes('AccountingDocumentType')) return 'journal_entry';
  if (keys.includes('CustomerPaymentDifference') || keys.includes('PaymentMethod')) return 'payment';
  if (keys.includes('Customer') && (keys.includes('CustomerName') || keys.includes('OrganizationBPName1'))) return 'customer';
  if (keys.includes('Material') || keys.includes('MaterialNumber')) return 'product';
  return 'unknown';
}

async function upsertCustomer(r) {
  const id = r.SoldToParty || r.Customer || r.ShipToParty || r.Payer;
  if (!id) return;
  await pool.query(`
    INSERT INTO customers(id, name, country, region, city, postal_code, street)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, customers.name),
      country = COALESCE(EXCLUDED.country, customers.country)
  `, [
    id,
    r.CustomerName || r.OrganizationBPName1 || r.BusinessPartnerFullName || null,
    r.Country || r.CountryRegion || null,
    r.Region || null,
    r.CityName || r.City || null,
    r.PostalCode || null,
    r.StreetName || r.Street || null,
  ]);
}

async function upsertProduct(r) {
  const id = r.Material || r.MaterialNumber || r.Product;
  if (!id) return;
  await pool.query(`
    INSERT INTO products(id, description, category, unit)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(id) DO NOTHING
  `, [
    id,
    r.MaterialDescription || r.ProductDescription || r.EANNumber || null,
    r.MaterialGroup || r.ProductGroup || r.Division || null,
    r.BaseUnit || r.OrderQuantityUnit || null,
  ]);
}

async function upsertSalesOrder(r) {
  const id = r.SalesOrder;
  if (!id) return;
  const custId = r.SoldToParty || r.Customer;
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  await pool.query(`
    INSERT INTO sales_orders(id, customer_id, order_date, delivery_date, status, sales_org, distribution_channel, division, total_net_value, currency)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(id) DO NOTHING
  `, [
    id,
    custId || null,
    r.SalesOrderDate || r.CreationDate || null,
    r.RequestedDeliveryDate || null,
    r.SDDocumentRejectionStatus || r.OverallSDProcessStatus || null,
    r.SalesOrganization || null,
    r.DistributionChannel || null,
    r.OrganizationDivision || r.Division || null,
    parseFloat(r.TotalNetAmount || r.NetAmount || 0) || null,
    r.TransactionCurrency || r.DocumentCurrency || null,
  ]);
}

async function upsertSalesOrderItem(r) {
  const id = `${r.SalesOrder}-${r.SalesOrderItem}`;
  if (!r.SalesOrder || !r.SalesOrderItem) return;
  const productId = r.Material || r.Product;
  if (productId) await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [productId]);
  await pool.query(`INSERT INTO sales_orders(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.SalesOrder]);
  await pool.query(`
    INSERT INTO sales_order_items(id, order_id, product_id, item_number, quantity, unit, net_value, net_price, currency, plant, storage_location)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(id) DO NOTHING
  `, [
    id, r.SalesOrder, productId || null, r.SalesOrderItem,
    parseFloat(r.RequestedQuantity || r.OrderQuantity || 0) || null,
    r.RequestedQuantityUnit || r.OrderQuantityUnit || null,
    parseFloat(r.NetAmount || r.NetValue || 0) || null,
    parseFloat(r.NetPriceAmount || r.ItemNetPrice || 0) || null,
    r.TransactionCurrency || null,
    r.Plant || null,
    r.StorageLocation || null,
  ]);
}

async function upsertDelivery(r) {
  const id = r.DeliveryDocument;
  if (!id) return;
  const custId = r.SoldToParty || r.ShipToParty;
  const orderId = r.ReferenceSDDocument || r.SalesOrder;
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  if (orderId) await pool.query(`INSERT INTO sales_orders(id) VALUES($1) ON CONFLICT DO NOTHING`, [orderId]);
  await pool.query(`
    INSERT INTO deliveries(id, order_id, customer_id, actual_delivery_date, planned_delivery_date, ship_to_party, shipping_point, plant, delivery_type, overall_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(id) DO NOTHING
  `, [
    id, orderId || null, custId || null,
    r.ActualDeliveryDate || r.DeliveryDate || null,
    r.PlannedGoodsIssueDate || null,
    r.ShipToParty || null,
    r.ShippingPoint || null,
    r.OriginPlant || r.Plant || null,
    r.DeliveryType || null,
    r.OverallSDProcessStatus || r.OverallGoodsMovementStatus || null,
  ]);
}

async function upsertDeliveryItem(r) {
  const id = `${r.DeliveryDocument}-${r.DeliveryDocumentItem}`;
  if (!r.DeliveryDocument || !r.DeliveryDocumentItem) return;
  const productId = r.Material || r.Product;
  if (productId) await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [productId]);
  await pool.query(`INSERT INTO deliveries(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.DeliveryDocument]);
  await pool.query(`
    INSERT INTO delivery_items(id, delivery_id, order_item_id, product_id, delivered_quantity, unit, plant, storage_location)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(id) DO NOTHING
  `, [
    id, r.DeliveryDocument,
    r.ReferenceSDDocumentItem ? `${r.ReferenceSDDocument}-${r.ReferenceSDDocumentItem}` : null,
    productId || null,
    parseFloat(r.ActualDeliveredQtyInBaseUnit || r.DeliveryQuantity || 0) || null,
    r.BaseUnit || r.DeliveryQuantityUnit || null,
    r.Plant || null,
    r.StorageLocation || null,
  ]);
}

async function upsertBillingDocument(r) {
  const id = r.BillingDocument;
  if (!id) return;
  const custId = r.SoldToParty || r.PayerParty || r.Customer;
  const orderId = r.SalesOrder || r.ReferenceSDDocument;
  const deliveryId = r.ReferenceDocument || r.DeliveryDocument;
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  if (orderId) await pool.query(`INSERT INTO sales_orders(id) VALUES($1) ON CONFLICT DO NOTHING`, [orderId]);
  if (deliveryId) await pool.query(`INSERT INTO deliveries(id) VALUES($1) ON CONFLICT DO NOTHING`, [deliveryId]);
  await pool.query(`
    INSERT INTO billing_documents(id, order_id, delivery_id, customer_id, billing_date, net_amount, tax_amount, currency, billing_type, company_code)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(id) DO NOTHING
  `, [
    id, orderId || null, deliveryId || null, custId || null,
    r.BillingDocumentDate || r.CreationDate || null,
    parseFloat(r.TotalNetAmount || r.NetAmount || 0) || null,
    parseFloat(r.TotalTaxAmount || r.TaxAmount || 0) || null,
    r.TransactionCurrency || r.DocumentCurrency || null,
    r.BillingDocumentType || null,
    r.CompanyCode || null,
  ]);
}

async function upsertBillingItem(r) {
  const id = `${r.BillingDocument}-${r.BillingDocumentItem}`;
  if (!r.BillingDocument || !r.BillingDocumentItem) return;
  const productId = r.Material || r.Product;
  if (productId) await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [productId]);
  await pool.query(`INSERT INTO billing_documents(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.BillingDocument]);
  await pool.query(`
    INSERT INTO billing_items(id, billing_doc_id, product_id, quantity, net_value, currency, plant)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(id) DO NOTHING
  `, [
    id, r.BillingDocument, productId || null,
    parseFloat(r.BillingQuantity || r.Quantity || 0) || null,
    parseFloat(r.NetAmount || r.NetValue || 0) || null,
    r.TransactionCurrency || null,
    r.Plant || null,
  ]);
}

async function upsertJournalEntry(r) {
  const id = r.AccountingDocument;
  if (!id) return;
  // Link back via ReferenceDocument → BillingDocument
  const billingId = r.ReferenceDocument;
  if (billingId) await pool.query(`INSERT INTO billing_documents(id) VALUES($1) ON CONFLICT DO NOTHING`, [billingId]);
  await pool.query(`
    INSERT INTO journal_entries(id, billing_doc_id, company_code, fiscal_year, gl_account, reference_document, cost_center, profit_center, transaction_currency, amount_in_transaction_currency, company_code_currency, amount_in_company_code_currency, posting_date, document_date, accounting_document_type, accounting_document_item)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT(id) DO NOTHING
  `, [
    id,
    billingId || null,
    r.CompanyCode || null,
    r.FiscalYear || null,
    r.GLAccount || r.GlAccount || null,
    r.ReferenceDocument || null,
    r.CostCenter || null,
    r.ProfitCenter || null,
    r.TransactionCurrency || null,
    parseFloat(r.AmountInTransactionCurrency || 0) || null,
    r.CompanyCodeCurrency || null,
    parseFloat(r.AmountInCompanyCodeCurrency || 0) || null,
    r.PostingDate || null,
    r.DocumentDate || null,
    r.AccountingDocumentType || null,
    r.AccountingDocumentItem || null,
  ]);
}

async function upsertPayment(r) {
  const id = r.ClearingDocument || r.PaymentDocument || r.AccountingDocument;
  if (!id) return;
  const custId = r.Customer || r.SoldToParty;
  const billingId = r.AssignmentReference || r.ReferenceDocument || r.BillingDocument;
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  if (billingId) await pool.query(`INSERT INTO billing_documents(id) VALUES($1) ON CONFLICT DO NOTHING`, [billingId]);
  await pool.query(`
    INSERT INTO payments(id, billing_doc_id, customer_id, payment_date, amount, currency, payment_method, clearing_document)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(id) DO NOTHING
  `, [
    id, billingId || null, custId || null,
    r.PostingDate || r.PaymentDate || null,
    parseFloat(r.AmountInTransactionCurrency || r.PaymentAmount || 0) || null,
    r.TransactionCurrency || r.Currency || null,
    r.PaymentMethod || null,
    r.ClearingDocument || null,
  ]);
}

const HANDLERS = {
  sales_order: upsertSalesOrder,
  sales_order_item: upsertSalesOrderItem,
  delivery: upsertDelivery,
  delivery_item: upsertDeliveryItem,
  billing_document: upsertBillingDocument,
  billing_item: upsertBillingItem,
  journal_entry: upsertJournalEntry,
  payment: upsertPayment,
  customer: upsertCustomer,
  product: upsertProduct,
};

async function processFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`\n📂 Processing: ${filename}`);

  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  let count = 0, errors = 0, unknown = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      const entityType = detectEntityType(record);
      if (entityType === 'unknown') { unknown++; continue; }
      await HANDLERS[entityType](record);
      count++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.error(`  ⚠ Error on line: ${e.message}`);
    }
  }

  console.log(`  ✅ ${count} records loaded | ⚠ ${errors} errors | ? ${unknown} unrecognized`);
}

async function initSchema() {
  const schemaPath = path.join(__dirname, '../config/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('✅ Schema initialized');
}

async function main() {
  console.log('🚀 Starting ingestion...');
  await initSchema();

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
    .map(f => path.join(DATA_DIR, f));

  if (files.length === 0) {
    console.error(`❌ No .jsonl files found in ${DATA_DIR}`);
    console.error('   Place your JSONL files in backend/data/');
    process.exit(1);
  }

  // Load in dependency order: master data first, transactions after
  const ORDER = ['customer', 'product', 'sales_order', 'delivery', 'billing', 'journal', 'payment'];
  const sorted = files.sort((a, b) => {
    const rankA = ORDER.findIndex(k => path.basename(a).toLowerCase().includes(k));
    const rankB = ORDER.findIndex(k => path.basename(b).toLowerCase().includes(k));
    return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
  });

  for (const file of sorted) {
    await processFile(file);
  }

  console.log('\n🎉 Ingestion complete!');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
