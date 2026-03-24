-- Order to Cash schema
-- Field names mirror the SAP JSONL dataset exactly

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  postal_code TEXT,
  street TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,             -- MaterialNumber
  description TEXT,
  category TEXT,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,             -- SalesOrder
  customer_id TEXT REFERENCES customers(id),
  order_date DATE,
  delivery_date DATE,
  status TEXT,
  sales_org TEXT,
  distribution_channel TEXT,
  division TEXT,
  total_net_value NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id TEXT PRIMARY KEY,             -- SalesOrder + SalesOrderItem composite
  order_id TEXT REFERENCES sales_orders(id),
  product_id TEXT REFERENCES products(id),
  item_number TEXT,
  quantity NUMERIC,
  unit TEXT,
  net_value NUMERIC,
  net_price NUMERIC,
  currency TEXT,
  plant TEXT,
  storage_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,             -- DeliveryDocument
  order_id TEXT REFERENCES sales_orders(id),
  customer_id TEXT REFERENCES customers(id),
  actual_delivery_date DATE,
  planned_delivery_date DATE,
  ship_to_party TEXT,
  shipping_point TEXT,
  plant TEXT,
  delivery_type TEXT,
  overall_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  delivery_id TEXT REFERENCES deliveries(id),
  order_item_id TEXT,
  product_id TEXT REFERENCES products(id),
  delivered_quantity NUMERIC,
  unit TEXT,
  plant TEXT,
  storage_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_documents (
  id TEXT PRIMARY KEY,             -- BillingDocument
  order_id TEXT REFERENCES sales_orders(id),
  delivery_id TEXT REFERENCES deliveries(id),
  customer_id TEXT REFERENCES customers(id),
  billing_date DATE,
  net_amount NUMERIC,
  tax_amount NUMERIC,
  currency TEXT,
  billing_type TEXT,
  company_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_items (
  id TEXT PRIMARY KEY,
  billing_doc_id TEXT REFERENCES billing_documents(id),
  product_id TEXT REFERENCES products(id),
  quantity NUMERIC,
  net_value NUMERIC,
  currency TEXT,
  plant TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,             -- AccountingDocument
  billing_doc_id TEXT REFERENCES billing_documents(id),
  company_code TEXT,
  fiscal_year TEXT,
  gl_account TEXT,
  reference_document TEXT,         -- links back to BillingDocument
  cost_center TEXT,
  profit_center TEXT,
  transaction_currency TEXT,
  amount_in_transaction_currency NUMERIC,
  company_code_currency TEXT,
  amount_in_company_code_currency NUMERIC,
  posting_date DATE,
  document_date DATE,
  accounting_document_type TEXT,   -- RV = billing, DZ = payment, etc.
  accounting_document_item TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,             -- ClearingDocument or PaymentDoc
  billing_doc_id TEXT REFERENCES billing_documents(id),
  customer_id TEXT REFERENCES customers(id),
  payment_date DATE,
  amount NUMERIC,
  currency TEXT,
  payment_method TEXT,
  clearing_document TEXT,
  bank_account TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common join patterns
CREATE INDEX IF NOT EXISTS idx_so_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_soi_order ON sales_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_soi_product ON sales_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_del_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_del_customer ON deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_bil_order ON billing_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_bil_delivery ON billing_documents(delivery_id);
CREATE INDEX IF NOT EXISTS idx_je_billing ON journal_entries(billing_doc_id);
CREATE INDEX IF NOT EXISTS idx_je_reference ON journal_entries(reference_document);
CREATE INDEX IF NOT EXISTS idx_pay_billing ON payments(billing_doc_id);
CREATE INDEX IF NOT EXISTS idx_pay_customer ON payments(customer_id);
