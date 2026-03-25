# Data Ingestion Guide

## Overview

The Dodge Graph application requires data to be loaded into PostgreSQL before the API can serve requests. The data is provided in JSONL (JSON Lines) format in the `backend/data/sap-o2c-data/` directory.

## What Gets Ingested

The ingestion process loads the following data entities from SAP Order-to-Cash (O2C) dataset:

| Entity                | Description                         | File Location                              |
| --------------------- | ----------------------------------- | ------------------------------------------ |
| **Customers**         | Business partners (sold-to parties) | `business_partners/`                       |
| **Products**          | Materials/products                  | `products/`                                |
| **Sales Orders**      | Purchase orders from customers      | `sales_order_headers/`                     |
| **Sales Order Items** | Line items within sales orders      | `sales_order_items/`                       |
| **Deliveries**        | Outbound deliveries                 | `outbound_delivery_headers/`               |
| **Delivery Items**    | Items in deliveries                 | `outbound_delivery_items/`                 |
| **Billing Documents** | Invoices                            | `billing_document_headers/`                |
| **Billing Items**     | Items in billing documents          | `billing_document_items/`                  |
| **Journal Entries**   | Accounting entries                  | `journal_entry_items_accounts_receivable/` |
| **Payments**          | Customer payments                   | `payments_accounts_receivable/`            |

## Automatic Ingestion (Docker)

When using Docker, ingestion happens **automatically** on container startup:

```bash
docker-compose up -d
```

### Process:

1. PostgreSQL starts and initializes
2. Backend waits for PostgreSQL readiness
3. Backend checks if database has data
4. If empty, automatically runs the ingest script
5. Backend server starts and listens on port 3001

### View Progress:

```bash
# Watch the backend ingestion process
docker-compose logs -f backend
```

Expected output:

```
🚀 Starting ingestion...
✅ Schema initialized
📊 Found 48 JSONL files to process

📂 Processing: part-20251119-133435-168.jsonl
  ✅ 1000 records loaded | ⚠ 0 errors | ? 0 unrecognized

📂 Processing: part-20251119-133438-390.jsonl
  ✅ 500 records loaded | ⚠ 0 errors | ? 0 unrecognized

... (more files)

🎉 Ingestion complete!
🎯 Starting backend server...
```

## Manual Ingestion (Local Development)

If you're running the backend locally without Docker:

### Prerequisites

1. PostgreSQL running locally
2. `.env` file configured with:
   ```
   DATABASE_URL=postgresql://postgres:password@localhost:5432/dodge_graph
   ```
3. Database and schema created

### Run Ingestion:

```bash
cd backend
node src/loaders/ingest.js
```

## Data Format

The data is in **JSONL** (JSON Lines) format:

- One JSON object per line
- Files are in nested directories under `backend/data/sap-o2c-data/`
- Field names match SAP naming conventions (camelCase)

Example:

```json
{"salesOrder":"740506","soldToParty":"310000108","totalNetAmount":"17108.25","transactionCurrency":"INR"}
{"salesOrder":"740507","soldToParty":"310000109","totalNetAmount":"19021.27","transactionCurrency":"INR"}
```

## Field Mapping

The ingest script automatically maps SAP field names to database schema:

| SAP Field             | Database Column                | Example Value |
| --------------------- | ------------------------------ | ------------- |
| `salesOrder`          | `sales_orders.id`              | "740506"      |
| `soldToParty`         | `customers.id`                 | "310000108"   |
| `totalNetAmount`      | `sales_orders.total_net_value` | "17108.25"    |
| `transactionCurrency` | `sales_orders.currency`        | "INR"         |
| `product`             | `products.id`                  | "3001456"     |
| `productGroup`        | `products.category`            | "ZPKG004"     |

## Troubleshooting

### Issue: "relation 'customers' does not exist"

**Cause:** Database is not initialized

**Solution:**

```bash
# Force rebuild and restart
docker-compose down -v
docker-compose up -d --build
```

### Issue: Ingestion is stuck

**Check logs:**

```bash
docker-compose logs -f backend
```

**If stuck, restart:**

```bash
docker-compose restart backend
```

### Issue: Ingestion completes but no data appears

**Verify the data files exist:**

```bash
ls backend/data/sap-o2c-data/*/
```

**Check database directly:**

```bash
docker-compose exec postgres psql -U postgres -d dodge_graph \
  -c "SELECT COUNT(*) FROM customers;"
```

### Issue: "nc: command not found"

This shouldn't happen in Docker. If running locally, install netcat:

**macOS:**

```bash
brew install netcat
```

**Linux:**

```bash
sudo apt-get install netcat-openbsd
```

**Windows:** Use WSL2 or install from Git Bash

## Performance Notes

- Initial ingestion typically takes **2-5 minutes** depending on data size
- 48 JSONL files with ~50,000+ total records
- Database auto-check on subsequent restarts (skips if data exists)
- To force re-ingestion: `docker-compose down -v && docker-compose up -d`

## Data Integrity

The ingestion script:

- Creates all tables with proper schema
- Adds indexes for common queries
- Uses `ON CONFLICT ... DO NOTHING` to handle duplicates
- Maintains referential integrity with foreign keys
- Validates JSON format

## Next Steps

Once the backend successfully reports "✅ Ingestion complete!" and "Dodge Graph API running...":

1. Frontend should be accessible at http://localhost
2. API at http://localhost/api
3. Check health: http://localhost/api/health
4. Load graph: http://localhost/api/graph

If you see data in the graph visualization, ingestion was successful!

---

For more information, see:

- [Docker Deployment Guide](DOCKER_GUIDE.md)
- Backend health check: `/api/health`
- Graph endpoint: `/api/graph`
