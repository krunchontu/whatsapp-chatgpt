# Deploying to Hetzner VPS (Production)

**Cost:** $3.79 - $5.40/month
**Difficulty:** Intermediate
**Time:** 30-45 minutes

This guide walks you through deploying the WhatsApp AI bot to a Hetzner VPS for production use.

---

## Table of Contents

1. [Why Hetzner?](#why-hetzner)
2. [Prerequisites](#prerequisites)
3. [Step 1: Create Hetzner Account](#step-1-create-hetzner-account)
4. [Step 2: Create VPS Server](#step-2-create-vps-server)
5. [Step 3: Initial Server Setup](#step-3-initial-server-setup)
6. [Step 4: Install Docker](#step-4-install-docker)
7. [Step 5: Deploy the Bot](#step-5-deploy-the-bot)
8. [Step 6: Configure SSL (Optional)](#step-6-configure-ssl-optional)
9. [Step 7: Set Up Monitoring](#step-7-set-up-monitoring)
10. [Step 8: Backup Strategy](#step-8-backup-strategy)
11. [Maintenance & Updates](#maintenance--updates)

---

## Why Hetzner?

**Hetzner is the best choice for MVP deployment:**

| Feature | Hetzner | DigitalOcean | AWS EC2 |
|---------|---------|--------------|---------|
| **Price (2 vCPU, 2GB RAM)** | $3.79/mo | $12/mo | $15/mo |
| **Bandwidth** | 20TB included | 2TB included | Pay per GB |
| **CPU Performance** | AMD EPYC (excellent) | Intel (good) | Variable |
| **Datacenters** | EU + US | Global | Global |
| **Billing** | Hourly | Monthly | Hourly |

**Savings:** $8-11/month vs competitors (70% cheaper)

---

## Prerequisites

Before starting, ensure you have:

- [ ] Email address (for Hetzner account)
- [ ] Credit/debit card or PayPal
- [ ] SSH key pair (or we'll create one)
- [ ] OpenAI API key ([Get here](https://platform.openai.com/signup))
- [ ] WhatsApp number (dedicated business number recommended)
- [ ] Domain name (optional, for SSL)

---

## Step 1: Create Hetzner Account

### 1.1 Sign Up

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Click "Sign Up"
3. Enter email and create password
4. Verify email address
5. Add payment method (credit card or PayPal)

**Note:** Hetzner may require ID verification for some regions. Have a photo ID ready.

### 1.2 Create Project

1. Log in to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Click "New Project"
3. Name it: `whatsapp-bot` (or your preferred name)
4. Click "Add Project"

---

## Step 2: Create VPS Server

### 2.1 Choose Server Location

1. In your project, click "Add Server"
2. **Location:** Choose closest to your target users:
   - **US East:** Ashburn, VA (for North/South America)
   - **EU:** Nuremberg or Helsinki (for Europe, Middle East, Africa)
   - **US West:** Hillsboro, OR (for Asia-Pacific via US)

**Tip:** Lower latency = faster WhatsApp responses

### 2.2 Select Image

1. **Image:** Ubuntu 22.04 (LTS)
2. Don't choose Ubuntu 24.04 yet (stick with stable LTS)

### 2.3 Choose Server Type

**For MVP (1-10 customers):**
- **Type:** Shared vCPU → **CX11**
- **Specs:** 2 vCPU, 2GB RAM, 40GB SSD
- **Price:** €3.79/month (~$3.79/month)

**For Growing (10-50 customers):**
- **Type:** Shared vCPU → **CPX11**
- **Specs:** 2 vCPU (AMD), 2GB RAM, 40GB SSD
- **Price:** €4.99/month (~$5.40/month)
- **Better:** AMD EPYC CPUs (faster)

**Start with CX11**, upgrade later if needed.

### 2.4 Networking

**IPv4:**
- ✅ Enable (required)

**IPv6:**
- ✅ Enable (recommended, free)

**Firewall:**
- Skip for now (we'll configure via UFW)

### 2.5 SSH Keys

**Option A: Use existing SSH key**
1. Click "Add SSH Key"
2. Paste your public key (`~/.ssh/id_rsa.pub`)
3. Name it: "My Laptop" or similar

**Option B: Create new SSH key (if you don't have one)**

On your local machine:

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "your_email@example.com"

# Press Enter to accept default location (~/.ssh/id_ed25519)
# Enter passphrase (optional but recommended)

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Paste this in Hetzner console
```

### 2.6 Volumes

- Skip (we'll use local storage for SQLite)

### 2.7 Additional Features

- **Backups:** ⚠️ Optional ($1/month, 20% of server cost)
  - Skip for MVP (we'll do manual backups)
  - Enable later when you have customers

### 2.8 Cloud Config (Optional)

Skip this section.

### 2.9 Name & Labels

**Name:** `whatsapp-bot-prod`

**Labels (optional):**
- `env=production`
- `app=whatsapp-bot`

### 2.10 Create Server

1. Review: €3.79/month
2. Click "Create & Buy Now"
3. Wait 1-2 minutes for server to be created

✅ **Your server is now running!**

Copy the **IPv4 address** (you'll need it in the next step).

---

## Step 3: Initial Server Setup

### 3.1 Connect via SSH

```bash
# Replace YOUR_SERVER_IP with your actual IP
ssh root@YOUR_SERVER_IP
```

**First-time connection:**
```
The authenticity of host 'YOUR_SERVER_IP' can't be established.
ED25519 key fingerprint is SHA256:xxxxx...
Are you sure you want to continue connecting (yes/no)?
```

Type `yes` and press Enter.

### 3.2 Update System

```bash
# Update package lists
apt update

# Upgrade all packages (takes 2-5 minutes)
apt upgrade -y

# Reboot if kernel was updated
# Check with: ls /var/run/reboot-required
# If file exists: reboot
```

### 3.3 Set Timezone

```bash
# List available timezones
timedatectl list-timezones

# Set your timezone (example: America/New_York)
timedatectl set-timezone America/New_York

# Verify
timedatectl
```

### 3.4 Configure Firewall (UFW)

```bash
# Install UFW (usually pre-installed)
apt install -y ufw

# Allow SSH (IMPORTANT: do this first!)
ufw allow 22/tcp
ufw allow OpenSSH

# Allow HTTP/HTTPS (for future SSL setup)
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Verify rules
ufw status
```

**Expected output:**
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

### 3.5 Create Non-Root User

**Security best practice:** Don't run services as root.

```bash
# Create user 'whatsapp'
adduser whatsapp

# Follow prompts:
# - Enter password (save this!)
# - Full Name: WhatsApp Bot (or leave blank)
# - Other fields: Press Enter to skip

# Add to sudo group (for admin tasks)
usermod -aG sudo whatsapp

# Add to docker group (we'll install Docker next)
# We'll do this after installing Docker
```

### 3.6 Configure SSH for New User

```bash
# Copy SSH keys from root to whatsapp user
mkdir -p /home/whatsapp/.ssh
cp /root/.ssh/authorized_keys /home/whatsapp/.ssh/
chown -R whatsapp:whatsapp /home/whatsapp/.ssh
chmod 700 /home/whatsapp/.ssh
chmod 600 /home/whatsapp/.ssh/authorized_keys
```

**Test SSH as whatsapp user (from your local machine, new terminal):**
```bash
ssh whatsapp@YOUR_SERVER_IP
```

If successful, you're connected as the `whatsapp` user!

### 3.7 Harden SSH (Optional but Recommended)

**Disable root login for security:**

```bash
# As root or sudo
sudo nano /etc/ssh/sshd_config

# Find and change these lines:
PermitRootLogin no
PasswordAuthentication no

# Save (Ctrl+X, Y, Enter)

# Restart SSH
sudo systemctl restart sshd
```

⚠️ **Warning:** Only do this AFTER confirming you can SSH as `whatsapp` user!

---

## Step 4: Install Docker

### 4.1 Install Docker Engine

```bash
# Switch to whatsapp user (if not already)
su - whatsapp

# Install prerequisites
sudo apt update
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

**Expected output:**
```
Docker version 24.x.x
Docker Compose version v2.x.x
```

### 4.2 Add User to Docker Group

```bash
# Add whatsapp user to docker group
sudo usermod -aG docker whatsapp

# Apply group changes (log out and back in)
exit  # Log out
ssh whatsapp@YOUR_SERVER_IP  # Log back in

# Verify Docker works without sudo
docker run hello-world
```

**Expected output:** "Hello from Docker!" message.

### 4.3 Configure Docker for Production

```bash
# Enable Docker to start on boot
sudo systemctl enable docker

# Verify
sudo systemctl is-enabled docker
```

---

## Step 5: Deploy the Bot

### 5.1 Clone Repository

```bash
# As whatsapp user
cd ~

# Install git if not present
sudo apt install -y git

# Clone repository
git clone https://github.com/krunchontu/whatsapp-chatgpt.git
cd whatsapp-chatgpt
```

### 5.2 Configure Environment

```bash
# Copy environment template
cp .env-example .env

# Edit configuration
nano .env
```

**Minimal required configuration:**

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_GPT_MODEL=gpt-4o
MAX_MODEL_TOKENS=2000

# Database (Docker path)
DATABASE_URL=file:/data/whatsapp-bot.db

# Redis (Docker service)
REDIS_URL=redis://redis:6379

# Bot Behavior (no prefix for customer service)
PREFIX_ENABLED=false
GROUPCHATS_ENABLED=false

# Cost Control
RATE_LIMIT_PER_USER=10
RATE_LIMIT_GLOBAL=100
COST_ALERT_THRESHOLD=50

# Access Control
ADMIN_PHONE_NUMBERS=+1234567890  # Replace with YOUR number
WHITELISTED_PHONE_NUMBERS=+1234567890  # Replace with YOUR number
WHITELISTED_ENABLED=true  # Only whitelisted numbers can use bot

# Customer Service Prompt
PRE_PROMPT=You are a professional customer service assistant. Be helpful, concise, and friendly. Keep responses under 3 sentences when possible.

# Transcription (voice messages)
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODE=openai

# TTS (disabled for MVP)
TTS_ENABLED=false

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

**Save:** Ctrl+X, Y, Enter

### 5.3 Create Data Directories

```bash
# Create directories for persistent data
mkdir -p ~/whatsapp-chatgpt/data
mkdir -p ~/whatsapp-chatgpt/session

# Set permissions
chmod 755 ~/whatsapp-chatgpt/data
chmod 755 ~/whatsapp-chatgpt/session
```

### 5.4 Build and Start Services

```bash
# Build Docker images (takes 3-5 minutes)
docker compose build

# Start services in background
docker compose up -d

# Check status
docker compose ps
```

**Expected output:**
```
NAME              IMAGE                COMMAND             STATUS         PORTS
whatsapp-bot      whatsapp-bot:latest  npm run start       Up 10 seconds  0.0.0.0:3000->3000/tcp
whatsapp-redis    redis:7-alpine       redis-server...     Up 10 seconds  6379/tcp
```

### 5.5 View Logs and Scan QR Code

```bash
# Watch logs in real-time
docker compose logs -f whatsapp-bot
```

**You'll see:**
1. Bot starting up
2. QR code appearing in terminal (as ASCII art)
3. "Scan this QR code with WhatsApp"

**Scan QR code:**
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Click "Link a Device"
4. Scan the QR code in terminal

**After successful scan:**
```
WhatsApp client is ready!
```

**Stop viewing logs:** Ctrl+C (services keep running in background)

### 5.6 Verify Bot is Working

**Test the bot:**
1. Send a message to your WhatsApp number from another device
2. The bot should respond with AI-generated text

**Check logs:**
```bash
docker compose logs --tail=50 whatsapp-bot
```

**Check health endpoint:**
```bash
curl http://localhost:3000/healthz
```

**Expected:** `{"status":"ok"}` (once health endpoint is implemented)

---

## Step 6: Configure SSL (Optional)

**Why SSL?** If you add a domain and want HTTPS for health checks or future web dashboard.

### 6.1 Prerequisites

- Domain name (e.g., `bot.yourdomain.com`)
- DNS A record pointing to your server IP

### 6.2 Install Nginx

```bash
# Install Nginx
sudo apt install -y nginx

# Allow Nginx through firewall
sudo ufw allow 'Nginx Full'

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6.3 Install Certbot (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d bot.yourdomain.com

# Follow prompts:
# - Enter email address
# - Agree to terms of service
# - Redirect HTTP to HTTPS: Yes

# Test auto-renewal
sudo certbot renew --dry-run
```

### 6.4 Configure Nginx Reverse Proxy

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/whatsapp-bot
```

**Paste this configuration:**

```nginx
server {
    server_name bot.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/bot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = bot.yourdomain.com) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name bot.yourdomain.com;
    return 404;
}
```

**Enable site:**

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

**Test:** Visit `https://bot.yourdomain.com/healthz`

---

## Step 7: Set Up Monitoring

### 7.1 UptimeRobot (Free Tier)

**Monitor bot uptime and get alerts:**

1. Sign up at [UptimeRobot](https://uptimerobot.com/)
2. Create new monitor:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** WhatsApp Bot
   - **URL:** `http://YOUR_SERVER_IP:3000/healthz` (or HTTPS domain)
   - **Monitoring Interval:** 5 minutes
3. Add alert contacts (email, SMS)

**Free tier:** 50 monitors, 5-minute checks

### 7.2 Sentry (Error Tracking - Free Tier)

**Track application errors:**

1. Sign up at [Sentry.io](https://sentry.io/)
2. Create new project: Node.js
3. Copy DSN (Data Source Name)
4. Add to `.env`:
   ```bash
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```
5. Restart services:
   ```bash
   docker compose restart whatsapp-bot
   ```

**Free tier:** 5,000 events/month

### 7.3 Server Monitoring

**Install basic monitoring:**

```bash
# Install htop (interactive process viewer)
sudo apt install -y htop

# Install ncdu (disk usage analyzer)
sudo apt install -y ncdu

# Check resources
htop  # Press q to quit
df -h  # Disk space
free -h  # Memory usage
```

**Set up disk space alert:**

```bash
# Create monitoring script
cat > ~/check-disk.sh << 'EOF'
#!/bin/bash
THRESHOLD=80
USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ $USAGE -gt $THRESHOLD ]; then
  echo "Disk usage is at ${USAGE}% (threshold: ${THRESHOLD}%)"
  # Add email/slack notification here
fi
EOF

chmod +x ~/check-disk.sh

# Add to crontab (run daily at 9am)
(crontab -l 2>/dev/null; echo "0 9 * * * ~/check-disk.sh") | crontab -
```

---

## Step 8: Backup Strategy

### 8.1 Automated Daily Backups

```bash
# Create backup script
cat > ~/backup-bot.sh << 'EOF'
#!/bin/bash

# Configuration
BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d)
DB_PATH=~/whatsapp-chatgpt/data/whatsapp-bot.db
SESSION_PATH=~/whatsapp-chatgpt/session

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp $DB_PATH $BACKUP_DIR/whatsapp-bot-${DATE}.db

# Backup WhatsApp session
tar -czf $BACKUP_DIR/session-${DATE}.tar.gz -C $(dirname $SESSION_PATH) $(basename $SESSION_PATH)

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $(date)"
EOF

chmod +x ~/backup-bot.sh

# Test backup
~/backup-bot.sh

# Add to crontab (run daily at 2am)
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-bot.sh >> ~/backup.log 2>&1") | crontab -

# Verify crontab
crontab -l
```

### 8.2 Off-Site Backups (Recommended)

**Option A: Hetzner Storage Box ($3.81/month for 100GB)**

1. Order Storage Box from Hetzner
2. Set up SFTP or rsync
3. Modify backup script to upload

**Option B: Backblaze B2 (Free for <10GB)**

```bash
# Install rclone
sudo apt install -y rclone

# Configure Backblaze
rclone config

# Follow prompts to add Backblaze B2

# Test upload
rclone copy ~/backups backblaze:whatsapp-backups

# Add to backup script
echo "rclone copy ~/backups backblaze:whatsapp-backups" >> ~/backup-bot.sh
```

**Option C: Manual Download (Simplest)**

```bash
# On your local machine, download backups weekly
scp whatsapp@YOUR_SERVER_IP:~/backups/*.db ~/local-backups/
```

### 8.3 Database Restore

**If you need to restore from backup:**

```bash
# Stop bot
docker compose down

# Restore database
cp ~/backups/whatsapp-bot-YYYYMMDD.db ~/whatsapp-chatgpt/data/whatsapp-bot.db

# Restore session (if needed)
tar -xzf ~/backups/session-YYYYMMDD.tar.gz -C ~/whatsapp-chatgpt/

# Restart bot
docker compose up -d
```

---

## Maintenance & Updates

### Daily Monitoring

```bash
# Check bot status
docker compose ps

# View recent logs
docker compose logs --tail=100 whatsapp-bot

# Check resource usage
htop
df -h
```

### Weekly Tasks

```bash
# Check for system updates
sudo apt update && sudo apt list --upgradable

# Apply security updates
sudo apt upgrade -y

# Check disk space
df -h
ncdu ~/whatsapp-chatgpt
```

### Monthly Tasks

```bash
# Update bot code
cd ~/whatsapp-chatgpt
git pull origin main

# Rebuild and restart
docker compose build
docker compose up -d

# Verify backups exist
ls -lh ~/backups/

# Review costs (OpenAI dashboard)
# https://platform.openai.com/usage
```

### Updating the Bot

```bash
# Pull latest code
cd ~/whatsapp-chatgpt
git fetch origin
git pull origin main

# Rebuild Docker image
docker compose build

# Restart with new code (minimal downtime)
docker compose up -d

# Check logs for errors
docker compose logs -f whatsapp-bot
```

### Troubleshooting

**Bot not responding:**
```bash
# Check if containers are running
docker compose ps

# Check logs for errors
docker compose logs --tail=100 whatsapp-bot

# Restart services
docker compose restart
```

**WhatsApp disconnected:**
```bash
# View logs
docker compose logs whatsapp-bot | grep -i "qr\|disconn"

# If QR code appears, rescan with phone
# If session corrupted, clear session and rescan:
docker compose down
rm -rf ~/whatsapp-chatgpt/session/*
docker compose up -d
# Scan QR code again
```

**High memory usage:**
```bash
# Check memory
free -h

# Check which process is using memory
docker stats

# Restart bot to clear memory
docker compose restart whatsapp-bot
```

**Disk full:**
```bash
# Check disk usage
df -h
ncdu ~/whatsapp-chatgpt

# Clear Docker cache
docker system prune -a

# Clear old logs
docker compose logs --tail=0 whatsapp-bot > /dev/null
```

---

## Cost Breakdown

### Monthly Costs (Production)

**Infrastructure:**
```
Hetzner CX11 VPS:        $3.79/mo
SSL Certificate:         $0 (Let's Encrypt)
Backups (off-site):      $0-4/mo (optional)
Domain:                  $1/mo (optional)
──────────────────────────────────
Infrastructure Total:    $3.79-8.79/mo
```

**OpenAI API (variable):**
```
3 beta customers:        $20-50/mo
10-20 customers:         $50-100/mo
50+ customers:           $100-200/mo
```

**Total (10 customers):** ~$54-109/mo

### Scaling Costs

**When to upgrade server:**
- 20+ customers → CPX11 ($5.40/mo)
- 50+ customers → CPX21 ($10.80/mo)
- 100+ customers → Multiple servers + PostgreSQL

---

## Next Steps

✅ **Deployment Complete!**

**You should now have:**
- WhatsApp bot running on Hetzner VPS
- Docker containers for bot + Redis
- Automated daily backups
- Monitoring set up
- SSL configured (if domain added)

**What's next:**
1. Test the bot thoroughly (send messages, voice, images)
2. Add more phone numbers to whitelist
3. Customize PRE_PROMPT for your business
4. Monitor costs in OpenAI dashboard
5. Read [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues

**Support:**
- [MVP Plan](MVP_PLAN.md) - Full roadmap
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/krunchontu/whatsapp-chatgpt/issues)

---

**Congratulations! Your WhatsApp AI bot is live in production! 🎉**
