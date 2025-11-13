# Story 3: FAQ Auto-Response System - Business Feature

**Epic**: Epic 2 - Customer Service Essentials
**Story ID**: EPIC2-STORY-3
**Estimated Effort**: 8-13 hours
**Priority**: P1 Critical (Core automation feature)
**Dependencies**:
- P0 #3 (Database - PostgreSQL with pgvector extension)
- P0 #10 (Unified Config System)
- Epic 1 (Error Handling - AppError, ErrorCode, USER_MESSAGES)
- P1 #11 (Per-Chat Memory - for conversation context)
**Architecture Alignment**: AI-powered customer service automation, semantic search

---

## User Story

As a **customer service team**,
I want **the bot to automatically detect and answer frequently asked questions using semantic search**,
So that **70% of routine inquiries are handled instantly without human intervention, reducing agent workload and improving response time**.

---

## Business Context

### The Problem

- 70% of customer inquiries are FAQs (shipping, returns, hours, pricing)
- Agents waste time answering same questions repeatedly
- Keyword matching fails for variations ("What are shipping costs?" vs "How much is delivery?")
- Static FAQ lists require exact wording matches

**Current state:** 200 messages/day, 140 are FAQs, agents spend 4-6 hours/day on repetitive answers.

### The Solution

AI-powered semantic FAQ matching:
- Upload FAQ database (Q&A pairs)
- OpenAI embeddings for semantic similarity
- Auto-detect FAQ matches with 85%+ confidence
- "Was this helpful?" feedback loop for continuous improvement

**Example:**
```
Customer: "How much is shipping?"
Bot: "📦 Shipping is $5 for orders under $50, FREE for orders over $50!

     Was this helpful?
     [👍 Yes] [👎 No, I need more help]"
```

### Success Metrics

- ✅ **70% FAQ match rate**: 70% of FAQ-type questions matched correctly
- ✅ **<500ms search time**: Instant responses (search in <500ms for 1000 FAQs)
- ✅ **85%+ accuracy**: 85% of matches rated "helpful" by users
- ✅ **90% deflection**: 90% of matched FAQs don't require escalation

---

## Acceptance Criteria

### Functional Requirements:

1. **Admin can upload FAQ database**
   - CSV format: `question,answer,category`
   - Command: `/faq upload` (attach CSV file)
   - Validates CSV format, generates embeddings for each question
   - Supports 10-1000 FAQs (more may impact search performance)

2. **Semantic search using OpenAI embeddings**
   - User query → OpenAI ada-002 embedding
   - Vector similarity search in database (cosine similarity)
   - Return top 3 matches with similarity scores
   - Threshold: 85% similarity (configurable)

3. **Auto-response for high-confidence matches**
   - If match ≥85%: Auto-respond with FAQ answer
   - If 70-84%: Show "Did you mean?" with top 3 options
   - If <70%: No FAQ match, proceed to other handlers (templates, GPT, escalation)

4. **"Was this helpful?" feedback mechanism**
   - After FAQ response, show buttons: [👍 Yes] [👎 No, I need more help]
   - Feedback stored: increment `helpful_count` or `not_helpful_count`
   - On "No": Escalate to template/agent or ask clarifying question

5. **Admin FAQ management**
   - `/faq list` - List all FAQs with usage stats
   - `/faq show <id>` - Show full FAQ with stats
   - `/faq edit <id> <new_answer>` - Update answer (re-generate embedding if question changes)
   - `/faq delete <id>` - Delete FAQ
   - `/faq stats` - Overall stats (total FAQs, match rate, helpful rate)

6. **Category filtering (optional)**
   - FAQs organized by category (shipping, returns, pricing)
   - Admin can filter: `/faq list shipping`
   - Search can prioritize category based on conversation context

### Integration Requirements:

7. **FAQ search integrated into message flow**
   - Before GPT handler, check FAQ match
   - If matched: Send FAQ answer, skip GPT
   - If no match: Continue to GPT/template/escalation
   - Conversation context considered (e.g., previous messages about "order" → prioritize order-related FAQs)

8. **FAQ data accessible to GPT handler**
   - If FAQ not exact match, GPT can reference FAQ database
   - Example: "I don't have an exact match, but here's what I found about shipping..."

