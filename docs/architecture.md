# WhatsApp-ChatGPT Bot - Production Hardening & Feature Enhancement Architecture

## Introduction

This document outlines the architectural approach for enhancing **WhatsApp-ChatGPT Bot** with **Production Hardening & Multi-Phase Feature Enhancements**. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development of new features while ensuring seamless integration with the existing system.

**Relationship to Existing Architecture:**
This document supplements existing project architecture by defining how new components will integrate with current systems. Where conflicts arise between new and existing patterns, this document provides guidance on maintaining consistency while implementing enhancements.

### Existing Project Analysis

After reviewing the codebase structure, documentation (CLAUDE.md), and comprehensive technical analysis, the following represents the current state of the system:

#### Current Project State

- **Primary Purpose:** WhatsApp bot powered by OpenAI's GPT and DALL-E models that integrates with WhatsApp Web using Puppeteer. Provides text chat, voice transcription, image generation, image analysis (vision), and text-to-speech capabilities.
- **Current Tech Stack:** Node.js 18+, TypeScript, Puppeteer 22.15.0, whatsapp-web.js 1.26.0, OpenAI API 4.52.1, AWS Polly, ffmpeg, LangChain 0.3.x, vite-node for execution
- **Architecture Style:** Event-driven modular architecture with clear separation of concerns:
  - **Events** (`src/events/`) - WhatsApp client event handlers
  - **Handlers** (`src/handlers/`) - Business logic for messages, commands, AI operations
  - **Providers** (`src/providers/`) - External service integrations (OpenAI, AWS, Whisper, Speech API)
  - **Commands** (`src/commands/`) - Modular command system with registration pattern
  - **Config** (`src/config.ts`, `src/handlers/ai-config.ts`) - **TWO SEPARATE CONFIG SYSTEMS** (env-based + runtime mutable)
- **Deployment Method:** Docker with multi-stage builds, non-root user (appuser:1001), resource limits (512M max), tini init system, persistent session volume

#### Available Documentation

