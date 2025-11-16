# Production Readiness Checklist

Use this checklist before deploying to production or onboarding customers.

---

## Pre-Launch Checklist

### Infrastructure ✅

- [ ] **Server provisioned** (Hetzner VPS or equivalent)
- [ ] **Docker and Docker Compose installed**
- [ ] **Firewall configured** (UFW with SSH, HTTP, HTTPS allowed)
- [ ] **Non-root user created** (e.g., `whatsapp` user)
- [ ] **SSH keys configured** (passwordless login)
- [ ] **Root login disabled** (security hardening)
- [ ] **System updated** (`apt update && apt upgrade`)
- [ ] **Timezone set correctly** (`timedatectl set-timezone`)

**Commands to verify:**
```bash
docker --version
docker compose version
sudo ufw status
ssh whatsapp@server-ip  # Should work without password
```

---

### Database & Cache ✅

- [ ] **SQLite database initialized** (`pnpm db:push`)
- [ ] **Data directory created** (`mkdir -p data/`)
- [ ] **Data directory permissions correct** (`chmod 755 data/`)
- [ ] **Redis running** (Docker Compose service)
- [ ] **Redis health check passing** (`docker compose exec redis redis-cli ping`)
- [ ] **Database backups configured** (daily cron job)
- [ ] **Off-site backups set up** (optional but recommended)

**Commands to verify:**
```bash
ls -lh data/whatsapp-bot.db
docker compose exec redis redis-cli ping  # Should return PONG
crontab -l | grep backup  # Should show backup job
```

---

### Environment Configuration ✅

- [ ] **`.env` file created** (`cp .env-example .env`)
- [ ] **`OPENAI_API_KEY` set** (valid API key)
- [ ] **`OPENAI_GPT_MODEL` configured** (gpt-4o recommended)
- [ ] **`DATABASE_URL` correct for environment**
- [ ] **`REDIS_URL` correct for environment**
- [ ] **`NODE_ENV` set to production**
- [ ] **`PRE_PROMPT` customized** (for your business)
- [ ] **`ADMIN_PHONE_NUMBERS` set** (your admin numbers)
- [ ] **`RATE_LIMIT_PER_USER` set** (10 recommended)
- [ ] **`RATE_LIMIT_GLOBAL` set** (100 recommended)
- [ ] **`COST_ALERT_THRESHOLD` set** ($50 recommended)
- [ ] **`MODERATION_ENABLED` set to true**
- [ ] **`LOG_LEVEL` set to info**
- [ ] **No secrets in git** (`.env` in `.gitignore`)

**Commands to verify:**
```bash
cat .env | grep OPENAI_API_KEY | wc -l  # Should be 1
cat .env | grep NODE_ENV  # Should show production
git status  # .env should NOT appear
```

---

### Application ✅

- [ ] **Code pulled from git** (`git clone` or `git pull`)
- [ ] **Docker images built** (`docker compose build`)
- [ ] **Containers started** (`docker compose up -d`)
- [ ] **Health checks passing** (`docker compose ps` shows healthy)
- [ ] **Logs clean** (no errors in `docker compose logs`)
- [ ] **QR code scanned** (WhatsApp connected)
- [ ] **Session persisted** (session data in volume)

**Commands to verify:**
```bash
docker compose ps  # Should show "healthy" status
docker compose logs --tail=50 whatsapp-bot | grep -i error  # Should be empty
docker compose exec whatsapp-bot curl http://localhost:3000/healthz
```

---

### Security ✅

- [ ] **Secrets in environment variables** (not hardcoded)
- [ ] **API keys rotated** (not using default/test keys)
- [ ] **Firewall enabled** (`ufw status` shows active)
- [ ] **Unnecessary ports closed** (only 22, 80, 443 open)
- [ ] **Docker running as non-root user** (`user: "1001:1001"` in docker-compose.yml)
- [ ] **Container security options set** (`no-new-privileges:true`)
- [ ] **PII redacted in logs** (phone numbers, messages - will be added in Week 1)
- [ ] **SSL configured** (if using domain)
- [ ] **Whitelist enabled** (for beta) or rate limiting configured

**Commands to verify:**
```bash
sudo ufw status
docker compose config | grep user  # Should show 1001:1001
docker compose config | grep no-new-privileges
```

