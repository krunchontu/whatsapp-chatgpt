# Security Integration

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
