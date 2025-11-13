# Coding Standards

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
