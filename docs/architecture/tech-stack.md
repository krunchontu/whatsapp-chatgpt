# Tech Stack

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
