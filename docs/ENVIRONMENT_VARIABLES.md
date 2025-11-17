# Environment Variables Reference

Complete reference for all configuration options in the WhatsApp AI bot.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment](#environment)
3. [Database & Cache](#database--cache)
4. [OpenAI Configuration](#openai-configuration)
5. [AI Models & Behavior](#ai-models--behavior)
6. [Rate Limiting & Cost Control](#rate-limiting--cost-control)
7. [Access Control (RBAC)](#access-control-rbac)
8. [Bot Behavior Settings](#bot-behavior-settings)
9. [Voice Transcription](#voice-transcription)
10. [Monitoring & Logging](#monitoring--logging)
11. [Advanced Options](#advanced-options)
12. [Deprecated Options](#deprecated-options)

---

## Quick Start

**Minimal configuration for testing:**

```bash
# Required
OPENAI_API_KEY=sk-your-key-here

# Recommended
OPENAI_GPT_MODEL=gpt-4o
DATABASE_URL=file:./data/whatsapp-bot.db
REDIS_URL=redis://localhost:6379
```

**Production configuration:**

```bash
# See .env-example for complete production setup
cp .env-example .env
# Edit .env with your values
```

---

## Environment

### `NODE_ENV`

**Description:** Application environment

**Type:** String

**Values:**
- `development` - Local development (verbose logs, hot reload)
- `production` - Production deployment (optimized, structured logs)
- `test` - Test environment (in-memory DB, mocked services)

**Default:** `development`

**Example:**
```bash
NODE_ENV=production
```

**When to change:**
- Development: Use `development`
- Docker deployment: Use `production`
- Running tests: Use `test`

---

## Database & Cache

### `DATABASE_URL`

**Description:** Database connection string

**Type:** String (URL format)

**Format:**
- **SQLite (MVP):** `file:./path/to/database.db`
- **PostgreSQL:** `postgresql://user:password@host:5432/dbname`

**Default:** `file:./data/whatsapp-bot.db`

**Examples:**
```bash
# Local development (SQLite)
DATABASE_URL=file:./data/whatsapp-bot.db

# Docker (SQLite)
DATABASE_URL=file:/data/whatsapp-bot.db

# PostgreSQL (future)
DATABASE_URL=postgresql://whatsapp:password@localhost:5432/whatsapp_bot

# PostgreSQL with connection pooling
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=10
```

**Notes:**
- SQLite: File path (relative or absolute)
- PostgreSQL: Include username, password, host, port, database name
- Connection pool: Add `?connection_limit=N` for PostgreSQL

**Migration path:** See [MVP_PLAN.md](MVP_PLAN.md#migration-path-sqlite--postgresql)

---

### `REDIS_URL`

**Description:** Redis connection string (for queue and rate limiting)

**Type:** String (URL format)

**Format:** `redis://[username]:[password]@host:port/database`

**Default:** `redis://localhost:6379`

**Examples:**
```bash
# Local development
REDIS_URL=redis://localhost:6379

# Docker
REDIS_URL=redis://redis:6379

# With password
REDIS_URL=redis://:mypassword@localhost:6379

# Remote Redis (with password and DB selection)
REDIS_URL=redis://:password@redis.example.com:6379/0

# Redis Cluster
REDIS_URL=redis://node1:6379,node2:6379,node3:6379
```

**Notes:**
- Database number (0-15) can be specified: `/0`, `/1`, etc.
- Default database is 0
- Password is optional for local development

---

## OpenAI Configuration

### `OPENAI_API_KEY` (Required)

**Description:** OpenAI API key for GPT and Whisper

**Type:** String

**Format:** Starts with `sk-`

**Default:** None (required)

**Example:**
```bash
OPENAI_API_KEY=sk-proj-abc123def456...
```

**How to get:**
1. Visit https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)
4. **Important:** Save it immediately (can't view again)

**Security:**
- Never commit to git
- Rotate regularly (monthly recommended)
- Use separate keys for dev/prod

---

### `OPENAI_API_KEYS` (Optional)

**Description:** Multiple API keys for rate limit rotation

**Type:** String (comma-separated)

**Format:** `sk-key1,sk-key2,sk-key3`

**Default:** Falls back to `OPENAI_API_KEY`

**Example:**
```bash
OPENAI_API_KEYS=sk-proj-key1...,sk-proj-key2...,sk-proj-key3...
```

**When to use:**
- Hitting rate limits with single key
- Want to distribute load across multiple accounts
- Different keys for different models

**Notes:**
- Bot will rotate through keys automatically
- All keys must have access to required models
- If one key fails, it skips to next

---

### `OPENAI_ORGANIZATION`

**Description:** OpenAI organization ID (optional)

**Type:** String

**Format:** Starts with `org-`

**Default:** None

**Example:**
```bash
OPENAI_ORGANIZATION=org-abc123...
```

**When to use:**
- You belong to multiple OpenAI organizations
- Want to track usage per organization
- Required by some enterprise accounts

---

### `OPENAI_PROJECT`

**Description:** OpenAI project ID (optional)

**Type:** String

**Format:** Starts with `proj_`

**Default:** None

**Example:**
```bash
OPENAI_PROJECT=proj_abc123...
```

**When to use:**
- Want to track usage per project
- Separate billing for different projects
- Organization-level usage tracking

---

### `OPENAI_TIMEOUT`

**Description:** Timeout for OpenAI API requests (milliseconds)

**Type:** Number

**Default:** `30000` (30 seconds)

**Recommended:** `30000` - `60000`

**Examples:**
```bash
# Standard (30 seconds)
OPENAI_TIMEOUT=30000

# Longer for slow models (60 seconds)
OPENAI_TIMEOUT=60000

# Shorter for fast responses (15 seconds)
OPENAI_TIMEOUT=15000
```

**Notes:**
- Too short: Requests may timeout prematurely
- Too long: Users wait longer for errors
- GPT-4 is slower than GPT-3.5, may need longer timeout

---

### `OPENAI_MAX_RETRIES`

**Description:** Number of retries for failed OpenAI requests

**Type:** Number

**Default:** `3`

**Recommended:** `2` - `5`

**Examples:**
```bash
# Conservative (fewer retries)
OPENAI_MAX_RETRIES=2

# Standard (recommended)
OPENAI_MAX_RETRIES=3

# Aggressive (more retries)
OPENAI_MAX_RETRIES=5
```

**Notes:**
- Retries use exponential backoff (2s, 4s, 8s, 16s...)
- Only retries on transient errors (429, 500, 503)
- Doesn't retry on permanent errors (401, 404)

---

## AI Models & Behavior

### `OPENAI_GPT_MODEL`

**Description:** GPT model for chat completions

**Type:** String

**Default:** `gpt-4o`

**Options:**
- `gpt-4o` - Best quality, vision support, $5/1M input tokens
- `gpt-4-turbo` - Fast GPT-4, $10/1M input tokens
- `gpt-3.5-turbo` - Fastest, cheapest, $0.50/1M input tokens
- `gpt-4` - Original GPT-4, slower, $30/1M input tokens

**Examples:**
```bash
# Best quality (recommended for customer service)
OPENAI_GPT_MODEL=gpt-4o

# Cheapest (10x cheaper, but lower quality)
OPENAI_GPT_MODEL=gpt-3.5-turbo

# Fastest GPT-4
OPENAI_GPT_MODEL=gpt-4-turbo
```

**Cost comparison (per 1M tokens):**
| Model | Input | Output | Speed |
|-------|-------|--------|-------|
| gpt-4o | $5 | $15 | Fast |
| gpt-4-turbo | $10 | $30 | Fast |
| gpt-3.5-turbo | $0.50 | $1.50 | Fastest |
| gpt-4 | $30 | $60 | Slow |

**When to use:**
- **Customer service:** `gpt-4o` (best quality + vision)
- **High volume:** `gpt-3.5-turbo` (cheap + fast)
- **Cost-conscious:** `gpt-3.5-turbo` first, upgrade if quality issues

---

### `VISION_MODEL`

**Description:** Model for image analysis

**Type:** String

**Default:** `gpt-4o`

**Options:**
- `gpt-4o` - Best vision model
- `gpt-4-turbo` - Good vision support
- `gpt-4-vision-preview` - Original vision model (deprecated)

**Example:**
```bash
VISION_MODEL=gpt-4o
```

**Notes:**
- Only models with vision support can analyze images
- gpt-4o has best vision capabilities
- Vision requests use more tokens than text-only

---

### `VISION_ENABLED`

**Description:** Enable image analysis

**Type:** Boolean

**Default:** `true`

**Examples:**
```bash
# Enable (users can send images)
VISION_ENABLED=true

# Disable (ignore images, save costs)
VISION_ENABLED=false
```

**When to disable:**
- Reduce costs (vision uses more tokens)
- Don't need image support
- Privacy concerns

---

### `MAX_MODEL_TOKENS`

**Description:** Maximum tokens per GPT request (prompt + response)

**Type:** Number

**Default:** `2000`

**Recommended:** `1000` - `4000`

**Examples:**
```bash
# Short responses (cost-conscious)
MAX_MODEL_TOKENS=1000

# Standard responses
MAX_MODEL_TOKENS=2000

# Long responses
MAX_MODEL_TOKENS=4000
```

**Notes:**
- Lower = cheaper, shorter responses
- Higher = more expensive, longer responses
- Typical conversation: 200-500 tokens
- GPT-4o max: 128,000 tokens (but expensive)

**Token guide:**
- 1 token ≈ 4 characters ≈ 0.75 words
- 100 tokens ≈ 75 words
- 1000 tokens ≈ 750 words ≈ 1.5 pages

---

### `PRE_PROMPT`

**Description:** System prompt that defines bot personality and behavior

**Type:** String (multiline supported)

**Default:** None

**Examples:**

**Customer Service:**
```bash
PRE_PROMPT="You are a professional customer service assistant. Be helpful, concise, and friendly. Keep responses under 3 sentences when possible. If you don't know the answer, admit it and offer to escalate to a human agent."
```

**E-commerce:**
```bash
PRE_PROMPT="You are a shopping assistant for Acme Store. Help customers find products, answer questions about shipping and returns, and provide order tracking. Our return policy is 30 days. Shipping is free over $50. Be friendly and enthusiastic about our products."
```

**Technical Support:**
```bash
PRE_PROMPT="You are a technical support assistant. Ask clarifying questions to understand the issue. Provide step-by-step troubleshooting instructions. Use simple language and avoid jargon. If the issue is complex, offer to escalate to a specialist."
```

**Notes:**
- Shapes all bot responses
- Keep it concise (under 200 words)
- Include key information: role, tone, constraints, escalation rules
- Test different prompts to find what works best

**Tips:**
- Be specific about tone (professional, casual, funny)
- Set response length constraints ("under 3 sentences")
- Define when to escalate ("if customer is frustrated")
- Include company info (hours, policies, procedures)

---

## Rate Limiting & Cost Control

### `RATE_LIMIT_PER_USER`

**Description:** Maximum messages per minute per user

**Type:** Number

**Default:** `10`

**Recommended:** `5` - `20`

**Examples:**
```bash
# Conservative (prevent abuse)
RATE_LIMIT_PER_USER=5

# Standard (recommended)
RATE_LIMIT_PER_USER=10

# Generous (customer service)
RATE_LIMIT_PER_USER=20

# No limit (not recommended)
RATE_LIMIT_PER_USER=0
```

**When to adjust:**
- High abuse → Lower limit (5)
- Legitimate heavy users → Raise limit (20)
- Beta testing → Disable (0) temporarily

**Notes:**
- Prevents spam and abuse
- Reduces OpenAI costs
- User sees: "You've reached the message limit. Please wait a minute and try again."

---

### `RATE_LIMIT_GLOBAL`

**Description:** Maximum total messages per minute (all users combined)

**Type:** Number

**Default:** `100`

**Recommended:** `50` - `200`

**Examples:**
```bash
# Small deployment (1-10 users)
RATE_LIMIT_GLOBAL=50

# Medium deployment (10-50 users)
RATE_LIMIT_GLOBAL=100

# Large deployment (50-100 users)
RATE_LIMIT_GLOBAL=200
```

**Calculation:**
```
Expected users × Average messages/min = Global limit
Example: 20 users × 5 msg/min = 100 global limit
```

**Notes:**
- Protects server from overload
- Prevents cost explosions
- Set based on expected concurrent users

---

### `COST_ALERT_THRESHOLD`

**Description:** Daily cost threshold for alerts (USD)

**Type:** Number

**Default:** `50`

**Examples:**
```bash
# Beta testing (low budget)
COST_ALERT_THRESHOLD=10

# Standard
COST_ALERT_THRESHOLD=50

# High volume
COST_ALERT_THRESHOLD=100
```

**Notes:**
- Alert triggered when daily OpenAI costs exceed threshold
- Helps detect unexpected usage spikes
- Set email in `ALERT_EMAIL` to receive notifications

---

### `ALERT_EMAIL`

**Description:** Email address for cost/error alerts

**Type:** String (email)

**Default:** None

**Example:**
```bash
ALERT_EMAIL=admin@yourcompany.com
```

**Alerts sent:**
- Daily costs exceed `COST_ALERT_THRESHOLD`
- Critical errors (database failures, API outages)
- Rate limit violations

**Note:** Email sending will be implemented in Week 2 of MVP

---

## Access Control (RBAC)

### `ADMIN_PHONE_NUMBERS`

**Description:** Phone numbers with admin privileges

**Type:** String (comma-separated)

**Format:** International format with country code `+1234567890`

**Default:** None

**Example:**
```bash
# Single admin
ADMIN_PHONE_NUMBERS=+15551234567

# Multiple admins
ADMIN_PHONE_NUMBERS=+15551234567,+14449876543,+12223334455
```

**Admin capabilities:**
- Use admin commands (!usage, !config, !stats)
- View usage metrics
- Modify bot configuration
- Access all features

**Notes:**
- Include country code (e.g., `+1` for US)
- No spaces, dashes, or parentheses
- Comma-separated for multiple numbers

---

### `WHITELISTED_PHONE_NUMBERS`

**Description:** Phone numbers allowed to use the bot

**Type:** String (comma-separated)

**Format:** International format `+1234567890`

**Default:** None (allows all numbers if `WHITELISTED_ENABLED=false`)

**Example:**
```bash
# Beta testers
WHITELISTED_PHONE_NUMBERS=+15551111111,+15552222222,+15553333333

# Single customer
WHITELISTED_PHONE_NUMBERS=+15551234567
```

**When to use:**
- Beta testing (limit to specific testers)
- Private bot (family/friends only)
- Paid customers only

**Notes:**
- Only works if `WHITELISTED_ENABLED=true`
- Non-whitelisted users see: "Sorry, you don't have access to this bot."

---

### `WHITELISTED_ENABLED`

**Description:** Enable whitelist mode

**Type:** Boolean

**Default:** `false`

**Examples:**
```bash
# Open to everyone
WHITELISTED_ENABLED=false

# Restricted access (whitelist only)
WHITELISTED_ENABLED=true
```

**When to enable:**
- Beta testing phase
- Paid customers only
- Private deployment

**When to disable:**
- Public bot
- Anyone can use
- Rely on rate limiting instead

---

## Bot Behavior Settings

### `PREFIX_ENABLED`

**Description:** Require command prefixes (!gpt, !dalle)

**Type:** Boolean

**Default:** `false` (recommended for customer service)

**Examples:**
```bash
# No prefix (natural conversation, recommended)
PREFIX_ENABLED=false
# User: "What's your return policy?"
# Bot responds automatically

# Prefix required
PREFIX_ENABLED=true
# User: "!gpt What's your return policy?"
# Bot responds only to !gpt messages
```

**When to enable:**
- Bot in group chats (avoid responding to all messages)
- Multi-purpose bot (GPT, DALL-E, etc.)

**When to disable:**
- Customer service (more natural)
- 1:1 conversations only

---

### `PREFIX_SKIPPED_FOR_ME`

**Description:** Skip prefix requirement for self-notes (messages to yourself)

**Type:** Boolean

**Default:** `true`

**Example:**
```bash
PREFIX_SKIPPED_FOR_ME=true
```

**Use case:**
- Send yourself notes without !gpt prefix
- Bot responds to all your messages (even if PREFIX_ENABLED=true)

---

### `GPT_PREFIX`
### `DALLE_PREFIX`
### `RESET_PREFIX`
### `AI_CONFIG_PREFIX`

**Description:** Custom command prefixes

**Type:** String

**Defaults:**
- `GPT_PREFIX=!gpt`
- `DALLE_PREFIX=!dalle`
- `RESET_PREFIX=!reset`
- `AI_CONFIG_PREFIX=!config`

**Examples:**
```bash
# Change to @bot syntax
GPT_PREFIX=@bot
DALLE_PREFIX=@draw
RESET_PREFIX=@reset

# Change to / syntax (like Discord bots)
GPT_PREFIX=/gpt
DALLE_PREFIX=/dalle
```

**Notes:**
- Only applies if `PREFIX_ENABLED=true`
- Must not conflict with each other

---

### `GROUPCHATS_ENABLED`

**Description:** Allow bot in WhatsApp group chats

**Type:** Boolean

**Default:** `false` (MVP)

**Examples:**
```bash
# Disable (1:1 only, recommended for MVP)
GROUPCHATS_ENABLED=false

# Enable (allow group chats)
GROUPCHATS_ENABLED=true
```

**When to enable:**
- Customer support groups
- Team collaboration
- Community bot

**When to disable:**
- MVP (reduces complexity)
- Customer service (1:1 preferred)
- Privacy concerns

**Notes:**
- Group chats increase OpenAI costs (more messages)
- Recommend enabling `PREFIX_ENABLED=true` for groups

---

### `MODERATION_ENABLED`

**Description:** Enable content moderation (filter inappropriate content)

**Type:** Boolean

**Default:** `true`

**Examples:**
```bash
# Enable (recommended for production)
MODERATION_ENABLED=true

# Disable (development/testing)
MODERATION_ENABLED=false
```

**When to disable:**
- Internal bot (trusted users only)
- Development/testing

**Notes:**
- Uses OpenAI Moderation API (free)
- Blocks harassment, hate speech, explicit content
- User sees: "Your message was flagged by our moderation system."

---

### `CUSTOM_MODERATION_PARAMS`

**Description:** Customize which content categories to flag

**Type:** JSON object (string)

**Default:** `{"harassment":true,"harassment/threatening":true,"hate":true,"self-harm":false,"sexual":false,"violence":false}`

**Categories:**
- `harassment` - Bullying, intimidation
- `harassment/threatening` - Threats of violence
- `hate` - Hate speech based on identity
- `self-harm` - Self-harm content
- `sexual` - Sexual content
- `violence` - Violence and gore

**Examples:**
```bash
# Strict (block all categories)
CUSTOM_MODERATION_PARAMS='{"harassment":true,"harassment/threatening":true,"hate":true,"self-harm":true,"sexual":true,"violence":true}'

# Moderate (default)
CUSTOM_MODERATION_PARAMS='{"harassment":true,"harassment/threatening":true,"hate":true,"self-harm":false,"sexual":false,"violence":false}'

# Lenient (only severe categories)
CUSTOM_MODERATION_PARAMS='{"harassment/threatening":true,"hate":true}'
```

**Notes:**
- Must be valid JSON
- Only applies if `MODERATION_ENABLED=true`

---

## Voice Transcription

### `TRANSCRIPTION_ENABLED`

**Description:** Enable voice message transcription

**Type:** Boolean

**Default:** `true`

**Examples:**
```bash
# Enable (users can send voice messages)
TRANSCRIPTION_ENABLED=true

# Disable (ignore voice messages, save costs)
TRANSCRIPTION_ENABLED=false
```

**When to disable:**
- Cost reduction (Whisper costs $0.006/minute)
- Voice messages not needed
- Text-only service

---

### `TRANSCRIPTION_MODE`

**Description:** Which transcription service to use

**Type:** String

**Options:**
- `openai` - OpenAI Whisper API (recommended for MVP)
- `local` - Local Whisper installation (requires setup)
- `speech-api` - External Speech API (requires separate service)
- `whisper-api` - Whisper API service (requires separate service)

**Default:** `openai`

**Example:**
```bash
# MVP (recommended)
TRANSCRIPTION_MODE=openai
```

**Cost (OpenAI Whisper):**
- $0.006 per minute of audio
- 1-minute voice message = $0.006
- 100 voice messages/day = $0.60/day = $18/month

**Notes:**
- MVP uses `openai` only
- Other modes require additional setup
- Will be simplified in future releases

---

### `TRANSCRIPTION_LANGUAGE`

**Description:** Language code for transcription

**Type:** String (ISO 639-1 code)

**Default:** Auto-detect

**Examples:**
```bash
# Auto-detect (recommended)
TRANSCRIPTION_LANGUAGE=

# English
TRANSCRIPTION_LANGUAGE=en

# Spanish
TRANSCRIPTION_LANGUAGE=es

# Portuguese
TRANSCRIPTION_LANGUAGE=pt
```

**Supported languages:** https://platform.openai.com/docs/guides/speech-to-text

**Notes:**
- Leave empty for auto-detection
- Specify language for better accuracy
- Only applies to Whisper transcription

---

## Monitoring & Logging

### `LOG_LEVEL`

**Description:** Logging verbosity level

**Type:** String

**Options:**
- `debug` - Very verbose (all logs)
- `info` - Standard logs
- `warn` - Warnings and errors only
- `error` - Errors only

**Default:** `info`

**Examples:**
```bash
# Development (verbose)
LOG_LEVEL=debug

# Production (standard)
LOG_LEVEL=info

# Quiet (errors only)
LOG_LEVEL=error
```

**When to use:**
- `debug`: Debugging issues, development
- `info`: Production (recommended)
- `warn`: Reduce log volume
- `error`: Critical errors only

---

### `SENTRY_DSN`

**Description:** Sentry error tracking DSN

**Type:** String (URL)

**Default:** None

**Example:**
```bash
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/7890123
```

**How to get:**
1. Sign up at https://sentry.io
2. Create new project (Node.js)
3. Copy DSN from project settings

**Free tier:** 5,000 events/month

**Notes:**
- Automatically captures errors
- Includes stack traces, context
- PII automatically redacted

---

### `LOGTAIL_SOURCE_TOKEN`

**Description:** Better Stack / Logtail logging token

**Type:** String

**Default:** None

**Example:**
```bash
LOGTAIL_SOURCE_TOKEN=abc123def456...
```

**How to get:**
1. Sign up at https://betterstack.com
2. Create source (Node.js)
3. Copy source token

**Free tier:** 1GB logs/month, 3-day retention

**Notes:**
- Structured log aggregation
- Searchable logs
- Real-time tail

---

## Advanced Options

### `SESSION_PATH`

**Description:** Directory to store WhatsApp session data

**Type:** String (file path)

**Default:** `./session`

**Examples:**
```bash
# Local development
SESSION_PATH=./session

# Custom path
SESSION_PATH=/var/lib/whatsapp-bot/session

# Docker (mounted volume)
SESSION_PATH=/app/session
```

**Notes:**
- Must be persistent (not /tmp)
- Contains WhatsApp authentication
- Backup this directory!

---

### `CONVERSATION_RETENTION_DAYS`

**Description:** Days to keep conversation history

**Type:** Number

**Default:** `7`

**Examples:**
```bash
# Short retention (privacy-focused)
CONVERSATION_RETENTION_DAYS=1

# Standard (recommended)
CONVERSATION_RETENTION_DAYS=7

# Long retention
CONVERSATION_RETENTION_DAYS=30
```

**Notes:**
- Automatically deletes old conversations
- GDPR compliance
- Lower = better privacy, less disk usage

---

### `MAX_MESSAGE_LENGTH`

**Description:** Maximum message length to process (characters)

**Type:** Number

**Default:** `4000`

**Examples:**
```bash
# Short messages only
MAX_MESSAGE_LENGTH=1000

# Standard
MAX_MESSAGE_LENGTH=4000

# Long messages
MAX_MESSAGE_LENGTH=10000
```

**Notes:**
- Prevents processing very long messages
- Reduces token usage
- User sees: "Message too long, please keep it under X characters."

---

## Deprecated Options

These environment variables are present in the codebase but **not used in MVP**. They will be removed or re-implemented in future versions.

| Variable | Status | Alternative |
|----------|--------|-------------|
| `TTS_ENABLED` | Disabled for MVP | Will be added in v2 |
| `TTS_MODE` | Disabled for MVP | Will be added in v2 |
| `AWS_*` | Not used in MVP | Remove from .env |
| `HUGGINGFACE_API_TOKEN` | Not used | Remove from .env |
| `SPEECH_API_URL` | Not used in MVP | Use OpenAI Whisper |
| `WHISPER_API_KEY` | Not used in MVP | Use OpenAI Whisper |
| `SERPAPI_API_KEY` | LangChain removed | Remove from .env |

**Note:** These variables are kept in `.env-example` for backward compatibility but have no effect in MVP.

---

## Configuration Checklist

### Required (Minimum to run)
- [x] `OPENAI_API_KEY` - Get from https://platform.openai.com/api-keys

### Recommended (Production)
- [ ] `OPENAI_GPT_MODEL` - Set to `gpt-4o`
- [ ] `DATABASE_URL` - Set for your environment
- [ ] `REDIS_URL` - Set for your environment
- [ ] `RATE_LIMIT_PER_USER` - Set to `10`
- [ ] `RATE_LIMIT_GLOBAL` - Set to `100`
- [ ] `COST_ALERT_THRESHOLD` - Set to `50`
- [ ] `ADMIN_PHONE_NUMBERS` - Add your admin numbers
- [ ] `PRE_PROMPT` - Customize for your business
- [ ] `MODERATION_ENABLED` - Set to `true`
- [ ] `LOG_LEVEL` - Set to `info`
- [ ] `NODE_ENV` - Set to `production`

### Optional (Nice to have)
- [ ] `WHITELISTED_PHONE_NUMBERS` - For beta testing
- [ ] `SENTRY_DSN` - For error tracking
- [ ] `ALERT_EMAIL` - For cost alerts
- [ ] `VISION_ENABLED` - Enable/disable image analysis
- [ ] `GROUPCHATS_ENABLED` - Enable/disable groups

---

## Environment-Specific Examples

### Development (.env.local)
```bash
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=file:./data/dev.db
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
OPENAI_GPT_MODEL=gpt-3.5-turbo  # Cheaper for dev
RATE_LIMIT_PER_USER=100  # No limits in dev
MODERATION_ENABLED=false  # Faster testing
```

### Production (.env.production)
```bash
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=file:/data/whatsapp-bot.db
REDIS_URL=redis://redis:6379
OPENAI_API_KEY=sk-prod-...
OPENAI_GPT_MODEL=gpt-4o
MAX_MODEL_TOKENS=2000
RATE_LIMIT_PER_USER=10
RATE_LIMIT_GLOBAL=100
COST_ALERT_THRESHOLD=50
MODERATION_ENABLED=true
ADMIN_PHONE_NUMBERS=+15551234567
PRE_PROMPT="You are a professional customer service assistant..."
SENTRY_DSN=https://...
```

### Test (.env.test)
```bash
NODE_ENV=test
LOG_LEVEL=error
DATABASE_URL=file::memory:
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-test-mock
TRANSCRIPTION_ENABLED=false
TTS_ENABLED=false
MODERATION_ENABLED=false
```

---

**Need help? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.**
