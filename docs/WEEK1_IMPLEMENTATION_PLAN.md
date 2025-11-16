# Week 1 Implementation Plan (Chunked)

**Goal:** Production-grade infrastructure baseline

**Total Time:** 5 days (40 hours)

**Strategy:** Break into small, testable chunks (15-20 min each) to avoid context overflow

---

## Overview

Week 1 builds the foundation for all future features:
1. **Database layer** - Persistent data storage
2. **Logging** - Structured, searchable logs
3. **Error handling** - User-friendly error messages
4. **Health checks** - Monitor bot health
5. **Validation** - Fail fast on invalid config

**Success Criteria:**
- ✅ Database working (CRUD operations)
- ✅ All logs structured (JSON)
- ✅ Errors user-friendly
- ✅ Health endpoints responding
- ✅ Tests passing (>70% coverage)

---

## Day 1: Database Layer (Part 1)

### Chunk 1.1: Prisma Setup & Database Connection (20 min)

**Goal:** Get Prisma connected to SQLite

**Tasks:**
1. Verify Prisma schema exists
2. Generate Prisma client
3. Create database connection module
4. Test connection

**Files to create:**
- `src/db/index.ts` - Database connection
- `src/db/client.ts` - Singleton Prisma client

**Tests:**
- Connection succeeds
- Connection fails gracefully

**Acceptance:**
```typescript
import { prisma } from './db';
const users = await prisma.user.findMany(); // Works
```

---

### Chunk 1.2: User Repository (20 min)

**Goal:** CRUD operations for User model

**Tasks:**
1. Create UserRepository interface
2. Implement UserRepository
3. Write unit tests

**Files to create:**
- `src/repositories/user.repository.ts`
- `src/repositories/user.repository.test.ts`

**Methods:**
- `findByPhoneNumber(phone: string)`
- `create(data: CreateUserInput)`
- `updateRole(id: string, role: Role)`
- `updateWhitelist(id: string, isWhitelisted: boolean)`

**Tests:**
- Create user succeeds
- Find user by phone number
- Update role
- Handle duplicate phone numbers

**Acceptance:**
```typescript
const user = await userRepo.create({ phoneNumber: '+1234567890' });
expect(user.phoneNumber).toBe('+1234567890');
```

---

### Chunk 1.3: Conversation Repository (20 min)

**Goal:** CRUD operations for Conversation model

**Tasks:**
1. Create ConversationRepository interface
2. Implement ConversationRepository
3. Write unit tests

**Files to create:**
- `src/repositories/conversation.repository.ts`
- `src/repositories/conversation.repository.test.ts`

**Methods:**
- `findOrCreate(userId: string)`
- `addMessage(conversationId: string, message: Message)`
- `getRecent(userId: string, limit: number)`
- `clearConversation(userId: string)`

**Tests:**
- Create conversation
- Add messages
- Retrieve recent messages
- Clear conversation

**Acceptance:**
```typescript
const messages = await conversationRepo.getRecent(userId, 10);
expect(messages.length).toBeLessThanOrEqual(10);
```

---

## Day 2: Database Layer (Part 2)

### Chunk 2.1: Usage Repository (20 min)

**Goal:** Track OpenAI API usage

**Tasks:**
1. Create UsageRepository interface
2. Implement UsageRepository
3. Write unit tests

**Files to create:**
- `src/repositories/usage.repository.ts`
- `src/repositories/usage.repository.test.ts`

**Methods:**
- `create(data: CreateUsageInput)`
- `getDailyTotal(userId: string, date: Date)`
- `getGlobalDailyTotal(date: Date)`
- `getUserStats(userId: string, days: number)`

**Tests:**
- Track usage
- Calculate daily totals
- Calculate costs

**Acceptance:**
```typescript
const usage = await usageRepo.create({
  userId,
  model: 'gpt-4o',
  totalTokens: 350,
  costMicros: 5250, // $0.00525
});
```

---

### Chunk 2.2: Repository Integration Tests (20 min)

**Goal:** Test repositories working together

**Tasks:**
1. Create integration test suite
2. Test user → conversation flow
3. Test user → usage flow
4. Test database migrations

**Files to create:**
- `src/repositories/__tests__/integration.test.ts`

**Tests:**
- Create user, add conversation, add messages
- Create user, track usage, get stats
- Database cleanup (delete expired data)

**Acceptance:**
```typescript
// Full flow works
const user = await userRepo.create({ phoneNumber: '+1234' });
const conv = await conversationRepo.findOrCreate(user.id);
await conversationRepo.addMessage(conv.id, { role: 'user', content: 'Hi' });
const messages = await conversationRepo.getRecent(user.id, 10);
expect(messages).toHaveLength(1);
```

