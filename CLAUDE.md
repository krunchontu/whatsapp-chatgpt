# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **business-focused WhatsApp bot** powered by OpenAI's GPT and DALL-E models that integrates with WhatsApp Web using Puppeteer.

**Primary Use Case:** AI-powered customer service automation and team productivity for businesses using WhatsApp as their primary communication channel.

**Core Capabilities:**
- **Customer Service Automation**: AI-powered responses to customer inquiries via WhatsApp
- **Team Productivity**: AI assistance for customer service agents and teams
- **Multi-Modal Support**: Text, voice messages, images, and document processing
- **Business Features**: RBAC for team roles, audit logs, data retention, usage tracking

**Target Audience:** Small to medium businesses in WhatsApp-heavy markets (Latin America, Southeast Asia, Middle East, India) that want to automate customer service and improve team efficiency.

## Development Commands

### Running the Application
```bash
npm start                    # Start the bot using vite-node
```

### Code Formatting
```bash
npm run format               # Format code with Prettier
npm run format:check         # Check code formatting without changes
```

### Docker
```bash
docker-compose up            # Run the bot in Docker
docker-compose up --build    # Rebuild and run
```

## Architecture

### Entry Point & Initialization
- `src/index.ts` - Application entry point that initializes the WhatsApp client with Puppeteer
- WhatsApp Web version is pinned to 2.2412.54 via remote cache
- Session data stored in directory specified by `SESSION_PATH` env var (default: `./session`)
- Uses `LocalAuth` strategy for persistent authentication
- Event handlers are registered for QR code, authentication, messages, etc.

### Configuration System
- `src/config.ts` - Central configuration loaded from environment variables
- `src/constants.ts` - Application constants (session path, status broadcast ID)
- `src/config/puppeteer.ts` - Puppeteer-specific browser launch arguments
- Custom moderation parameters via `CUSTOM_MODERATION_PARAMS` env var (JSON format)

### Message Flow
1. **Message Reception** (`src/events/message.ts`):
   - Events: `MESSAGE_RECEIVED` (incoming) and `MESSAGE_CREATE` (outgoing/self-notes)
   - Routes to `handleIncomingMessage()` in `src/handlers/message.ts`

2. **Message Handling** (`src/handlers/message.ts`):
   - Checks timestamp to ignore old messages (`handlers/timestamp.ts`)
   - Enforces group chat settings and whitelist access control
   - Attempts voice message transcription first
   - Dispatches to command handler

3. **Command Dispatching** (`src/handlers/command.ts`):
   - Parses command prefixes (!gpt, !dalle, !reset, !config, !lang, !sd, !translate)
   - Routes to appropriate handler based on prefix
   - Falls back to GPT handler if prefixes disabled or self-noted message

### AI Providers
- `src/providers/openai.ts` - OpenAI API client with chat completion and transcription
  - Lazy initialization via `initOpenAI()` when first needed
  - Supports vision models for image analysis
  - Handles Whisper transcription with audio format conversion (OGG to WAV via ffmpeg)
- `src/providers/speech.ts` - Text-to-speech via external Speech API
- `src/providers/aws.ts` - AWS Polly for text-to-speech
- `src/providers/whisper-*.ts` - Multiple Whisper transcription backends (local, API, OpenAI)

### Command Modules
Commands are organized as modules in `src/commands/`:
- Each module exports a `register()` function returning command definitions
- Registered in `src/handlers/ai-config.ts` via `initAiConfig()`
- Available modules: chat, general, gpt, transcription, tts, stable-diffusion, translate
- Command pattern: `!config <module> <command> <value>`

### GPT Handler (`src/handlers/gpt.ts`)
Key features:
- Supports text prompts with optional image attachments or image URLs
- Vision API integration when images detected (uses `config.visionModel`, typically gpt-4o)
- Extracts image URLs from message links by checking file extensions
- Converts WhatsApp media to base64 for vision API
- Applies pre-prompt from config as system message
- Optional prompt moderation before processing
- Optional TTS response (Speech API or AWS Polly)
- Debug logging throughout media handling flow

