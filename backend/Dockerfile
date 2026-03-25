FROM node:18-alpine

WORKDIR /app

# Install netcat and curl for database readiness check and health checks
RUN apk add --no-cache netcat-openbsd curl

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3001

# Health check - increase start-period to 120s to allow data ingestion to complete
HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Run data ingestion then start server
CMD ["sh", "-c", "node src/loaders/ingest.js && npm start"]

