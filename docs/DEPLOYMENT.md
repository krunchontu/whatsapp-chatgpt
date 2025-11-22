# Production Deployment Guide

**Complete guide for deploying WhatsApp-ChatGPT bot to production.**

---

## Overview

This guide covers production deployment of the WhatsApp-ChatGPT bot. The recommended approach is **Docker Compose** on a Linux VPS (e.g., Hetzner, DigitalOcean, AWS EC2).

### Deployment Options

| Method | Difficulty | Cost/Month | Use Case |
|--------|-----------|------------|----------|
| **Docker Compose** (recommended) | Easy | $4-9 | Production, 1-50 users |
| Bare Metal Node.js | Medium | $4-9 | Custom setup, advanced users |
| Kubernetes | Hard | $20+ | Enterprise, high availability |

**This guide focuses on Docker Compose** - see [DEPLOYMENT_HETZNER.md](DEPLOYMENT_HETZNER.md) for VPS setup details.

---

## Prerequisites

### Infrastructure
- **Linux VPS** with 2GB+ RAM, 10GB+ disk (Ubuntu 22.04 LTS recommended)
- **Docker** 20.10+ and **Docker Compose** V2 installed
- **Domain name** (optional but recommended for SSL)
- **SSH access** to server

### API Keys & Accounts
- **OpenAI API key** ([Get one](https://platform.openai.com/signup))
- **WhatsApp account** (dedicated number recommended - see [Ban Risk](#whatsapp-ban-risk))
- **Sentry account** (optional, for error tracking)

### Local Tools
- Git
- SSH client
- Text editor

---

## Quick Start (Production)

### 1. Server Setup

```bash
# SSH into your server
ssh user@your-server.com

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (no sudo needed)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 2. Clone Repository

```bash
# Create app directory
mkdir -p ~/apps
cd ~/apps

# Clone repository
git clone https://github.com/askrella/whatsapp-chatgpt.git
cd whatsapp-chatgpt
```

### 3. Configure Environment

```bash
# Copy example environment file
cp .env-example .env

# Edit configuration
nano .env
```

**Minimal production configuration:**
```bash
# ========================
# REQUIRED SETTINGS
# ========================

# OpenAI API key (REQUIRED)
OPENAI_API_KEY=sk-your-actual-api-key-here

# Bot behavior
OPENAI_GPT_MODEL=gpt-4o
MAX_MODEL_TOKENS=2000
PRE_PROMPT="You are a professional customer service assistant for [YOUR COMPANY]. Be helpful, concise, and courteous."

# ========================
# PRODUCTION SETTINGS
# ========================

# Environment
NODE_ENV=production
LOG_LEVEL=info

# Database & Cache (Docker paths)
DATABASE_URL=file:/data/whatsapp-bot.db
REDIS_URL=redis://redis:6379

# ========================
# SECURITY & ACCESS
# ========================

# Admin access (IMPORTANT: Replace with your number)
OWNER_PHONE_NUMBERS=+15551234567
ADMIN_PHONE_NUMBERS=+15551234568

# Whitelist mode (recommended for production)
WHITELISTED_ENABLED=true
WHITELISTED_PHONE_NUMBERS=+15551234567,+15551234568,+15551234569

# ========================
# COST CONTROLS
# ========================

# Rate limiting
RATE_LIMIT_PER_USER=10          # 10 messages/min per user
RATE_LIMIT_GLOBAL=100           # 100 messages/min total

# Cost alerts
COST_ALERT_ENABLED=true
COST_ALERT_THRESHOLD=50         # Alert when daily cost exceeds $50

# ========================
# FEATURES
# ========================

# Bot behavior
PREFIX_ENABLED=false            # No !gpt prefix needed
GROUPCHATS_ENABLED=false        # Disable group chats initially
MODERATION_ENABLED=true         # Enable content moderation

# Voice messages
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODE=openai       # Use OpenAI Whisper

# Vision (image analysis)
VISION_ENABLED=true
VISION_MODEL=gpt-4o

# ========================
# DATA RETENTION
# ========================

DEFAULT_RETENTION_DAYS=30       # GDPR compliance
AUDIT_LOG_RETENTION_DAYS=90
```

**IMPORTANT:**
- Replace `OPENAI_API_KEY` with your actual key
- Replace phone numbers with your actual numbers (format: `+15551234567`)
- Update `PRE_PROMPT` with your company name and brand voice

### 4. Start Services

```bash
# Start in detached mode
docker compose up -d

# View logs (watch for QR code)
docker compose logs -f whatsapp-bot
```

### 5. Authenticate WhatsApp

1. Watch the logs for QR code (appears within 30-60 seconds)
2. Open WhatsApp on your phone
3. Go to: **Settings → Linked Devices → Link a Device**
4. Scan the QR code from the terminal

**Success indicators:**
```
[INFO] WhatsApp client is ready!
[INFO] Connected to WhatsApp Web
```

### 6. Test the Bot

Send a test message to your WhatsApp number:
```
Hello, are you there?
```

Expected response:
```
Hello! I'm here and ready to help. How can I assist you today?
```

---

## Environment Configuration Deep Dive

### Security Best Practices

```bash
# 1. Use strong API key rotation
# Separate keys for dev/staging/prod
OPENAI_API_KEY=sk-prod-key-here

# 2. Restrict access with RBAC
OWNER_PHONE_NUMBERS=+15551234567           # Full access
ADMIN_PHONE_NUMBERS=+15551234568           # Config + audit logs
OPERATOR_PHONE_NUMBERS=+15551234569        # Limited config

# 3. Enable whitelist mode
WHITELISTED_ENABLED=true
WHITELISTED_PHONE_NUMBERS=+1555123456[7-9]

# 4. Enable content moderation
MODERATION_ENABLED=true
CUSTOM_MODERATION_PARAMS='{"harassment":true,"hate":true,"self-harm":true}'
```

### Cost Control Configuration

```bash
# Rate limiting (prevent abuse)
RATE_LIMIT_PER_USER=10              # 10 messages/min per user
RATE_LIMIT_WINDOW_MS=60000          # 1 minute window
RATE_LIMIT_GLOBAL=100               # 100 messages/min globally

# Daily cost alerts
COST_ALERT_ENABLED=true
COST_ALERT_THRESHOLD=50             # Alert at $50/day (~$1500/month)

# Usage tracking (monitor per-user costs)
USAGE_TRACKING_ENABLED=true
```

**Estimated costs:**
- **Light usage** (500 msgs/month): $5-10/month
- **Medium usage** (2000 msgs/month): $20-50/month
- **Heavy usage** (10000 msgs/month): $100-200/month

### Bot Personality & Behavior

```bash
# System prompt (defines bot personality)
PRE_PROMPT="You are a professional customer service assistant for Acme Corp.

Your role:
- Help customers with questions about products and services
- Be concise (under 3 sentences when possible)
- Use a friendly, professional tone
- If you don't know, admit it and offer to escalate
- Never make promises about refunds or policy exceptions

Business hours: Monday-Friday 9AM-6PM EST
Escalation phrase: 'Let me transfer you to a team member who can help.'"

# Prefix settings (for customer service, disable prefixes)
PREFIX_ENABLED=false                # No !gpt needed
PREFIX_SKIPPED_FOR_ME=true          # Allow self-notes

# Group chat settings
GROUPCHATS_ENABLED=false            # Start disabled, enable later if needed
```

### Feature Configuration

```bash
# Voice transcription
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODE=openai           # Options: openai, local, whisper-api

# Text-to-speech (optional, adds cost)
TTS_ENABLED=false                   # Disable for MVP
TTS_MODE=openai                     # Options: openai, aws-polly

# Image analysis (vision)
VISION_ENABLED=true
VISION_MODEL=gpt-4o                 # Required for images

# Conversation memory
CONVERSATION_CONTEXT_SIZE=10        # Last 10 messages (adjust based on use case)
```

### Data Retention & Privacy

```bash
# GDPR compliance
DEFAULT_RETENTION_DAYS=30           # Delete conversations after 30 days
AUDIT_LOG_RETENTION_DAYS=90         # Keep audit logs for 90 days
ALLOW_CUSTOMER_EXPORT=true          # Let users export their data

# Session storage
SESSION_PATH=/app/session           # Docker path (mapped to volume)
```

---

## Post-Deployment Steps

### 1. Verify Services

```bash
# Check container status
docker compose ps

# Expected output:
# NAME              STATUS         PORTS
# whatsapp-bot      Up (healthy)   3000/tcp
# redis             Up (healthy)   6379/tcp

# Check logs
docker compose logs --tail=50 whatsapp-bot

# Check health endpoint
curl http://localhost:3000/healthz
# Expected: {"status":"ok"}
```

### 2. Test All Features

**Text conversation:**
```
You: Hello
Bot: Hello! How can I help you today?
```

**Voice message:**
- Send a voice message
- Bot should transcribe and respond

**Image analysis:**
- Send an image
- Bot should describe what it sees

**Commands:**
```
!config help          # View available commands
!config role list     # View user roles (admin only)
!config audit list    # View audit logs (admin only)
```

### 3. Monitor Costs

```bash
# Check OpenAI usage dashboard
# https://platform.openai.com/usage

# View usage in bot (admin command)
!config usage total

# Set up cost alerts in OpenAI dashboard
# https://platform.openai.com/account/billing/limits
```

### 4. Set Up Backups

**Automated backup script:**
```bash
# Create backup script
cat > ~/apps/whatsapp-chatgpt/backup.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/whatsapp-bot"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
docker compose cp whatsapp-bot:/data/whatsapp-bot.db \
  "$BACKUP_DIR/db-$DATE.db"

# Backup session (WhatsApp auth)
docker compose cp whatsapp-bot:/app/session \
  "$BACKUP_DIR/session-$DATE" 2>/dev/null || true

# Backup .env
cp .env "$BACKUP_DIR/.env-$DATE"

# Compress old backups
find "$BACKUP_DIR" -name "*.db" -mtime +7 -exec gzip {} \;

# Delete backups older than retention period
find "$BACKUP_DIR" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
EOF

chmod +x backup.sh

# Test backup
./backup.sh

# Schedule daily backups (2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * cd $HOME/apps/whatsapp-chatgpt && ./backup.sh >> $HOME/logs/backup.log 2>&1") | crontab -
```

**Backup verification:**
```bash
# List backups
ls -lh ~/backups/whatsapp-bot/

# Test restore
docker compose down
docker compose cp ~/backups/whatsapp-bot/db-20250122-020000.db whatsapp-bot:/data/whatsapp-bot.db
docker compose up -d
```

### 5. Set Up Monitoring

**Option A: Simple monitoring (cron + curl)**
```bash
# Create health check script
cat > ~/apps/whatsapp-chatgpt/healthcheck.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:3000/healthz"
ALERT_EMAIL="admin@example.com"

if ! curl -sf "$HEALTH_URL" > /dev/null; then
  echo "WhatsApp bot is DOWN!" | mail -s "ALERT: Bot Down" "$ALERT_EMAIL"
  docker compose restart whatsapp-bot
fi
EOF

chmod +x healthcheck.sh

# Run every 5 minutes
(crontab -l 2>/dev/null; echo "*/5 * * * * cd $HOME/apps/whatsapp-chatgpt && ./healthcheck.sh") | crontab -
```

**Option B: External monitoring (recommended)**
- [UptimeRobot](https://uptimerobot.com) - Free tier available
- [Healthchecks.io](https://healthchecks.io) - Free tier available
- [Sentry](https://sentry.io) - Error tracking (add `SENTRY_DSN` to .env)

### 6. Enable SSL (Optional but Recommended)

If you expose the health endpoint publicly:

```bash
# Install Nginx
sudo apt install nginx certbot python3-certbot-nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/whatsapp-bot

# Add configuration:
server {
    listen 80;
    server_name bot.yourdomain.com;

    location /healthz {
        proxy_pass http://localhost:3000/healthz;
        proxy_set_header Host $host;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d bot.yourdomain.com
```

---

## Monitoring & Maintenance

### Daily Checks

```bash
# 1. Check container status
docker compose ps

# 2. Check resource usage
docker stats --no-stream

# 3. Check logs for errors
docker compose logs --tail=100 whatsapp-bot | grep -i error

# 4. Check OpenAI usage
# Visit: https://platform.openai.com/usage
```

### Weekly Maintenance

```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y

# 2. Update application
cd ~/apps/whatsapp-chatgpt
git pull origin main
docker compose build
docker compose up -d

# 3. Check disk space
df -h

# 4. Verify backups
ls -lh ~/backups/whatsapp-bot/

# 5. Review audit logs (admin command via WhatsApp)
!config audit list 7
```

### Monthly Review

- Review OpenAI costs vs budget
- Check backup integrity (test restore)
- Review user feedback and conversation quality
- Update PRE_PROMPT if needed
- Review and clean old logs:
  ```bash
  docker compose logs --since 720h whatsapp-bot > ~/logs/archive-$(date +%Y%m).log
  ```

---

## Backup & Disaster Recovery

### What to Backup

1. **Critical (backup daily):**
   - WhatsApp session (`/app/session`)
   - SQLite database (`/data/whatsapp-bot.db`)
   - Environment file (`.env`)

2. **Important (backup weekly):**
   - Docker Compose config (`docker-compose.yml`)
   - Application code (Git repository)

### Disaster Recovery Plan

**Scenario 1: Container crashed**
```bash
# Restart services
docker compose restart whatsapp-bot

# If that fails, rebuild
docker compose down
docker compose up -d --build
```

**Scenario 2: Database corrupted**
```bash
# Stop services
docker compose down

# Restore from backup
cp ~/backups/whatsapp-bot/db-latest.db.gz /tmp/
gunzip /tmp/db-latest.db.gz
docker compose cp /tmp/db-latest.db whatsapp-bot:/data/whatsapp-bot.db

# Start services
docker compose up -d
```

**Scenario 3: WhatsApp session lost**
```bash
# Stop services
docker compose down

# Restore session
cp -r ~/backups/whatsapp-bot/session-latest whatsapp-bot:/app/session

# If no backup, re-authenticate
docker volume rm whatsapp-chatgpt_session-data
docker compose up -d
# Scan QR code again
```

**Scenario 4: Complete server failure**
```bash
# On new server:
# 1. Install Docker
# 2. Clone repository
# 3. Restore .env file
# 4. Restore database and session
# 5. Start services
docker compose up -d
```

---

## Troubleshooting

### Issue: Bot not responding

**Diagnosis:**
```bash
# Check container status
docker compose ps
# Look for: STATUS = Up (healthy)

# Check logs
docker compose logs --tail=100 whatsapp-bot

# Check WhatsApp connection
docker compose exec whatsapp-bot grep -i "client is ready" /proc/*/fd/1
```

**Solutions:**
```bash
# Restart bot
docker compose restart whatsapp-bot

# If session expired, re-authenticate
docker compose down
docker volume rm whatsapp-chatgpt_session-data
docker compose up -d
# Scan QR code
```

### Issue: High API costs

**Diagnosis:**
```bash
# Check usage (admin command via WhatsApp)
!config usage total
!config usage daily

# Check OpenAI dashboard
# https://platform.openai.com/usage
```

**Solutions:**
```bash
# 1. Lower rate limits
nano .env
# RATE_LIMIT_PER_USER=5  # Reduce from 10 to 5

# 2. Reduce context size
# CONVERSATION_CONTEXT_SIZE=5  # Reduce from 10 to 5

# 3. Switch to cheaper model
# OPENAI_GPT_MODEL=gpt-4o-mini  # Cheaper alternative

# Restart to apply changes
docker compose restart whatsapp-bot
```

### Issue: Database locked errors

**Diagnosis:**
```bash
docker compose logs whatsapp-bot | grep "database is locked"
```

**Solutions:**
```bash
# SQLite doesn't handle high concurrency well
# Option 1: Restart and reduce load
docker compose restart whatsapp-bot

# Option 2: Migrate to PostgreSQL (recommended for >20 concurrent users)
# See MVP_PLAN.md for migration guide
```

### Issue: Out of memory

**Diagnosis:**
```bash
docker stats
# Look for memory usage near limit
```

**Solutions:**
```bash
# Option 1: Increase memory limit
nano docker-compose.yml
# Change: memory: 2g  # Increase from 1g to 2g

# Option 2: Upgrade VPS
# Hetzner CX11 (2GB) → CX21 (4GB)

# Restart
docker compose up -d
```

### Issue: WhatsApp disconnects frequently

**Possible causes:**
- Unstable internet connection
- Session corruption
- Using same WhatsApp number on multiple bots

**Solutions:**
```bash
# 1. Check internet connectivity
ping -c 5 google.com

# 2. Clear and re-authenticate
docker compose down
docker volume rm whatsapp-chatgpt_session-data
docker compose up -d
# Scan QR code

# 3. Ensure dedicated WhatsApp number
# Don't use same number for multiple bots or WhatsApp apps
```

---

## Scaling & Performance

### When to Scale

**Scale vertically (more resources) when:**
- Memory usage consistently > 80%
- CPU usage consistently > 80%
- Response times > 5 seconds

**Scale horizontally (more instances) when:**
- Handling > 50 concurrent users
- Multiple regions needed
- High availability required

### Vertical Scaling (Easier)

```bash
# Upgrade VPS
# Hetzner: CX11 (2GB, $3.79) → CX21 (4GB, $5.83)

# Increase Docker limits
nano docker-compose.yml
```

```yaml
deploy:
  resources:
    limits:
      cpus: "2.0"      # Increase from 1.0
      memory: 2g       # Increase from 1g
```

```bash
# Restart with new limits
docker compose up -d
```

### Horizontal Scaling (Advanced)

**Requirements:**
- Migrate SQLite → PostgreSQL
- Shared session storage (Redis)
- Load balancer
- Multiple VPS instances

See [MVP_PLAN.md](MVP_PLAN.md) for migration guide.

---

## Security Hardening

### Server Security

```bash
# 1. Enable firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (optional)
sudo ufw allow 443/tcp   # HTTPS (optional)
sudo ufw enable

# 2. Disable password authentication
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd

# 3. Automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# 4. Fail2ban (prevent brute force)
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### Application Security

```bash
# 1. Environment file permissions
chmod 600 .env

# 2. Use Docker secrets for API keys (advanced)
# See: https://docs.docker.com/engine/swarm/secrets/

# 3. Enable audit logging
nano .env
# AUDIT_LOG_ENABLED=true

# 4. Regular security updates
cd ~/apps/whatsapp-chatgpt
git pull origin main
docker compose build
docker compose up -d
```

### WhatsApp Ban Risk

**Important:** This bot uses **unofficial WhatsApp Web API** (Puppeteer). WhatsApp may ban accounts using unofficial clients.

**Mitigation strategies:**
1. **Use dedicated WhatsApp Business number** (not personal)
2. **Gradual rollout:** Start with 1-3 users, slowly increase
3. **Monitor for warnings:** WhatsApp sends warnings before bans
4. **Backup session regularly:** Can restore if banned temporarily
5. **Long-term:** Migrate to official WhatsApp Business API (planned v3)

**Ban indicators:**
- Frequent disconnections
- "Your phone number is banned" message
- QR code stops working

**If banned:**
1. Stop the bot immediately
2. Wait 24-48 hours
3. Try re-authenticating
4. Consider new number if permanently banned

---

## Performance Benchmarks

**Expected performance (CX11 VPS, 2GB RAM):**

| Metric | Value |
|--------|-------|
| Response time (text) | 1-3 seconds |
| Response time (voice) | 3-10 seconds |
| Response time (image) | 2-5 seconds |
| Concurrent users | 10-20 |
| Messages/day | 500-2000 |
| Memory usage | 300-800 MB |
| CPU usage | 10-40% |

**Bottlenecks:**
- OpenAI API latency (1-3s)
- Whisper transcription (2-8s for voice)
- SQLite write concurrency (>20 concurrent writes)

---

## Deployment Checklist

Before going live, verify:

**Infrastructure:**
- [ ] VPS provisioned and accessible via SSH
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured (ufw)
- [ ] Domain configured (if using SSL)

**Application:**
- [ ] Repository cloned
- [ ] `.env` file created and configured
- [ ] `OPENAI_API_KEY` set correctly
- [ ] Phone numbers updated (OWNER, ADMIN, WHITELISTED)
- [ ] `PRE_PROMPT` customized for your brand
- [ ] Services started: `docker compose ps` shows healthy

**WhatsApp:**
- [ ] QR code scanned successfully
- [ ] "WhatsApp client is ready" message appears in logs
- [ ] Test message sent and received

**Security:**
- [ ] Whitelist enabled (`WHITELISTED_ENABLED=true`)
- [ ] Admin numbers configured correctly
- [ ] Rate limiting enabled
- [ ] Content moderation enabled
- [ ] `.env` file permissions set to 600

**Monitoring:**
- [ ] Health endpoint working: `curl http://localhost:3000/healthz`
- [ ] Logs are clean (no errors)
- [ ] Backup script created and scheduled
- [ ] External monitoring configured (UptimeRobot, etc.)

**Cost Controls:**
- [ ] OpenAI usage limits set in dashboard
- [ ] Cost alerts enabled (`COST_ALERT_ENABLED=true`)
- [ ] Rate limits configured appropriately
- [ ] Budget confirmed ($25-50/month for MVP)

**Testing:**
- [ ] Text message test passed
- [ ] Voice message test passed
- [ ] Image analysis test passed
- [ ] Admin commands work (`!config help`)
- [ ] Rate limiting works (send 15 messages quickly)

**Documentation:**
- [ ] Team trained on how to use bot
- [ ] Escalation process documented
- [ ] Disaster recovery plan reviewed
- [ ] Backup restoration tested

---

## Next Steps

✅ **Deployment Complete!**

**Recommended next steps:**

1. **Monitor closely for 1 week:**
   - Check logs daily
   - Monitor OpenAI costs
   - Gather user feedback

2. **Iterate on PRE_PROMPT:**
   - Fine-tune based on real conversations
   - Adjust tone and personality
   - Add company-specific knowledge

3. **Expand gradually:**
   - Start with 1-3 beta users
   - Gather feedback
   - Increase to 5-10 users
   - Scale infrastructure as needed

4. **Plan for growth:**
   - Review [MVP_PLAN.md](MVP_PLAN.md) for scaling path
   - Consider PostgreSQL migration at 20+ users
   - Plan official WhatsApp Business API migration

---

## Additional Resources

- **[DEPLOYMENT_DOCKER.md](DEPLOYMENT_DOCKER.md)** - Docker-specific guide
- **[DEPLOYMENT_HETZNER.md](DEPLOYMENT_HETZNER.md)** - VPS setup walkthrough
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues (to be created)
- **[MVP_PLAN.md](MVP_PLAN.md)** - Full roadmap and scaling guide
- **[CLAUDE.md](CLAUDE.md)** - Codebase and feature documentation
- **[.env-example](.env-example)** - Full environment variable reference

---

## Support

**Need help?**
- 🐛 **Bugs:** [Create an issue](https://github.com/askrella/whatsapp-chatgpt/issues)
- 💬 **Questions:** [Discord community](https://discord.gg/9VJaRXKwd3)
- 📧 **Email:** support@yourcompany.com

---

**Built with ❤️ for small businesses.**
**Deploy confidently, scale responsibly.**
