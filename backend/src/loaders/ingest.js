/**
 * ingest.js — loads all SAP O2C JSONL files from ./data/sap-o2c-data/ into PostgreSQL.
 * Handles the exact camelCase field names from the real dataset.
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

const num = v => (v === null || v === undefined || v === '') ? null : parseFloat(v) || null;
const str = v => (v === null || v === undefined || v === '') ? null : String(v).trim() || null;
const dat = v => (!v || v === 'null') ? null : v;

async function procesBusinessPartner(r) {
  const id = r.businessPartner || r.customer;
  if (!id) return;
  await pool.query(`INSERT INTO customers(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=COALESCE(EXCLUDED.name,customers.name)`,
    [id, str(r.businessPartnerFullName || r.businessPartnerName)]);
}

async function processAddress(r) {
  const id = r.businessPartner;
  if (!id) return;
  await pool.query(`INSERT INTO customers(id,country,region,city,postal_code,street) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET country=COALESCE(EXCLUDED.country,customers.country),region=COALESCE(EXCLUDED.region,customers.region),city=COALESCE(EXCLUDED.city,customers.city),postal_code=COALESCE(EXCLUDED.postal_code,customers.postal_code),street=COALESCE(EXCLUDED.street,customers.street)`,
    [id, str(r.country), str(r.region), str(r.cityName), str(r.postalCode), str(r.streetName)]);
}

async function processProduct(r) {
  const id = r.product; if (!id) return;
  await pool.query(`INSERT INTO products(id,description,category,unit) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,
    [id, str(r.productOldId), str(r.productGroup), str(r.baseUnit)]);
}

async function processProductDescription(r) {
  const id = r.product; if (!id || r.language !== 'EN') return;
  await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [id]);
  await pool.query(`UPDATE products SET description=$1 WHERE id=$2 AND (description IS NULL OR description='')`,
    [str(r.productDescription), id]);
}

async function processProductPlant(r) {}
async function processPlant(r) {}
async function processCustomerCompany(r) {}
async function processCustomerSalesArea(r) {}

async function processDeliveryHeader(r) {
  const id = r.deliveryDocument; if (!id) return;
  await pool.query(`INSERT INTO deliveries(id,actual_delivery_date,planned_delivery_date,shipping_point,delivery_type,overall_status)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
    [id, dat(r.actualGoodsMovementDate), dat(r.creationDate), str(r.shippingPoint), str(r.deliveryType||'LF'), str(r.overallGoodsMovementStatus||r.hdrGeneralIncompletionStatus)]);
}

async function processDeliveryItem(r) {
  const id = `${r.deliveryDocument}-${r.deliveryDocumentItem}`;
  if (!r.deliveryDocument || !r.deliveryDocumentItem) return;
  await pool.query(`INSERT INTO deliveries(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.deliveryDocument]);
  if (r.material) await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.material]);
  if (r.referenceSdDocument) {
    await pool.query(`INSERT INTO sales_orders(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.referenceSdDocument]);
    await pool.query(`UPDATE deliveries SET order_id=$1 WHERE id=$2 AND order_id IS NULL`, [r.referenceSdDocument, r.deliveryDocument]);
  }
  await pool.query(`INSERT INTO delivery_items(id,delivery_id,order_item_id,product_id,delivered_quantity,unit,plant,storage_location)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
    [id, r.deliveryDocument,
     r.referenceSdDocument && r.referenceSdDocumentItem ? `${r.referenceSdDocument}-${r.referenceSdDocumentItem}` : null,
     str(r.material)||null, num(r.actualDeliveryQuantity), str(r.deliveryQuantityUnit), str(r.plant), str(r.storageLocation)]);
}

async function processBillingHeader(r) {
  const id = r.billingDocument; if (!id) return;
  const custId = str(r.soldToParty);
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  await pool.query(`INSERT INTO billing_documents(id,customer_id,billing_date,net_amount,currency,billing_type,company_code,accounting_document)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
    [id, custId, dat(r.billingDocumentDate||r.creationDate), num(r.totalNetAmount), str(r.transactionCurrency), str(r.billingDocumentType), str(r.companyCode), str(r.accountingDocument)]);
}

async function processBillingItem(r) {
  const id = `${r.billingDocument}-${r.billingDocumentItem}`;
  if (!r.billingDocument || !r.billingDocumentItem) return;
  await pool.query(`INSERT INTO billing_documents(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.billingDocument]);
  if (r.material) await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.material]);
  if (r.referenceSdDocument) {
    await pool.query(`INSERT INTO deliveries(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.referenceSdDocument]);
    await pool.query(`UPDATE billing_documents SET delivery_id=$1 WHERE id=$2 AND delivery_id IS NULL`, [r.referenceSdDocument, r.billingDocument]);
  }
  await pool.query(`INSERT INTO billing_items(id,billing_doc_id,product_id,quantity,net_value,currency)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
    [id, r.billingDocument, str(r.material)||null, num(r.billingQuantity), num(r.netAmount), str(r.transactionCurrency)]);
}

async function processBillingCancellation(r) {}

async function processJournalEntry(r) {
  const id = `${r.accountingDocument}-${r.accountingDocumentItem||'1'}`;
  if (!r.accountingDocument) return;
  const billingId = str(r.referenceDocument);
  if (billingId) await pool.query(`INSERT INTO billing_documents(id) VALUES($1) ON CONFLICT DO NOTHING`, [billingId]);
  await pool.query(`INSERT INTO journal_entries(id,billing_doc_id,company_code,fiscal_year,gl_account,reference_document,cost_center,profit_center,transaction_currency,amount_in_transaction_currency,company_code_currency,amount_in_company_code_currency,posting_date,document_date,accounting_document_type,accounting_document_item)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO NOTHING`,
    [id, billingId, str(r.companyCode), str(r.fiscalYear), str(r.glAccount), billingId, str(r.costCenter), str(r.profitCenter), str(r.transactionCurrency), num(r.amountInTransactionCurrency), str(r.companyCodeCurrency), num(r.amountInCompanyCodeCurrency), dat(r.postingDate), dat(r.documentDate), str(r.accountingDocumentType), str(r.accountingDocumentItem)]);
}

async function processPayment(r) {
  const id = `${r.accountingDocument}-${r.accountingDocumentItem||'1'}`;
  if (!r.accountingDocument) return;
  const custId = str(r.customer);
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  await pool.query(`INSERT INTO payments(id,customer_id,payment_date,amount,currency,clearing_document)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
    [id, custId, dat(r.postingDate||r.clearingDate), num(r.amountInTransactionCurrency), str(r.transactionCurrency), str(r.clearingAccountingDocument)]);
}


async function processSalesOrderHeader(r) {
  const id = r.salesOrder; if (!id) return;
  const custId = str(r.soldToParty);
  if (custId) await pool.query(`INSERT INTO customers(id) VALUES($1) ON CONFLICT DO NOTHING`, [custId]);
  await pool.query(`INSERT INTO sales_orders(id,customer_id,order_date,status,currency,total_net_value) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
    [id, custId, dat(r.creationDate), str(r.overallDeliveryStatus), str(r.transactionCurrency), num(r.totalNetAmount)]);
}

async function processSalesOrderItem(r) {
  const id = `${r.salesOrder}-${r.salesOrderItem}`; if (!r.salesOrder || !r.salesOrderItem) return;
  await pool.query(`INSERT INTO sales_orders(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.salesOrder]);
  if (r.material) await pool.query(`INSERT INTO products(id) VALUES($1) ON CONFLICT DO NOTHING`, [r.material]);
  await pool.query(`INSERT INTO sales_order_items(id,order_id,product_id,item_number,quantity,unit,net_value,currency,plant,storage_location) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
    [id, r.salesOrder, str(r.material)||null, str(r.salesOrderItem), num(r.requestedQuantity), str(r.requestedQuantityUnit), num(r.netAmount), str(r.transactionCurrency), str(r.productionPlant), str(r.storageLocation)]);
}

const FOLDER_HANDLERS = {
  sales_order_headers: processSalesOrderHeader,
  sales_order_items: processSalesOrderItem,
  business_partners: procesBusinessPartner,
  business_partner_addresses: processAddress,
  products: processProduct,
  product_descriptions: processProductDescription,
  product_plants: processProductPlant,
  plants: processPlant,
  customer_company_assignments: processCustomerCompany,
  customer_sales_area_assignments: processCustomerSalesArea,
  outbound_delivery_headers: processDeliveryHeader,
  outbound_delivery_items: processDeliveryItem,
  billing_document_headers: processBillingHeader,
  billing_document_items: processBillingItem,
  billing_document_cancellations: processBillingCancellation,
  journal_entry_items_accounts_receivable: processJournalEntry,
  payments_accounts_receivable: processPayment,
};

const PROCESS_ORDER = [
  'business_partners',
  'business_partner_addresses', 
  'products',
  'product_descriptions',
  'sales_order_headers',
  'outbound_delivery_headers',
  'outbound_delivery_items',
  'sales_order_items',
  'billing_document_headers',
  'billing_document_items',
  'billing_document_cancellations',
  'journal_entry_items_accounts_receivable',
  'payments_accounts_receivable',
  'product_plants',
  'plants',
  'customer_company_assignments',
  'customer_sales_area_assignments',
];

async function processFile(filePath, handler, folderName) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let count = 0, errors = 0, buffer = '';
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer) {
        try { const r = JSON.parse(buffer); buffer=''; await handler(r); count++; } catch(_) { buffer=''; errors++; }
      }
      continue;
    }
    buffer += trimmed;
    try { const r = JSON.parse(buffer); buffer=''; await handler(r); count++; } catch(e) {
      if (!(e instanceof SyntaxError)) { buffer=''; errors++; if(errors<=3) console.error(`  ⚠ ${e.message}`); }
    }
  }
  if (buffer.trim()) { try { await handler(JSON.parse(buffer)); count++; } catch(_) {} }
  return { count, errors };
}

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '../config/schema.sql'), 'utf8');
  await pool.query(sql);
  
  // Add accounting_document column to billing_documents if not exists
  await pool.query(`ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS accounting_document TEXT`);
  console.log('✅ Schema initialized');
}

async function main() {
  console.log('🚀 Starting SAP O2C data ingestion...\n');
  await initSchema();

  let baseDir = DATA_DIR;
  if (fs.existsSync(path.join(DATA_DIR, 'sap-o2c-data'))) baseDir = path.join(DATA_DIR, 'sap-o2c-data');

  if (!fs.existsSync(baseDir)) {
    console.error(`❌ No data found in ${baseDir}`); process.exit(1);
  }

  let total = 0;
  for (const folderName of PROCESS_ORDER) {
    const folderPath = path.join(baseDir, folderName);
    const handler = FOLDER_HANDLERS[folderName];
    if (!handler || !fs.existsSync(folderPath)) continue;
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));
    if (!files.length) continue;
    console.log(`📂 ${folderName}`);
    let fc = 0;
    for (const file of files) {
      const { count } = await processFile(path.join(folderPath, file), handler, folderName);
      fc += count;
    }
    console.log(`   ✅ ${fc} records`);
    total += fc;
  }

  console.log('\n📊 Final counts:');
  for (const t of ['customers','products','sales_orders','deliveries','billing_documents','journal_entries','payments']) {
    const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
    console.log(`   ${t}: ${r.rows[0].count}`);
  }
  console.log(`\n🎉 Done! ${total} total records.`);
  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
