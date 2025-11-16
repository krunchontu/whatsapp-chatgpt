# Docker Deployment Guide

Quick guide for deploying the WhatsApp AI bot using Docker Compose.

---

## Prerequisites

- Docker 20.10+ and Docker Compose V2
- 2GB RAM minimum
- 10GB disk space
- OpenAI API key

---

## Quick Start (5 Minutes)

```bash
# 1. Clone repository
git clone https://github.com/krunchontu/whatsapp-chatgpt.git
cd whatsapp-chatgpt

# 2. Configure environment
cp .env-example .env
nano .env  # Add your OPENAI_API_KEY

# 3. Start services
docker compose up -d

# 4. View logs and scan QR code
docker compose logs -f whatsapp-bot

# 5. Scan QR code with WhatsApp
# Open WhatsApp → Settings → Linked Devices → Link a Device
```

**That's it!** Your bot is now running.

---

## Architecture

```
┌─────────────────────────────────────┐
│         Docker Compose              │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────┐  ┌────────────┐  │
│  │ whatsapp-bot │  │   Redis    │  │
│  │              │←→│            │  │
│  │ Node.js 20   │  │ Version 7  │  │
│  │ TypeScript   │  │ 50MB RAM   │  │
│  │ Puppeteer    │  │            │  │
│  │ Chromium     │  │ Queue +    │  │
│  │              │  │ Cache      │  │
│  └──────────────┘  └────────────┘  │
│         ↓                           │
│  ┌──────────────┐                  │
│  │   SQLite     │                  │
│  │  (volume)    │                  │
│  └──────────────┘                  │
│                                     │
└─────────────────────────────────────┘
         ↓
    Internet
    (OpenAI API, WhatsApp Web)
```

---

## Docker Compose Configuration

### Services

**whatsapp-bot:**
- Node.js 20 application
- Puppeteer + Chromium for WhatsApp Web
- 1GB RAM limit, 512MB reserved
- Health check: `/healthz` endpoint (every 30s)
- Ports: 3000 (health checks, optional)

**redis:**
- Redis 7 Alpine (tiny image)
- 50MB memory limit
- AOF persistence enabled
- Health check: `redis-cli ping`

### Volumes

**session-data:**
- WhatsApp session (authentication)
- **Critical:** Must persist, backup regularly

**whatsapp-data:**
- SQLite database
- Conversation history, usage metrics
- **Critical:** Backup daily

**redis-data:**
- Redis persistence
- Job queue, rate limit state

### Networking

**whatsapp-net:**
- Bridge network
- Allows bot ↔ Redis communication
- Isolated from other Docker networks

---

## Environment Configuration

### Minimal (.env)

```bash
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Database (Docker paths)
DATABASE_URL=file:/data/whatsapp-bot.db
REDIS_URL=redis://redis:6379

# Production mode
NODE_ENV=production
```

### Production (.env)

See [.env-example](.env-example) for complete configuration.

**Key settings:**
```bash
# AI
OPENAI_GPT_MODEL=gpt-4o
MAX_MODEL_TOKENS=2000
PRE_PROMPT="You are a professional customer service assistant..."

# Cost control
RATE_LIMIT_PER_USER=10
RATE_LIMIT_GLOBAL=100
COST_ALERT_THRESHOLD=50

# Access control
ADMIN_PHONE_NUMBERS=+15551234567
WHITELISTED_ENABLED=true
WHITELISTED_PHONE_NUMBERS=+15551234567

# Bot behavior
PREFIX_ENABLED=false
GROUPCHATS_ENABLED=false
MODERATION_ENABLED=true

# Transcription
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODE=openai

# Logging
LOG_LEVEL=info
SENTRY_DSN=https://...  # Optional
```

---

## Common Commands

### Start/Stop

```bash
# Start services (detached)
docker compose up -d

# Stop services
docker compose down

# Restart services
docker compose restart

# Restart specific service
docker compose restart whatsapp-bot
```

### Logs

```bash
# View logs (real-time)
docker compose logs -f

# View bot logs only
docker compose logs -f whatsapp-bot

# Last 100 lines
docker compose logs --tail=100 whatsapp-bot

# Search logs
docker compose logs whatsapp-bot | grep -i error
```

### Status

```bash
# Check container status
docker compose ps

# Check resource usage
docker stats

# Check health
docker compose exec whatsapp-bot curl http://localhost:3000/healthz
```

### Database

```bash
# Access SQLite database
docker compose exec whatsapp-bot sqlite3 /data/whatsapp-bot.db

# Backup database
docker compose cp whatsapp-bot:/data/whatsapp-bot.db ./backup.db

# Restore database
docker compose cp ./backup.db whatsapp-bot:/data/whatsapp-bot.db
```

### Redis

```bash
# Connect to Redis CLI
docker compose exec redis redis-cli

# Check Redis memory usage
docker compose exec redis redis-cli INFO memory

# Clear Redis (rate limits, queue)
docker compose exec redis redis-cli FLUSHALL
```

---

## Updating

```bash
# Pull latest code
git pull origin main

# Rebuild image
docker compose build

# Restart with new code
docker compose up -d

# Verify
docker compose logs -f whatsapp-bot
```

---

## Backup & Restore

### Backup (Manual)

```bash
# Create backup directory
mkdir -p backups

# Backup database
docker compose cp whatsapp-bot:/data/whatsapp-bot.db \
  ./backups/whatsapp-bot-$(date +%Y%m%d).db

# Backup session
docker compose cp whatsapp-bot:/app/session \
  ./backups/session-$(date +%Y%m%d)

# Backup .env
cp .env ./backups/.env-$(date +%Y%m%d)
```

### Backup (Automated)

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=./backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d)

