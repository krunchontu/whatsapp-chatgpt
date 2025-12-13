# Quick Start Guide (Dummy Proof Edition)

**Get your WhatsApp AI bot running in 10 minutes.**

---

## What You Need Before Starting

1. **A computer** (Mac, Windows, or Linux)
2. **An OpenAI API key** - Get one at https://platform.openai.com/signup
3. **A WhatsApp account** with a phone that can scan QR codes

That's it. Let's go.

---

## Option A: Run Locally (Easiest - 5 minutes)

### Step 1: Install Prerequisites

**Mac:**
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and Redis
brew install node@20 redis

# Start Redis
brew services start redis
```

**Windows:**
1. Download and install Node.js 20 from https://nodejs.org/
2. Download and install Redis from https://github.com/microsoftarchive/redis/releases
3. Open Command Prompt as Administrator

**Linux (Ubuntu/Debian):**
```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs redis-server

# Start Redis
sudo systemctl start redis
```

### Step 2: Download the Bot

```bash
# Clone the repository
git clone https://github.com/askrella/whatsapp-chatgpt.git
cd whatsapp-chatgpt

# Install dependencies
npm install
```

### Step 3: Configure (Copy & Paste)

```bash
# Create your config file
cp .env-example .env
```

Now open `.env` in any text editor and change ONLY these lines:

```bash
# CHANGE THIS LINE - paste your OpenAI key
OPENAI_API_KEY=sk-paste-your-key-here

# CHANGE THIS LINE - your phone number (with country code)
OWNER_PHONE_NUMBERS=+15551234567
```

**That's all you need to change.** Save the file.

### Step 4: Start the Bot

```bash
# Initialize the database
npx prisma db push

# Start the bot
npm start
```

### Step 5: Scan the QR Code

1. Look for a QR code in your terminal (appears in ~30 seconds)
2. Open WhatsApp on your phone
3. Go to **Settings → Linked Devices → Link a Device**
4. Scan the QR code

### Step 6: Test It!

Send a message to yourself on WhatsApp:
```
Hello!
```

The bot should respond. You're done!

---

## Option B: Run with Docker (Recommended for Production)

### Step 1: Install Docker

**Mac/Windows:**
Download Docker Desktop from https://docker.com/products/docker-desktop

**Linux:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then:
docker --version
```

### Step 2: Download the Bot

```bash
git clone https://github.com/askrella/whatsapp-chatgpt.git
cd whatsapp-chatgpt
```

### Step 3: Configure (Copy & Paste)

```bash
cp .env-example .env
```

Open `.env` and change ONLY:

```bash
OPENAI_API_KEY=sk-paste-your-key-here
OWNER_PHONE_NUMBERS=+15551234567
```

### Step 4: Start Everything

```bash
docker compose up -d
```

### Step 5: Scan QR Code

```bash
# Watch the logs for the QR code
docker compose logs -f whatsapp-bot
```

Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device).

### Step 6: Test It!

Send "Hello" to yourself on WhatsApp. Done!

---

## Troubleshooting

### "I don't see a QR code"

```bash
# Check if the bot is running
docker compose ps

# View the logs
docker compose logs whatsapp-bot

# Restart everything
docker compose down
docker compose up -d
docker compose logs -f whatsapp-bot
```

### "The bot doesn't respond"

1. Make sure your phone number is in `OWNER_PHONE_NUMBERS` in `.env`
2. Restart the bot:
   ```bash
   docker compose restart whatsapp-bot
   ```

### "OpenAI error"

1. Check your API key is correct in `.env`
2. Make sure you have credits at https://platform.openai.com/account/billing

### "Docker won't start"

```bash
# Make sure Docker is running
docker info

# If not, start Docker Desktop (Mac/Windows) or:
sudo systemctl start docker  # Linux
```

### "I need to re-scan the QR code"

```bash
# Delete the session and restart
docker compose down
docker volume rm whatsapp-chatgpt_session-data
docker compose up -d
docker compose logs -f whatsapp-bot
```

---

## Common Commands

| What you want to do | Command |
|---------------------|---------|
| Start the bot | `docker compose up -d` |
| Stop the bot | `docker compose down` |
| View logs | `docker compose logs -f whatsapp-bot` |
| Restart the bot | `docker compose restart whatsapp-bot` |
| Check status | `docker compose ps` |
| Check health | `curl http://localhost:3000/healthz` |

---

## Next Steps

Once your bot is running:

1. **Customize the personality** - Edit `PRE_PROMPT` in `.env`
2. **Add more users** - Add phone numbers to `WHITELISTED_PHONE_NUMBERS`
3. **Enable group chats** - Set `GROUPCHATS_ENABLED=true`

See [DEPLOYMENT.md](DEPLOYMENT.md) for advanced configuration.

---

## Quick Reference: Essential Settings

```bash
# === MUST CHANGE ===
OPENAI_API_KEY=sk-your-key-here          # Your OpenAI API key
OWNER_PHONE_NUMBERS=+15551234567         # Your phone number

# === OPTIONAL BUT USEFUL ===
PRE_PROMPT="You are a helpful assistant."  # Bot personality
WHITELISTED_PHONE_NUMBERS=+1555...,+1555...  # Who can use the bot
GROUPCHATS_ENABLED=false                 # Allow group chats?
TRANSCRIPTION_ENABLED=true               # Transcribe voice messages?
```

---

## Costs

- **Infrastructure**: $0 (local) or ~$5/month (VPS)
- **OpenAI API**: ~$0.01-0.05 per conversation
- **Typical monthly cost**: $10-50 for light usage

---

**That's it! You now have an AI-powered WhatsApp bot.**

Need help? Open an issue at https://github.com/askrella/whatsapp-chatgpt/issues