---

### Chunk 2.3: Database Cleanup Job (20 min)

**Goal:** Auto-delete expired data (GDPR compliance)

**Tasks:**
1. Create cleanup utility
2. Delete expired conversations
3. Schedule cleanup (cron-like)

**Files to create:**
- `src/db/cleanup.ts`
- `src/db/cleanup.test.ts`

**Methods:**
- `cleanupExpiredConversations()`
- `cleanupOldUsageMetrics(days: number)`

**Tests:**
- Deletes expired conversations
- Keeps recent conversations
- Handles empty database

**Acceptance:**
```typescript
await cleanup.cleanupExpiredConversations();
// Conversations older than 7 days deleted
```

---

## Day 3: Logging & Error Handling (Part 1)

### Chunk 3.1: Pino Logger Setup (15 min)

**Goal:** Structured logging with PII redaction

**Tasks:**
1. Create logger module
2. Configure Pino with PII redaction
3. Create log levels (debug, info, warn, error)

**Files to create:**
- `src/utils/logger.ts`
- `src/utils/logger.test.ts`

**Configuration:**
- Redact: phoneNumber, message.body, req.headers.authorization
- Format: JSON in production, pretty in development
- Levels: debug, info, warn, error

**Tests:**
- Logs at correct level
- PII redacted
- JSON format in production

**Acceptance:**
```typescript
logger.info({ userId: '123', action: 'message_received' }, 'Processing message');
// Outputs structured JSON
```

---

### Chunk 3.2: Error Classes (20 min)

**Goal:** Type-safe error handling

**Tasks:**
1. Create ErrorCode enum
2. Create AppError class
3. Create user-friendly error messages

**Files to create:**
- `src/errors/index.ts`
- `src/errors/codes.ts`
- `src/errors/messages.ts`
- `src/errors/errors.test.ts`

**Error codes:**
- RATE_LIMIT_EXCEEDED
- UNAUTHORIZED
- INVALID_INPUT
- OPENAI_API_ERROR
- DATABASE_ERROR
- TRANSCRIPTION_FAILED
- etc.

**Tests:**
- AppError creates correctly
- User messages correct
- Status codes correct

**Acceptance:**
```typescript
throw new AppError(
  ErrorCode.RATE_LIMIT_EXCEEDED,
  429,
  undefined,
  { userId, currentRate: 15 }
);
// User sees: "You've reached the message limit. Please wait a minute."
```

---

### Chunk 3.3: Error Handler Middleware (20 min)

**Goal:** Catch and format errors

**Tasks:**
1. Create error handler middleware
2. Log errors with context
3. Send user-friendly messages

**Files to create:**
- `src/middleware/error-handler.ts`
- `src/middleware/error-handler.test.ts`

**Features:**
- Catch AppError and format
- Catch unknown errors and log
- Send to Sentry (if configured)
- Reply to user with friendly message

**Tests:**
- Handles AppError
- Handles generic Error
- Logs to Pino
- Sends to Sentry

**Acceptance:**
```typescript
try {
  // Some operation
} catch (error) {
  await handleError(error, message, logger);
  // User receives friendly message
  // Error logged with context
}
```

---

## Day 4: Logging & Error Handling (Part 2)

### Chunk 4.1: Replace console.log with logger (30 min)

**Goal:** Structured logging throughout codebase

**Tasks:**
1. Find all console.log/console.error
2. Replace with logger.info/logger.error
3. Add context to log messages
4. Remove console statements

**Files to modify:**
- `src/index.ts`
- `src/handlers/*.ts`
- `src/providers/*.ts`
- All other files with console.*

**Pattern:**
```typescript
// Before
console.log('Message received from', phoneNumber);

// After
logger.info({
  phoneNumber: hashPhoneNumber(phoneNumber), // PII safe
  action: 'message_received'
}, 'Processing incoming message');
```

**Tests:**
- No console.log in codebase (linter rule)
- All logs structured

**Acceptance:**
```bash
# Search for console.log
grep -r "console\." src/
# Should return 0 results (except logger.ts)
```

---

### Chunk 4.2: Integrate Error Handling in Handlers (30 min)

**Goal:** Replace try-catch with proper error handling

**Tasks:**
1. Wrap handlers in error middleware
2. Throw AppError instead of generic Error
3. Add context to errors
4. Test error scenarios

**Files to modify:**
- `src/handlers/message.ts`
- `src/handlers/gpt.ts`
- `src/handlers/command.ts`
- All handler files