### AI Configuration (`src/handlers/ai-config.ts`)
- Runtime configuration system via `!config` commands
- Manages DALL-E settings (image size, model)
- Command registry system: `aiConfig.commandsMap`
- Conversation context reset via `!reset` command

### Moderation
- `src/handlers/moderation.ts` - Content moderation for incoming prompts
- Configurable via `PROMPT_MODERATION_ENABLED` and blacklist categories
- Custom moderation parameters defined per deployment

## Environment Variables

Key environment variables to configure (see `.env-example`):
- `OPENAI_API_KEY` or `OPENAI_API_KEYS` (comma-separated for rate limit rotation)
- `OPENAI_GPT_MODEL` (default: gpt-3.5-turbo, recommended: gpt-4o)
- `MAX_MODEL_TOKENS` - Token limit per request
- `PRE_PROMPT` - System prompt prepended to all conversations
- `PREFIX_ENABLED` - Whether commands require prefixes
- `PREFIX_SKIPPED_FOR_ME` - Skip prefix for self-noted messages
- `GROUPCHATS_ENABLED` - Allow bot in group chats
- `MODERATION_ENABLED` - Enable content moderation
- `CUSTOM_MODERATION_PARAMS` - JSON object with moderation categories
- `WHITELISTED_PHONE_NUMBERS` - Comma-separated allowed numbers
- `TRANSCRIPTION_ENABLED` / `TRANSCRIPTION_MODE` - Voice message handling
- `TTS_ENABLED` / `TTS_MODE` - Text-to-speech responses
- `VISION_ENABLED` - Enable image analysis (default: true)
- `VISION_MODEL` - Model for vision tasks (default: gpt-4o)
- `SESSION_PATH` - WhatsApp session storage location

## Business Configuration

### Recommended PRE_PROMPT for Customer Service

Configure the bot's personality and behavior for professional customer service by setting the `PRE_PROMPT` environment variable:

```bash
PRE_PROMPT="You are a professional customer service assistant for [COMPANY_NAME].

Your role:
- Help customers with their questions and issues professionally and courteously
- Provide accurate information about products, services, policies, and procedures
- Be concise but thorough - keep responses under 3 sentences when possible
- Use a friendly, professional tone - never use slang or informal language
- If you don't know the answer, admit it and offer to escalate to a human agent
- For complex issues or complaints, always offer to transfer to a human agent
- Never make promises about refunds, returns, or policy exceptions
- Always thank customers for their patience and business

Important guidelines:
- Respond in the customer's language (auto-detect)
- Be empathetic but maintain professional boundaries
- Focus on solutions, not problems
- Escalate when: customer is frustrated, issue is complex, or you're uncertain

When to escalate: Say 'Let me transfer you to one of our team members who can better assist you with this.'

Current date: [AUTO_FILLED]
Business hours: [CONFIGURE_BUSINESS_HOURS]
"
```

**Customization Checklist:**
1. Replace `[COMPANY_NAME]` with your business name
2. Add `[CONFIGURE_BUSINESS_HOURS]` (e.g., "Monday-Friday 9AM-6PM PST")
3. Add company-specific policies or information
4. Adjust tone based on your brand (formal vs casual)
5. Add industry-specific knowledge (e.g., shipping policies, return windows)

### RBAC Role Configuration

Configure team roles using environment variables:

```bash
# Owner (full access)
OWNER_PHONE_NUMBERS=+1234567890

# Admins (manage config, view audit logs)
ADMIN_PHONE_NUMBERS=+1234567891,+1234567892

# Operators (customer service agents, limited config access)
OPERATOR_PHONE_NUMBERS=+1234567893,+1234567894,+1234567895

# Whitelisted customers (if using whitelist mode)
WHITELISTED_PHONE_NUMBERS=+1234567896,+1234567897
```

