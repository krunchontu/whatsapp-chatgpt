# AI-Powered WhatsApp Customer Service Bot 🤖

![Docker](https://github.com/askrella/whatsapp-chatgpt/actions/workflows/docker.yml/badge.svg)
![Prettier](https://github.com/askrella/whatsapp-chatgpt/actions/workflows/prettier.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Discord Invite](https://dcbadge.vercel.app/api/server/9VJaRXKwd3)](https://discord.gg/9VJaRXKwd3)

**Business-focused WhatsApp automation** powered by OpenAI's GPT-4o for SMEs. Automate customer service, handle inquiries 24/7, and improve team productivity—all through WhatsApp.

✨ **MVP Status:** In active development. See [MVP_PLAN.md](docs/MVP_PLAN.md) for roadmap.

### Core Features
- 💬 **AI-powered customer service** via WhatsApp (text, voice, images)
- 🎤 **Voice message transcription** (OpenAI Whisper)
- 🖼️ **Image analysis** (GPT-4o vision)
- 💰 **Cost controls** (rate limiting, usage tracking, alerts)
- 🔐 **Access control** (RBAC, whitelist)
- 📊 **Conversation memory** (context-aware responses)
- 🚀 **Production-ready** (SQLite, Redis, Docker)

<p align="center">
<img width="904" alt="Whatsapp ChatGPT" src="https://user-images.githubusercontent.com/6507938/220681521-17a12a41-44df-4d51-b491-f6a83871fc9e.png">
</p>

## 🎯 Target Audience

**Small to medium businesses** in WhatsApp-heavy markets (Latin America, Southeast Asia, Middle East, India) looking to:
- Automate customer service inquiries
- Provide 24/7 support without hiring night shifts
- Improve response times and customer satisfaction
- Reduce support costs (typical ROI: 6-46x)

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ (LTS)
- **pnpm** 8+ (or npm/yarn)
- **OpenAI API key** ([Get one here](https://platform.openai.com/signup))
- **WhatsApp account** (dedicated number recommended)

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/askrella/whatsapp-chatgpt.git
cd whatsapp-chatgpt

# 2. Install dependencies (using pnpm for better performance)
pnpm install

# 3. Set up environment
cp .env-example .env
# Edit .env and add your OPENAI_API_KEY

# 4. Set up database
pnpm db:push

# 5. Start the bot
pnpm start

# 6. Scan QR code with WhatsApp
# QR code will appear in terminal
```

### Docker Deployment (Production)

```bash
# 1. Configure environment
cp .env-example .env
# Edit .env with your settings

# 2. Build and start
docker-compose up -d

# 3. View logs and scan QR code
docker-compose logs -f whatsapp-bot
```

## 📚 Documentation

- **[MVP Plan](docs/MVP_PLAN.md)** - Full roadmap, tech stack, cost breakdown
- **[Legacy Docs](https://askrella.github.io/whatsapp-chatgpt)** - Original documentation (some features not in MVP)

### Key Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `OPENAI_GPT_MODEL` | Model for chat | `gpt-4o` |
| `DATABASE_URL` | SQLite database path | `file:./data/whatsapp-bot.db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `RATE_LIMIT_PER_USER` | Messages per minute per user | `10` |
| `COST_ALERT_THRESHOLD` | Daily cost alert (USD) | `50` |
| `ADMIN_PHONE_NUMBERS` | Admin numbers (comma-separated) | - |
| `PRE_PROMPT` | System prompt (bot personality) | See `.env-example` |

See [.env-example](.env-example) for complete list.

## 🛠️ Tech Stack

**MVP (Free-Tier Optimized):**
- **Runtime:** Node.js 20, TypeScript 5
- **Database:** SQLite (file-based, zero cost)
- **Cache/Queue:** Redis 7 + BullMQ
- **AI:** OpenAI (GPT-4o, Whisper)
- **WhatsApp:** Puppeteer + whatsapp-web.js
- **Testing:** Jest (80%+ coverage target)
- **Deployment:** Docker Compose

**Monthly Cost:** $24-54 (3 beta customers)
- Hetzner VPS: $3.79/mo
- OpenAI API: $20-50/mo (usage-based)

See [MVP_PLAN.md](docs/MVP_PLAN.md) for migration path to PostgreSQL.

## 📋 MVP Roadmap

**Current Status:** Week 0 - Foundation Setup

- [x] MVP plan documented ([docs/MVP_PLAN.md](docs/MVP_PLAN.md))
- [x] Free-tier tech stack configured
- [x] Prisma + SQLite setup
- [ ] Week 1: Database layer, logging, error handling
- [ ] Week 2: Rate limiting, usage tracking, RBAC
- [ ] Week 3: Job queue, conversation memory, retry logic
- [ ] Week 4: Testing (80%+ coverage), bug fixes, docs
- [ ] Week 5-6: Beta testing (1-3 customers)
- [ ] Week 7-8: General availability

**Target:** Production-ready MVP in 6-8 weeks

## ⚠️ Important Disclaimers

### Costs
- **Not free:** OpenAI charges per API request
- **Typical cost:** $0.01-0.10 per conversation
- **MVP budget:** $20-50/month for 500-2000 messages
- **Mitigation:** Rate limiting, usage tracking, daily alerts

### WhatsApp Ban Risk
- **Unofficial API:** This bot uses Puppeteer (browser automation)
- **Ban risk:** WhatsApp may ban accounts using unofficial clients
- **Recommendation:** Use dedicated WhatsApp Business number
- **Future:** Migration to official WhatsApp Business API planned (v3)

### Production Readiness
- **MVP status:** Core features working, infrastructure in progress
- **Not yet ready for:** Enterprise, high-volume (>50 customers), regulated industries
- **Best for:** Small businesses, beta testing, proof of concept

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

**Coverage target:** 80%+ lines

## 🤝 Contributing

Contributions welcome! Focus areas for MVP:
1. Testing (increase coverage)
2. Error handling improvements
3. Documentation
4. Bug fixes

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Contributors

<a href="https://github.com/askrella/whatsapp-chatgpt/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=askrella/whatsapp-chatgpt" />
</a>

## 📦 Key Dependencies

- **WhatsApp:** [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) + [Puppeteer](https://pptr.dev/)
- **AI:** [OpenAI SDK](https://github.com/openai/openai-node)
- **Database:** [Prisma](https://www.prisma.io/) + SQLite
- **Queue:** [BullMQ](https://docs.bullmq.io/) + [ioredis](https://github.com/redis/ioredis)
- **Logging:** [Pino](https://getpino.io/)
- **Validation:** [Zod](https://zod.dev/)
- **Testing:** [Jest](https://jestjs.io/)

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/askrella/whatsapp-chatgpt/issues)
- **Discord:** [Join our community](https://discord.gg/9VJaRXKwd3)
- **Docs:** [MVP Plan](docs/MVP_PLAN.md)

---

**Built with ❤️ for small businesses who want to automate customer service without breaking the bank.**
