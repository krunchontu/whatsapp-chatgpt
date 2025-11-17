# Troubleshooting Guide

This guide covers common issues and their solutions when running the WhatsApp AI bot.

---

## Table of Contents

1. [Installation & Setup Issues](#installation--setup-issues)
2. [WhatsApp Connection Issues](#whatsapp-connection-issues)
3. [Docker Issues](#docker-issues)
4. [Database Issues](#database-issues)
5. [OpenAI API Issues](#openai-api-issues)
6. [Performance Issues](#performance-issues)
7. [Cost & Rate Limiting Issues](#cost--rate-limiting-issues)
8. [Deployment Issues](#deployment-issues)
9. [Debugging Tips](#debugging-tips)

---

## Installation & Setup Issues

### Issue: `pnpm: command not found`

**Cause:** pnpm not installed globally

**Solution:**
```bash
# Install pnpm globally
npm install -g pnpm

# Verify installation
pnpm --version
```

**Alternative:** Use npm instead:
```bash
# Replace pnpm with npm in all commands
npm install
npm run start
```

---

### Issue: `Cannot find module 'dotenv'` or similar

**Cause:** Dependencies not installed

**Solution:**
```bash
# Install all dependencies
pnpm install

# If package-lock.json conflicts
rm package-lock.json
pnpm install
```

---

### Issue: `Prisma Client not generated`

**Error:** `@prisma/client did not initialize yet`

**Solution:**
```bash
# Generate Prisma client
pnpm db:generate

# Or push schema (generates client + creates tables)
pnpm db:push
```

---

### Issue: TypeScript errors on `pnpm start`

**Error:** `Cannot find name 'X'` or `Type 'Y' is not assignable`

**Solution:**
```bash
# Check TypeScript version
pnpm list typescript

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Generate Prisma types
pnpm db:generate
```

---

### Issue: Port 3000 already in use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process (replace PID)
kill -9 PID

# Or use different port in .env
echo "PORT=3001" >> .env
```

---

## WhatsApp Connection Issues

### Issue: QR code not appearing

**Possible causes:**
1. WhatsApp session already exists
2. Puppeteer can't launch browser
3. Missing dependencies

**Solution 1: Clear session and retry**
```bash
# Stop bot
docker compose down
# OR: Ctrl+C if running locally

# Remove session data
rm -rf session/

# Restart bot
docker compose up -d
# OR: pnpm start

# Watch logs for QR code
docker compose logs -f whatsapp-bot
```

**Solution 2: Check Puppeteer dependencies (Docker)**
```bash
# Verify Chromium is installed in container
docker compose exec whatsapp-bot which chromium-browser
```

---

### Issue: "Could not find Chrome" error

**Error:** `Error: Could not find Chrome (ver. XX.X.XXXX.XX)`

**Solution (Local development):**
```bash
# macOS
brew install --cask google-chrome

# Ubuntu/Debian
sudo apt install -y chromium-browser

# Or set custom Chrome path in .env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Solution (Docker):**
```bash
# Rebuild Docker image (includes Chromium)
docker compose build --no-cache
docker compose up -d
```

---

### Issue: WhatsApp disconnects frequently

**Symptoms:**
- QR code appears again after hours/days
- "Session closed" messages in logs

**Causes:**
1. WhatsApp detected automation
2. Session data corrupted
3. Network issues

**Solutions:**

**1. Use dedicated WhatsApp Business number**
```
- Don't use personal WhatsApp number
- Get separate number for bot
- Register as WhatsApp Business
```

**2. Avoid suspicious patterns**
```
- Don't send 100s of messages/hour
- Add delays between responses
- Don't spam same message repeatedly
```

**3. Persist session data properly**
```bash
# Verify session directory is mounted
docker compose config | grep session

# Should see:
# - session-data:/app/session
```

**4. Check logs for errors**
```bash
docker compose logs whatsapp-bot | grep -i "disconnect\|error\|session"
```

---

### Issue: Bot receives messages but doesn't respond

**Debugging steps:**

**1. Check logs for errors**
```bash
docker compose logs --tail=100 whatsapp-bot
```

**2. Verify OpenAI API key**
```bash
# Check if key is set
docker compose exec whatsapp-bot env | grep OPENAI_API_KEY

# Test OpenAI API manually
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**3. Check whitelist settings**
```bash
# If WHITELISTED_ENABLED=true, ensure your number is in list
cat .env | grep WHITELIST
```

**4. Check prefix settings**
```bash
# If PREFIX_ENABLED=true, messages need !gpt prefix
cat .env | grep PREFIX
```

**5. Enable debug logging**
```bash
# Add to .env
LOG_LEVEL=debug

# Restart
docker compose restart whatsapp-bot

# Watch logs
docker compose logs -f whatsapp-bot
```

---

### Issue: Voice messages not transcribed

**Error:** `Transcription failed` or no response to voice messages

**Solution 1: Verify transcription enabled**
```bash
# Check .env
cat .env | grep TRANSCRIPTION

# Should be:
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODE=openai
```

**Solution 2: Check FFmpeg installation**
```bash
# Verify FFmpeg available
docker compose exec whatsapp-bot which ffmpeg

# Should output: /usr/bin/ffmpeg
```

**Solution 3: Check OpenAI Whisper API**
```bash
# Test Whisper API manually
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-audio.ogg" \
  -F "model=whisper-1"
```

---

## Docker Issues

### Issue: `docker: command not found`

**Cause:** Docker not installed

**Solution:**
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in
exit
# SSH back in

# Verify
docker run hello-world
```

---

### Issue: Permission denied while connecting to Docker

**Error:** `Got permission denied while trying to connect to the Docker daemon socket`

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Apply group changes
newgrp docker

# Or log out and back in
exit  # Then SSH back in

# Verify
docker ps
```

---

### Issue: Docker containers not starting

**Error:** `Container exited with code X`

**Debugging:**

**1. Check container status**
```bash
docker compose ps
```

**2. View container logs**
```bash
docker compose logs whatsapp-bot
docker compose logs redis
```

**3. Inspect failed container**
```bash
docker compose logs --tail=50 whatsapp-bot
```

**4. Common fixes**
```bash
# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d

# Check disk space
df -h
docker system df

# Clean up old containers/images
docker system prune -a
```

---

### Issue: Redis connection failed

**Error:** `Error: connect ECONNREFUSED redis:6379`

**Solution:**

**1. Verify Redis is running**
```bash
docker compose ps redis

# Should show: Up
```

**2. Check Redis health**
```bash
docker compose exec redis redis-cli ping

# Should output: PONG
```

**3. Restart Redis**
```bash
docker compose restart redis
```

**4. Check Redis logs**
```bash
docker compose logs redis
```

---

### Issue: Docker out of disk space

**Error:** `no space left on device`

**Solution:**
```bash
# Check disk usage
docker system df

# Remove unused containers, images, volumes
docker system prune -a --volumes

# Remove old images
docker image prune -a

# Check system disk space
df -h

# Find large directories
ncdu /
```

---

## Database Issues

### Issue: Database locked

**Error:** `SQLITE_BUSY: database is locked`

**Cause:** Multiple processes accessing SQLite simultaneously

**Solution:**

**1. For development (local)**
```bash
# Stop all instances
pkill -f "node.*index.ts"

# Restart single instance
pnpm start
```

**2. For production (Docker)**
```bash
# Only run one bot instance
docker compose ps  # Should show only 1 whatsapp-bot

# If multiple, scale down
docker compose up -d --scale whatsapp-bot=1
```

**3. Long-term fix: Migrate to PostgreSQL**
```
See docs/MVP_PLAN.md for PostgreSQL migration guide
```

---

### Issue: Database schema out of sync

**Error:** `An operation failed because it depends on one or more records that were required but not found`

**Solution:**
```bash
# Reset database (WARNING: deletes all data)
rm data/whatsapp-bot.db

# Push schema
pnpm db:push

# Or run migrations
pnpm db:migrate
```

---

### Issue: Cannot find database file

**Error:** `ENOENT: no such file or directory, open 'data/whatsapp-bot.db'`

**Solution:**
```bash
# Create data directory
mkdir -p data

# Push schema (creates database)
pnpm db:push

# Verify database exists
ls -lh data/
```

---

## OpenAI API Issues

### Issue: Invalid API key

**Error:** `Incorrect API key provided` or `401 Unauthorized`

**Solution:**

**1. Verify API key format**
```bash
# Should start with sk-
echo $OPENAI_API_KEY

# If not set, add to .env
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
```

**2. Test API key manually**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-your-key-here"
```

**3. Check API key status**
- Visit https://platform.openai.com/api-keys
- Verify key exists and is not revoked
- Create new key if needed

---

### Issue: Rate limit exceeded

**Error:** `Rate limit reached for requests` or `429 Too Many Requests`

**Causes:**
1. Too many requests too quickly
2. OpenAI account tier limits
3. No rate limiting configured

**Solutions:**

**1. Enable rate limiting (in .env)**
```bash
RATE_LIMIT_PER_USER=10  # 10 requests/minute per user
RATE_LIMIT_GLOBAL=100   # 100 requests/minute total
```

**2. Upgrade OpenAI plan**
- Visit https://platform.openai.com/account/billing/overview
- Upgrade to Tier 2 or higher for higher limits

**3. Use multiple API keys**
```bash
# Add multiple keys for rotation
OPENAI_API_KEYS=sk-key1,sk-key2,sk-key3
```

---

### Issue: Model not found

**Error:** `The model 'gpt-4o' does not exist` or `404 Model not found`

**Cause:** Model name typo or not available in your account

**Solution:**
```bash
# List available models
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Common model names:
# - gpt-4o (recommended)
# - gpt-4-turbo
# - gpt-3.5-turbo

# Update .env
OPENAI_GPT_MODEL=gpt-4-turbo
```

---

### Issue: Insufficient quota / Balance too low

**Error:** `You exceeded your current quota` or `Insufficient funds`

**Solution:**

**1. Check billing**
- Visit https://platform.openai.com/account/billing/overview
- Add credit or payment method

**2. Set up budget alerts**
- Visit https://platform.openai.com/account/billing/limits
- Set monthly budget limit

**3. Monitor usage**
```bash
# Add to .env for cost alerts
COST_ALERT_THRESHOLD=50  # Alert if daily cost > $50

# Check OpenAI dashboard for usage
https://platform.openai.com/usage
```

---

### Issue: Slow response times

**Symptoms:** Bot takes 10-30 seconds to respond

**Causes:**
1. GPT-4 is slower than GPT-3.5
2. Network latency
3. Token count too high
4. OpenAI API congestion

**Solutions:**

**1. Use faster model**
```bash
# gpt-3.5-turbo is 10x faster
OPENAI_GPT_MODEL=gpt-3.5-turbo
```

**2. Reduce max tokens**
```bash
MAX_MODEL_TOKENS=1000  # Instead of 2000
```

**3. Enable streaming (future feature)**
```
Streaming responses will be added in v2
```

**4. Monitor response times**
```bash
# Check logs for timing
docker compose logs whatsapp-bot | grep "response.*ms"
```

---

## Performance Issues

### Issue: High memory usage

**Symptoms:** Server running out of RAM, OOM kills

**Debugging:**
```bash
# Check memory usage
free -h
docker stats

# Identify memory hog
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"
```

**Solutions:**

**1. Restart bot to clear memory**
```bash
docker compose restart whatsapp-bot
```

**2. Limit Docker memory**
```yaml
# docker-compose.yml
deploy:
  resources:
    limits:
      memory: 512M  # Adjust as needed
```

**3. Upgrade server**
```bash
# CX11 (2GB) → CPX11 (2GB but better CPU)
# Or CX21 (4GB)
```

**4. Optimize conversation memory**
```bash
# Reduce messages stored per conversation
# In future: Add MAX_CONVERSATION_MESSAGES=5
```

---

### Issue: High CPU usage

**Symptoms:** Server sluggish, high load average

**Causes:**
1. Puppeteer/Chromium using CPU
2. FFmpeg transcoding voice messages
3. Too many concurrent requests

**Solutions:**

**1. Check what's using CPU**
```bash
htop
docker stats
```

**2. Disable unused features**
```bash
# Disable transcription if not needed
TRANSCRIPTION_ENABLED=false

# Disable vision if not needed
VISION_ENABLED=false
```

**3. Use job queue for heavy operations**
```
Voice transcription should run in background queue (Week 3 feature)
```

**4. Upgrade to better CPU**
```bash
# CPX11 has better AMD EPYC CPUs
# 20-30% faster than CX11
```

---

### Issue: Disk space full

**Error:** `ENOSPC: no space left on device`

**Solution:**
```bash
# Check disk usage
df -h
ncdu /

# Clear Docker cache
docker system prune -a

# Clear logs
docker compose logs --tail=0 whatsapp-bot > /dev/null

# Remove old backups
find ~/backups -mtime +30 -delete

# Clear WhatsApp media cache (if large)
rm -rf session/.wwebjs_cache
```

---

## Cost & Rate Limiting Issues

### Issue: Unexpectedly high OpenAI costs

**Symptoms:** $100+ bill when expecting $20

**Debugging:**

**1. Check usage in OpenAI dashboard**
```
https://platform.openai.com/usage
```

**2. Check bot logs for request volume**
```bash
docker compose logs whatsapp-bot | grep -c "GPT request"
```

**3. Identify heavy users**
```bash
# Check usage_metrics table (future feature)
# For now, check logs
docker compose logs whatsapp-bot | grep "phoneNumber"
```

**Prevention:**

**1. Enable rate limiting**
```bash
RATE_LIMIT_PER_USER=10
RATE_LIMIT_GLOBAL=100
```

**2. Set daily cost alerts**
```bash
COST_ALERT_THRESHOLD=10  # Alert if >$10/day
```

**3. Use cheaper model**
```bash
# GPT-3.5-Turbo is 10x cheaper than GPT-4
OPENAI_GPT_MODEL=gpt-3.5-turbo
```

**4. Reduce token limits**
```bash
MAX_MODEL_TOKENS=1000  # Down from 2000
```

**5. Disable expensive features**
```bash
VISION_ENABLED=false  # Vision uses more tokens
TRANSCRIPTION_ENABLED=false  # Whisper costs $0.006/minute
```

---

### Issue: Rate limiting not working

**Symptoms:** Users can send unlimited messages

**Debugging:**

**1. Check Redis connection**
```bash
docker compose exec redis redis-cli ping
# Should output: PONG
```

**2. Verify rate limit config**
```bash
cat .env | grep RATE_LIMIT

# Should be:
RATE_LIMIT_PER_USER=10
RATE_LIMIT_GLOBAL=100
```

**3. Check logs**
```bash
docker compose logs whatsapp-bot | grep -i "rate limit"
```

**Note:** Rate limiting will be implemented in Week 2 of MVP roadmap.

---

## Deployment Issues

### Issue: Cannot SSH into server

**Error:** `Connection refused` or `Permission denied`

**Solutions:**

**1. Verify server is running**
- Check Hetzner console
- Server should show "Running" status

**2. Check SSH port**
```bash
# Default port 22
ssh user@server-ip -p 22

# If custom port
ssh user@server-ip -p CUSTOM_PORT
```

**3. Check firewall rules**
```bash
# On server (if you can access via Hetzner console)
sudo ufw status

# SSH should be allowed
sudo ufw allow 22/tcp
```

**4. Use correct SSH key**
```bash
# Specify key explicitly
ssh -i ~/.ssh/id_rsa user@server-ip
```

**5. Use Hetzner console access**
- Go to Hetzner console
- Click server → Console
- Login as root
- Fix SSH configuration

---

### Issue: Docker Compose not found

**Error:** `docker-compose: command not found`

**Cause:** Using Docker Compose v2 (plugin) instead of standalone

**Solution:**
```bash
# Use `docker compose` instead of `docker-compose`
docker compose up -d

# Or install standalone (not recommended)
sudo apt install docker-compose
```

---

### Issue: SSL certificate failed

**Error:** `Challenge failed` or `DNS problem`

**Causes:**
1. DNS not propagated yet
2. Port 80 blocked
3. Domain doesn't point to server IP

**Solutions:**

**1. Verify DNS**
```bash
# Check if domain points to your server
dig +short bot.yourdomain.com

# Should output your server IP
```

**2. Check ports**
```bash
# Port 80 and 443 should be open
sudo ufw status | grep -E "80|443"
```

**3. Wait for DNS propagation**
```bash
# Can take up to 24 hours, usually 5-10 minutes
```

**4. Use DNS challenge instead**
```bash
# If port 80 blocked, use DNS challenge
sudo certbot certonly --manual --preferred-challenges dns -d bot.yourdomain.com
```

---

## Debugging Tips

### Enable Verbose Logging

```bash
# Add to .env
LOG_LEVEL=debug
NODE_ENV=development

# Restart
docker compose restart whatsapp-bot

# Watch logs
docker compose logs -f whatsapp-bot
```

### Test OpenAI Connection

```bash
# Test API key and connectivity
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | jq
```

### Test Redis Connection

```bash
# Connect to Redis CLI
docker compose exec redis redis-cli

# Test commands
> ping
PONG
> keys *
(list of keys)
> exit
```

### Inspect Database

```bash
# Connect to SQLite database
sqlite3 data/whatsapp-bot.db

# Run queries
sqlite> .tables
sqlite> SELECT * FROM users;
sqlite> .quit
```

### Check Container Health

```bash
# View all containers
docker compose ps

# Inspect specific container
docker inspect whatsapp-bot

# Check health status
docker compose exec whatsapp-bot curl http://localhost:3000/healthz
```

### Monitor Resource Usage

```bash
# Real-time resource monitoring
docker stats

# Disk usage
df -h
ncdu /

# Memory usage
free -h

# CPU usage
htop  # Press q to quit
```

### Tail Logs from Multiple Containers

```bash
# All containers
docker compose logs -f

# Specific containers
docker compose logs -f whatsapp-bot redis

# Last 100 lines
docker compose logs --tail=100 whatsapp-bot

# Grep for errors
docker compose logs whatsapp-bot | grep -i error
```

---

## Getting Help

### Before Asking for Help

**Gather this information:**

1. **Environment:**
   - OS: `uname -a`
   - Node version: `node --version`
   - Docker version: `docker --version`
   - pnpm version: `pnpm --version`

2. **Error logs:**
   ```bash
   docker compose logs --tail=100 whatsapp-bot > error.log
   ```

3. **Configuration:**
   ```bash
   # Sanitized .env (remove API keys!)
   cat .env | grep -v "API_KEY"
   ```

4. **What you tried:**
   - List troubleshooting steps already attempted

### Where to Get Help

1. **Documentation:**
   - [MVP Plan](MVP_PLAN.md)
   - [Deployment Guide](DEPLOYMENT_HETZNER.md)
   - [Environment Variables](ENVIRONMENT_VARIABLES.md)

2. **GitHub Issues:**
   - [Create new issue](https://github.com/krunchontu/whatsapp-chatgpt/issues)
   - Search existing issues first

3. **Discord Community:**
   - [Join Discord](https://discord.gg/9VJaRXKwd3)

---

## Common Error Messages & Quick Fixes

| Error | Quick Fix |
|-------|-----------|
| `pnpm: command not found` | `npm install -g pnpm` |
| `docker: command not found` | Install Docker: `curl -fsSL https://get.docker.com \| sh` |
| `Permission denied (docker)` | `sudo usermod -aG docker $USER` then logout/login |
| `Port 3000 already in use` | `lsof -i :3000` then `kill -9 PID` |
| `QR code not appearing` | `rm -rf session/ && docker compose restart` |
| `Invalid API key` | Check `.env` has `OPENAI_API_KEY=sk-...` |
| `Database locked` | Ensure only 1 bot instance running |
| `Redis connection failed` | `docker compose restart redis` |
| `Cannot find Prisma Client` | `pnpm db:generate` |
| `Disk space full` | `docker system prune -a` |
| `WhatsApp disconnected` | Use dedicated number, avoid spam patterns |
| `High OpenAI costs` | Enable rate limiting, use cheaper model |
| `Slow responses` | Use `gpt-3.5-turbo`, reduce `MAX_MODEL_TOKENS` |

---

**Still stuck? Create a [GitHub issue](https://github.com/krunchontu/whatsapp-chatgpt/issues) with detailed logs and environment info.**