**Role Capabilities:**
- **Owner**: Full system access, can modify all settings, view audit logs
- **Admin**: Team lead - manage runtime config, view usage metrics, access reports
- **Operator**: Customer service agent - handle escalations, basic config (language, model)
- **User**: Customer - can interact with bot, no config access

### Business-Specific Settings

**Enable Group Chat Support** (for customer support groups):
```bash
GROUPCHATS_ENABLED=true
```

**Enable Content Moderation** (prevent spam/abuse):
```bash
MODERATION_ENABLED=true
CUSTOM_MODERATION_PARAMS='{"harassment":true,"harassment/threatening":true,"hate":true,"self-harm":false,"sexual":false,"violence":false}'
```

**Configure Usage Tracking** (cost control):
```bash
USAGE_TRACKING_ENABLED=true  # Track token usage per customer/agent
COST_ALERT_THRESHOLD=100      # Alert when monthly cost exceeds $100
```

**Data Retention Policy** (GDPR compliance):
```bash
DEFAULT_RETENTION_DAYS=30     # Delete conversation data after 30 days
ALLOW_CUSTOMER_EXPORT=true    # Let customers export their data
```

### Example Business Deployment (.env)

```bash
# Company Info
COMPANY_NAME="Acme Customer Support"
PRE_PROMPT="You are a professional customer service assistant for Acme Corp..."

# OpenAI Config
OPENAI_API_KEY=sk-...
OPENAI_GPT_MODEL=gpt-4o
MAX_MODEL_TOKENS=2000

# Business Features
GROUPCHATS_ENABLED=true
MODERATION_ENABLED=true
PREFIX_ENABLED=false              # No need for !gpt prefix in customer service
PREFIX_SKIPPED_FOR_ME=true

# Team Roles
OWNER_PHONE_NUMBERS=+15551234567           # Business owner
ADMIN_PHONE_NUMBERS=+15551234568           # Team lead
OPERATOR_PHONE_NUMBERS=+15551234569,+15551234570  # CS agents

# Voice & Transcription (important for global customers)
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODE=OpenAI
TTS_ENABLED=false                 # Disable unless needed

# Privacy & Compliance
DEFAULT_RETENTION_DAYS=30
ALLOW_CUSTOMER_EXPORT=true

# Performance
RATE_LIMIT_PER_USER=10            # 10 messages per minute per customer
RATE_LIMIT_GLOBAL=100             # 100 messages per minute total
```

## Important Patterns

### Adding New Commands
1. Create module in `src/commands/` implementing `ICommandModule` interface
2. Export `key` and `register()` function returning `ICommandsMap`
3. Add module to registration array in `src/handlers/ai-config.ts` `initAiConfig()`
4. Commands automatically appear in `!config help` output

### Working with WhatsApp Media
- Use `message.hasMedia` to check for attachments
- Call `message.downloadMedia()` to get `MessageMedia` object
- Check media type with `isImageMedia(media)` from `src/utils.ts`
- Convert to base64 with `convertMediaToBase64(media)` for API usage
- Image URLs detected via `message.links` array with extension pattern matching

### OpenAI Client Pattern
- Don't instantiate OpenAI client at module level
- Use lazy initialization via `initOpenAI()` before API calls
- API key comes from `getConfig("gpt", "apiKey")` not directly from env
- Supports organization and project scoping via config

### Session Management
- Session directory must exist before WhatsApp client initialization
- Created automatically in `src/index.ts` if missing
- Persistent across restarts for avoiding repeated QR scans
- In Docker, mounted as volume for persistence

## Docker Deployment

- Multi-stage build separates build and runtime dependencies
- Chromium and ffmpeg bundled in image
- Non-root user (appuser:1001) for security
- Session data persists via named volume
- Health check endpoint expected at localhost:3000/health (not yet implemented)
- Memory limits: 512M max, 256M reserved
- Uses tini as init system for proper signal handling