---

### Monitoring & Logging ✅

- [ ] **Structured logging enabled** (Pino - will be added in Week 1)
- [ ] **Sentry configured** (error tracking, optional)
- [ ] **UptimeRobot configured** (uptime monitoring, optional)
- [ ] **Log rotation configured** (docker-compose.yml logging section)
- [ ] **Disk space monitoring** (cron job, optional)
- [ ] **Cost alerts configured** (`COST_ALERT_THRESHOLD` set)

**Commands to verify:**
```bash
docker compose config | grep max-size  # Should show log rotation
cat .env | grep SENTRY_DSN
cat .env | grep COST_ALERT_THRESHOLD
```

---

### Testing ✅

- [ ] **Unit tests passing** (`pnpm test` - will be added in Week 1)
- [ ] **Integration tests passing** (Week 4)
- [ ] **Test message sent and received** (manual test)
- [ ] **Voice message transcribed** (manual test)
- [ ] **Image analyzed** (manual test, if vision enabled)
- [ ] **Rate limiting works** (send 11+ messages quickly)
- [ ] **Moderation works** (send inappropriate message)
- [ ] **Error handling tested** (invalid command, OpenAI down)
- [ ] **Admin commands tested** (!usage, !config, etc.)

**Manual test checklist:**
```
1. Send text message → Bot responds ✓
2. Send voice message → Bot transcribes and responds ✓
3. Send image → Bot analyzes and responds ✓
4. Send 15 messages in 1 minute → Rate limited after 10 ✓
5. Send inappropriate content → Blocked by moderation ✓
6. Use admin command → Works for admin, blocked for others ✓
```

---

### Documentation ✅

- [ ] **README updated** (reflects actual implementation)
- [ ] **Environment variables documented** (.env-example complete)
- [ ] **Deployment guide accessible** (DEPLOYMENT_HETZNER.md)
- [ ] **Troubleshooting guide available** (TROUBLESHOOTING.md)
- [ ] **Customer onboarding doc created** (for beta users)
- [ ] **Terms of Service** (if required)
- [ ] **Privacy Policy** (if required, especially GDPR)

---

### Legal & Compliance ✅

- [ ] **Terms of Service drafted**
- [ ] **Privacy Policy drafted**
- [ ] **Data retention policy defined** (7 days in .env)
- [ ] **WhatsApp ban risk disclosed to users**
- [ ] **OpenAI costs disclosed to users** (if charging)
- [ ] **Customer consent obtained** (opt-in to bot)
- [ ] **GDPR compliance** (if EU customers):
  - [ ] Data processing agreement
  - [ ] Right to be forgotten (manual for MVP)
  - [ ] Data export capability (manual for MVP)
  - [ ] Privacy policy mentions OpenAI

---

### Backup & Recovery ✅

- [ ] **Backup script created** (`backup.sh`)
- [ ] **Backup script tested** (run manually)
- [ ] **Backup cron job configured** (runs daily at 2am)
- [ ] **Off-site backups configured** (Backblaze, S3, or manual)
- [ ] **Restore procedure tested** (from backup)
- [ ] **Database backup < 24 hours old**
- [ ] **Session backup < 24 hours old**
- [ ] **`.env` backup exists** (stored securely)

**Commands to verify:**
```bash
ls -lh ~/backups/  # Should show recent backups
crontab -l | grep backup
./backup.sh  # Test backup manually
```

---

### Cost Management ✅

