# Enhancement Scope and Integration Strategy

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