**Pattern:**
```typescript
// Before
try {
  // operation
} catch (err) {
  console.error('Error:', err);
}

// After
try {
  // operation
} catch (err) {
  if (err instanceof OpenAI.APIError) {
    throw new AppError(
      ErrorCode.OPENAI_API_ERROR,
      err.status || 500,
      err.message,
      { userId, model: 'gpt-4o' }
    );
  }
  throw err; // Re-throw if unknown
}
```

**Tests:**
- Errors caught and formatted
- User receives friendly message
- Logs include context

**Acceptance:**
```typescript
// User receives: "I'm having trouble connecting to my AI service."
// Logs show: { error: 'OpenAI API error', userId, model, statusCode: 503 }
```

---

### Chunk 4.3: Sentry Integration (15 min)

**Goal:** Error tracking in production

**Tasks:**
1. Install Sentry SDK
2. Configure Sentry with DSN
3. Capture errors automatically
4. Test Sentry integration

**Files to create:**
- `src/utils/sentry.ts`
- `src/utils/sentry.test.ts`

**Configuration:**
- Only in production (NODE_ENV=production)
- PII scrubbed
- Breadcrumbs enabled
- Release tracking

**Tests:**
- Sentry initializes correctly
- Errors sent to Sentry
- PII not sent

**Acceptance:**
```typescript
import { initSentry } from './utils/sentry';
initSentry();
// Errors automatically sent to Sentry
```

---

## Day 5: Health Checks & Validation

### Chunk 5.1: Express Server for Health Endpoints (20 min)

**Goal:** HTTP server for monitoring

**Tasks:**
1. Create Express app
2. Add /healthz endpoint (liveness)
3. Add /readyz endpoint (readiness)
4. Start server on port 3000

**Files to create:**
- `src/server/index.ts`
- `src/server/health.ts`
- `src/server/server.test.ts`

**Endpoints:**
- `GET /healthz` → 200 OK (always)
- `GET /readyz` → 200 OK (if DB, Redis, OpenAI reachable)

**Tests:**
- /healthz returns 200
- /readyz checks dependencies
- Server starts on port 3000

**Acceptance:**
```bash
curl http://localhost:3000/healthz
# {"status":"ok"}

curl http://localhost:3000/readyz
# {"status":"ready","checks":{"db":"ok","redis":"ok","openai":"ok"}}
```

---

### Chunk 5.2: Environment Validation with Zod (20 min)

**Goal:** Fail fast on invalid config

**Tasks:**
1. Create Zod schema for environment
2. Validate on startup
3. Throw if invalid
4. Test validation

**Files to create:**
- `src/config/validation.ts`
- `src/config/validation.test.ts`

**Schema:**
```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  OPENAI_GPT_MODEL: z.string(),
  MAX_MODEL_TOKENS: z.coerce.number().positive(),
  RATE_LIMIT_PER_USER: z.coerce.number().positive(),
  // ... all required variables
});
```

**Tests:**
- Valid config passes
- Invalid config throws
- Missing required vars throws

**Acceptance:**
```typescript
// Missing OPENAI_API_KEY
process.env.OPENAI_API_KEY = '';
expect(() => validateEnv()).toThrow('OPENAI_API_KEY is required');
```

---

### Chunk 5.3: Graceful Shutdown (20 min)

**Goal:** Clean up on SIGTERM/SIGINT

**Tasks:**
1. Listen for shutdown signals
2. Close database connections
3. Close Redis connections
4. Stop accepting new requests
5. Wait for in-flight requests

**Files to create:**
- `src/utils/shutdown.ts`
- `src/utils/shutdown.test.ts`

**Cleanup order:**
1. Stop accepting new messages
2. Finish processing current messages (max 30s)
3. Close database connection
4. Close Redis connection
5. Exit process

**Tests:**
- SIGTERM triggers shutdown
- Connections closed
- Process exits cleanly

**Acceptance:**
```typescript
process.on('SIGTERM', async () => {
  await gracefulShutdown();
  process.exit(0);
});
```

---

### Chunk 5.4: Integration Testing (30 min)

**Goal:** Test all Week 1 components together

**Tasks:**
1. Create end-to-end test
2. Test database → logger → error handler flow
3. Test health endpoints
4. Test graceful shutdown

**Files to create:**
- `src/__tests__/integration.test.ts`

**Tests:**
- Full message flow (with errors)
- Health checks work
- Shutdown cleans up
- Logs are structured

**Acceptance:**
```typescript
// Simulated message flow
const message = createMockMessage();
await handleIncomingMessage(message);
// Database updated
// Logs structured
// Error handled gracefully
```

---

## Implementation Strategy

### Order of Execution

**Day 1 (Database Layer Part 1):**
```
Chunk 1.1 → Chunk 1.2 → Chunk 1.3
Total: ~60 min
```

