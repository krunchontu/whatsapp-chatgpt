# Next Steps

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
