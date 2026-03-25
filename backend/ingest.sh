#!/bin/bash

# Manual data ingestion script
# Usage: npm run ingest (from backend directory)

echo "🚀 Starting manual data ingestion..."
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ] || [ ! -f "src/loaders/ingest.js" ]; then
  echo "❌ Error: Please run this script from the backend directory"
  echo "   cd backend && npm run ingest"
  exit 1
fi

# Check if data files exist
if [ ! -d "data/sap-o2c-data" ]; then
  echo "❌ Error: No data directory found at data/sap-o2c-data/"
  echo "   Make sure your JSONL files are in: backend/data/sap-o2c-data/*/"
  exit 1
fi

# Check for .env file
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found"
  echo "   Creating .env from .env.example..."
  if [ -f "../.env.example" ]; then
    cp ../.env.example .env
    echo "   ✅ Created .env - make sure to update DATABASE_URL if needed"
  else
    echo "   ❌ Could not find .env.example"
    exit 1
  fi
fi

# Count JSONL files
FILE_COUNT=$(find data/sap-o2c-data -name "*.jsonl" | wc -l)

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "❌ Error: No JSONL files found in data/sap-o2c-data/"
  exit 1
fi

echo "📊 Found $FILE_COUNT JSONL files"
echo "📁 Schema: customers, products, sales_orders, deliveries, billing_documents, journal_entries, payments"
echo ""

# Run the ingest script
node src/loaders/ingest.js

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Ingestion completed successfully!"
  echo ""
  echo "Next steps:"
  echo "  • Start server: npm run dev"
  echo "  • Check backend: curl http://localhost:3001/api/graph"
  echo "  • Check frontend: http://localhost:5173"
else
  echo ""
  echo "❌ Ingestion failed. Check the errors above."
  exit 1
fi