9. **Performance optimization**
   - FAQ embeddings pre-computed (generated once during upload, not per query)
   - Vector search indexed (pgvector GIN index)
   - Cache frequently matched FAQs (Redis, 15-minute TTL)

### Quality Requirements:

10. **Change is covered by tests (>80% coverage per Architecture)**
    - Unit tests for similarity calculation
    - Unit tests for threshold logic (85%, 70-84%, <70%)
    - Unit tests for error handling (all error codes)
    - Integration tests for database operations (embeddings, vector search)
    - E2E tests for FAQ match flow
    - **Minimum 80% code coverage** for all new code

11. **Error handling using AppError from Epic 1**
    - All errors throw `AppError` with appropriate `ErrorCode`
    - Error codes: `FAQ_SEARCH_ERROR`, `FAQ_NO_MATCH`, `FAQ_UPLOAD_ERROR`, `FAQ_EMBEDDING_ERROR`
    - OpenAI embedding failures handled gracefully (retry 2x, then fail)
    - Database search failures logged and return generic error

12. **Pino logging for all operations (Epic 1 consistency)**
    - FAQ upload: `logger.info({ faqCount, category }, 'FAQs uploaded')`
    - FAQ search: `logger.info({ query, matchConfidence, faqId, searchTime }, 'FAQ match found')`
    - No match: `logger.warn({ query, topSimilarity, searchTime }, 'No FAQ match')`
    - Feedback: `logger.info({ faqId, helpful }, 'FAQ feedback received')`
    - Errors: `logger.error({ errorCode, query }, 'FAQ operation failed')`
    - Performance: Log search time (must be <500ms for 1000 FAQs)

13. **Documentation updated**
    - Add FAQ commands to CLAUDE.md
    - Document embedding process and vector search
    - Document similarity threshold tuning
    - Document error codes and user messages

14. **Performance guarantees**
    - FAQ search (1000 FAQs): <500ms
    - Embedding generation: <1s per question
    - FAQ upload (100 FAQs): <2 minutes (includes embedding generation)
    - Cache hit rate: >50% for frequently asked questions

---

## Technical Implementation

### Database Schema (Requires pgvector Extension)

**File**: `prisma/schema.prisma` (addition)

```prisma
model FAQ {
  id              Int      @id @default(autoincrement())
  question        String   @db.Text
  answer          String   @db.Text
  category        String?  @db.VarChar(50)
  keywords        String[] // For backup keyword search
  embedding       Unsupported("vector(1536)")?  // OpenAI ada-002 embedding
  usageCount      Int      @default(0) @map("usage_count")
  helpfulCount    Int      @default(0) @map("helpful_count")
  notHelpfulCount Int      @default(0) @map("not_helpful_count")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([category])
  @@map("faqs")
}
```

**SQL Migration (manual - Prisma doesn't fully support pgvector yet):**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create FAQs table with vector column
CREATE TABLE faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50),
  keywords TEXT[],
  embedding vector(1536),  -- OpenAI ada-002 dimension
  usage_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create GIN index for vector similarity search
CREATE INDEX ON faqs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index on category
CREATE INDEX ON faqs(category);
```

---

### FAQ Repository with Vector Search

**File**: `src/repositories/faq-repository.ts` (NEW)

```typescript
import { prisma } from '../database/prisma';
import { logger } from '../logging/logger';

export interface FAQMatch {
  id: number;
  question: string;
  answer: string;
  similarity: number;
}

export class FAQRepository {
  /**
   * Create FAQ with embedding
   */
  async create(question: string, answer: string, embedding: number[], category?: string) {
    // pgvector embedding stored as array
    const embeddingString = `[${embedding.join(',')}]`;

    const result = await prisma.$executeRaw`
      INSERT INTO faqs (question, answer, category, embedding, created_at, updated_at)
      VALUES (${question}, ${answer}, ${category}, ${embeddingString}::vector, NOW(), NOW())
      RETURNING id
    `;

    logger.info({ question: question.substring(0, 50), category }, 'FAQ created');
    return result;
  }

