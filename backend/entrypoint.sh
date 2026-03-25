#!/bin/sh

# entrypoint.sh - Initialize database and start server

set -e

echo "🔄 Waiting for PostgreSQL to be ready..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

echo ""
echo "📊 Checking if database is populated..."

# Check if customers table has data
CUSTOMER_COUNT=$(npx -y postgres-cli -h postgres -U postgres -d dodge_graph -c "SELECT COUNT(*) FROM customers;" 2>/dev/null || echo "0")

if [ "$CUSTOMER_COUNT" = "0" ] || [ -z "$CUSTOMER_COUNT" ]; then
  echo "🚀 Running data ingestion..."
  node src/loaders/ingest.js
else
  echo "✅ Database already populated with $CUSTOMER_COUNT customers"
fi

echo ""
echo "🎯 Starting backend server..."
npm start