docker compose cp whatsapp-bot:/data/whatsapp-bot.db $BACKUP_DIR/db-$DATE.db
docker compose cp whatsapp-bot:/app/session $BACKUP_DIR/session-$DATE

# Delete backups older than 30 days
find $BACKUP_DIR -mtime +30 -delete
EOF

chmod +x backup.sh

# Run daily via cron
(crontab -l 2>/dev/null; echo "0 2 * * * cd $(pwd) && ./backup.sh") | crontab -
```

### Restore

```bash
# Stop services
docker compose down

# Restore database
docker compose cp ./backups/db-20250116.db whatsapp-bot:/data/whatsapp-bot.db

# Restore session
docker compose cp ./backups/session-20250116 whatsapp-bot:/app/session

# Start services
docker compose up -d
```

---

## Troubleshooting

### Issue: Containers won't start

```bash
# Check logs
docker compose logs

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Issue: QR code not appearing

```bash
# Check logs for QR code
docker compose logs whatsapp-bot | less

# If session corrupted, clear it
docker compose down
docker volume rm whatsapp-chatgpt_session-data
docker compose up -d
```

### Issue: High memory usage

```bash
# Check memory
docker stats

# Restart bot
docker compose restart whatsapp-bot

# Adjust memory limits in docker-compose.yml
```

### Issue: Disk full

```bash
# Check Docker disk usage
docker system df

# Clean up unused containers/images
docker system prune -a

# Check volume sizes
docker volume ls
docker volume inspect whatsapp-chatgpt_whatsapp-data
```

### Issue: Bot not responding

```bash
# Check if containers running
docker compose ps

# Check logs for errors
docker compose logs --tail=100 whatsapp-bot

# Check OpenAI API key
docker compose exec whatsapp-bot env | grep OPENAI

# Restart services
docker compose restart
```

---

## Production Best Practices

### Security

```yaml
# docker-compose.yml already includes:
security_opt:
  - no-new-privileges:true  # Prevent privilege escalation
user: "1001:1001"             # Non-root user
```

### Resource Limits

```yaml
# Adjust based on your server
deploy:
  resources:
    limits:
      cpus: "1.0"      # Max 1 CPU core
      memory: 1g       # Max 1GB RAM
    reservations:
      memory: 512M     # Reserve 512MB
```

### Logging

```yaml
# Prevent log files from consuming disk
logging:
  driver: "json-file"
  options:
    max-size: "10m"    # Max 10MB per log file
    max-file: "3"      # Keep 3 files (30MB total)
```

### Health Checks

```yaml
# Already configured
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
  interval: 30s      # Check every 30s
  timeout: 10s       # Timeout after 10s
  retries: 3         # Retry 3 times
  start_period: 40s  # Wait 40s before first check
```

### Persistence

```yaml
# Critical volumes
volumes:
  session-data:      # WhatsApp auth (backup!)
  whatsapp-data:     # Database (backup!)
  redis-data:        # Redis persistence
```

---

## Monitoring

### Health Check

```bash
# Manual check
curl http://localhost:3000/healthz

# Expected: {"status":"ok"}
```

### Resource Monitoring

```bash
# Real-time stats
docker stats --no-stream

# Check specific container
docker stats whatsapp-bot
```

### Log Monitoring

```bash
# Watch logs for errors
docker compose logs -f whatsapp-bot | grep -i error

# Count errors in last hour
docker compose logs --since 1h whatsapp-bot | grep -c ERROR
```

---

## Scaling

### Vertical Scaling (More Resources)

```yaml
# docker-compose.yml
deploy:
  resources:
    limits:
      cpus: "2.0"      # 2 CPU cores
      memory: 2g       # 2GB RAM
```

### Horizontal Scaling (Multiple Instances)

**Not recommended for MVP:**
- SQLite doesn't support multiple writers
- WhatsApp session tied to single instance

**For scaling:**
1. Migrate to PostgreSQL
2. Use shared session storage
3. Load balance requests
4. See [MVP_PLAN.md](MVP_PLAN.md) for migration path

---

## Docker Hub (Optional)

### Build and Push Image

```bash
# Build image
docker build -t yourusername/whatsapp-bot:latest .

# Push to Docker Hub
docker push yourusername/whatsapp-bot:latest
```

### Use Pre-built Image

```yaml
# docker-compose.yml
services:
  whatsapp-bot:
    image: yourusername/whatsapp-bot:latest
    # Remove 'build: .' line
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: whatsapp
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/whatsapp-chatgpt
            git pull origin main
            docker compose build
            docker compose up -d
```

---

## Cost Estimate

**Docker Deployment (on Hetzner CX11):**

```
Server (CX11):          $3.79/mo
Domain (optional):      $1/mo
SSL (Let's Encrypt):    FREE
Backups (optional):     $4/mo
────────────────────────────────
Infrastructure Total:   $4.79-8.79/mo

OpenAI API:             $20-200/mo (usage-based)
────────────────────────────────
Total:                  $25-209/mo
```

---

## Next Steps

✅ **Docker Deployment Complete!**

**What's next:**
1. Monitor costs: https://platform.openai.com/usage
2. Set up backups (automated script above)
3. Add monitoring (Sentry, UptimeRobot)
4. Test thoroughly (send messages, voice, images)
5. Add more users to whitelist

**Guides:**
- [Hetzner VPS Deployment](DEPLOYMENT_HETZNER.md) - Full production guide
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [Environment Variables](ENVIRONMENT_VARIABLES.md) - Configuration reference
- [MVP Plan](MVP_PLAN.md) - Full roadmap

---

**Need help? Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) or [create an issue](https://github.com/krunchontu/whatsapp-chatgpt/issues).**