  /**
   * Vector similarity search
   */
  async searchSimilar(queryEmbedding: number[], limit: number = 3, category?: string): Promise<FAQMatch[]> {
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    const results = category
      ? await prisma.$queryRaw<any[]>`
          SELECT id, question, answer,
                 1 - (embedding <=> ${embeddingString}::vector) AS similarity
          FROM faqs
          WHERE category = ${category}
          ORDER BY embedding <=> ${embeddingString}::vector
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<any[]>`
          SELECT id, question, answer,
                 1 - (embedding <=> ${embeddingString}::vector) AS similarity
          FROM faqs
          ORDER BY embedding <=> ${embeddingString}::vector
          LIMIT ${limit}
        `;

    return results.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Increment usage count
   */
  async incrementUsage(id: number) {
    await prisma.$executeRaw`
      UPDATE faqs SET usage_count = usage_count + 1 WHERE id = ${id}
    `;
  }

  /**
   * Record feedback
   */
  async recordFeedback(id: number, helpful: boolean) {
    if (helpful) {
      await prisma.$executeRaw`
        UPDATE faqs SET helpful_count = helpful_count + 1 WHERE id = ${id}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE faqs SET not_helpful_count = not_helpful_count + 1 WHERE id = ${id}
      `;
    }

    logger.info({ faqId: id, helpful }, 'FAQ feedback recorded');
  }

  /**
   * Get all FAQs
   */
  async getAll(category?: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id, question, answer, category, usage_count, helpful_count, not_helpful_count
      FROM faqs
      ${category ? `WHERE category = ${category}` : ''}
      ORDER BY usage_count DESC
    `;
  }

