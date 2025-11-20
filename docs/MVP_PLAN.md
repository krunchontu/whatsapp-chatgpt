# MVP Plan: WhatsApp AI Customer Service Bot
**Version:** 1.0
**Date:** 2025-11-16
**Status:** APPROVED
**Target:** Production-ready MVP for 1-3 SME customers

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [MVP Scope](#mvp-scope)
3. [Free-Tier Tech Stack](#free-tier-tech-stack)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Cost Breakdown](#cost-breakdown)
6. [Success Metrics](#success-metrics)
7. [Risk Mitigation](#risk-mitigation)
8. [Post-MVP Roadmap](#post-mvp-roadmap)

---

## Executive Summary

### Current State
- **Status:** Working prototype (25% complete)
- **Core Features:** GPT-4 chat, voice transcription, image analysis working
- **Missing:** Database persistence, logging, testing, rate limiting, production infrastructure
- **Gap:** 75% of documented features are unimplemented

### MVP Goal
Build a **production-ready 1:1 WhatsApp customer service bot** that:
- Handles AI-powered customer inquiries 24/7
- Has proper cost controls and monitoring
- Supports 1-3 SME beta customers reliably
- Costs < $60/month total (infrastructure + API)

### Timeline
**6-8 weeks** with 1 developer

### Investment
- **Development:** 6-8 weeks @ 1 FTE
- **Monthly Cost:** $24-54/month (ultra-low-cost setup)
- **Break-even:** 1-2 months for SMEs with 50+ daily inquiries

---

## MVP Scope

### ✅ In Scope (Must Have)

#### Core Features
- [x] WhatsApp Web integration (already working)
- [x] GPT-4o text conversations with context memory
- [x] Voice message transcription (OpenAI Whisper only)
- [x] Image analysis (GPT-4o vision)
- [x] Command system (!reset, !config)
- [ ] **NEW:** Conversation memory (last 10 messages, 7-day retention)

#### Infrastructure (P0 - Blockers)
- [ ] SQLite database with Prisma ORM
- [ ] Structured logging (Pino with PII redaction)
- [ ] Error handling framework (AppError class, user-friendly messages)
- [ ] Health check endpoints (/healthz, /readyz)
- [ ] Environment validation (Zod)
- [ ] Graceful shutdown

#### Cost & Security Controls (P0)
- [ ] Rate limiting (10 msg/min per user, 100 global)
- [ ] Usage tracking (token counting, cost calculation)
- [ ] Cost alerting ($50/day threshold)
- [ ] Basic RBAC (Admin/User roles only)
- [ ] Request timeout protection (30s max)
- [ ] Whitelist access control

#### Reliability & Testing (P0)
- [ ] Job queue for heavy operations (BullMQ + Redis)
- [ ] Comprehensive tests (80%+ coverage, Jest)
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker for OpenAI API
- [ ] Integration tests for critical paths

### 🚫 Out of Scope (Deferred to v2+)

**Cut from MVP to ship faster:**
- ❌ DALL-E image generation (nice-to-have, adds cost/complexity)
- ❌ Text-to-speech responses (adds complexity)
- ❌ Multiple transcription modes (keep OpenAI Whisper only)
- ❌ LangChain integration (incomplete, not essential)
- ❌ Group chat support (1:1 only reduces complexity)
- ❌ Advanced RBAC (Owner/Admin/Operator - just Admin/User for MVP)
- ❌ Epic 2 features (templates, forms, FAQ, business hours)
- ❌ Audit logging (regular logging sufficient for MVP)
- ❌ GDPR tools (manual export acceptable for 3 customers)

**Why these cuts make sense:**
- Focus on core value: AI-powered customer service
- Reduce OpenAI API costs (no DALL-E, no TTS)
- Simplify operations (fewer moving parts)
- Faster time to market (6 weeks vs 12+ weeks)

---

## Free-Tier Tech Stack

### Philosophy
**Minimize costs while maintaining production-readiness.**
Use free/cheap services during MVP, upgrade when revenue justifies it.

### Tech Stack Comparison

| Component | Original Plan | **Free Tier MVP** | Savings |
|-----------|--------------|-------------------|---------|
| **Database** | PostgreSQL (managed) $25/mo | **SQLite** (file-based) | $25/mo |
| **Cache/Queue** | Redis Cloud $20/mo | **Local Redis** (on VPS) | $20/mo |
| **Hosting** | AWS EC2 $15/mo | **Hetzner VPS** $3.79/mo | $11/mo |
| **Monitoring** | Sentry Pro $26/mo | **Sentry Free** (5k events/mo) | $26/mo |
| **Logging** | Grafana Cloud $30/mo | **Better Stack Free** (1GB/mo) | $30/mo |
| **Domain** | $12/year | IP address or Cloudflare $9/year | $3/year |
| | | **Total Savings:** | **$112/mo** |

### Final Stack (Production-Ready)

```yaml
Runtime & Language:
  Node.js: 20 LTS (upgrade from 18)
  TypeScript: 5.x (strict mode enabled)
  Package Manager: pnpm (3x faster than npm, saves disk space)

Database & Persistence:
  Database: SQLite 3.x (file-based, zero cost, production-ready)
  ORM: Prisma 5.x (type-safe, handles SQLite → PostgreSQL migration)
  Migration Path: Upgrade to PostgreSQL when multi-server needed

Cache & Queue:
  Redis: 7.x (local, runs on same VPS)
  Queue: BullMQ 5.x (async job processing)
  Usage: Rate limiting, job queue, session cache

WhatsApp Integration:
  Library: whatsapp-web.js 1.26.x
  Browser: Puppeteer 22.x (Chromium automation)
  ⚠️ Risk: Unofficial API, WhatsApp may ban accounts
  📋 Mitigation: Document risk, plan migration to official Business API

AI/ML:
  OpenAI SDK: 4.x (GPT-4o for chat, Whisper for transcription)
  Models: gpt-4o (vision), whisper-1 (audio)
  Audio Processing: FFmpeg 1.1.0 (OGG → WAV conversion)

Infrastructure:
  Logging: Pino 8.x (fastest Node.js logger, structured JSON)
  Validation: Zod 3.x (runtime validation, TypeScript inference)
  Config: dotenv 16.x + Zod validation
  Job Queue: BullMQ 5.x (reliable async processing)

Testing:
  Framework: Jest 29.x (unit + integration tests)
  API Testing: Supertest 6.x
  Test Data: @faker-js/faker
  Coverage Target: 80%+

Monitoring (Free Tiers):
  Errors: Sentry Free (5,000 events/month)
  Logs: Better Stack Free (1GB/month, 3-day retention)
  Uptime: UptimeRobot Free (50 monitors, 5-min checks)
  Metrics: Prometheus (self-hosted, optional)

Deployment:
  Hosting: Hetzner CX11 VPS ($3.79/mo - 2 vCPU, 2GB RAM, 40GB SSD)
  OS: Ubuntu 22.04 LTS
  Container: Docker + Docker Compose
  Reverse Proxy: Nginx (optional, for SSL)
  SSL: Let's Encrypt (free certificates)
```

### Why SQLite for MVP?

**Advantages:**
- ✅ **Zero cost** - No managed database fees
- ✅ **Zero ops** - No separate server, backups are file copies
- ✅ **Fast** - No network latency, all queries are local
- ✅ **Production-proven** - Powers Expensify (millions of users), Airbnb mobile app
- ✅ **Prisma support** - Full ORM support, easy migration to PostgreSQL
- ✅ **Simple** - Single file database, easy to backup/restore

**Limitations (when to upgrade):**
- ⚠️ Single server only (no horizontal scaling)
- ⚠️ Limited concurrent writes (~10 per second)
- ⚠️ No complex JSON queries (upgrade to Postgres if needed)

**When to migrate to PostgreSQL:**
- 10+ concurrent users
- Multiple servers (need shared database)
- Database size > 100GB
- Complex analytical queries
- Revenue > $5k/month (cost becomes negligible)

### Hosting Options

#### Option 1: Hetzner VPS (RECOMMENDED) 🏆

**Cost:** $3.79 - $5.40/month
**Specs:** 2 vCPU, 2GB RAM, 40GB SSD, 20TB bandwidth

```
┌─────────────────────────────────────┐
│   Hetzner CX11 VPS ($3.79/mo)       │
├─────────────────────────────────────┤
│  ✓ WhatsApp Bot (Node.js ~700MB)    │
│  ✓ SQLite (file: /data/bot.db)      │
│  ✓ Redis (container, ~50MB)         │
│  ✓ Nginx (reverse proxy, ~10MB)     │
│  ✓ Chromium (Puppeteer, ~300MB)     │
│                                      │
│  Total: ~1.5GB / 2GB RAM available   │
└─────────────────────────────────────┘
```

**Why Hetzner:**
- Best price/performance in the market
- European (GDPR-friendly) and US datacenters
- No hidden bandwidth costs (20TB included)
- Hourly billing (test for pennies)
- Great AMD EPYC CPUs

**Alternatives:**
- DigitalOcean ($4-6/mo) - Better docs, easier UI
- Vultr ($3.50-6/mo) - More datacenter locations
- Linode/Akamai ($5/mo) - Good support

#### Option 2: Fly.io (EXPERIMENTAL, might be FREE)

**Cost:** Possibly free (256MB RAM × 3 VMs)
**Challenge:** Puppeteer might exceed RAM limits
**Verdict:** Worth testing, keep Hetzner as backup

#### Option 3: Railway (Limited Free Credit)

**Cost:** $5/month credit (lasts 5-10 days for 24/7 bot)
**Verdict:** Free credit runs out too fast

---

## Implementation Roadmap

### Week 1: Foundation (Infrastructure Baseline)

**Goal:** Production-grade infrastructure ready

#### Day 1-2: Database Layer
- [ ] Install SQLite + Prisma dependencies
- [ ] Create Prisma schema (User, Conversation, UsageMetric, SystemConfig)
- [ ] Generate Prisma client
- [ ] Implement repositories (UserRepository, ConversationRepository, UsageRepository)
- [ ] Write repository unit tests (with in-memory test DB)

**Deliverables:**
```typescript
// Prisma schema supports both SQLite and PostgreSQL
datasource db {
  provider = "sqlite"  // Change to "postgresql" later
  url      = env("DATABASE_URL")
}

// Repositories abstract data access
interface IUserRepository {
  findByPhoneNumber(phone: string): Promise<User | null>
  create(data: CreateUserInput): Promise<User>
  updateRole(id: string, role: Role): Promise<User>
}
```

#### Day 3-4: Logging & Error Handling
- [ ] Install and configure Pino logger
- [ ] Implement PII redaction (phone numbers, message content)
- [ ] Create AppError class with ErrorCode enum
- [ ] Define USER_MESSAGES catalog (user-friendly error messages)
- [ ] Replace all console.log with structured logging
- [ ] Write error handling tests

**Deliverables:**
```typescript
// Structured logging with PII redaction
logger.info({
  userId: 'user_123',  // Safe
  action: 'message_received',
  messageLength: 42,
  // message.body REDACTED automatically
}, 'Processing user message');

// User-friendly errors
throw new AppError(
  ErrorCode.RATE_LIMIT_EXCEEDED,
  429,
  undefined,  // Uses default message
  { userId, currentRate: 15 }
);
```

#### Day 5: Health Checks & Validation
- [ ] Create Express server for health endpoints
- [ ] Implement /healthz (liveness check)
- [ ] Implement /readyz (readiness check - DB, Redis, OpenAI connectivity)
- [ ] Add Zod schema for environment validation
- [ ] Fail fast on missing/invalid config
- [ ] Implement graceful shutdown (cleanup WhatsApp session, close DB)
- [ ] Integration tests

**Deliverables:**
```typescript
// Health checks for Docker/K8s
GET /healthz → 200 OK (always)
GET /readyz → 200 OK (DB connected, Redis connected, OpenAI reachable)

// Environment validation
const config = envSchema.parse(process.env);  // Throws if invalid
```

**Week 1 Success Criteria:**
- ✅ Database working with migrations
- ✅ All logs structured (JSON format)
- ✅ Errors user-friendly
- ✅ Health checks responding
- ✅ Tests passing (>70% coverage)

---

### Week 2: Cost & Security Controls

**Goal:** Prevent cost explosions and unauthorized access

#### Day 1-2: Rate Limiting
- [ ] Set up Redis (local container)
- [ ] Install rate limiter library (rate-limiter-flexible)
- [ ] Implement rate limiter middleware
- [ ] Per-user limits (10 messages/minute)
- [ ] Global limits (100 messages/minute)
- [ ] Proper error messages when rate limited
- [ ] Integration tests (simulate bursts)

**Deliverables:**
```typescript
// Rate limiting prevents abuse
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 10,        // Number of requests
  duration: 60,      // Per 60 seconds
  keyPrefix: 'rl',
});

// User sees friendly message
"You've reached the message limit. Please wait a minute and try again."
```

#### Day 3-4: Usage Tracking & Cost Management
- [ ] Implement token counting for GPT requests
- [ ] Calculate cost per request ($/1k tokens)
- [ ] Save UsageMetric to database after each request
- [ ] Daily aggregation query
- [ ] Cost alert system (email or log alert when > threshold)
- [ ] Admin command: `!usage` (view stats)
- [ ] Unit tests for cost calculation

**Deliverables:**
```typescript
// Track every OpenAI request
await usageRepository.create({
  userId: 'user_123',
  model: 'gpt-4o',
  operation: 'chat',
  promptTokens: 150,
  completionTokens: 200,
  totalTokens: 350,
  cost: 0.00525,  // $0.00525 = 350 tokens × $0.015/1k
  timestamp: new Date(),
});

// Alert when daily cost exceeds threshold
if (dailyCost > config.COST_ALERT_THRESHOLD) {
  logger.warn({ dailyCost }, 'Cost threshold exceeded!');
  // Send email alert or Slack notification
}
```

#### Day 5: Basic RBAC (2 roles only)
- [ ] Add `role` field to User model (ADMIN | USER)
- [ ] Implement auth middleware (check role)
- [ ] Admin-only commands: `!usage`, `!config`, `!stats`
- [ ] User commands: `!reset`, chat
- [ ] Whitelist enforcement (only whitelisted numbers can use bot)
- [ ] Unit tests for permission checks

**Deliverables:**
```typescript
// Only admins can view usage stats
if (user.role !== Role.ADMIN) {
  throw new AppError(ErrorCode.UNAUTHORIZED, 403);
}

// Whitelist check happens on every message
const user = await userRepository.findByPhoneNumber(phoneNumber);
if (!user?.isWhitelisted) {
  throw new AppError(ErrorCode.UNAUTHORIZED, 403);
}
```

**Week 2 Success Criteria:**
- ✅ Rate limiting active (tested with burst traffic)
- ✅ Usage tracking recording all OpenAI calls
- ✅ Cost alerts working
- ✅ RBAC enforced (Admin/User roles)
- ✅ Tests passing (>75% coverage)

---

### Week 3: Reliability & Async Processing ✅ COMPLETED

**Goal:** Handle failures gracefully, don't block on heavy operations
**Status:** Completed 2025-11-20

#### Day 1-2: Job Queue ✅
- [x] Set up BullMQ with Redis
- [x] Create transcription worker (async voice processing)
- [x] Move voice transcription to queue (don't block main thread)
- [x] Implement retry logic (3 attempts, exponential backoff: 2s, 4s, 8s)
- [x] Dead letter queue for failed jobs
- [x] Worker monitoring (queue size, processing time)
- [x] Integration tests

**Deliverables:**
```typescript
// Heavy operations run async
await transcriptionQueue.add('transcribe', {
  messageId: message.id,
  audioUrl: media.url,
  userId: user.id,
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});

// User sees immediate response
await message.reply('🎤 Processing your voice message...');

// Worker processes in background
transcriptionWorker.process(async (job) => {
  const { audioUrl } = job.data;
  const transcript = await openai.transcribe(audioUrl);
  // Process transcript...
});
```

#### Day 3-4: Conversation Memory ✅
- [x] Implement conversation storage (last 10 messages per user)
- [x] Retrieve context when sending to GPT
- [x] 7-day TTL on conversations (GDPR compliance)
- [x] Daily cleanup job (delete expired conversations)
- [x] `!reset` command clears conversation
- [x] Unit tests for memory retrieval
- [x] Integration tests for context preservation

**Deliverables:**
```typescript
// Store conversation history
await conversationRepository.addMessage(userId, {
  role: 'user',
  content: 'What is your return policy?',
  timestamp: new Date(),
});

// Retrieve context for GPT
const history = await conversationRepository.getRecent(userId, 10);
const messages = [
  { role: 'system', content: config.PRE_PROMPT },
  ...history,  // Last 10 messages
  { role: 'user', content: newMessage },
];

// Auto-delete after 7 days
expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
```

#### Day 5: Error Recovery & Circuit Breaker ✅
- [x] Implement retry logic for OpenAI API (429, 500, 503 errors)
- [x] Circuit breaker pattern (stop calling API after 5 consecutive failures)
- [x] Request timeout protection (30s max)
- [x] Fallback error messages (when API down)
- [x] Graceful degradation (log but don't crash)
- [x] Stress tests (simulate API failures)

**Deliverables:**
```typescript
// Retry with exponential backoff
const completion = await retry(
  () => openai.chat.completions.create(...),
  {
    retries: 3,
    onRetry: (err, attempt) => {
      logger.warn({ err, attempt }, 'OpenAI request failed, retrying...');
    },
  }
);

// Circuit breaker prevents cascading failures
if (circuitBreaker.isOpen()) {
  await message.reply(
    "I'm experiencing technical difficulties. Please try again in a few minutes."
  );
  return;
}
```

**Week 3 Success Criteria:**
- ✅ Job queue processing voice messages async
- ✅ Conversation memory preserving context
- ✅ Retry logic handling transient failures
- ✅ No crashes when OpenAI API down
- ✅ Tests passing (>80% coverage)

---

### Week 4: Testing & Cleanup

**Goal:** Achieve 80% test coverage, fix existing bugs, prepare for deployment

#### Day 1-2: Comprehensive Testing
- [ ] Unit tests for all services (AIService, CostService, AuthService)
- [ ] Integration tests for critical paths:
  - WhatsApp message → GPT response → reply
  - Voice message → transcription → GPT → reply
  - Rate limiting enforcement
  - Cost tracking accuracy
- [ ] Mock OpenAI in tests (nock or msw)
- [ ] Test error scenarios (API failures, rate limits, invalid input)
- [ ] Achieve 80%+ code coverage
- [ ] Set up coverage reporting (Jest + Codecov)

**Test Structure:**
```typescript
// Unit test example
describe('CostService', () => {
  it('calculates GPT-4o cost correctly', () => {
    const cost = costService.calculate({
      model: 'gpt-4o',
      promptTokens: 100,
      completionTokens: 200,
    });
    expect(cost).toBe(0.0045);  // (100 × $0.015 + 200 × $0.015) / 1000
  });
});

// Integration test example
describe('GPT Handler', () => {
  it('handles message with context memory', async () => {
    // Given: User has conversation history
    await conversationRepo.addMessage(userId, {
      role: 'user',
      content: 'My order number is 12345',
    });

    // When: User sends follow-up
    await handleMessage(message, 'Is it shipped?');

    // Then: GPT receives context
    expect(openaiMock).toHaveBeenCalledWith({
      messages: expect.arrayContaining([
        { role: 'user', content: 'My order number is 12345' },
        { role: 'user', content: 'Is it shipped?' },
      ]),
    });
  });
});
```

#### Day 3: Bug Fixes
- [ ] Fix `handleDeleteConversation` export issue (defined in ai-config.ts but exported from gpt.ts)
- [ ] Fix moderation integration (moderateIncomingPrompt referenced but not defined)
- [ ] Fix typo "occured" → "occurred" (appears in multiple files)
- [ ] Remove LangChain handler (incomplete, not used in MVP)
- [ ] Remove DALL-E handler (deferred to v2)
- [ ] Remove TTS handlers (deferred to v2)
- [ ] Clean up unused dependencies

#### Day 4: Documentation
- [ ] Update CLAUDE.md to reflect actual implementation
- [ ] Mark unimplemented features as "PLANNED (v2)" not "implemented"
- [ ] Update README with:
  - Honest current status
  - Free tier setup instructions
  - Environment variables reference
  - Quick start guide
- [ ] Create DEPLOYMENT.md (Hetzner VPS setup guide)
- [ ] Create TROUBLESHOOTING.md (common issues)
- [ ] Architecture diagram (mermaid or ASCII)
- [ ] Create ROADMAP.md (MVP → v2 → v3)

#### Day 5: Production Prep
- [ ] Update docker-compose.yml (SQLite + local Redis)
- [ ] Create production .env-example
- [ ] Environment variable validation checklist
- [ ] Database backup/restore scripts
- [ ] Load testing (simulate 100 concurrent users)
- [ ] Security review:
  - No secrets in code
  - PII redacted in logs
  - Rate limiting active
  - RBAC enforced
  - Input validation on all commands

**Week 4 Success Criteria:**
- ✅ 80%+ test coverage
- ✅ All critical bugs fixed
- ✅ Documentation accurate and complete
- ✅ Security review passed
- ✅ Load tests successful

---

### Week 5-6: Beta Testing & Iteration

**Goal:** Deploy to 1-3 beta customers, gather feedback, stabilize

#### Week 5: Internal Testing
- [ ] Deploy to staging environment (Hetzner VPS)
- [ ] Manual QA testing:
  - Happy paths (text, voice, image messages)
  - Error scenarios (rate limits, API failures, invalid commands)
  - Admin commands (!usage, !config, !stats)
  - User commands (!reset, chat)
- [ ] Performance testing (response times under load)
- [ ] Monitor costs daily (should be < $2/day for testing)
- [ ] Fix critical bugs discovered
- [ ] Refine error messages based on user feedback

#### Week 6: Beta Deployment
- [ ] **Day 1-2:** Onboard beta customer #1 (internal team or friendly customer)
  - Send setup instructions
  - Add phone number to whitelist
  - Monitor first interactions closely
  - Gather feedback

- [ ] **Day 3:** Stabilization
  - Fix bugs reported by beta #1
  - Improve UX based on feedback
  - Monitor costs and performance

- [ ] **Day 4-5:** Onboard beta customers #2 and #3
  - Apply learnings from beta #1
  - Document common questions (future FAQ)
  - Collect customer satisfaction ratings

- [ ] **Day 6-7:** Iteration
  - Analyze usage patterns
  - Optimize response times
  - Reduce costs where possible
  - Update documentation

**Week 5-6 Success Criteria:**
- ✅ 3 beta customers using bot daily
- ✅ Uptime > 99%
- ✅ Customer satisfaction > 4/5
- ✅ Daily cost < $3/customer
- ✅ No critical bugs reported

---

### Week 7-8: Stabilization & General Availability

**Goal:** Prepare for wider release beyond beta

#### Week 7: Polish
- [ ] Fix all medium-priority bugs from beta
- [ ] Optimize performance bottlenecks
  - Reduce GPT response time
  - Optimize database queries
  - Improve transcription speed
- [ ] Add missing documentation
- [ ] Create customer onboarding guide (PDF or video)
- [ ] Plan v2 roadmap based on beta feedback

#### Week 8: Launch Prep
- [ ] Final security audit
- [ ] Create marketing materials:
  - Screenshots of bot in action
  - Demo video (2-3 minutes)
  - Landing page or README
- [ ] Prepare support resources:
  - FAQ document
  - Troubleshooting guide for customers
  - Escalation process
- [ ] Set up monitoring alerts (Sentry, UptimeRobot)
- [ ] Plan pricing model (if charging customers)
- [ ] Announce general availability

**Week 7-8 Success Criteria:**
- ✅ All beta feedback addressed
- ✅ Performance optimized (p95 < 5s for text)
- ✅ Marketing materials ready
- ✅ Support process documented
- ✅ Ready to onboard 10+ customers

---

## Cost Breakdown

### Development Costs

**6-8 Weeks of Development:**
- 1 Full-Time Developer
- Tech Lead / Senior Developer recommended
- Estimated: $12k - $24k (depending on rate)

### Monthly Operating Costs

#### Minimum Setup (Months 1-3, Beta Testing)
```
Infrastructure:
├─ Hetzner CX11 VPS           $3.79/mo
├─ Sentry (free tier)         $0
├─ Better Stack (free tier)   $0
├─ UptimeRobot (free tier)    $0
└─ Infrastructure Total:      $3.79/mo

OpenAI API (3 beta customers, ~500 messages/month):
├─ GPT-4o chat                $15/mo
├─ Whisper transcription      $5/mo
└─ API Total:                 $20/mo

Monthly Total:                $23.79/mo
```

#### Growing (Months 4-6, 10-20 customers)
```
Infrastructure:
├─ Hetzner CPX11 VPS          $5.40/mo  [upgraded]
├─ Domain (optional)          $0.75/mo  ($9/year)
├─ Sentry (free tier)         $0
└─ Infrastructure Total:      $6.15/mo

OpenAI API (~2000 messages/month):
├─ GPT-4o chat                $40/mo
├─ Whisper transcription      $10/mo
└─ API Total:                 $50/mo

Monthly Total:                $56.15/mo
```

#### Scaled (Months 7-12, 50+ customers)
```
Infrastructure:
├─ Hetzner CPX21 VPS          $10.80/mo  [3 vCPU, 4GB RAM]
├─ PostgreSQL migration       $0         [still on same VPS]
├─ Domain + SSL               $0.75/mo
├─ Sentry Pro (optional)      $26/mo    [better error tracking]
└─ Infrastructure Total:      $37.55/mo

OpenAI API (~5000 messages/month):
├─ GPT-4o chat                $100/mo
├─ Whisper transcription      $20/mo
└─ API Total:                 $120/mo

Monthly Total:                $157.55/mo
```

### 6-Month Cost Projection

```
Month 1 (Development):        $23.79  [testing only]
Month 2 (Beta):               $23.79  [3 beta customers]
Month 3 (Beta):               $35.00  [refining, light usage]
Month 4 (Growing):            $50.00  [10 customers]
Month 5 (Growing):            $55.00  [15 customers]
Month 6 (Growing):            $60.00  [20 customers]

6-Month Total:                $247.58
Average per month:            $41.26 💰
```

### Break-Even Analysis

**For a typical SME:**
```
Customer service cost saved:
├─ 70 AI-handled inquiries/day
├─ 5 minutes saved per inquiry
├─ 5.8 hours/day of agent time saved
├─ $15/hour agent rate
└─ Savings: $87/day = $2,610/month

Bot operating cost:           $56/month (Month 4-6)

ROI:                          46x (4,600% return)
Payback period:               < 1 day
```

**Even for micro SMEs (10 inquiries/day):**
```
Savings:                      $375/month (2.5 hours/day saved)
Cost:                         $56/month
ROI:                          6.7x (670% return)
Payback period:               4.5 days
```

### Comparison: Free Tier vs Traditional Cloud

**Traditional AWS/GCP Setup:**
```
Month 1-6:
├─ EC2 t3.small               $15 × 6   = $90
├─ RDS PostgreSQL             $25 × 6   = $150
├─ ElastiCache Redis          $20 × 6   = $120
├─ OpenAI API                 $30 × 6   = $180
├─ Sentry Pro                 $26 × 6   = $156
└─ Total:                     $696

vs Free Tier Setup:           $248
Savings:                      $448 (64% reduction)
```

---

## Success Metrics

### Technical Metrics (Week 8 Targets)

**Reliability:**
- ✅ Uptime: 99%+ (max 7.2 hours downtime/month)
- ✅ Error rate: < 1% of requests
- ✅ Mean time to recovery (MTTR): < 30 minutes

**Performance:**
- ✅ Response time (text): p95 < 5 seconds
- ✅ Response time (voice): p95 < 15 seconds
- ✅ Response time (image): p95 < 8 seconds
- ✅ Queue processing time: p95 < 10 seconds

**Quality:**
- ✅ Test coverage: 80%+ lines
- ✅ Zero critical security vulnerabilities
- ✅ All logs structured (JSON)
- ✅ PII redacted in logs

**Cost:**
- ✅ Cost per conversation: < $0.10 average
- ✅ Monthly infrastructure: < $10 (Months 1-6)
- ✅ No surprise bills > 2x expected

### Business Metrics (Week 8 Targets)

**Customer Adoption:**
- ✅ Beta customers: 3 SMEs using daily
- ✅ Messages handled: 500+ per month
- ✅ Active users: 10+ per month

**Customer Satisfaction:**
- ✅ Customer rating: 4/5+ average
- ✅ Issue resolution rate: 80%+ (AI or human escalation)
- ✅ Response relevance: 90%+ (not nonsense replies)

**Operational:**
- ✅ Support burden: < 2 hours/week of bug reports
- ✅ Onboarding time: < 30 minutes per customer
- ✅ Deployment frequency: Weekly (can ship safely)

### Leading Indicators (Week 4-6)

Early signs of success during beta:
- ✅ Beta customers continue using after first week
- ✅ Message volume growing week-over-week
- ✅ Positive feedback from customer service agents
- ✅ Customers asking to add more team members
- ✅ Low error rate (< 5% during beta)

---

## Risk Mitigation

### Technical Risks

#### 1. WhatsApp Account Ban
**Probability:** Medium
**Impact:** High (bot stops working completely)

**Mitigation:**
- Document risk clearly in customer onboarding
- Use dedicated WhatsApp Business number (not personal)
- Avoid spammy behavior (rate limiting helps)
- Monitor for ban warnings
- Plan migration to official WhatsApp Business API (v3 roadmap)
- Have backup plan: Telegram bot (1-2 week pivot)

**Early warning signs:**
- Messages not delivering
- QR code re-prompts frequently
- WhatsApp warnings in app

#### 2. OpenAI Cost Explosion
**Probability:** Medium
**Impact:** High (unexpected $1000+ bill)

**Mitigation:**
- ✅ Rate limiting (10 msg/min per user, 100 global)
- ✅ Usage tracking with real-time cost calculation
- ✅ Daily cost alerts (threshold: $50/day)
- ✅ OpenAI billing alerts (set at $100/month)
- ✅ Max token limits (2000 tokens per request)
- Monitor top users (identify abuse)
- Add cost caps at user level if needed

**Early warning signs:**
- Daily cost > $20 during beta
- Single user generating > 50 messages/day
- Cost/conversation > $0.50

#### 3. Data Loss
**Probability:** Low
**Impact:** High (lose customer conversations, usage data)

**Mitigation:**
- Daily SQLite backups (copy .db file to S3/Backblaze)
- Redis persistence enabled (AOF mode)
- WhatsApp session backed up (avoid QR re-scan)
- Database migrations version-controlled (Prisma)
- Test restore process monthly

**Backup strategy:**
```bash
# Daily cron job
0 2 * * * /usr/local/bin/backup-db.sh

# backup-db.sh
cp /data/whatsapp-bot.db /backups/whatsapp-bot-$(date +%Y%m%d).db
rclone copy /backups/*.db backblaze:whatsapp-backups/
find /backups -mtime +30 -delete  # Keep 30 days local
```

#### 4. Security Breach
**Probability:** Low
**Impact:** High (customer data leaked, regulatory issues)

**Mitigation:**
- Whitelist enforcement (only approved numbers)
- PII redaction in logs (phone numbers, messages)
- No sensitive data stored (PCI, health info)
- Secrets in environment variables (not code)
- Docker runs as non-root user
- Regular security audits (manual + automated)
- HTTPS for health endpoints (Let's Encrypt)

**Security checklist:**
- [ ] No hardcoded secrets
- [ ] All API keys in .env (gitignored)
- [ ] PII redacted in Sentry
- [ ] Rate limiting prevents abuse
- [ ] Input validation on all commands
- [ ] SQL injection prevented (Prisma parameterized queries)

#### 5. Poor Performance (Slow Responses)
**Probability:** Medium
**Impact:** Medium (users abandon bot)

**Mitigation:**
- Job queue for heavy operations (transcription, image processing)
- Timeout protection (30s max per request)
- Loading messages ("Processing your voice message...")
- Optimize database queries (indexes on userId, timestamp)
- Monitor response times (p95, p99)
- Set performance budgets (p95 < 5s for text)

**If performance degrades:**
- Upgrade VPS (more CPU/RAM)
- Add Redis caching for frequent queries
- Optimize Puppeteer (headless, disable images)
- Use faster OpenAI models (gpt-3.5-turbo for simple queries)

#### 6. Cannot Scale Beyond MVP
**Probability:** Low
**Impact:** Medium (success problem)

**Mitigation:**
- Stateless architecture (all state in DB/Redis, not memory)
- Horizontal scaling ready:
  - Migrate SQLite → PostgreSQL (1 day)
  - Add Redis cluster (1 day)
  - Load balance multiple bot instances (2 days)
- Database design supports multi-tenancy (userId indexed)
- Queue system handles async processing

**Scaling path (50+ customers → 500+ customers):**
1. Migrate to PostgreSQL (shared DB)
2. Add 2-3 more VPS instances
3. Load balance with Nginx
4. Redis cluster for cache/queue
5. Estimated time: 1 week
6. Estimated cost: $50/mo → $200/mo

---

## Post-MVP Roadmap

### v2: Customer Service Essentials (Months 3-4)

**Goal:** Add business-focused features based on beta feedback

**Features:**
- Response templates (canned replies for common questions)
- FAQ auto-response (detect common questions, reply instantly)
- Business hours checking (route to voicemail outside hours)
- Human escalation workflow (transfer to agent with context)
- 3-role RBAC (Owner/Admin/Operator instead of just Admin/User)
- Customer satisfaction surveys (rate bot responses)
- Analytics dashboard (usage, costs, satisfaction)

**Estimated effort:** 4 weeks
**Cost impact:** +$10/mo (slightly more complex infrastructure)

### v3: Enterprise Features (Months 5-6)

**Goal:** Support larger customers, reduce WhatsApp ban risk

**Features:**
- DALL-E image generation (re-add, customer requested)
- Multi-language TTS responses (AWS Polly)
- Audit logging (compliance for regulated industries)
- GDPR compliance tools (data export, right to deletion)
- WhatsApp Business API migration (eliminate ban risk)
- Multi-tenancy (support multiple companies on one instance)
- Advanced analytics (conversation analysis, topic clustering)

**Estimated effort:** 6 weeks
**Cost impact:** +$50/mo (WhatsApp Business API fees)

### v4: Advanced AI (Months 7-9)

**Goal:** Leverage latest AI capabilities

**Features:**
- Function calling (book appointments, check order status via API)
- RAG (Retrieval-Augmented Generation) - answer from company docs
- Fine-tuned models (train on company data)
- Sentiment analysis (detect frustrated customers, escalate)
- Multi-agent workflows (LangGraph for complex tasks)
- Voice responses (TTS in customer's language)
- Proactive outreach (follow-up messages, reminders)

**Estimated effort:** 8 weeks
**Cost impact:** +$100/mo (fine-tuning, embeddings, additional API calls)

### Long-Term Vision

**Become the Intercom for WhatsApp:**
- Unified inbox (human agents + AI in same interface)
- Mobile app for agents (iOS/Android)
- Integration marketplace (Shopify, Stripe, Salesforce, etc.)
- AI agent marketplace (pre-built bots for industries)
- White-label solution (resell to agencies)

**Revenue model:**
- Free tier: 100 messages/month
- Starter: $29/mo (1,000 messages/month)
- Growth: $99/mo (5,000 messages/month)
- Enterprise: Custom pricing

---

## Production Readiness Checklist

### Before Beta Launch (Week 6)

**Infrastructure:**
- [ ] Database backups configured (daily)
- [ ] Redis persistence enabled (AOF)
- [ ] Health check endpoints responding
- [ ] Graceful shutdown handling
- [ ] Environment variables validated (Zod)
- [ ] Secrets in environment (not code)
- [ ] Docker running as non-root user

**Monitoring:**
- [ ] Structured logging to stdout (Pino)
- [ ] PII redacted in logs
- [ ] Error tracking (Sentry) configured
- [ ] Cost alerts configured ($50/day threshold)
- [ ] Rate limit metrics tracked
- [ ] Uptime monitoring (UptimeRobot)
- [ ] Disk space monitoring (80% alert)

**Security:**
- [ ] Whitelist enforced (unauthorized users blocked)
- [ ] RBAC implemented (Admin/User roles)
- [ ] Rate limiting active (10/min per user, 100/min global)
- [ ] API keys rotated (not using default keys)
- [ ] No secrets in git history
- [ ] Input validation on all commands
- [ ] SQL injection prevented (Prisma)

**Testing:**
- [ ] 80%+ unit test coverage
- [ ] Integration tests passing
- [ ] Load tested (100 concurrent users)
- [ ] Stress tested (OpenAI API failure scenarios)
- [ ] Manual QA completed (happy + error paths)

**Documentation:**
- [ ] README with setup instructions
- [ ] DEPLOYMENT.md (Hetzner VPS guide)
- [ ] Environment variables documented
- [ ] Architecture diagram
- [ ] API/command reference
- [ ] Troubleshooting guide
- [ ] Runbook for common issues

**Legal/Compliance:**
- [ ] Terms of Service drafted
- [ ] Privacy Policy drafted
- [ ] WhatsApp ban risk disclosed to customers
- [ ] Data retention policy (7 days documented)
- [ ] Customer consent obtained (opt-in)

### Before General Availability (Week 8)

**Everything above, plus:**
- [ ] Beta feedback addressed
- [ ] Performance optimized (p95 < 5s)
- [ ] Customer onboarding guide created
- [ ] Support process documented
- [ ] Pricing model defined
- [ ] Marketing materials ready
- [ ] Demo video created
- [ ] Landing page live

---

## Next Steps

### Immediate (This Week)

1. **Option C: Update Project for Free Tier** (2-3 hours)
   - [ ] Update package.json dependencies
   - [ ] Configure Prisma for SQLite
   - [ ] Update Docker Compose (SQLite + local Redis)
   - [ ] Create .env-example with free tier settings
   - [ ] Update README with new tech stack

2. **Create Development Branch**
   - [ ] Create `mvp/foundation` branch
   - [ ] Set up local environment (SQLite, Redis)
   - [ ] Verify builds and tests run

### Week 1 (Starting Next Week)

3. **Option A: Start MVP Implementation**
   - [ ] Implement database layer (Prisma + SQLite)
   - [ ] Implement structured logging (Pino)
   - [ ] Create error handling framework
   - [ ] Add health check endpoints
   - [ ] Write tests (>70% coverage)

### Ongoing

4. **Option B: Documentation**
   - [ ] Create deployment docs as we go
   - [ ] Update CLAUDE.md to reflect reality
   - [ ] Document decisions and trade-offs

---

## Approval & Sign-off

**MVP Scope:** ✅ APPROVED
**Free Tier Stack:** ✅ APPROVED
**Timeline (6-8 weeks):** ✅ APPROVED
**Budget ($24-54/mo):** ✅ APPROVED

**Approved by:** User
**Date:** 2025-11-16

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-16 | Initial MVP plan created | Claude |

---

**This document is the source of truth for MVP scope, tech stack, and roadmap.**
All team members should refer to this when making implementation decisions.