**Day 2 (Database Layer Part 2):**
```
Chunk 2.1 → Chunk 2.2 → Chunk 2.3
Total: ~60 min
```

**Day 3 (Logging & Error Handling Part 1):**
```
Chunk 3.1 → Chunk 3.2 → Chunk 3.3
Total: ~55 min
```

**Day 4 (Logging & Error Handling Part 2):**
```
Chunk 4.1 → Chunk 4.2 → Chunk 4.3
Total: ~75 min
```

**Day 5 (Health Checks & Validation):**
```
Chunk 5.1 → Chunk 5.2 → Chunk 5.3 → Chunk 5.4
Total: ~90 min
```

**Total Week 1:** ~5.5 hours of focused coding (spread over 5 days)

---

## Git Workflow

**Branching:**
```bash
# Create feature branch
git checkout -b week1/foundation

# For each chunk, commit
git add .
git commit -m "feat(db): implement user repository (Chunk 1.2)"

# Push regularly
git push origin week1/foundation
```

**Commit message format:**
```
feat(scope): description (Chunk X.Y)

- Bullet points of changes
- Tests added
- Files modified
```

**Example:**
```
feat(logging): add Pino structured logger (Chunk 3.1)

- Configure Pino with PII redaction
- Add log levels (debug, info, warn, error)
- JSON format in production, pretty in development
- Tests for redaction and formatting

Files:
- src/utils/logger.ts
- src/utils/logger.test.ts
```

---

## Testing Strategy

**For each chunk:**
1. Write tests FIRST (TDD approach)
2. Implement feature
3. Run tests (`pnpm test`)
4. Verify coverage (`pnpm test:coverage`)
5. Fix any issues

**Coverage targets:**
- Repositories: 90%+ (critical code)
- Utilities: 80%+
- Middleware: 80%+
- Overall: 70%+ (Week 1)

**Test types:**
- **Unit tests:** Individual functions/classes
- **Integration tests:** Components working together
- **E2E tests:** Full flow (message → response)

---

## Context Management

**To avoid context overflow:**

1. **Work on one chunk at a time**
   - Read only files needed for current chunk
   - Don't load entire codebase

2. **Create small, focused modules**
   - Each file < 200 lines
   - Single responsibility

3. **Use interfaces and types**
   - Define contracts first
   - Implement later

4. **Commit frequently**
   - After each chunk
   - Clear git history

5. **Document as you go**
   - Add comments for complex logic
   - Update docs after each day

---

## Quality Gates

**Before moving to next chunk:**
- [ ] Tests pass
- [ ] No TypeScript errors
- [ ] No linter errors
- [ ] Code formatted (Prettier)
- [ ] Changes committed
- [ ] Documentation updated (if needed)

**Before finishing each day:**
- [ ] All chunks complete
- [ ] Integration tests pass
- [ ] Coverage target met
- [ ] Code reviewed (self-review)
- [ ] Changes pushed to GitHub

**Before finishing Week 1:**
- [ ] All 14 chunks complete
- [ ] >70% test coverage
- [ ] All quality gates passed
- [ ] Documentation updated
- [ ] Ready for Week 2

---

## Rollback Plan

**If a chunk fails:**
1. Revert chunk (`git revert`)
2. Analyze failure
3. Fix issue
4. Re-attempt chunk

**If stuck > 30 minutes:**
1. Document issue
2. Skip chunk (mark as TODO)
3. Move to next chunk
4. Return later with fresh perspective

---

## Success Criteria

**Week 1 Complete when:**
- ✅ Database layer working (all repositories)
- ✅ Logging structured (Pino throughout)
- ✅ Errors user-friendly (AppError + messages)
- ✅ Health checks responding (/healthz, /readyz)
- ✅ Environment validated (Zod)
- ✅ Graceful shutdown implemented
- ✅ Tests passing (>70% coverage)
- ✅ No console.log in codebase
- ✅ All chunks committed and pushed

---

## Next Steps After Week 1

**Week 2 will build on this foundation:**
- Rate limiting (uses Redis from Week 1)
- Usage tracking (uses UsageRepository from Week 1)
- Cost alerts (uses logging from Week 1)
- RBAC (uses UserRepository from Week 1)

**Week 1 provides:**
- ✅ Database persistence
- ✅ Structured logging
- ✅ Error handling
- ✅ Health monitoring
- ✅ Configuration validation

---

## Ready to Start?

**First chunk:** Chunk 1.1 - Prisma Setup & Database Connection

**Command to begin:**
```bash
# Ensure dependencies installed
pnpm install

# Generate Prisma client
pnpm db:generate

# Create first test file
mkdir -p src/db
touch src/db/index.ts
touch src/db/client.ts

# Let's go! 🚀
```

**Estimated time:** 20 minutes
