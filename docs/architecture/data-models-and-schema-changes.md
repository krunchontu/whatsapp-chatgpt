# Data Models and Schema Changes

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
