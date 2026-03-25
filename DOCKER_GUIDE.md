# Docker Deployment Guide

## Quick Start

### Prerequisites

- Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop))
- Groq API Key from [console.groq.com](https://console.groq.com)

### Setup

1. **Copy environment file:**

   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your Groq API Key:**

   ```bash
   GROQ_API_KEY=your_actual_api_key_here
   ```

3. **Build and start all services:**

   ```bash
   docker-compose up -d
   ```

   This will:
   - Build the frontend (React + Vite)
   - Build the backend (Node.js + Express)
   - Start PostgreSQL database
   - Start Nginx reverse proxy

4. **Access the application:**
   - **Frontend**: http://localhost
   - **API**: http://localhost/api
   - **Health Check**: http://localhost/api/health

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Browser (localhost)              │
└────────────────┬────────────────────────┘
                 │
         ┌───────▼─────────┐
         │  Nginx (port 80) │  ◄─ Reverse Proxy
         └───────┬─────────┘
             ┌───┴──────────────┐
             │                  │
     ┌───────▼──────┐  ┌────────▼───────┐
     │  Frontend    │  │   Backend API  │
     │  (port 5173) │  │   (port 3001)  │
     └──────────────┘  └────────┬───────┘
                                 │
                        ┌────────▼────────┐
                        │  PostgreSQL DB  │
                        │   (port 5432)   │
                        └─────────────────┘
```

---

## Common Commands

### View running containers:

```bash
docker-compose ps
```

### View logs:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
docker-compose logs -f nginx
```

### Stop all services:

```bash
docker-compose stop
```

### Resume stopped services:

```bash
docker-compose start
```

### Rebuild and restart:

```bash
docker-compose up -d --build
```

### Remove everything (including volumes):

```bash
docker-compose down -v
```

### Access PostgreSQL CLI:

```bash
docker-compose exec postgres psql -U postgres -d dodge_graph
```

### Shell access into a container:

```bash
docker-compose exec backend sh
docker-compose exec frontend sh
docker-compose exec postgres sh
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs service_name

# Verify all services are healthy
docker-compose ps
```

### Database connection issues

- Ensure PostgreSQL container is running: `docker-compose ps postgres`
- Check postgres logs: `docker-compose logs postgres`
- Database URL in backend must be: `postgresql://postgres:password@postgres:5432/dodge_graph`

### API not accessible

- Check backend health: `curl http://localhost:3001/api/health`
- Check Nginx logs: `docker-compose logs nginx`
- Verify all services are healthy: `docker-compose ps`

### Fresh start (clean rebuild)

```bash
docker-compose down -v  # Remove everything
docker-compose up -d --build  # Rebuild and restart
```

### Database schema missing

If tables don't exist, you may need to seed the database. Check if there's a schema initialization script in `backend/src/loaders/`.

---

## Performance Tips

- **Initial build** may take 5-10 minutes (first-time dependency installation)
- **Subsequent builds** are much faster due to Docker layer caching
- Services auto-restart if they crash (`restart: unless-stopped`)
- Health checks verify each service is ready before dependent services start

---

## Production Notes

For production deployment:

- Use environment variables from a secure secrets manager (not `.env`)
- Change PostgreSQL password (currently `password`)
- Use a more robust reverse proxy configuration
- Enable SSL/TLS with certificates
- Add resource limits to the docker-compose file
- Use specific image versions instead of `latest` or `alpine`

---

## Development vs. Production

### Development (local):

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

### Docker (production-like):

```bash
docker-compose up -d
```

The Docker setup uses production builds:

- Frontend: Vite build → served with `serve`
- Backend: Running with `npm start` (not `npm run dev`)
- No hot-reload, file watching, or nodemon