- [ ] **OpenAI billing limits set** (https://platform.openai.com/account/billing/limits)
- [ ] **Budget alerts configured** (OpenAI dashboard)
- [ ] **Rate limiting enabled** (in .env)
- [ ] **Usage tracking configured** (will be added in Week 2)
- [ ] **Cost per conversation estimated** (typical: $0.01-0.10)
- [ ] **Monthly budget calculated** (users × avg messages × cost)
- [ ] **Alert email configured** (`ALERT_EMAIL` in .env)

**Cost calculation example:**
```
10 users × 50 messages/day × $0.05/message = $25/day = $750/month
Set COST_ALERT_THRESHOLD to $30/day to catch anomalies
```

---

## Beta Launch Checklist

### Before Onboarding First Customer

- [ ] **All pre-launch items complete** (above)
- [ ] **Onboarding document created** (how to add number, scan QR)
- [ ] **Support process defined** (how customers get help)
- [ ] **Feedback mechanism** (how to collect customer feedback)
- [ ] **Bug reporting process** (GitHub issues, email, etc.)
- [ ] **Escalation process** (human takeover if bot fails)

---

### Beta Customer Onboarding

**For each beta customer:**

- [ ] **Customer added to whitelist** (`WHITELISTED_PHONE_NUMBERS`)
- [ ] **Customer sent onboarding doc** (how to use bot)
- [ ] **Customer tested bot** (sent first message successfully)
- [ ] **Customer feedback collected** (initial impressions)
- [ ] **Customer phone number logged** (for support)
- [ ] **Customer expectations set** (MVP status, limitations)

---

### Beta Monitoring (Daily)

- [ ] **Check bot uptime** (docker compose ps)
- [ ] **Review logs for errors** (docker compose logs)
- [ ] **Check OpenAI costs** (https://platform.openai.com/usage)
- [ ] **Check customer feedback** (messages, emails)
- [ ] **Verify backups ran** (ls ~/backups/)
- [ ] **Check disk space** (df -h)
- [ ] **Check memory usage** (docker stats)
- [ ] **Respond to customer issues** (within 24 hours)

---

## General Availability Checklist

### Before Public Launch (After Beta)

- [ ] **Beta feedback addressed** (major bugs fixed)
- [ ] **Performance optimized** (p95 response time < 5s)
- [ ] **All Week 1-4 features complete** (see MVP_PLAN.md)
- [ ] **Tests passing** (80%+ coverage)
- [ ] **Security audit complete** (manual or automated)
- [ ] **Documentation complete** (all guides updated)
- [ ] **Customer onboarding automated** (self-serve if possible)
- [ ] **Pricing model defined** (if charging)
- [ ] **Payment system integrated** (if charging)
- [ ] **Marketing materials ready** (landing page, demo video)
- [ ] **Support system ready** (email, chat, FAQ)

---

### Ongoing Maintenance

**Daily:**
- [ ] Check logs for errors
- [ ] Check OpenAI costs
- [ ] Check uptime

**Weekly:**
- [ ] Review customer feedback
- [ ] Check for system updates
- [ ] Review usage metrics
- [ ] Verify backups

**Monthly:**
- [ ] Apply security patches
- [ ] Update bot code (git pull)
- [ ] Review costs vs budget
- [ ] Optimize PRE_PROMPT based on feedback
- [ ] Clean old backups
- [ ] Rotate API keys (optional)

---

## Troubleshooting Contacts

**If something goes wrong:**

1. **Check logs first:**
   ```bash
   docker compose logs --tail=100 whatsapp-bot
   ```

2. **Restart services:**
   ```bash
   docker compose restart
   ```

3. **Check documentation:**
   - [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
   - [MVP_PLAN.md](MVP_PLAN.md)

4. **Get help:**
   - GitHub Issues: https://github.com/krunchontu/whatsapp-chatgpt/issues
   - Discord: https://discord.gg/9VJaRXKwd3

---

## Production Deployment Summary

**When you've checked all boxes above:**

✅ **Infrastructure Ready**
✅ **Security Configured**
✅ **Monitoring Enabled**
✅ **Backups Automated**
✅ **Documentation Complete**
✅ **Testing Passed**
✅ **Legal Compliance**
✅ **Cost Controls Active**

**YOU ARE READY FOR PRODUCTION! 🚀**

---

## Post-Launch Metrics

Track these metrics to measure success:

### Technical Metrics
- Uptime: Target 99%+
- Response time (p95): Target < 5s
- Error rate: Target < 1%
- Cost per conversation: Target < $0.10

### Business Metrics
- Active users: Growing
- Messages per user: Growing
- Customer satisfaction: 4/5+
- Support burden: < 2 hours/week

### Cost Metrics
- Daily OpenAI costs: Within budget
- Monthly infrastructure: $3.79-10/mo
- Cost per customer: Calculated
- ROI: Positive (cost savings > operating costs)

---

**Good luck with your launch! 🎉**

**Need help? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) or [create an issue](https://github.com/krunchontu/whatsapp-chatgpt/issues).**