  /**
   * Get stats
   */
  async getStats() {
    const result = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) as total_faqs,
        SUM(usage_count) as total_uses,
        SUM(helpful_count) as total_helpful,
        SUM(not_helpful_count) as total_not_helpful,
        ROUND(100.0 * SUM(helpful_count) / NULLIF(SUM(helpful_count + not_helpful_count), 0), 2) as helpful_rate
      FROM faqs
    `;

    return result[0];
  }
}

export const faqRepository = new FAQRepository();
```

---

### OpenAI Embedding Service

**File**: `src/services/embedding-service.ts` (NEW)

```typescript
import { initOpenAI } from '../providers/openai';
import { logger } from '../logging/logger';
import { AppError, ErrorCode } from '../errors/error-codes';
import { USER_MESSAGES } from '../errors/user-messages';

export class EmbeddingService {
  /**
   * Generate embedding for text using OpenAI ada-002
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const openai = initOpenAI();
    const startTime = Date.now();

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      const duration = Date.now() - startTime;
      logger.debug({ textLength: text.length, duration }, 'Embedding generated');

      return response.data[0].embedding;
    } catch (error) {
      logger.error({ error, text: text.substring(0, 100) }, 'Failed to generate embedding');
      throw new AppError(
        ErrorCode.FAQ_EMBEDDING_ERROR,
        USER_MESSAGES[ErrorCode.FAQ_EMBEDDING_ERROR],
        { text: text.substring(0, 100) }
      );
    }
  }

  /**
   * Generate embeddings in batch (for FAQ upload)
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    const openai = initOpenAI();

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts,
      });

      logger.info({ count: texts.length }, 'Batch embeddings generated');

      return response.data.map((item) => item.embedding);
    } catch (error) {
      logger.error({ error, count: texts.length }, 'Failed to generate batch embeddings');
      throw new AppError(ErrorCode.FAQ_EMBEDDING_ERROR, USER_MESSAGES[ErrorCode.FAQ_EMBEDDING_ERROR]);
    }
  }
}

export const embeddingService = new EmbeddingService();
```

---

### FAQ Handler

**File**: `src/handlers/faq.ts` (NEW - Abbreviated for brevity)

```typescript
import { Message } from 'whatsapp-web.js';
import { logger } from '../logging/logger';
import { faqRepository } from '../repositories/faq-repository';
import { embeddingService } from '../services/embedding-service';
import { AppError, ErrorCode } from '../errors/error-codes';
import { USER_MESSAGES } from '../errors/user-messages';

const SIMILARITY_THRESHOLD_HIGH = 0.85; // Auto-respond
const SIMILARITY_THRESHOLD_LOW = 0.70; // "Did you mean?"

/**
 * Search FAQ and respond if match found
 * Returns true if FAQ handled, false if no match (continue to other handlers)
 */
export async function searchAndRespondFAQ(message: Message): Promise<boolean> {
  const query = message.body;
  const chatId = message.from;
  const startTime = Date.now();

  try {
    // Generate embedding for query
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Search similar FAQs
    const matches = await faqRepository.searchSimilar(queryEmbedding, 3);

    const searchTime = Date.now() - startTime;

    if (matches.length === 0 || matches[0].similarity < SIMILARITY_THRESHOLD_LOW) {
      // No good match
      logger.warn({ query: query.substring(0, 100), topSimilarity: matches[0]?.similarity, searchTime }, 'No FAQ match');
      return false;
    }

    const bestMatch = matches[0];

    if (bestMatch.similarity >= SIMILARITY_THRESHOLD_HIGH) {
      // High confidence - auto-respond
      await faqRepository.incrementUsage(bestMatch.id);

      logger.info({ query: query.substring(0, 100), faqId: bestMatch.id, similarity: bestMatch.similarity, searchTime }, 'FAQ match found');

      await message.reply(`${bestMatch.answer}\n\n_Was this helpful?_\n👍 React with thumbs up for yes\n👎 React with thumbs down if you need more help`);

      return true;
    } else {
      // Medium confidence - show options
      const options = matches.map((m, i) => `${i + 1}. ${m.question}`).join('\n');
      await message.reply(`Did you mean:\n\n${options}\n\nReply with the number, or type your question again.`);

      return true; // Handled, waiting for user selection
    }
  } catch (error) {
    if (error instanceof AppError) {
      logger.error({ errorCode: error.code, query }, error.userMessage);
    } else {
      logger.error({ error, query }, 'Unexpected error in FAQ search');
    }
    return false; // Continue to other handlers
  }
}

// ... additional functions for /faq commands (upload, list, stats, etc.)
```

---

## Performance Considerations

**Embedding Generation:**
- Batch processing during upload (20 FAQs per batch)
- Async processing (use job queue for large uploads >100 FAQs)

**Vector Search:**
- pgvector IVFFlat index (lists=100 for 1000 FAQs)
- Pre-filter by category when possible
- Cache top 50 most-used FAQs in Redis (15-min TTL)

**Cost Optimization:**
- ada-002: $0.0001 per 1K tokens
- 1000 FAQs @ 50 tokens each = $0.005 one-time cost
- Query embedding: ~10-20 tokens = $0.000002 per query

---

## Definition of Done

- ✅ All acceptance criteria met (AC 1-14)
- ✅ pgvector extension installed and tested
- ✅ **Unit tests pass (>80% coverage per Architecture standards)**
- ✅ **All error codes tested**
- ✅ **AppError integration tested**
- ✅ **Pino logging verified**
- ✅ FAQ upload tested (10, 100, 1000 FAQs)
- ✅ Similarity search tested with various queries
- ✅ Threshold logic tested (85%, 70-84%, <70%)
- ✅ Feedback mechanism tested
- ✅ Performance targets met (<500ms for 1000 FAQs)
- ✅ Documentation updated

---

## Files to Create/Modify

### New Files:
- `src/handlers/faq.ts` - FAQ search and management
- `src/repositories/faq-repository.ts` - Vector search operations
- `src/services/embedding-service.ts` - OpenAI embedding generation
- `prisma/migrations/YYYYMMDD_add_faqs_table/migration.sql` - Manual migration with pgvector
- `tests/unit/services/embedding-service.test.ts`
- `tests/integration/handlers/faq.test.ts`

### Modified Files:
- `src/handlers/message.ts` - Add FAQ search before GPT handler
- `src/errors/error-codes.ts` - Add FAQ error codes
- `src/errors/user-messages.ts` - Add FAQ error messages
- `CLAUDE.md` - Document FAQ system

---

## Notes for Developer

- **pgvector extension required** - Install before migration: `CREATE EXTENSION vector;`
- **Embedding dimensions** - ada-002 uses 1536 dimensions
- **Cosine similarity** - pgvector uses `<=>` operator for cosine distance (1 - similarity)
- **Index tuning** - Adjust IVFFlat lists parameter based on FAQ count
- **Batch processing** - OpenAI allows up to 2048 inputs per batch
- **Cost monitoring** - Log embedding API calls for cost tracking
