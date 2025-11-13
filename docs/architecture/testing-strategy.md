# Testing Strategy

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
