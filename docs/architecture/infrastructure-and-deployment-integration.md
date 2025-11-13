# Infrastructure and Deployment Integration

### Existing Infrastructure

**Current Deployment (Baseline):**
```yaml
# docker-compose.yml (existing)
version: "3.8"
services:
  whatsapp-chatgpt:
    container_name: whatsapp-chatgpt
    build: .
    tmpfs:
      - /tmp
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          memory: 256M
    volumes:
      - session-data:/app/session
    env_file:
      - .env
    command: npm run start
    user: "1001:1001"

volumes:
  session-data:

networks:
  whatsapp-net:
    driver: bridge
```

### P0 Infrastructure Changes

**Enhanced docker-compose.yml:**
```yaml
version: "3.8"

services:
  # 🔄 Enhanced main service
  whatsapp-chatgpt:
    container_name: whatsapp-chatgpt
    build: .
    tmpfs:
      - /tmp  # Temp files still use tmpfs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]  # 🔄 Updated endpoint
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s  # 🔄 Increased for DB migrations
    deploy:
      resources:
        limits:
          cpus: "2.0"  # 🔄 Increased for workers
          memory: 1024M  # 🔄 Increased for job queue
        reservations:
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    volumes:
      - session-data:/app/session
    networks:
      - whatsapp-net
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: sh -c "npx prisma migrate deploy && npm run start"  # 🔄 Run migrations first
    user: "1001:1001"

  # 🆕 PostgreSQL service
  postgres:
    image: postgres:16-alpine
    container_name: whatsapp-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: whatsapp_bot
      POSTGRES_USER: bot_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data/pgdata
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bot_user -d whatsapp_bot"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - whatsapp-net
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M

  # 🆕 Redis service
  redis:
    image: redis:7-alpine
    container_name: whatsapp-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - redis-data:/data
    networks:
      - whatsapp-net
    deploy:
      resources:
        limits:
          memory: 128M

  # 🆕 Job worker (optional - horizontal scaling)
  whatsapp-worker:
    container_name: whatsapp-worker
    build: .
    restart: unless-stopped
    environment:
      NODE_ENV: production
      WORKER_MODE: "true"  # Only process jobs, don't start WhatsApp client
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    command: node dist/queue/workers.js
    networks:
      - whatsapp-net
    deploy:
      replicas: 2  # Scale workers independently
      resources:
        limits:
          memory: 512M

volumes:
  session-data:
  postgres-data:  # 🆕
  redis-data:     # 🆕

networks:
  whatsapp-net:
    driver: bridge
```

**Enhanced Dockerfile:**
```dockerfile
# 🔄 Updated build stage
FROM node:18-bullseye-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Install system dependencies + Tesseract for OCR (P1 #13)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        chromium \
        chromium-common \
        ffmpeg \
        tesseract-ocr \          # 🆕 For File IQ OCR
        tesseract-ocr-eng \
        libtesseract-dev \
        curl && \                # 🆕 For health checks
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm install --production

# Runtime stage
FROM node:18-bullseye-slim

# Copy system deps from build stage
COPY --from=build /usr/bin/chromium /usr/bin/chromium
COPY --from=build /usr/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=build /usr/bin/tesseract /usr/bin/tesseract  # 🆕
COPY --from=build /usr/bin/curl /usr/bin/curl            # 🆕
COPY --from=build /usr/share/tesseract-ocr /usr/share/tesseract-ocr  # 🆕
# ... (other COPY commands)

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .

# 🔄 Generate Prisma client
RUN npx prisma generate

# Session directory permissions (P0 #9 FIX)
RUN mkdir -p /app/session && \
    chown appuser:appuser /app/session && \
    chmod 700 /app/session  # 🔄 Changed from 1777 to 700

USER appuser

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start"]
```

**Updated .env-example:**
```bash
# Existing environment variables
OPENAI_API_KEYS=sk-xxx,sk-yyy
OPENAI_GPT_MODEL=gpt-4o
# ... (existing vars)

# 🆕 P0 Database Configuration
DATABASE_URL=postgresql://bot_user:${POSTGRES_PASSWORD}@postgres:5432/whatsapp_bot
POSTGRES_PASSWORD=your-secure-password-here

# 🆕 P0 Redis Configuration
REDIS_URL=redis://redis:6379

# 🆕 P0 Logging Configuration
LOG_LEVEL=info  # debug, info, warn, error
LOG_PII_REDACTION=true

# 🆕 P0 Rate Limiting
RATE_LIMIT_PER_USER=10  # requests per minute
RATE_LIMIT_GLOBAL=100   # requests per minute

# 🆕 P0 RBAC
DEFAULT_ROLE=user  # owner, admin, operator, user
OWNER_PHONE_NUMBERS=+1234567890  # Comma-separated

# 🆕 P0 Job Queue
QUEUE_CONCURRENCY=5  # Concurrent jobs per worker
QUEUE_MAX_DEPTH=200  # Max queue size before backpressure

# 🆕 P1 Feature Flags
MEMORY_ENABLED=true
FILE_IQ_ENABLED=true
USAGE_TRACKING_ENABLED=true
GROUP_MODERATION_ENABLED=false  # Enable per-group via /moderate on
```

### Deployment Strategy

**P0 Sprint 1 Deployment:**
1. **Staging deployment:**
   ```bash
   # Build images
   docker compose build

   # Run migrations (dry-run)
   docker compose run --rm whatsapp-chatgpt npx prisma migrate deploy --preview-feature

   # Start services
   docker compose up -d

   # Verify health
   curl http://localhost:3000/healthz
   curl http://localhost:3000/readyz
   ```

2. **Production deployment:**
   - Use `UNIFIED_CONFIG_ENABLED=false` initially (rollback safety)
   - Run smoke tests
   - Flip to `UNIFIED_CONFIG_ENABLED=true`
   - Monitor for 24 hours
   - Remove feature flag after 1 week

**Rollback Procedures:**
- Database: Prisma migrations are reversible (`prisma migrate resolve --rolled-back`)
- Config: Feature flag `UNIFIED_CONFIG_ENABLED=false`
- Full rollback: Revert to previous Docker image tag

**Monitoring & Alerts (P0 #5):**
```yaml
# Add to docker-compose.yml (optional - monitoring stack)
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - whatsapp-net

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    networks:
      - whatsapp-net
```

---