- **CLAUDE.md** - Comprehensive project overview with architecture, configuration, commands, patterns, Docker deployment
- **docs/** - User-facing documentation (installation, configuration, usage guides for GPT, transcription, TTS, Docker, LangChain)
- **No formal architecture document** - This is the first comprehensive architecture document

#### Identified Constraints

- **Hardcoded WhatsApp Web version** (`2.2412.54`) - Will break when WhatsApp deprecates this version; no auto-update mechanism
- **In-memory state management** - `aiConfig` object in `ai-config.ts` is global mutable state; conversation context lost on restart
- **No persistent storage layer (P0 constraint that becomes P1 blocker)** - Current system is ephemeral. P1 features (#11 per-chat memory, #13 File IQ, #16 group copilot) require storage. **Decision needed during P0:** SQLite (simple, local), PostgreSQL (scalable, Docker Compose add), or Redis (fast, ephemeral-ish). **Recommendation:** Start with SQLite for single-instance deployments; design abstraction layer for future multi-instance scaling.
- **No health check implementation** - Docker expects `/health` endpoint but it doesn't exist
- **Session directory permissions** - `chmod 1777` (world-writable) in Dockerfile is overly permissive
- **Single-threaded event loop** - Heavy operations (FFmpeg, vision API) can block message processing
- **No observability infrastructure** - No metrics, structured logging, or alerting
- **Configuration security vulnerability** - Runtime `!config` commands can modify sensitive settings including API keys via WhatsApp messages
- **Debug logging in production** - Extensive `console.log` statements including PII (phone numbers, message content, images)
- **Suppressed deprecation warnings** - `process.removeAllListeners("warning")` in index.ts hides legitimate issues
- **Incomplete features (LangChain, Stable Diffusion)** - Command routing exists but minimal implementation. **Decision for P2 or later:**
  - **Option A (Recommended):** Feature-flag these as "experimental" until properly implemented
  - **Option B:** Remove routing if no user demand; reduce maintenance surface
  - **Option C:** Complete in P3 if business case emerges

  **Architectural stance:** Do not expand these in P0/P1; focus on hardening core GPT/DALL-E/transcription flows.

### Security Posture Assessment

**CRITICAL VULNERABILITIES (P0 Blockers):**

- **P0 #1 - API Key Exposure:** Any whitelisted user can execute `!config gpt apiKey <new-key>` to hijack API access. **Risk:** Unauthorized billing, data exfiltration, service disruption.
- **P0 #2 - PII Logging:** Full message objects logged with phone numbers, message content, images. **Risk:** GDPR/privacy violations, leaked credentials.
- **P0 #9 - Filesystem Permissions:** Session directory `chmod 1777` (world-writable). **Risk:** Session hijacking, arbitrary file writes.

**Impact if not addressed:** Production deployment in current state risks:
- Financial loss (API abuse)
- Legal liability (data breach)
- Reputational damage (service compromise)

**Recommendation:** P0 items #1, #2, #9 are **non-negotiable** before onboarding external users.

### Enhancement Overview

**Enhancement Type:** Brownfield Production Hardening + Progressive Feature Additions
**Scope:** Multi-phase enhancement across 3 priority tiers (23 items total)

- **Phase 1 (P0 - Blockers):** Security & Operations Foundation (Items #1-10) - MUST ship before onboarding users
- **Phase 2 (P1 - High Impact):** User-Visible Value Layer (Items #11-17) - Ships immediately after P0
- **Phase 3 (P2 - Monetization):** Business Workflows & Revenue Features (Items #18-22) - After steady operations established

**Integration Impact Breakdown:**
- **Code Changes:** ~40% refactor (config, logging), ~60% net new (RBAC, storage, features)
- **Deployment Impact:** Rolling deployment possible for P1/P2; P0 #10 (config unification) requires coordinated restart
- **User Impact:** Existing commands remain functional; new RBAC may prompt role assignment on first use
- **Data Migration:** P1 introduces storage layer - requires migration plan for existing conversation state (currently lost on restart)

**Estimated Timeline (from user-provided plan):**
- Sprint 1 (Week 1): P0 items #1-5 (RBAC, logging, retention, audit, health checks)
- Sprint 2 (Week 2): P0 items #6-10 (rate limiting, temp files, deps, permissions, config unification)
- Sprint 3 (Week 3): P1 items #11-14 (memory, slash tools, file IQ, voice-first)
- Sprint 4 (Week 4): P1 items #15-17 (usage metrics, group copilot, error taxonomy)

**Architectural Note:** This timeline is aggressive. P0 #10 (config unification) touches ~15 files and requires careful regression testing. P1 storage layer (items #11, #13) is a foundational shift that may extend Sprint 3.

**Backward Compatibility Guarantees:**
- ✅ Existing chat commands (`!gpt`, `!dalle`, `!reset`, etc.) remain functional
- ✅ Existing environment variables honored (new vars added, none removed)
- ✅ Session data format compatible (WhatsApp auth persists across upgrades)
- ⚠️ `!config` behavior changes: Secrets no longer mutable at runtime (P0 #1); requires migration to env vars
- ⚠️ Log format changes: Structured JSON logs replace debug console output (P0 #2); log parsers may need updates

**Testing Strategy (Critical for P0):**

Given the scope of P0 refactoring (config unification, logging overhaul), the following testing is **mandatory**:
- **Regression tests:** Existing commands (!gpt, !dalle, transcription, TTS) must pass pre/post-refactor
- **Integration tests:** WhatsApp session management, OpenAI API calls, media handling
- **Security tests:** RBAC enforcement, PII redaction, audit log immutability
- **Load tests:** Rate limiting, job queue backpressure, temp file cleanup under load

**Recommendation:** Define test plan during "Testing Strategy" section; execute before each phase ships.

**Success Criteria by Phase:**

**P0 Complete When:**
- [ ] All 10 items (#1-10) implemented and tested
- [ ] Security audit passes (no secrets in runtime config, no PII in logs, proper file permissions)
- [ ] Health check endpoint returns 200 OK
- [ ] Load test passes (100 concurrent users, no event loop starvation)
- [ ] Zero suppressed warnings in production logs
- [ ] Documentation updated (CLAUDE.md, .env-example)

**P1 Complete When:**
- [ ] All 7 items (#11-17) implemented
- [ ] Storage layer operational with migrations tested
- [ ] User-facing features validated (per-chat memory, slash tools, file IQ, voice UX)
- [ ] Usage metrics accurate and accessible via `/usage` command
- [ ] Error messages user-friendly (no "An error occurred" generic messages)

**P2 Complete When:**
- [ ] Business workflow features (#18-22) operational
- [ ] WABA compliance verified for broadcasts
- [ ] Form/workflow exports tested (CSV, email, webhooks)
- [ ] Revenue tracking integrated with usage metrics

### Change Log

| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|--------|
| Initial architecture | 2025-01-24 | 1.0 | Brownfield enhancement architecture for production hardening & features | Winston (Architect) |

---

## Enhancement Scope and Integration Strategy

This section defines how P0-P2 enhancements will integrate with the existing WhatsApp-ChatGPT bot architecture.

### Integration Approach

#### Code Integration Strategy

**P0 Code Integration (Security & Operations Foundation):**

- **P0 #1 (RBAC for config):**
  - Create new module: `src/security/rbac.ts` (role definitions: owner/admin/operator/user, permission checks)
  - Create: `src/security/session.ts` for short-lived admin session tokens (Redis-backed, 15-min TTL)
  - Refactor: `src/handlers/ai-config.ts` to use RBAC guards before executing config commands
  - Integration point: Wrap `handleMessageAIConfig()` with permission middleware
  - **Breaking change mitigation:** See "!config Breaking Change Migration Plan" below

- **P0 #2 (Structured logging with PII redaction):**
  - Create new module: `src/logging/logger.ts` (Pino-based structured logger for performance)
  - Create: `src/logging/pii-redactor.ts` (regex-based phone/email/NRIC/API key redaction)
  - Create: `src/logging/log-levels.ts` (environment-based log level configuration)
  - Refactor: Replace all `console.log()`, `console.debug()`, `console.error()` calls across ~15 files with `logger.info()`, `logger.debug()`, `logger.error()`
  - Remove: All `JSON.stringify(message)` logging that exposes PII
  - Integration point: Inject logger into all handlers, providers, events; configure log rotation in Docker

- **P0 #3 (Data retention & privacy controls):**
  - Create: `src/handlers/privacy.ts` (handles `/export`, `/wipe`, `/retention` commands)
  - Create: `src/storage/retention-manager.ts` (TTL enforcement, scheduled cleanup)
  - Create: `src/repositories/retention-repository.ts` (thin repository pattern for retention policies)
  - Database: `retention_policies` table (see Database Integration section)
  - Integration: Background job (BullMQ scheduled worker) enforces TTL daily at 2 AM UTC

- **P0 #4 (Audit trail for privileged actions):**
  - Create: `src/security/audit-logger.ts` (append-only audit log writer with hash chain for immutability)
  - Create: `src/commands/audit.ts` (handles `/audit last 100` command, RBAC owner-only)
  - Create: `src/repositories/audit-repository.ts` (thin repository for audit logs)
  - Database: `audit_logs` table with hash_chain column for tamper detection
  - Integration: Hook into RBAC actions (`src/security/rbac.ts`), config changes (`src/handlers/ai-config.ts`), broadcasts (P2)

- **P0 #5 (Health/Ready/Live endpoints):**
  - Create: `src/api/health-server.ts` (native Node.js `http` module, zero dependencies)
  - Endpoints:
    - `GET /healthz` - Process health (200 if running, used by Docker healthcheck)
    - `GET /readyz` - Readiness (checks WhatsApp client state + OpenAI API reachability with 5s timeout)
    - `GET /livez` - Liveness (event loop responsive check)
  - Integration: Start HTTP server on port 3000 in `src/index.ts` alongside WhatsApp client initialization
  - **No authentication needed** - Internal endpoints only, not exposed externally

- **P0 #6 (Rate limiting + job queue):**
  - Create: `src/queue/job-queue.ts` (BullMQ wrapper with job types: transcription, vision, ocr, tts)
  - Create: `src/queue/workers.ts` (worker processes for heavy jobs)
  - Create: `src/middleware/rate-limiter.ts` (token bucket: 10 req/min per user, 100 req/min global)
  - Refactor: `src/handlers/transcription.ts` to enqueue FFmpeg jobs instead of blocking
  - Refactor: `src/handlers/gpt.ts` vision API calls to enqueue image analysis
  - Integration: Message handler intercepts heavy operations, queues them, replies "Processing... I'll notify you when ready"
  - Backpressure: If queue depth >200, reject new jobs with "System busy, try again in 1 minute"

- **P0 #7 (Temp file lifecycle & crash-safe cleanup):**
  - Create: `src/utils/temp-file-manager.ts` (PID-scoped temp dirs: `/tmp/whatsapp-bot-{pid}/`)
  - Refactor: All temp file creation in `src/providers/whisper-*.ts`, `src/handlers/transcription.ts` to use managed API
  - Add: Cleanup on boot (delete orphaned `/tmp/whatsapp-bot-*` directories from crashed processes)
  - Add: Graceful shutdown handler to cleanup temp files on SIGTERM
  - Integration: Worker isolation - each job queue worker gets isolated temp directory

- **P0 #8 (Dependency hygiene):**
  - Remove: `process.removeAllListeners("warning")` from `src/index.ts:2`
  - Update: `package.json` dependencies to resolve punycode deprecation (likely via `whatwg-url` update)
  - Add: CI/CD check that fails build on deprecation warnings (`NODE_OPTIONS=--trace-warnings`)
  - Integration: Continuous - deprecation warnings become build failures

- **P0 #9 (Session directory permissions):**
  - Refactor: `Dockerfile` line 121 from `chmod 1777` to `chmod 700` (owner-only read/write/execute)
  - Verify: `appuser:1001` has exclusive access, no other users can read/write
  - Integration: Docker image build validation; security scan passes

- **P0 #10 (Unified config system):**
  - **Major refactor (high risk - see rollback strategy below):**
  - Create: `src/config/schema.ts` (Zod schema for validation, type-safe config)
  - Create: `src/config/index.ts` (unified config object, immutable at runtime, env-only initialization)
  - Create: `src/config/runtime-settings.ts` (non-secret settings like model selection, RBAC-guarded)
  - Remove: Global mutable `aiConfig` object from `src/handlers/ai-config.ts`
  - Refactor: All modules calling `getConfig("gpt", "apiKey")` (~15 files) to use `config.openai.apiKey`
  - Merge: `config.ts` and `ai-config.ts` into single `config/` module
  - **Breaking change:** `!config gpt apiKey` no longer works (see migration plan below)
  - Integration: All modules import from `src/config` singleton

**P1 Code Integration (User Value Layer):**

- **P1 #11 (Per-chat memory with privacy):**
  - Create: `src/handlers/memory.ts` (handles `!remember`, `!forget`, `!list`, `!export` memory commands)
  - Create: `src/repositories/conversation-repository.ts` (thin repository for conversation storage)
  - Database: `conversation_memory` table with TTL enforcement
  - Integration: Inject conversation context into GPT handler; respect retention policies from P0 #3

- **P1 #12 (Slash tools with WhatsApp interactive UI):**
  - Create: `src/commands/slash-tools.ts` (register `/summarize`, `/translate`, `/action-items`, `/remind`, `/todo`)
  - Leverage: `whatsapp-web.js` Buttons API for quick actions, Lists API for menus
  - Integration: Extend `src/handlers/command.ts` dispatcher with `/` prefix handling

- **P1 #13 (File IQ - drop doc/image, ask later):**
  - Create: `src/handlers/file-iq.ts` (OCR via Tesseract, embeddings via OpenAI, `!askfile` command)
  - Create: `src/repositories/file-repository.ts` (thin repository with PostgreSQL-specific pgvector queries)
  - Database: `file_metadata` table with vector embeddings column
  - Integration: Queue-based OCR/embedding (P0 #6 job queue), async notification when ready

- **P1 #14 (Voice-first UX):**
  - Enhance: `src/handlers/transcription.ts` to auto-transcribe voice notes (remove `!transcribe` prefix requirement)
  - Create: `src/commands/read.ts` for `/read` TTS command (reads last bot response aloud)
  - Integration: Modify `src/events/message.ts` to detect voice notes and auto-process

- **P1 #15 (Usage & cost meter):**
  - Create: `src/handlers/usage.ts` (handles `/usage` command with date range filters)
  - Create: `src/repositories/usage-repository.ts` (thin repository for metrics)
  - Create: `src/middleware/usage-tracker.ts` (intercepts OpenAI API calls, logs tokens/cost)
  - Database: `usage_metrics` table (user_id, chat_id, date, tokens, api_calls, cost)
  - Integration: Hook into OpenAI provider (`src/providers/openai.ts`) to capture metrics

- **P1 #16 (Group admin copilot):**
  - Create: `src/handlers/group-admin.ts` (handles `/rules`, `/moderate on|off`, `/warn @user`, `/recap daily`)
  - Create: `src/repositories/moderation-repository.ts` (store moderation settings per group)
  - Database: `group_settings` table
  - Integration: Hook into `src/events/message.ts` for group messages, apply moderation rules

- **P1 #17 (Error taxonomy + user-safe messages):**
  - Create: `src/errors/error-codes.ts` (enum: FILE_TOO_LARGE, API_RATE_LIMIT, INSUFFICIENT_PERMISSIONS, etc.)
  - Create: `src/errors/user-messages.ts` (map error codes to user-friendly messages)
  - Refactor: All `catch (error: any)` blocks across codebase to use typed errors
  - Integration: Global error handler in message processing pipeline translates error codes to messages

**P2 Code Integration (Business Workflows):**

- **P2 #18-22:** Forms, templates, workflows, broadcasts, bookmarks, rubber-duck mode
- All require database integration and new command modules following existing `ICommandModule` interface pattern
- Integration approach: Extend command registration in `src/handlers/ai-config.ts` (post-unification in P0 #10)

#### Database Integration

**Critical Clarification: Database Required in P0, Not P1**

The original draft incorrectly positioned database as "P1 Major Shift." **Database infrastructure is required in P0 Sprint 1 (Week 1)** for:
- **P0 #3:** Retention policies storage
- **P0 #4:** Audit logs (append-only, immutable)

**Database Selection (Required Decision Before P0 Sprint 1):**

| Factor | SQLite | PostgreSQL |
|--------|--------|------------|
| **P0 Requirements** | ✅ Supports retention policies, audit logs | ✅ Supports retention policies, audit logs |
| **P1 #13 (File IQ vector search)** | ⚠️ Requires sqlite-vss (immature, 0.x version) | ✅ pgvector (mature, production-proven) |
| **Operational Complexity** | ✅ Embedded, no extra containers | ⚠️ Requires Docker Compose update |
| **Scaling (Future)** | ❌ Single-instance only | ✅ Multi-instance ready |
| **Development Overhead** | ✅ Simple | ⚠️ Slightly more complex |

**Architect's Recommendation: PostgreSQL from P0 Sprint 1**

**Rationale:**
1. **P1 #13 File IQ requires pgvector** - If we start with SQLite in P0 Sprint 1 (Week 1), we'd need to migrate to PostgreSQL by P1 Sprint 3 (Week 3). That's a 2-week window for a major migration - **not realistic**.
2. **Avoid mid-sprint database migration risk** - Pay upfront cost (Docker Compose complexity) to de-risk P1.
3. **Production-proven for vector search** - pgvector is mature; sqlite-vss is experimental.

**Infrastructure Stack (P0 Sprint 1):**
- **PostgreSQL 16:** Persistent storage (audit logs, retention policies, later: conversation memory, file metadata, usage metrics)
- **Redis 7:** Ephemeral storage (BullMQ job queue, rate limiting, session tokens, conversation context caching)
- **Docker Compose Update:** Add `postgres` and `redis` services to `docker-compose.yml`

**Thin Repository Pattern (10% Overhead Decision):**

After architectural debate, we're using **thin repository pattern** instead of full database abstraction layer:

```typescript
// src/repositories/base-repository.ts
export abstract class BaseRepository {
  protected prisma = prisma; // Direct Prisma access
}

// src/repositories/conversation-repository.ts
export class ConversationRepository extends BaseRepository {
  async save(chatId: string, messages: Message[]) {
    return this.prisma.conversation.upsert({
      where: { chatId },
      update: { messages },
      create: { chatId, messages }
    });
  }

  async get(chatId: string) {
    return this.prisma.conversation.findUnique({ where: { chatId } });
  }
}

// src/repositories/file-repository.ts
export class FileRepository extends BaseRepository {
  async search(query: string, embedding: number[]) {
    // PostgreSQL-specific pgvector query (acknowledged, not abstracted)
    return this.prisma.$queryRaw`
      SELECT * FROM files
      ORDER BY embedding <-> ${embedding}::vector
      LIMIT 10
    `;
  }
}
```

**Benefits:**
- ✅ Testability (mock repositories in unit tests)
- ✅ Encapsulation (database logic centralized)
- ✅ Low overhead (~10% vs. 30% for full abstraction layer)
- ✅ Acknowledges PostgreSQL-specific features (pgvector) instead of pretending they're portable
- ✅ Future migration easier (update repositories, not scattered Prisma calls)

**Schema Overview:**

**P0 Tables (Sprint 1 - Week 1):**
```sql
-- Retention policies per chat
CREATE TABLE retention_policies (
  chat_id VARCHAR(255) PRIMARY KEY,
  retention_days INTEGER NOT NULL DEFAULT 30,
  opt_in_status BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs (append-only, immutable)
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  metadata JSONB,
  hash_chain VARCHAR(64) -- SHA-256 hash of previous log entry for immutability verification
);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
```

**P1 Tables (Sprint 3 - Week 3):**
```sql
-- Conversation memory with TTL
CREATE TABLE conversation_memory (
  chat_id VARCHAR(255) PRIMARY KEY,
  messages JSONB NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_conversation_expires ON conversation_memory(expires_at);

-- File metadata with vector embeddings (pgvector extension required)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE file_metadata (
  file_id VARCHAR(255) PRIMARY KEY,
  chat_id VARCHAR(255) NOT NULL,
  ocr_text TEXT,
  embedding vector(1536), -- OpenAI ada-002 embedding dimension
  file_type VARCHAR(50),
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_file_chat ON file_metadata(chat_id);
CREATE INDEX idx_file_embedding ON file_metadata USING ivfflat (embedding vector_cosine_ops);

-- Usage metrics
CREATE TABLE usage_metrics (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  chat_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 4) DEFAULT 0,
  UNIQUE(user_id, chat_id, date)
);
CREATE INDEX idx_usage_user_date ON usage_metrics(user_id, date);
CREATE INDEX idx_usage_chat_date ON usage_metrics(chat_id, date);

-- Group settings (for P1 #16 group admin copilot)
CREATE TABLE group_settings (
  group_id VARCHAR(255) PRIMARY KEY,
  moderation_enabled BOOLEAN DEFAULT false,
  rules_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Migration Strategy:**
- Use **Prisma Migrate** for schema versioning
- Migrations stored in `prisma/migrations/`
- Run `prisma migrate deploy` on container startup
- Backward compatibility N/A (starting from zero, no existing database)

#### API Integration

**Current State:** No HTTP API; only WhatsApp message-based interface.

**P0 API Integration (Sprint 1 - Week 1):**

**P0 #5 (Health/Ready/Live endpoints):**

```typescript
// src/api/health-server.ts (native Node.js http module)
import http from 'http';
import { checkWhatsAppSession } from '../utils/whatsapp-health';
import { checkOpenAIReachability } from '../utils/openai-health';

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/healthz') {
    // Process health - just return 200 if running
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
  }
  else if (req.url === '/readyz') {
    // Readiness - check WhatsApp session + OpenAI API
    const waReady = await checkWhatsAppSession(); // 5s timeout
    const openaiReady = await checkOpenAIReachability(); // 5s timeout

    if (waReady && openaiReady) {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ready', whatsapp: true, openai: true }));
    } else {
      res.writeHead(503); // Service Unavailable
      res.end(JSON.stringify({ status: 'not_ready', whatsapp: waReady, openai: openaiReady }));
    }
  }
  else if (req.url === '/livez') {
    // Liveness - event loop responsive check
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'live', timestamp: new Date().toISOString() }));
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

export function startHealthServer(port = 3000) {
  server.listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
  });
}
```

**Integration:**
- Start HTTP server in `src/index.ts` alongside WhatsApp client
- Docker `healthcheck` in `docker-compose.yml` uses `curl -f http://localhost:3000/healthz`
- **No authentication** - Internal endpoints only, not exposed to internet

**P1 API Integration:** None (WhatsApp commands sufficient)

**P2 API Integration:**

- **P2 #18-19 (Forms & workflows export endpoints):**
  - `POST /api/forms/export` - Export form data as CSV
  - `POST /api/workflows/webhook` - Webhook integration for workflow completions
  - **At this point, migrate from native http to Fastify** (need routing, middleware, auth)
  - **Authentication:** API key-based auth (separate from WhatsApp RBAC)

#### UI Integration

**Current State:** WhatsApp chat interface only (text commands).

**P0 UI Integration:** None (operations-focused, no user-facing UI changes)

**P1 UI Integration:**

- **P1 #12 (Slash tools with WhatsApp interactive UI):**
  - Use `whatsapp-web.js` **Buttons API** for quick actions:
    ```typescript
    // Example: /translate with language selection
    const buttons = new Buttons(
      'Select target language:',
      [
        { id: 'vi', body: '🇻🇳 Vietnamese' },
        { id: 'my', body: '🇲🇾 Malay' },
        { id: 'zh', body: '🇨🇳 Chinese' }
      ],
      'Translation', 'Choose language'
    );
    await message.reply(buttons);
    ```
  - Use **Lists API** for longer menus:
    ```typescript
    // Example: /usage with date range selection
    const list = new List(
      'View usage statistics:',
      'Select Period',
      [
        { title: 'Today', description: 'Usage for today' },
        { title: 'This Week', description: 'Last 7 days' },
        { title: 'This Month', description: 'Last 30 days' },
        { title: 'All Time', description: 'Total usage' }
      ],
      'Usage Period'
    );
    await message.reply(list);
    ```
  - Integration: Extend `Message.reply()` in handlers to include button/list metadata

- **P1 #11 (Per-chat memory with interactive prompts):**
  - Example: "I remember we discussed [topic]. Should I forget this? [Yes | No]"
  - Use Buttons API for memory management UX

**P2 UI Integration:**

- **P2 #18 (Quick forms in chat):**
  - Multi-step form collection using WhatsApp message threads
  - Use Lists API for field selection, Buttons for navigation ("Next Field", "Submit", "Cancel")

**Integration Strategy:**
- Leverage existing `whatsapp-web.js` capabilities (Buttons, Lists) - no external UI framework needed
- No web dashboard required (WhatsApp is the interface)
- Future consideration: Admin web dashboard for analytics (P3+, out of scope)

### Compatibility Requirements

#### Existing API Compatibility

**WhatsApp Command Interface:**
- ✅ All existing commands (`!gpt`, `!dalle`, `!reset`, `!config`, `!lang`, `!sd`, `!translate`) remain functional
- ⚠️ `!config` behavior changes in P0 #1 (see migration plan below)
- ✅ New slash commands (`/summarize`, `/translate`, `/usage`, etc.) added in P1
- **Command prefix coexistence:** `!` for AI model invocation, `/` for utility tools

**OpenAI API Compatibility:**
- ✅ No breaking changes to OpenAI integration
- ✅ Vision API, chat completions, DALL-E, Whisper remain unchanged
- ✅ API key rotation (multiple keys in `OPENAI_API_KEYS`) preserved
- ✅ Lazy initialization pattern (`initOpenAI()`) preserved

**Provider API Compatibility:**
- ✅ AWS Polly TTS integration unchanged
- ✅ Speech API transcription unchanged
- ✅ Whisper (local, API, OpenAI) providers unchanged
- ✅ Multi-provider architecture preserved

#### !config Breaking Change Migration Plan (P0 #1)

**Phase 1 (P0 Sprint 1 Week 1 - Soft Deprecation):**
- `!config` commands for secrets (apiKey, awsAccessKeyId, whisperApiKey) log warning:
  ```
  ⚠️ DEPRECATION WARNING
  Modifying secrets via chat will be disabled in 7 days for security reasons.
  Please update your .env file instead:

  !config gpt apiKey <key> → .env: OPENAI_API_KEY=<key>

  See docs/migration.md for full migration guide.
  ```
- Audit log captures all deprecation warnings with user ID
- Commands still work during grace period

**Phase 2 (P0 Sprint 2 Week 2 - Hard Cutoff):**
- `!config` commands for secrets return error:
  ```
  ❌ SECURITY POLICY
  Secrets can no longer be modified via chat.
  Update your .env file and restart the bot.

  Allowed settings: model, imageSize, language, ttsMode
  Restricted settings: apiKey, awsAccessKeyId, awsSecretAccessKey

  See docs/migration.md for details.
  ```
- Non-secret settings still modifiable (e.g., `!config dalle size 1024x1024`)
- RBAC required: Only admin/owner roles can modify non-secret settings

**Documentation (docs/migration.md):**
```markdown
# !config Migration Guide

## Secret Settings (Now Environment Variables Only)

| Old Command | New Environment Variable |
|-------------|-------------------------|
| `!config gpt apiKey <key>` | `OPENAI_API_KEY=<key>` |
| `!config gpt organization <org>` | `OPENAI_ORGANIZATION=<org>` |
| `!config aws accessKeyId <id>` | `AWS_ACCESS_KEY_ID=<id>` |
| `!config aws secretAccessKey <secret>` | `AWS_SECRET_ACCESS_KEY=<secret>` |
| `!config whisper apiKey <key>` | `WHISPER_API_KEY=<key>` |

## Non-Secret Settings (Still Configurable via !config)

| Command | Example | RBAC Required |
|---------|---------|---------------|
| `!config gpt model <model>` | `!config gpt model gpt-4o` | Admin |
| `!config dalle size <size>` | `!config dalle size 1024x1024` | Admin |
| `!config tts mode <mode>` | `!config tts mode speech-api` | Admin |

## Migration Steps

1. Copy secret values from current runtime config (use `!config help` to see current values)
2. Add to `.env` file
3. Restart bot: `docker compose restart whatsapp-chatgpt`
4. Verify: Bot should start without errors and API calls should work
```

**Backward Compatibility Path:**
- Users already using `.env` (majority) see zero impact
- Users who modified secrets via `!config` get 7-day warning + clear migration docs

#### Database Schema Compatibility

**Current:** N/A (no database)

**P0 Forward Compatibility:**
- Prisma migrations are versioned (sequential numbering: `20250124_init`, `20250131_add_p1_tables`)
- Schema evolution tracked in `prisma/migrations/` directory
- **No backward compatibility concerns** (starting from zero)

**Future PostgreSQL Features:**
- pgvector for embeddings (P1 #13)
- Full-text search (tsvector) if needed in P2+
- JSONB for flexible schema (already used in conversation_memory, metadata columns)

#### Performance Impact

**P0 Performance Changes:**

- **P0 #6 (Rate limiting + job queue):**
  - ✅ **Positive:** Heavy operations (FFmpeg, vision API) no longer block event loop
  - ⚠️ **Trade-off:** Slight latency increase for queued jobs (+2-10s depending on queue depth)
  - **User impact:** System remains responsive under load; queued jobs get async notification

- **P0 #2 (Structured logging with Pino):**
  - ✅ **Neutral:** Pino is one of the fastest Node.js loggers (<1ms overhead per log)
  - **User impact:** None (logging is internal)

**P1 Performance Changes:**

- **P1 #11 (Per-chat memory - database queries):**
  - PostgreSQL query latency: 20-100ms per query (Docker network)
  - **With Redis caching:** <5ms for cache hits (90% expected hit rate)
  - **User impact:** Negligible with caching; worst-case +100ms without cache

- **P1 #13 (File IQ - OCR + embeddings):**
  - **OCR (Tesseract):** 2-10 seconds per page (depending on resolution)
  - **Embedding generation (OpenAI):** 1-3 seconds per document
  - **Vector similarity search:** <100ms (PostgreSQL pgvector with IVFFlat index)
  - **Total end-to-end:** 3-30 seconds depending on document size
  - **User experience:** "📄 Processing your 3-page document... I'll notify you when ready." (async job via BullMQ)

- **P0 #6 (Job queue depth impact on latency):**
  - **Queue processing rate:** ~10 jobs/second (single worker)
  - **Under load:** Queue depth could reach 100+ jobs
  - **User impact:** Job in position 100 waits ~10 seconds before processing starts
  - **Mitigation:** Horizontal scaling (add worker containers), prioritize user-facing jobs over batch jobs

**Realistic Performance Estimates:**

| Operation | Current (P0 Baseline) | With Enhancements | Notes |
|-----------|----------------------|-------------------|-------|
| Text message reply | <200ms | <300ms | +100ms for database context retrieval (cached) |
| Voice transcription (1 min) | <5s (blocks event loop) | <7s (queued, non-blocking) | +2s queue wait, but doesn't block other messages |
| Image generation (DALL-E) | Dependent on OpenAI | Unchanged | External API latency unchanged |
| Vision API (image analysis) | 2-3s (blocks event loop) | 4-5s (queued, non-blocking) | +2s queue wait, system stays responsive |
| File IQ (document upload) | N/A | 3-30s (async) | New feature, async notification |

**Performance Guarantees:**
- ✅ Message processing latency: <300ms for text messages (P1 with caching)
- ✅ Event loop non-blocking: All heavy operations queued (P0 #6)
- ✅ System responsive under load: Rate limiting prevents overload (P0 #6)
- ⚠️ Queue depth transparency: Users informed of processing status ("Processing... 5 jobs ahead of you")

### P0 #10 Config Unification - Rollback Strategy

**Risk Mitigation for High-Risk Refactor:**

**Pre-Deployment:**
- **Feature flag:** `UNIFIED_CONFIG_ENABLED=true|false` environment variable
  - `false` (default): Use legacy dual-config system (`src/config.ts` + `src/handlers/ai-config.ts`)
  - `true`: Use new unified config (`src/config/index.ts`)
- Allows testing in production with easy rollback

**Deployment Strategy (P0 Sprint 2):**
1. Deploy with `UNIFIED_CONFIG_ENABLED=false` (no behavior change)
2. Run smoke tests: Execute all existing commands (!gpt, !dalle, !config, !reset)
3. Run regression test suite (mandatory)
4. Flip to `UNIFIED_CONFIG_ENABLED=true`
5. Monitor for errors for 24 hours
6. If breaking issue discovered: Set `UNIFIED_CONFIG_ENABLED=false`, restart (instant rollback)

**Rollback Plan:**
- **Trigger:** Critical bug in unified config (e.g., API keys not loaded, config commands broken)
- **Action:** Set `UNIFIED_CONFIG_ENABLED=false` in `.env`, restart containers
- **Recovery time:** <5 minutes (env var change + restart)
- **Hotfix:** Fix unified config while running on legacy system, re-enable when validated

**Completion:**
- After 1 week in production with `UNIFIED_CONFIG_ENABLED=true` and zero issues:
  - Remove feature flag
  - Delete legacy config code
  - Update documentation to reflect unified config only

### Architect's Technology Recommendations

Based on analysis above, here are explicit technology choices for P0:

1. **Database:** ✅ **PostgreSQL 16** (required for P1 #13 pgvector, no point delaying)
   - ORM: **Prisma** (type-safe, excellent migrations, widely adopted)
   - Pattern: **Thin repository pattern** (10% overhead, good balance)

2. **Job Queue:** ✅ **BullMQ with Redis 7** (mature, excellent monitoring, widely adopted)
   - Alternative considered: pg-boss (PostgreSQL-based) - rejected due to less mature monitoring
   - Workers: Separate worker processes, horizontally scalable

3. **Breaking Change (!config secrets):** ✅ **7-day soft deprecation → hard cutoff**
   - Migration guide: `docs/migration.md`
   - Users on `.env` (majority): zero impact

4. **HTTP Server (P0 health checks):** ✅ **Native Node.js http module** (zero dependencies, <50 lines of code)
   - P2 migration: Move to Fastify when webhooks/exports require routing

5. **Structured Logging:** ✅ **Pino** (fastest Node.js logger, production-proven)
   - PII redaction: Custom middleware with regex patterns
   - Log rotation: Docker log driver (`json-file` with `max-size: 10m`)

6. **Rate Limiting Storage:** ✅ **Redis** (same instance as BullMQ, token bucket algorithm)

7. **Session Tokens (P0 #1 RBAC):** ✅ **Redis with 15-min TTL** (ephemeral, auto-expiry)

**Infrastructure Summary (P0 Sprint 1):**
```yaml
# docker-compose.yml additions
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: whatsapp_bot
      POSTGRES_USER: bot_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - whatsapp-net

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - whatsapp-net

volumes:
  postgres-data:
  redis-data:
```

---

## Tech Stack

### Existing Technology Stack

The following table documents the current technology stack that will be maintained and integrated with:

| Category | Current Technology | Version | Usage in Enhancement | Notes |
|----------|-------------------|---------|---------------------|-------|
| **Runtime** | Node.js | 18+ | ✅ Maintained | Existing engine requirement |
| **Language** | TypeScript | Latest | ✅ Maintained | All new code in TypeScript |
| **Build Tool** | vite-node | 1.0.2+ | ✅ Maintained | Fast dev execution |
| **WhatsApp Integration** | whatsapp-web.js | 1.26.0 | ✅ Enhanced (Buttons/Lists in P1) | Core integration |
| **Browser Automation** | Puppeteer | 22.15.0 | ✅ Maintained | WhatsApp Web automation |
| **AI - Chat/Vision** | OpenAI API | 4.52.1 | ✅ Maintained + Extended (embeddings P1) | GPT, DALL-E, Vision, Whisper |
| **AI - TTS** | AWS Polly | @aws-sdk/client-polly 3.731.1 | ✅ Maintained | Text-to-speech |
| **Media Processing** | FFmpeg | @ffmpeg-installer/ffmpeg 1.1.0 | ✅ Refactored (queue in P0 #6) | Audio conversion |
| **Media Processing** | fluent-ffmpeg | 2.1.3 | ✅ Maintained | FFmpeg wrapper |
| **AI Framework** | LangChain | 0.3.11 | ⚠️ Feature-flagged (incomplete) | Keep as-is, no expansion P0/P1 |
| **Utilities** | dotenv | 16.3.1 | ✅ Maintained | Environment configuration |
| **Utilities** | lru-cache | 10.2.0 | ✅ Maintained | In-memory caching |
| **Utilities** | picocolors | 1.0.0 | ✅ Maintained | CLI colors |
| **Utilities** | qrcode | 1.5.3 | ✅ Maintained | QR code generation |
| **Code Quality** | Prettier | 3.0.3 | ✅ Maintained | Code formatting |
| **Container** | Docker | Latest | ✅ Enhanced (docker-compose update P0) | Deployment |

### New Technology Additions

#### P0 Sprint 1 (Week 1) - Critical Infrastructure

| Technology | Version | Purpose | Rationale | Integration Method |
|-----------|---------|---------|-----------|-------------------|
| **PostgreSQL** | 16-alpine | Persistent storage (audit logs, retention, P1 features) | Required for P1 #13 pgvector; mature, scalable | Docker Compose service |
| **Redis** | 7-alpine | Job queue, rate limiting, sessions, cache | Required for BullMQ; fast, widely adopted | Docker Compose service |
| **Prisma** | Latest | Type-safe ORM, migrations | Best-in-class TypeScript ORM | npm dependency |
| **BullMQ** | Latest | Job queue for heavy operations | Production-proven, excellent monitoring | npm dependency |
| **Pino** | Latest | Structured logging with PII redaction | Fastest Node.js logger | npm dependency |
| **Zod** | Latest | Config schema validation | Type-safe runtime validation | npm dependency |

#### P1 Sprint 3 (Week 3) - User Features

| Technology | Version | Purpose | Rationale | Integration Method |
|-----------|---------|---------|-----------|-------------------|
| **pgvector** | Latest | PostgreSQL extension for vector search | File IQ (P1 #13) embeddings similarity search | PostgreSQL extension |
| **Tesseract** | Latest (via tesseract.js) | OCR for document processing | File IQ (P1 #13) text extraction | npm dependency |
| **ioredis** | Latest | Redis client for Node.js | Better performance than node-redis | npm dependency (BullMQ dependency) |

#### P2 - Business Features (Future)

| Technology | Version | Purpose | Rationale | Integration Method |
|-----------|---------|---------|-----------|-------------------|
| **Fastify** | Latest | HTTP framework for webhooks/exports | Lightweight, fast (upgrade from native http) | npm dependency |
| **csv-writer** | Latest | CSV export for forms/workflows | Simple, reliable | npm dependency |

### Technology Decision Rationale

**Why PostgreSQL over SQLite:**
- P1 #13 File IQ requires pgvector (mature) vs. sqlite-vss (experimental 0.x)
- Avoid mid-sprint migration (SQLite in P0 → PostgreSQL in P1 = risky)
- Multi-instance ready for future scaling

**Why BullMQ over alternatives:**
- pg-boss: PostgreSQL-based but less mature monitoring
- Bee-Queue: Less feature-complete than BullMQ
- BullMQ: Production-proven, excellent observability, active development

**Why Prisma over TypeORM/Sequelize:**
- Type safety (generates types from schema)
- Best-in-class migrations
- Excellent developer experience
- Active development and community

**Why Pino over Winston:**
- Performance: Pino is 2-3x faster (critical for high-throughput logging)
- Structured logging by default
- Lower memory overhead
- Production-proven at scale

**Why native http (P0) then Fastify (P2):**
- P0 needs only 3 health endpoints - native http sufficient
- Fastify migration in P2 when routing complexity justifies framework
- Avoid premature dependency addition

### Dependency Updates (P0 #8)

**Required Updates to Fix Deprecation Warnings:**

```json
// package.json updates
{
  "dependencies": {
    // Existing (update to resolve punycode deprecation)
    "whatwg-url": "^14.0.0",  // Resolves punycode warning

    // New P0 dependencies
    "prisma": "^5.8.0",
    "@prisma/client": "^5.8.0",
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.2",
    "pino": "^8.17.2",
    "pino-pretty": "^10.3.1",  // Dev pretty printing
    "zod": "^3.22.4"
  },
  "devDependencies": {
    // New P0 dev dependencies
    "@types/node": "^18.19.0",
    "tsx": "^4.7.0"  // Alternative to vite-node with better watch mode
  }
}
```

**Removed:**
- `process.removeAllListeners("warning")` - Delete from src/index.ts

**CI/CD Enforcement:**
```bash
# Add to CI pipeline
NODE_OPTIONS=--trace-warnings npm test
# Fails build if deprecation warnings present
```

---

## Data Models and Schema Changes

### Schema Design Philosophy

1. **Immutability for audit logs** - Append-only with hash chain
2. **TTL enforcement** - Automated expiry for privacy compliance
3. **JSONB for flexibility** - Semi-structured data where schema evolution expected
4. **Indexing strategy** - Optimize for query patterns, not theoretical use cases
5. **Vector embeddings** - 1536 dimensions (OpenAI ada-002 standard)

### P0 Data Models (Sprint 1 - Week 1)

#### Retention Policies

**Purpose:** Store per-chat data retention preferences for privacy compliance (P0 #3).

**Schema:**
```sql
CREATE TABLE retention_policies (
  chat_id VARCHAR(255) PRIMARY KEY,
  retention_days INTEGER NOT NULL DEFAULT 30,
  opt_in_status BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- Primary key on `chat_id` (automatic)

**Business Rules:**
- Default retention: 30 days
- User must opt-in explicitly (GDPR compliance)
- Background job enforces TTL daily at 2 AM UTC
- Deletion cascades to conversation_memory, file_metadata

**Integration:**
- `/retention set 60` - Set retention to 60 days
- `/retention show` - Display current retention policy
- `/export` - Export all user data before deletion
- `/wipe` - Immediate deletion (opt-out)

#### Audit Logs

**Purpose:** Immutable audit trail for privileged actions (P0 #4).

**Schema:**
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,  -- e.g., "RBAC_ROLE_CHANGE", "CONFIG_UPDATE", "BROADCAST_SENT"
  metadata JSONB,  -- Flexible action-specific data
  hash_chain VARCHAR(64),  -- SHA-256(id + timestamp + user_id + action + prev_hash)
  CONSTRAINT fk_prev_hash CHECK (hash_chain IS NOT NULL)
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

**Hash Chain Implementation:**
```typescript
// src/security/audit-logger.ts
async function appendAuditLog(userId: string, action: string, metadata: any) {
  const lastLog = await prisma.audit_logs.findFirst({
    orderBy: { id: 'desc' }
  });

  const prevHash = lastLog?.hash_chain || '0000000000000000000000000000000000000000000000000000000000000000';
  const currentHash = sha256(`${userId}|${action}|${Date.now()}|${prevHash}`);

  return prisma.audit_logs.create({
    data: {
      user_id: userId,
      action,
      metadata,
      hash_chain: currentHash
    }
  });
}
```

**Immutability Verification:**
```typescript
// Verify audit log integrity
async function verifyAuditLogIntegrity(): Promise<boolean> {
  const logs = await prisma.audit_logs.findMany({ orderBy: { id: 'asc' } });
  let prevHash = '0000...';

  for (const log of logs) {
    const expectedHash = sha256(`${log.user_id}|${log.action}|${log.timestamp}|${prevHash}`);
    if (log.hash_chain !== expectedHash) return false;  // Tamper detected
    prevHash = log.hash_chain;
  }
  return true;
}
```

**Business Rules:**
- Append-only (no UPDATE or DELETE operations allowed)
- Hash chain ensures tamper detection
- Retention: Minimum 1 year (compliance requirement)
- Access: Owner role only (`/audit last 100`)

### P1 Data Models (Sprint 3 - Week 3)

#### Conversation Memory

**Purpose:** Store per-chat conversation context for continuity (P1 #11).

**Schema:**
```sql
CREATE TABLE conversation_memory (
  chat_id VARCHAR(255) PRIMARY KEY,
  messages JSONB NOT NULL,  -- Array of {role, content, timestamp}
  token_count INTEGER DEFAULT 0,  -- Track context size
  expires_at TIMESTAMP,  -- TTL from retention_policies
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversation_expires ON conversation_memory(expires_at) WHERE expires_at IS NOT NULL;
```

**Message Format (JSONB):**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather today?",
      "timestamp": "2025-01-24T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "I don't have access to real-time weather data...",
      "timestamp": "2025-01-24T10:00:02Z"
    }
  ]
}
```

**Business Rules:**
- Max context window: 4000 tokens (truncate oldest if exceeded)
- Respects retention_policies.retention_days
- Redis caching: 90% hit rate expected (cache recent conversations)
- `/forget` - Clear conversation context
- `/remember <fact>` - Explicitly store context
- `/list` - Show remembered facts

**TTL Enforcement:**
```sql
-- Daily cleanup job (2 AM UTC)
DELETE FROM conversation_memory
WHERE expires_at < NOW();
```

#### File Metadata

**Purpose:** Store uploaded files with OCR text and embeddings for semantic search (P1 #13).

**Schema:**
```sql
-- Requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE file_metadata (
  file_id VARCHAR(255) PRIMARY KEY,  -- SHA-256 hash of file content
  chat_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500),
  file_type VARCHAR(50),  -- 'pdf', 'image/png', 'image/jpeg', etc.
  file_size INTEGER,  -- Bytes
  ocr_text TEXT,  -- Tesseract extraction
  embedding vector(1536),  -- OpenAI ada-002 embeddings
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,  -- Respects retention policy
  FOREIGN KEY (chat_id) REFERENCES retention_policies(chat_id) ON DELETE CASCADE
);

CREATE INDEX idx_file_chat ON file_metadata(chat_id);
CREATE INDEX idx_file_expires ON file_metadata(expires_at) WHERE expires_at IS NOT NULL;

-- Vector similarity search index (IVFFlat algorithm)
CREATE INDEX idx_file_embedding ON file_metadata
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Embedding Generation:**
```typescript
// src/handlers/file-iq.ts
async function processFile(file: File, chatId: string) {
  // 1. OCR extraction (Tesseract)
  const ocrText = await extractText(file);

  // 2. Generate embedding (OpenAI)
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: ocrText.substring(0, 8000)  // Token limit
  });

  // 3. Store in database
  await prisma.file_metadata.create({
    data: {
      file_id: sha256(file.content),
      chat_id: chatId,
      file_name: file.name,
      file_type: file.mimeType,
      file_size: file.size,
      ocr_text: ocrText,
      embedding: embedding.data[0].embedding,
      expires_at: calculateExpiry(chatId)  // From retention_policies
    }
  });
}
```

**Similarity Search:**
```typescript
// !askfile "What was the budget for Q4?"
async function searchFiles(chatId: string, query: string) {
  // 1. Generate query embedding
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: query
  });

  // 2. Vector similarity search (pgvector)
  const results = await prisma.$queryRaw`
    SELECT
      file_id,
      file_name,
      ocr_text,
      1 - (embedding <=> ${queryEmbedding.data[0].embedding}::vector) AS similarity
    FROM file_metadata
    WHERE chat_id = ${chatId}
    ORDER BY embedding <=> ${queryEmbedding.data[0].embedding}::vector
    LIMIT 5
  `;

  return results;  // [{file_name, ocr_text, similarity: 0.89}, ...]
}
```

**Business Rules:**
- Max file size: 20MB (enforced in handler)
- Supported types: PDF, PNG, JPG, JPEG
- OCR timeout: 30s per document
- Embedding cost: $0.0001 per 1K tokens (logged in usage_metrics)

#### Usage Metrics

**Purpose:** Track API usage, tokens, costs for transparency and billing (P1 #15).

**Schema:**
```sql
CREATE TABLE usage_metrics (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  chat_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  operation VARCHAR(50),  -- 'gpt', 'dalle', 'whisper', 'embedding', 'tts'
  tokens_used INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 4) DEFAULT 0,
  metadata JSONB,  -- Model used, latency, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, chat_id, date, operation)
);

CREATE INDEX idx_usage_user_date ON usage_metrics(user_id, date DESC);
CREATE INDEX idx_usage_chat_date ON usage_metrics(chat_id, date DESC);
CREATE INDEX idx_usage_date ON usage_metrics(date DESC);
```

**Cost Calculation (as of Jan 2025):**
```typescript
// src/middleware/usage-tracker.ts
const PRICING = {
  'gpt-4o': { input: 0.0025, output: 0.01 },  // Per 1K tokens
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'dall-e-3': { '1024x1024': 0.040 },  // Per image
  'whisper-1': { audio: 0.006 },  // Per minute
  'text-embedding-ada-002': { embedding: 0.0001 }  // Per 1K tokens
};

async function trackUsage(userId: string, chatId: string, operation: string, tokens: number, model: string) {
  const cost = calculateCost(operation, tokens, model);

  await prisma.usage_metrics.upsert({
    where: {
      user_id_chat_id_date_operation: {
        user_id: userId,
        chat_id: chatId,
        date: new Date().toISOString().split('T')[0],
        operation
      }
    },
    update: {
      tokens_used: { increment: tokens },
      api_calls: { increment: 1 },
      cost_usd: { increment: cost }
    },
    create: {
      user_id: userId,
      chat_id: chatId,
      date: new Date(),
      operation,
      tokens_used: tokens,
      api_calls: 1,
      cost_usd: cost,
      metadata: { model, timestamp: new Date() }
    }
  });
}
```

**Query Examples:**
```typescript
// /usage today
const today = await prisma.usage_metrics.aggregate({
  where: {
    user_id: userId,
    date: new Date()
  },
  _sum: { tokens_used: true, cost_usd: true }
});

// /usage this-month
const month = await prisma.usage_metrics.aggregate({
  where: {
    user_id: userId,
    date: { gte: startOfMonth(new Date()) }
  },
  _sum: { tokens_used: true, api_calls: true, cost_usd: true },
  _groupBy: ['operation']
});
```

#### Group Settings

**Purpose:** Store moderation settings for group chats (P1 #16).

**Schema:**
```sql
CREATE TABLE group_settings (
  group_id VARCHAR(255) PRIMARY KEY,
  moderation_enabled BOOLEAN DEFAULT false,
  rules_text TEXT,  -- Custom group rules
  warn_threshold INTEGER DEFAULT 3,  -- Warnings before action
  auto_mute_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Moderation warnings
CREATE TABLE moderation_warnings (
  id SERIAL PRIMARY KEY,
  group_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  reason TEXT,
  warned_at TIMESTAMP DEFAULT NOW(),
  warned_by VARCHAR(255),  -- Admin who issued warning
  FOREIGN KEY (group_id) REFERENCES group_settings(group_id) ON DELETE CASCADE
);

CREATE INDEX idx_moderation_group_user ON moderation_warnings(group_id, user_id);
```

**Business Rules:**
- `/rules` - Display group rules
- `/moderate on` - Enable moderation (admin only)
- `/warn @user <reason>` - Issue warning
- Auto-mute after `warn_threshold` warnings
- `/recap daily` - Daily summary of group activity

### Schema Migration Strategy

**Prisma Migration Workflow:**

```bash
# P0 Sprint 1 - Initial schema
npx prisma migrate dev --name init_p0_schema

# P1 Sprint 3 - Add user features
npx prisma migrate dev --name add_p1_features

# Production deployment
npx prisma migrate deploy  # Run in Docker entrypoint
```

**Docker Entrypoint Update:**
```dockerfile
# Dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
```

**Migration Rollback:**
- Prisma migrations are versioned and reversible
- Keep migrations in git for audit trail
- Test migrations in staging before production

---

## Component Architecture

### New Components (P0-P1)

The following diagram shows how new components integrate with existing architecture:

```mermaid
graph TB
    subgraph "Existing Architecture"
        WA[WhatsApp Client<br/>whatsapp-web.js]
        Events[src/events/<br/>Message Events]
        MsgHandler[src/handlers/message.ts<br/>Message Handler]
        CmdDispatch[src/handlers/command.ts<br/>Command Dispatcher]
        GPTHandler[src/handlers/gpt.ts<br/>GPT Handler]
        DALLEHandler[src/handlers/dalle.ts<br/>DALLE Handler]
        OpenAIProvider[src/providers/openai.ts<br/>OpenAI Provider]
    end

    subgraph "P0 New Components - Security & Ops"
        RBAC[src/security/rbac.ts<br/>RBAC Engine]
        Session[src/security/session.ts<br/>Admin Sessions]
        AuditLog[src/security/audit-logger.ts<br/>Audit Logger]
        Logger[src/logging/logger.ts<br/>Structured Logger]
        PIIRedact[src/logging/pii-redactor.ts<br/>PII Redaction]
        RateLimit[src/middleware/rate-limiter.ts<br/>Rate Limiter]
        JobQueue[src/queue/job-queue.ts<br/>BullMQ Queue]
        Workers[src/queue/workers.ts<br/>Job Workers]
        TempMgr[src/utils/temp-file-manager.ts<br/>Temp File Manager]
        HealthAPI[src/api/health-server.ts<br/>Health Check Server]
        Config[src/config/<br/>Unified Config]
    end

    subgraph "P0 Infrastructure"
        Postgres[(PostgreSQL<br/>Audit + Retention)]
        Redis[(Redis<br/>Queue + Cache + Sessions)]
    end

    subgraph "P1 New Components - User Features"
        Memory[src/handlers/memory.ts<br/>Conversation Memory]
        SlashTools[src/commands/slash-tools.ts<br/>Slash Commands]
        FileIQ[src/handlers/file-iq.ts<br/>File IQ]
        Usage[src/handlers/usage.ts<br/>Usage Metrics]
        GroupAdmin[src/handlers/group-admin.ts<br/>Group Moderation]
        ErrorTax[src/errors/<br/>Error Taxonomy]
    end

    subgraph "Repository Layer (Thin Pattern)"
        RetentionRepo[ConversationRepository]
        AuditRepo[AuditRepository]
        FileRepo[FileRepository]
        UsageRepo[UsageRepository]
    end

    WA --> Events
    Events --> MsgHandler
    MsgHandler --> RateLimit
    RateLimit --> CmdDispatch
    CmdDispatch --> RBAC
    RBAC --> GPTHandler
    RBAC --> DALLEHandler
    RBAC --> Memory
    RBAC --> SlashTools
    RBAC --> FileIQ

    GPTHandler --> JobQueue
    FileIQ --> JobQueue
    JobQueue --> Workers
    Workers --> TempMgr
    Workers --> OpenAIProvider

    RBAC --> Session
    RBAC --> AuditLog
    AuditLog --> AuditRepo

    Memory --> RetentionRepo
    FileIQ --> FileRepo
    Usage --> UsageRepo

    RetentionRepo --> Postgres
    AuditRepo --> Postgres
    FileRepo --> Postgres
    UsageRepo --> Postgres

    Session --> Redis
    JobQueue --> Redis
    RateLimit --> Redis

    HealthAPI -.->|Health Checks| WA
    HealthAPI -.->|Readiness| OpenAIProvider

    Logger --> PIIRedact
    MsgHandler --> Logger
    GPTHandler --> Logger
    Workers --> Logger
```

### Component Responsibility Matrix

| Component | Responsibility | Dependencies | Integrates With |
|-----------|---------------|--------------|-----------------|
| **RBAC Engine** | Role-based access control, permission checks | Redis (sessions), AuditLogger | All command handlers |
| **Admin Sessions** | Short-lived admin session tokens (15min TTL) | Redis | RBAC Engine |
| **Audit Logger** | Immutable audit trail with hash chain | AuditRepository, Postgres | RBAC, Config, Broadcasts |
| **Structured Logger** | Pino-based logging with PII redaction | PII Redactor | All modules |
| **Rate Limiter** | Token bucket per user/global | Redis | Message Handler |
| **Job Queue** | BullMQ wrapper for heavy operations | Redis, Workers | GPT Handler, FileIQ, Transcription |
| **Job Workers** | Process queued jobs (FFmpeg, OCR, embeddings) | TempFileManager, OpenAI Provider | Job Queue |
| **Temp File Manager** | PID-scoped temp dirs, crash-safe cleanup | OS filesystem | Workers, Transcription |
| **Health Check Server** | HTTP server for /healthz, /readyz, /livez | WhatsApp Client, OpenAI Provider | Docker healthcheck |
| **Unified Config** | Immutable config from env, Zod validation | Zod schema | All modules |
| **Conversation Memory** | Per-chat context with TTL | ConversationRepository, Redis cache | GPT Handler |
| **Slash Tools** | Utility commands (/summarize, /translate, etc.) | whatsapp-web.js Buttons/Lists | Command Dispatcher |
| **File IQ** | OCR + embeddings + semantic search | FileRepository, Job Queue, OpenAI | Message Handler (media) |
| **Usage Metrics** | Track tokens, costs, API calls | UsageRepository, OpenAI Provider | All AI operations |
| **Group Moderation** | Rules, warnings, moderation | ModerationRepository | Message Handler (groups) |
| **Error Taxonomy** | User-friendly error messages | Error codes enum | All handlers (catch blocks) |

### Key Integration Patterns

#### 1. Repository Pattern (Thin)

**Purpose:** Encapsulate database operations without over-abstracting.

```typescript
// src/repositories/base-repository.ts
export abstract class BaseRepository {
  protected prisma = prisma;
}

// src/repositories/conversation-repository.ts
export class ConversationRepository extends BaseRepository {
  async save(chatId: string, messages: Message[], ttl: number) {
    return this.prisma.conversation_memory.upsert({
      where: { chat_id: chatId },
      update: {
        messages,
        expires_at: new Date(Date.now() + ttl * 24 * 60 * 60 * 1000),
        updated_at: new Date()
      },
      create: {
        chat_id: chatId,
        messages,
        expires_at: new Date(Date.now() + ttl * 24 * 60 * 60 * 1000)
      }
    });
  }

  async get(chatId: string): Promise<Message[] | null> {
    const memory = await this.prisma.conversation_memory.findUnique({
      where: { chat_id: chatId }
    });
    return memory?.messages as Message[] || null;
  }
}
```

#### 2. Middleware Pattern (Rate Limiting, Usage Tracking)

**Purpose:** Cross-cutting concerns applied to message handling pipeline.

```typescript
// src/middleware/rate-limiter.ts
export async function rateLimitMiddleware(message: Message, next: () => Promise<void>) {
  const userId = message.from;
  const allowed = await checkRateLimit(userId);  // Redis token bucket

  if (!allowed) {
    await message.reply("⏱️ Slow down! You're sending messages too quickly. Try again in 1 minute.");
    return;  // Short-circuit
  }

  await next();  // Continue to command dispatcher
}

// src/handlers/message.ts
export async function handleIncomingMessage(message: Message) {
  await rateLimitMiddleware(message, async () => {
    await commandDispatcher(message);
  });
}
```

#### 3. Job Queue Pattern (Heavy Operations)

**Purpose:** Offload blocking operations to background workers.

```typescript
// src/queue/job-queue.ts
export enum JobType {
  TRANSCRIPTION = 'transcription',
  VISION = 'vision',
  OCR = 'ocr',
  EMBEDDING = 'embedding',
  TTS = 'tts'
}

export async function enqueueJob(type: JobType, data: any, chatId: string) {
  const job = await queue.add(type, {
    ...data,
    chatId,
    timestamp: Date.now()
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });

  return job.id;
}

// src/queue/workers.ts
queue.process(JobType.OCR, async (job) => {
  const { fileBuffer, chatId, fileId } = job.data;

  // 1. OCR extraction
  const text = await tesseract.recognize(fileBuffer);

  // 2. Generate embedding
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text
  });

  // 3. Save to database
  await fileRepository.save(fileId, chatId, text, embedding.data[0].embedding);

  // 4. Notify user
  await whatsappClient.sendMessage(chatId, `✅ Your document "${fileName}" is ready! Use !askfile to search it.`);
});
```

#### 4. RBAC Integration Pattern

**Purpose:** Protect admin commands with role-based access control.

```typescript
// src/security/rbac.ts
export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  OPERATOR = 'operator',
  USER = 'user'
}

export function requireRole(minRole: Role) {
  return async (message: Message, next: () => Promise<void>) => {
    const userRole = await getUserRole(message.from);

    if (!hasPermission(userRole, minRole)) {
      await auditLogger.log(message.from, 'RBAC_DENIED', {
        command: message.body,
        required: minRole,
        actual: userRole
      });

      await message.reply("❌ Insufficient permissions. This command requires admin access.");
      return;
    }

    await auditLogger.log(message.from, 'RBAC_ALLOWED', {
      command: message.body,
      role: userRole
    });

    await next();
  };
}

// Usage in command handler
// src/commands/audit.ts
export async function handleAuditCommand(message: Message, args: string[]) {
  await requireRole(Role.OWNER)(message, async () => {
    const logs = await auditRepository.getLast(100);
    await message.reply(formatAuditLogs(logs));
  });
}
```

---

## Source Tree

### Existing Project Structure (Relevant Parts)

```
whatsapp-chatgpt/
├── src/
│   ├── cli/
│   │   └── ui.ts                   # CLI output utilities
│   ├── commands/                   # Existing command modules
│   │   ├── chat.ts
│   │   ├── general.ts
│   │   ├── gpt.ts
│   │   ├── stable-diffusion.ts
│   │   ├── transcription.ts
│   │   ├── translate.ts
│   │   └── tts.ts
│   ├── config/
│   │   └── puppeteer.ts            # Puppeteer browser args
│   ├── events/                     # WhatsApp event handlers
│   │   ├── authFailure.ts
│   │   ├── authenticated.ts
│   │   ├── browser.ts
│   │   ├── loading.ts
│   │   ├── message.ts              # MESSAGE_RECEIVED, MESSAGE_CREATE
│   │   ├── qr.ts
│   │   └── ready.ts
│   ├── handlers/                   # Business logic
│   │   ├── ai-config.ts            # Runtime AI config (TO BE REFACTORED P0 #10)
│   │   ├── command.ts              # Command dispatcher
│   │   ├── dalle.ts
│   │   ├── gpt.ts
│   │   ├── langchain.ts
│   │   ├── message.ts              # Main message handler
│   │   ├── moderation.ts
│   │   ├── timestamp.ts
│   │   ├── transcription.ts
│   │   └── translate.ts
│   ├── providers/                  # External service integrations
│   │   ├── aws.ts                  # AWS Polly
│   │   ├── browser-agent.ts
│   │   ├── openai.ts               # OpenAI API client
│   │   ├── speech.ts
│   │   ├── whisper-api.ts
│   │   └── whisper-local.ts
│   ├── types/                      # TypeScript types
│   │   ├── ai-config.ts
│   │   ├── aws-polly-engine.ts
│   │   ├── commands.ts
│   │   ├── dalle-config.ts
│   │   ├── transcription-mode.ts
│   │   └── tts-mode.ts
│   ├── config.ts                   # Environment-based config (TO BE MERGED P0 #10)
│   ├── constants.ts
│   ├── index.ts                    # Application entrypoint
│   └── utils.ts
├── docs/                           # User documentation
│   ├── architecture.md             # THIS FILE
│   ├── README.md
│   └── pages/
│       ├── configure-prefix.md
│       ├── docker.md
│       ├── gpt.md
│       ├── installation.md
│       └── ...
├── .env                            # Environment variables (not in git)
├── .env-example
├── docker-compose.yml
├── Dockerfile
├── package.json
└── CLAUDE.md                       # Project overview for AI agents
```

### New File Organization (P0 + P1)

```
whatsapp-chatgpt/
├── src/
│   ├── api/                        # 🆕 P0 #5 HTTP API
│   │   ├── health-server.ts        # Health check endpoints
│   │   └── index.ts
│   ├── commands/                   # Enhanced
│   │   ├── [existing files]
│   │   ├── audit.ts                # 🆕 P0 #4 Audit log viewer
│   │   ├── read.ts                 # 🆕 P1 #14 TTS read command
│   │   └── slash-tools.ts          # 🆕 P1 #12 Slash commands
│   ├── config/                     # 🆕 P0 #10 Unified config
│   │   ├── index.ts                # Main config export
│   │   ├── schema.ts               # Zod validation schema
│   │   ├── runtime-settings.ts     # Non-secret runtime settings
│   │   └── puppeteer.ts            # Existing
│   ├── errors/                     # 🆕 P1 #17 Error taxonomy
│   │   ├── error-codes.ts          # Error code enum
│   │   ├── user-messages.ts        # User-friendly messages
│   │   └── index.ts
│   ├── handlers/                   # Enhanced
│   │   ├── [existing files - refactored to use new logger, config]
│   │   ├── file-iq.ts              # 🆕 P1 #13 File IQ
│   │   ├── group-admin.ts          # 🆕 P1 #16 Group moderation
│   │   ├── memory.ts               # 🆕 P1 #11 Conversation memory
│   │   ├── privacy.ts              # 🆕 P0 #3 /export, /wipe, /retention
│   │   └── usage.ts                # 🆕 P1 #15 /usage metrics
│   ├── logging/                    # 🆕 P0 #2 Structured logging
│   │   ├── logger.ts               # Pino logger instance
│   │   ├── pii-redactor.ts         # PII redaction middleware
│   │   └── log-levels.ts           # Log level configuration
│   ├── middleware/                 # 🆕 P0 #6 Middleware
│   │   ├── rate-limiter.ts         # Rate limiting
│   │   └── usage-tracker.ts        # 🆕 P1 #15 Track API usage
│   ├── queue/                      # 🆕 P0 #6 Job queue
│   │   ├── job-queue.ts            # BullMQ wrapper
│   │   ├── workers.ts              # Job processors
│   │   └── index.ts
│   ├── repositories/               # 🆕 Thin repository pattern
│   │   ├── base-repository.ts      # Abstract base
│   │   ├── audit-repository.ts     # 🆕 P0 #4 Audit logs
│   │   ├── conversation-repository.ts  # 🆕 P1 #11 Conversation memory
│   │   ├── file-repository.ts      # 🆕 P1 #13 File metadata
│   │   ├── moderation-repository.ts    # 🆕 P1 #16 Group settings
│   │   ├── retention-repository.ts # 🆕 P0 #3 Retention policies
│   │   ├── usage-repository.ts     # 🆕 P1 #15 Usage metrics
│   │   └── index.ts
│   ├── security/                   # 🆕 P0 #1, #4 Security
│   │   ├── rbac.ts                 # Role-based access control
│   │   ├── session.ts              # Admin session tokens
│   │   └── audit-logger.ts         # Audit log writer
│   ├── storage/                    # 🆕 P0 #3 Storage utilities
│   │   └── retention-manager.ts    # TTL enforcement
│   ├── utils/                      # Enhanced utilities
│   │   ├── temp-file-manager.ts    # 🆕 P0 #7 Temp file lifecycle
│   │   └── [existing utils.ts]
│   └── [existing files - refactored]
├── prisma/                         # 🆕 Database schema
│   ├── schema.prisma               # Prisma schema definition
│   └── migrations/                 # Migration history
│       ├── 20250124_init_p0/
│       └── 20250131_add_p1_features/
├── docs/
│   ├── architecture.md             # THIS FILE
│   └── migration.md                # 🆕 !config migration guide
├── tests/                          # 🆕 Test suite
│   ├── unit/
│   │   ├── repositories/
│   │   ├── security/
│   │   └── logging/
│   ├── integration/
│   │   ├── database/
│   │   ├── queue/
│   │   └── whatsapp/
│   └── e2e/
│       └── commands/
├── .env
├── .env-example                    # 🔄 Updated with new vars
├── docker-compose.yml              # 🔄 Add postgres, redis services
├── Dockerfile                      # 🔄 Update permissions, add migrations
└── package.json                    # 🔄 Add new dependencies
```

### File Naming Conventions

**Integration Guidelines:**
- **Existing pattern:** kebab-case for files (e.g., `ai-config.ts`)
- **New files:** Follow existing pattern for consistency
- **Repositories:** Suffix with `-repository.ts` (e.g., `audit-repository.ts`)
- **Handlers:** Suffix with `.ts`, descriptive name (e.g., `file-iq.ts`, not `file-handler.ts`)
- **Types:** Match the domain (e.g., `error-codes.ts` for error taxonomy)

**Import/Export Patterns:**
- **Barrel exports:** Use `index.ts` in each directory for clean imports
  ```typescript
  // src/repositories/index.ts
  export * from './audit-repository';
  export * from './conversation-repository';
  export * from './file-repository';

  // Usage
  import { AuditRepository, ConversationRepository } from './repositories';
  ```
- **Named exports preferred:** Avoid default exports for better refactoring

---

## Infrastructure and Deployment Integration

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

## Coding Standards

### Existing Standards Compliance

**Current Code Style:**
- **Language:** TypeScript with implicit typing in some areas
- **Formatting:** Prettier 3.0.3 configured
  - `npm run format` - Format code
  - `npm run format:check` - Verify formatting
- **Linting:** No ESLint currently configured
- **Testing:** No test framework currently

**Existing Patterns Observed:**
- Event handler pattern (`src/events/`)
- Handler pattern (`src/handlers/`)
- Provider pattern (`src/providers/`)
- Command registration pattern (`ICommandModule` interface)
- Lazy initialization (e.g., `initOpenAI()`)

### Enhancement-Specific Standards

#### TypeScript Standards

**Type Safety (P0-P1):**
```typescript
// ❌ Avoid any types
catch (error: any) {  // Current pattern - to be replaced
  console.error(error);
}

// ✅ Use typed errors (P1 #17)
import { AppError, ErrorCode } from './errors';

catch (error) {
  if (error instanceof AppError) {
    logger.error({ code: error.code, message: error.message });
  } else {
    logger.error({ error: 'UNKNOWN_ERROR', details: error });
  }
}
```

**Explicit Types for Public APIs:**
```typescript
// ❌ Implicit types
export function handleMessageAIConfig(message: Message, prompt: any) {
  // ...
}

// ✅ Explicit types
export async function handleMessageAIConfig(
  message: Message,
  prompt: string
): Promise<void> {
  // ...
}
```

**Zod for Runtime Validation (P0 #10):**
```typescript
// src/config/schema.ts
import { z } from 'zod';

export const configSchema = z.object({
  openai: z.object({
    apiKeys: z.array(z.string()).min(1),
    model: z.string().default('gpt-4o'),
    maxTokens: z.number().positive().default(2000)
  }),
  database: z.object({
    url: z.string().url()
  }),
  redis: z.object({
    url: z.string().url()
  })
});

export type Config = z.infer<typeof configSchema>;
```

#### Logging Standards (P0 #2)

**Structured Logging with Pino:**
```typescript
// ❌ Old pattern (to be removed)
console.log('[GPT] Received prompt from', message.from, ':', prompt);
console.debug('[DEBUG] Message:', JSON.stringify(message, null, 2));

// ✅ New pattern (P0 #2)
import { logger } from './logging/logger';

logger.info({
  handler: 'gpt',
  chatId: message.from,  // PII redacted automatically
  promptLength: prompt.length  // Log metadata, not content
}, 'Received GPT prompt');

logger.debug({
  handler: 'gpt',
  hasMedia: message.hasMedia,
  messageType: message.type
}, 'Processing message');  // No PII in logs
```

**Log Levels:**
- `error`: Exceptions, failures (requires attention)
- `warn`: Unexpected conditions (may require attention)
- `info`: Normal operations (user actions, API calls)
- `debug`: Detailed debugging (disabled in production)

**PII Redaction:**
```typescript
// Automatically redacted by pii-redactor.ts:
// - Phone numbers (e.g., +1234567890 → +123***7890)
// - Email addresses (e.g., user@example.com → u***@example.com)
// - API keys (e.g., sk-abc123 → sk-***123)
// - NRIC/passport numbers
```

#### Error Handling Standards (P1 #17)

**Typed Errors:**
```typescript
// src/errors/error-codes.ts
export enum ErrorCode {
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  OPENAI_API_ERROR = 'OPENAI_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  QUEUE_FULL = 'QUEUE_FULL'
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public userMessage: string,
    public details?: any
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

// src/errors/user-messages.ts
export const USER_MESSAGES = {
  [ErrorCode.FILE_TOO_LARGE]: "Your file is too large. Please send files under 20MB.",
  [ErrorCode.API_RATE_LIMIT]: "You're sending requests too quickly. Please wait 1 minute.",
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: "You don't have permission to use this command.",
  [ErrorCode.QUEUE_FULL]: "The system is busy. Please try again in a few minutes."
};
```

**Error Handling Pattern:**
```typescript
// All handlers must use this pattern
try {
  await processFile(file);
} catch (error) {
  if (error instanceof AppError) {
    logger.warn({ code: error.code, details: error.details }, error.userMessage);
    await message.reply(error.userMessage);
  } else {
    logger.error({ error }, 'Unexpected error');
    await message.reply("Something went wrong. Please try again or contact support.");
  }

  // Audit log for security-related errors
  if (error instanceof AppError && error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) {
    await auditLogger.log(message.from, 'PERMISSION_DENIED', {
      command: message.body
    });
  }
}
```

#### Database Standards

**Repository Pattern:**
- All database access through repositories (`src/repositories/`)
- No direct Prisma calls in handlers
- Repositories extend `BaseRepository`

**Transaction Handling:**
```typescript
// Use Prisma transactions for atomic operations
async function createUserWithRetention(chatId: string, retentionDays: number) {
  return prisma.$transaction(async (tx) => {
    await tx.retention_policies.create({
      data: { chat_id: chatId, retention_days: retentionDays, opt_in_status: true }
    });

    await tx.audit_logs.create({
      data: {
        user_id: chatId,
        action: 'RETENTION_POLICY_CREATED',
        metadata: { retention_days: retentionDays }
      }
    });
  });
}
```

#### Testing Standards

**Unit Tests (Required for P0):**
```typescript
// tests/unit/repositories/audit-repository.test.ts
import { AuditRepository } from '../../../src/repositories';
import { prismaMock } from '../../mocks/prisma';

describe('AuditRepository', () => {
  let repository: AuditRepository;

  beforeEach(() => {
    repository = new AuditRepository();
  });

  it('should create audit log with hash chain', async () => {
    const log = await repository.create('user123', 'TEST_ACTION', { foo: 'bar' });

    expect(log.hash_chain).toBeDefined();
    expect(log.hash_chain).toMatch(/^[a-f0-9]{64}$/);  // SHA-256 hex
  });
});
```

**Integration Tests (Required for P0):**
```typescript
// tests/integration/database/retention.test.ts
import { prisma } from '../../../src/prisma';

describe('Retention Policy Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should enforce TTL on conversation memory', async () => {
    // Create retention policy (7 days)
    await prisma.retention_policies.create({
      data: { chat_id: 'test-chat', retention_days: 7, opt_in_status: true }
    });

    // Create conversation memory with expired TTL
    await prisma.conversation_memory.create({
      data: {
        chat_id: 'test-chat',
        messages: [],
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000)  // Yesterday
      }
    });

    // Run TTL cleanup
    await prisma.conversation_memory.deleteMany({
      where: { expires_at: { lt: new Date() } }
    });

    // Verify deleted
    const memory = await prisma.conversation_memory.findUnique({
      where: { chat_id: 'test-chat' }
    });
    expect(memory).toBeNull();
  });
});
```

### Critical Integration Rules

**1. Existing API Compatibility:**
- All WhatsApp commands must remain functional
- Message format unchanged
- Session persistence maintained

**2. Database Integration:**
- All schema changes via Prisma migrations
- No raw SQL except for pgvector queries
- Repositories handle all data access

**3. Error Handling Integration:**
- Replace all `console.error()` with `logger.error()`
- Use `AppError` with user-friendly messages
- Audit log security-related errors

**4. Logging Consistency:**
- No PII in logs (phone numbers, message content, API keys)
- Structured JSON format (Pino)
- Log levels: error, warn, info, debug

---

## Testing Strategy

### Testing Philosophy

**Goals:**
1. **Prevent regressions** - Existing commands must work post-refactor
2. **Validate security** - RBAC, PII redaction, audit logs tested
3. **Ensure reliability** - Rate limiting, job queue, database operations
4. **Performance baselines** - Measure latency, throughput, queue depth

### Test Pyramid

```
        /\
       /  \  E2E Tests (10%)
      /____\  - Full WhatsApp message flows
     /      \ - Command integration tests
    /________\ Integration Tests (30%)
   /          \ - Database operations
  /____________\ - Queue processing
 /              \ - API health checks
/________________\ Unit Tests (60%)
                   - Repositories
                   - RBAC logic
                   - PII redaction
                   - Error handling
```

### P0 Testing Requirements (Mandatory Before Release)

#### 1. Unit Tests

**Coverage Target:** >80% for new code

**Critical Units:**
- `src/security/rbac.ts` - Role permission checks
- `src/logging/pii-redactor.ts` - PII regex patterns
- `src/middleware/rate-limiter.ts` - Token bucket logic
- `src/repositories/*` - All repository methods
- `src/errors/*` - Error code mapping

**Example:**
```typescript
// tests/unit/security/rbac.test.ts
describe('RBAC', () => {
  it('should allow owner to access owner-only commands', () => {
    expect(hasPermission(Role.OWNER, Role.OWNER)).toBe(true);
  });

  it('should deny user from accessing admin commands', () => {
    expect(hasPermission(Role.USER, Role.ADMIN)).toBe(false);
  });

  it('should allow admin to access operator commands', () => {
    expect(hasPermission(Role.ADMIN, Role.OPERATOR)).toBe(true);
  });
});
```

#### 2. Integration Tests

**Coverage:** All database operations, queue jobs, external APIs

**Critical Integrations:**
- PostgreSQL schema migrations
- Prisma queries (CRUD operations)
- BullMQ job processing
- Redis rate limiting
- Health check endpoints

**Example:**
```typescript
// tests/integration/queue/job-queue.test.ts
describe('Job Queue Integration', () => {
  let queue: Queue;
  let worker: Worker;

  beforeAll(async () => {
    queue = createQueue('test-queue');
    worker = createWorker('test-queue', async (job) => {
      return { processed: true, data: job.data };
    });
  });

  afterAll(async () => {
    await queue.close();
    await worker.close();
  });

  it('should process transcription job', async () => {
    const job = await queue.add('transcription', {
      audioBuffer: Buffer.from('fake-audio'),
      chatId: 'test-chat'
    });

    const result = await job.waitUntilFinished();
    expect(result.processed).toBe(true);
  }, 30000);  // 30s timeout for job processing
});
```

#### 3. Security Tests

**Coverage:** RBAC enforcement, PII redaction, audit log immutability

**Test Cases:**
```typescript
// tests/security/pii-redaction.test.ts
describe('PII Redaction', () => {
  const redactor = new PIIRedactor();

  it('should redact phone numbers', () => {
    const input = 'User +1234567890 sent a message';
    const output = redactor.redact(input);
    expect(output).toBe('User +123***7890 sent a message');
  });

  it('should redact API keys', () => {
    const input = 'API key: sk-abc123def456';
    const output = redactor.redact(input);
    expect(output).toBe('API key: sk-***456');
  });

  it('should redact email addresses', () => {
    const input = 'Contact user@example.com';
    const output = redactor.redact(input);
    expect(output).toContain('u***@example.com');
  });
});

// tests/security/audit-log-immutability.test.ts
describe('Audit Log Immutability', () => {
  it('should detect tampered hash chain', async () => {
    // Create valid log
    await auditRepo.create('user1', 'ACTION_1', {});

    // Tamper with log directly (bypass repository)
    await prisma.$executeRaw`
      UPDATE audit_logs SET action = 'TAMPERED_ACTION' WHERE id = 1
    `;

    // Verify integrity fails
    const isValid = await verifyAuditLogIntegrity();
    expect(isValid).toBe(false);
  });
});
```

#### 4. Regression Tests

**Coverage:** All existing WhatsApp commands

**Test Matrix:**
| Command | Test Case | Expected Result |
|---------|-----------|-----------------|
| `!gpt <prompt>` | Send text prompt | GPT response received |
| `!gpt <prompt>` + image | Send prompt with image | Vision API response |
| `!dalle <prompt>` | Generate image | Image generated and sent |
| `!reset` | Reset conversation | Context cleared |
| `!config help` | View config options | Help text displayed |
| Voice note | Send voice note | Auto-transcribed (P1 #14) |

**Example:**
```typescript
// tests/e2e/commands/gpt.test.ts
describe('GPT Command E2E', () => {
  let mockWhatsAppClient: MockClient;

  beforeEach(() => {
    mockWhatsAppClient = new MockClient();
  });

  it('should respond to !gpt command', async () => {
    const message = mockWhatsAppClient.createMessage({
      from: 'user@test',
      body: '!gpt What is 2+2?'
    });

    await handleIncomingMessage(message);

    expect(message.reply).toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('4'));
  });

  it('should handle vision API with image', async () => {
    const message = mockWhatsAppClient.createMessage({
      from: 'user@test',
      body: '!gpt What is in this image?',
      hasMedia: true,
      media: mockImageMedia()
    });

    await handleIncomingMessage(message);

    expect(openAIProvider.createVisionCompletion).toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalled();
  });
});
```

#### 5. Load Tests

**Scenarios:**
- 100 concurrent users sending messages
- Queue depth under load (target: <200 jobs)
- Rate limiting enforcement
- Database connection pooling

**Tools:** Artillery.io or k6

**Example:**
```yaml
# artillery-load-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users/second
      name: "Ramp up"
    - duration: 120
      arrivalRate: 50  # 50 users/second
      name: "Sustained load"

scenarios:
  - name: "Message processing"
    flow:
      - post:
          url: "/webhook/message"
          json:
            from: "user{{ $randomNumber() }}"
            body: "!gpt Hello"
```

### Test Infrastructure

**Test Database:**
```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: whatsapp_bot_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    tmpfs:
      - /var/lib/postgresql/data  # In-memory for speed

  redis-test:
    image: redis:7-alpine
    tmpfs:
      - /data
```

**CI/CD Integration:**
```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install
      - run: npx prisma migrate deploy
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Test Execution Plan

**Pre-P0 Sprint 1:**
- Set up test infrastructure (test database, mocks)
- Write unit tests for RBAC, PII redaction

**P0 Sprint 1 (Week 1):**
- Unit tests for all new modules
- Integration tests for database operations
- Security tests (RBAC, audit logs, PII redaction)

**P0 Sprint 2 (Week 2):**
- Regression tests for config unification
- Load tests for rate limiting and queue
- E2E tests for all existing commands

**P1 Sprint 3 (Week 3):**
- Integration tests for File IQ (OCR + embeddings)
- Unit tests for conversation memory
- E2E tests for slash commands

**Before Each Release:**
- ✅ All unit tests pass (>80% coverage)
- ✅ All integration tests pass
- ✅ All regression tests pass
- ✅ Security tests pass (no PII leaks, RBAC enforced)
- ✅ Load tests pass (100 concurrent users, queue depth <200)

---

## Security Integration

### Security Threat Model

**Assets to Protect:**
1. API keys (OpenAI, AWS, Whisper)
2. User data (conversations, files, usage metrics)
3. Audit logs (tamper-proof trail)
4. WhatsApp session (authentication tokens)

**Threat Actors:**
- Whitelisted users (insider threat)
- Compromised WhatsApp accounts
- Container escape
- Network eavesdropping

**Attack Vectors:**
1. **P0 #1 - Runtime config manipulation** (CRITICAL - FIXED)
2. **P0 #2 - PII leakage via logs** (CRITICAL - FIXED)
3. **P0 #9 - Session hijacking via world-writable directory** (CRITICAL - FIXED)
4. SQL injection (mitigated by Prisma)
5. Rate limit bypass
6. Audit log tampering

### P0 Security Measures

#### 1. RBAC Implementation (P0 #1)

**Role Hierarchy:**
```
Owner > Admin > Operator > User
```

**Permission Matrix:**

| Action | Owner | Admin | Operator | User |
|--------|-------|-------|----------|------|
| !gpt, !dalle (AI commands) | ✅ | ✅ | ✅ | ✅ |
| !config (non-secrets) | ✅ | ✅ | ❌ | ❌ |
| !config (secrets) | ❌ | ❌ | ❌ | ❌ |
| /audit | ✅ | ❌ | ❌ | ❌ |
| /broadcast | ✅ | ✅ | ❌ | ❌ |
| /role assign | ✅ | ❌ | ❌ | ❌ |

**Admin Session Tokens:**
```typescript
// src/security/session.ts
import { Redis } from 'ioredis';

const SESSION_TTL = 15 * 60;  // 15 minutes

export async function createAdminSession(userId: string): Promise<string> {
  const sessionToken = crypto.randomUUID();
  const key = `admin-session:${sessionToken}`;

  await redis.set(key, userId, 'EX', SESSION_TTL);

  await auditLogger.log(userId, 'ADMIN_SESSION_CREATED', {
    token: sessionToken.substring(0, 8) + '...',  // Partial token for audit
    ttl: SESSION_TTL
  });

  return sessionToken;
}

export async function requireAdminSession(token: string): Promise<string | null> {
  const key = `admin-session:${token}`;
  const userId = await redis.get(key);

  if (!userId) {
    await auditLogger.log('ANONYMOUS', 'ADMIN_SESSION_EXPIRED_OR_INVALID', { token: token.substring(0, 8) });
    return null;
  }

  // Refresh TTL on use (sliding expiration)
  await redis.expire(key, SESSION_TTL);

  return userId;
}
```

**Usage:**
```typescript
// Elevated admin command requires session token
// User types: /admin-login
const sessionToken = await createAdminSession(message.from);
await message.reply(`Admin session created. Token: ${sessionToken}\n\nUse: /config gpt model gpt-4 --session ${sessionToken}\n\nExpires in 15 minutes.`);

// Later: /config gpt model gpt-4 --session abc-123-def
const args = parseArgs(message.body);  // { command: 'config', session: 'abc-123-def' }
const userId = await requireAdminSession(args.session);
if (!userId) {
  await message.reply("❌ Invalid or expired admin session. Use /admin-login to create a new session.");
  return;
}

// Proceed with admin action
await handleConfigCommand(message, args);
```

#### 2. PII Redaction (P0 #2)

**PII Patterns:**
```typescript
// src/logging/pii-redactor.ts
export class PIIRedactor {
  private patterns = [
    {
      name: 'phone',
      regex: /(\+?\d{1,3}[- ]?)?\d{3}[- ]?\d{3}[- ]?\d{4}/g,
      replace: (match) => match.substring(0, 4) + '***' + match.substring(match.length - 4)
    },
    {
      name: 'email',
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replace: (match) => {
        const [local, domain] = match.split('@');
        return local[0] + '***@' + domain;
      }
    },
    {
      name: 'apiKey',
      regex: /\b(sk-|pk-)[a-zA-Z0-9]{20,}\b/g,
      replace: (match) => match.substring(0, 5) + '***' + match.substring(match.length - 3)
    },
    {
      name: 'nric',  // Singapore NRIC
      regex: /\b[STFG]\d{7}[A-Z]\b/gi,
      replace: () => 'S***REDACTED***'
    }
  ];

  redact(input: string): string {
    let redacted = input;
    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern.regex, pattern.replace);
    }
    return redacted;
  }
}

// Integrate with Pino logger
import pino from 'pino';

const redactor = new PIIRedactor();

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  hooks: {
    logMethod(args, method) {
      // Redact all string arguments
      const redactedArgs = args.map(arg =>
        typeof arg === 'string' ? redactor.redact(arg) : arg
      );
      method.apply(this, redactedArgs);
    }
  }
});
```

**Verification Test:**
```typescript
// tests/security/pii-redaction.test.ts
it('should redact PII from log output', () => {
  const logEntry = {
    message: 'User +1234567890 with email user@example.com sent API key sk-abc123def456ghi789'
  };

  const redacted = redactor.redact(JSON.stringify(logEntry));

  expect(redacted).not.toContain('+1234567890');
  expect(redacted).not.toContain('user@example.com');
  expect(redacted).not.toContain('sk-abc123def456ghi789');
  expect(redacted).toContain('+123***7890');
  expect(redacted).toContain('u***@example.com');
  expect(redacted).toContain('sk-***789');
});
```

#### 3. Audit Log Immutability (P0 #4)

**Hash Chain Implementation:**
```typescript
// src/security/audit-logger.ts
import crypto from 'crypto';

export class AuditLogger {
  async log(userId: string, action: string, metadata: any): Promise<void> {
    const lastLog = await prisma.audit_logs.findFirst({
      orderBy: { id: 'desc' },
      select: { hash_chain: true }
    });

    const prevHash = lastLog?.hash_chain || '0'.repeat(64);
    const timestamp = new Date().toISOString();
    const payload = `${userId}|${action}|${timestamp}|${JSON.stringify(metadata)}|${prevHash}`;
    const currentHash = crypto.createHash('sha256').update(payload).digest('hex');

    await prisma.audit_logs.create({
      data: {
        user_id: userId,
        action,
        metadata,
        hash_chain: currentHash,
        timestamp: new Date()
      }
    });

    logger.info({ userId, action, hash: currentHash.substring(0, 8) }, 'Audit log created');
  }
}

// Verification function (run periodically or on-demand)
export async function verifyAuditLogIntegrity(): Promise<{ valid: boolean; tamperedLogs: number[] }> {
  const logs = await prisma.audit_logs.findMany({ orderBy: { id: 'asc' } });
  const tamperedLogs: number[] = [];
  let prevHash = '0'.repeat(64);

  for (const log of logs) {
    const payload = `${log.user_id}|${log.action}|${log.timestamp.toISOString()}|${JSON.stringify(log.metadata)}|${prevHash}`;
    const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');

    if (log.hash_chain !== expectedHash) {
      tamperedLogs.push(log.id);
    }

    prevHash = log.hash_chain;
  }

  return { valid: tamperedLogs.length === 0, tamperedLogs };
}
```

#### 4. Session Directory Permissions (P0 #9)

**Before (Vulnerable):**
```dockerfile
RUN chmod 1777 /app/session  # World-writable - INSECURE
```

**After (Secure):**
```dockerfile
RUN chmod 700 /app/session   # Owner-only - SECURE
RUN chown appuser:appuser /app/session
```

**Verification:**
```bash
# In container
ls -la /app/session
# drwx------ 2 appuser appuser 4096 Jan 24 10:00 session  ✅ Correct

# Test: Other users cannot read
docker exec -u 1002 whatsapp-chatgpt ls /app/session
# ls: cannot open directory '/app/session': Permission denied  ✅ Correct
```

#### 5. Secret Management

**Environment Variables Only (P0 #1):**
```bash
# .env
OPENAI_API_KEY=sk-abc123...       # Secret - never logged
AWS_SECRET_ACCESS_KEY=xyz789...   # Secret - never logged
POSTGRES_PASSWORD=secure-password  # Secret - never logged

# Non-secrets (can be modified via !config with RBAC)
OPENAI_GPT_MODEL=gpt-4o           # Non-secret - can change at runtime
DALLE_IMAGE_SIZE=1024x1024        # Non-secret - can change at runtime
```

**Config Loading (Secure):**
```typescript
// src/config/index.ts
import { z } from 'zod';

const secretSchema = z.object({
  openai: z.object({
    apiKey: z.string().min(20),      // Never exposed in logs or API
    organization: z.string().optional()
  }),
  database: z.object({
    url: z.string().url()            // Contains password - never logged
  })
});

export function loadConfig(): Config {
  const rawConfig = {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      organization: process.env.OPENAI_ORGANIZATION
    },
    database: {
      url: process.env.DATABASE_URL!
    }
  };

  const validated = secretSchema.parse(rawConfig);

  // Log config load without secrets
  logger.info({
    openai: { organization: validated.openai.organization },
    database: { connected: true }  // Never log DATABASE_URL
  }, 'Configuration loaded');

  return validated;
}
```

### Security Checklist (P0 Completion Criteria)

- [ ] **RBAC enforced:** All admin commands require proper role
- [ ] **PII redacted:** No phone numbers, emails, or API keys in logs
- [ ] **Audit logs immutable:** Hash chain verified, no UPDATE/DELETE on audit_logs table
- [ ] **Session permissions:** `/app/session` is `chmod 700`, owned by `appuser`
- [ ] **Secrets in env only:** No runtime modification of API keys, passwords
- [ ] **Admin sessions:** Short-lived tokens (15min TTL), Redis-backed
- [ ] **SQL injection protected:** All queries via Prisma ORM
- [ ] **Rate limiting enforced:** Token bucket per user + global
- [ ] **Deprecation warnings fixed:** No suppressed warnings, dependencies updated

---

## Next Steps

### Handoff to Development Team

**Immediate Actions (Before P0 Sprint 1):**

1. **Review and approve this architecture document**
   - Confirm PostgreSQL + Redis from Sprint 1
   - Confirm thin repository pattern (10% overhead)
   - Confirm breaking change strategy (!config secrets)

2. **Set up development environment:**
   ```bash
   # Clone repo
   git clone <repo-url>
   cd whatsapp-chatgpt

   # Copy env template
   cp .env-example .env

   # Add secrets to .env
   # OPENAI_API_KEY=sk-...
   # DATABASE_URL=postgresql://bot_user:password@localhost:5432/whatsapp_bot
   # REDIS_URL=redis://localhost:6379
   # POSTGRES_PASSWORD=secure-password

   # Start infrastructure
   docker compose up -d postgres redis

   # Install dependencies
   npm install

   # Run migrations
   npx prisma migrate dev

   # Start dev server
   npm run start
   ```

3. **Create GitHub project board:**
   - Column 1: Backlog (all P0-P2 items)
   - Column 2: Sprint 1 (P0 #1-5)
   - Column 3: Sprint 2 (P0 #6-10)
   - Column 4: In Progress
   - Column 5: In Review
   - Column 6: Done

4. **Set up CI/CD pipeline:**
   - GitHub Actions workflow (`.github/workflows/test.yml`)
   - Run on every PR: lint, test, build
   - Block merge if tests fail or deprecation warnings present

### P0 Sprint 1 (Week 1) - Kick-off

**Priority Order:**
1. **Database + Redis setup** (Day 1-2)
   - Update `docker-compose.yml`
   - Add Prisma schema
   - Run initial migrations
   - Verify health checks

2. **Structured logging** (Day 2-3)
   - Implement Pino logger
   - PII redaction middleware
   - Replace all `console.log` calls
   - Verify no PII in logs

3. **RBAC + Admin sessions** (Day 3-4)
   - Implement role system
   - Redis-backed session tokens
   - Protect !config commands
   - Audit log integration

4. **Retention policies + Audit logs** (Day 4-5)
   - Retention policies table
   - Audit logs with hash chain
   - `/export`, `/wipe`, `/retention` commands
   - Background TTL enforcement job

5. **Health check endpoints** (Day 5)
   - HTTP server (native http module)
   - `/healthz`, `/readyz`, `/livez`
   - Update `docker-compose.yml` healthcheck

**Sprint 1 Success Criteria:**
- [ ] PostgreSQL + Redis operational
- [ ] Migrations run successfully
- [ ] No PII in logs (verified by tests)
- [ ] RBAC enforced (admin commands require proper role)
- [ ] Audit logs immutable (hash chain verified)
- [ ] Health checks pass (Docker healthcheck green)

### P0 Sprint 2 (Week 2) - Operations Hardening

**Priority Order:**
1. **Job queue + Workers** (Day 1-2)
   - BullMQ setup
   - Refactor FFmpeg to use queue
   - Refactor vision API to use queue
   - Worker processes

2. **Rate limiting** (Day 2-3)
   - Token bucket implementation
   - Redis storage
   - Per-user + global limits
   - Backpressure handling

3. **Temp file management** (Day 3)
   - PID-scoped temp dirs
   - Crash-safe cleanup
   - Graceful shutdown handler

4. **Dependency hygiene** (Day 3)
   - Remove `process.removeAllListeners("warning")`
   - Update dependencies
   - Fix punycode deprecation
   - CI enforcement

5. **Session permissions fix** (Day 4)
   - Update Dockerfile (`chmod 700`)
   - Verify permissions
   - Security scan

6. **Config unification** (Day 4-5)
   - Implement unified config
   - Zod schema validation
   - Feature flag deployment
   - Regression testing
   - Rollback plan verification

**Sprint 2 Success Criteria:**
- [ ] Job queue operational (100+ jobs processed)
- [ ] Rate limiting enforced (verified by load tests)
- [ ] Temp files cleaned up (verified after crash simulation)
- [ ] Zero deprecation warnings
- [ ] Session permissions secure (`chmod 700`)
- [ ] Config unification deployed with feature flag
- [ ] All regression tests pass

### P1 Sprint 3 (Week 3) - User Features

**Focus:** Conversation memory, slash tools, File IQ, voice-first UX

**Sprint 4 (Week 4) - User Features Completion**

**Focus:** Usage metrics, group moderation, error taxonomy

### Documentation Updates

**Required Updates:**
1. **CLAUDE.md** - Update with new architecture patterns
2. **docs/migration.md** - !config migration guide (create new)
3. **.env-example** - Add all new environment variables
4. **README.md** - Update installation instructions
5. **docs/architecture.md** - Keep this file updated as architecture evolves

### Monitoring & Observability (Post-P0)

**Recommended Tools:**
- **Logs:** Grafana Loki (aggregate Pino JSON logs)
- **Metrics:** Prometheus + Grafana (queue depth, latency, error rates)
- **Tracing:** (Optional) Jaeger for distributed tracing
- **Alerts:** PagerDuty or Opsgenie for production incidents

**Key Metrics to Track:**
- Message processing latency (p50, p95, p99)
- Queue depth (current, max)
- Rate limit rejections (per user, global)
- Database query latency
- Redis cache hit rate
- OpenAI API errors
- Health check failures

---

## Final Recommendations

**This architecture document is ready for implementation.** The development team can proceed with P0 Sprint 1 immediately.

**Key Success Factors:**
1. **Follow the priority order** - P0 items are sequenced to minimize risk
2. **Test continuously** - Don't wait until the end of sprint to run tests
3. **Use feature flags** - Especially for P0 #10 config unification (high risk)
4. **Validate with users** - Soft deprecation warnings (P0 #1) give users time to migrate
5. **Monitor closely** - Watch logs, queue depth, error rates during rollout

**Architecture Principles Applied:**
✅ **Incremental refactoring** - No big-bang rewrite
✅ **Backward compatibility** - Existing commands preserved
✅ **Security-first** - RBAC, PII redaction, audit logs
✅ **Pragmatic choices** - PostgreSQL over SQLite, thin repositories over full abstraction
✅ **Testability** - Unit, integration, E2E tests required
✅ **Production-ready** - Health checks, logging, monitoring, rollback plans

**This document provides:**
- Complete technical blueprint for P0-P2
- Detailed integration strategies
- Technology recommendations with rationale
- Testing and security requirements
- Rollback and risk mitigation plans

**The team is cleared for takeoff. Good luck with P0 Sprint 1! 🚀**
