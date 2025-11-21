# Audit Logging Guide

**Status:** ✅ Complete
**Version:** 1.0
**Last Updated:** 2025-11-21

---

## Table of Contents

1. [Overview](#overview)
2. [What is Logged](#what-is-logged)
3. [Audit Commands](#audit-commands)
4. [Role Management Commands](#role-management-commands)
5. [Querying Audit Logs](#querying-audit-logs)
6. [Retention Policy](#retention-policy)
7. [Integration Points](#integration-points)
8. [Examples](#examples)
9. [Security & Compliance](#security--compliance)

---

## Overview

The audit logging system provides comprehensive tracking of all administrative actions, security events, and configuration changes in the WhatsApp bot. This is essential for:

- **Security monitoring** - Track unauthorized access attempts
- **Compliance** - GDPR and regulatory audit trails
- **Debugging** - Trace configuration changes and their impact
- **Accountability** - Know who did what and when

### Key Features

✅ **Comprehensive tracking** - All admin actions automatically logged
✅ **Role-based access** - ADMIN+ can view logs, OWNER can export
✅ **Multiple categories** - AUTH, CONFIG, ADMIN, SECURITY
✅ **Flexible querying** - Filter by user, category, date range, action
✅ **Automatic retention** - 90-day retention (configurable)
✅ **Export capability** - JSON/CSV export for compliance

---

## What is Logged

### Authentication & Authorization

- **Role changes** - USER → OPERATOR, ADMIN → USER, etc.
- **Whitelist changes** - Adding/removing phone numbers
- **Permission denials** - Attempted unauthorized actions

### Configuration Changes

- **Bot settings** - Model changes, language settings, etc.
- **System configuration** - Rate limits, cost thresholds, etc.

### Administrative Actions

- **Usage queries** - Who viewed statistics
- **Audit log access** - Who viewed/exported audit logs
- **Cost alerts** - Threshold breaches
- **Conversation resets** - Manual history deletions

### Security Events

- **Rate limit violations** - Per-user and global violations
- **Moderation flags** - Content flagged by OpenAI moderation
- **Circuit breaker events** - Service degradation/recovery
- **Failed authentications** - Blocked access attempts

---

## Audit Commands

All audit commands are available via `!config audit <command>` and require **ADMIN** role or higher.

### View Recent Logs

```
!config audit list [days]
```

**Description:** View recent audit logs
**Default:** Last 7 days
**Max days:** 365
**Permission:** ADMIN+

**Example:**
```
!config audit list 30
```

Shows the last 30 days of audit logs.

### View User-Specific Logs

```
!config audit user <phoneNumber>
```

**Description:** View all audit logs for a specific user
**Permission:** ADMIN+

**Example:**
```
!config audit user +1234567890
```

Shows all logged actions by this user.

### Filter by Category

```
!config audit category <AUTH|CONFIG|ADMIN|SECURITY>
```

**Description:** Filter audit logs by category
**Permission:** ADMIN+

**Categories:**
- `AUTH` - Authentication and authorization events
- `CONFIG` - Configuration changes
- `ADMIN` - Administrative actions
- `SECURITY` - Security events (rate limits, moderation, circuit breaker)

**Example:**
```
!config audit category SECURITY
```

Shows all security-related audit logs.

### Export Audit Logs

```
!config audit export [days]
```

**Description:** Export audit logs as JSON
**Default:** Last 30 days
**Permission:** **OWNER only**

**Example:**
```
!config audit export 90
```

Exports the last 90 days of audit logs.

---

## Role Management Commands

All role commands are available via `!config role <command>` and require **ADMIN** role or higher (some require OWNER).

### List All Users and Roles

```
!config role list
```

**Description:** List all users with their roles
**Permission:** ADMIN+

**Output:**
```
👥 User Roles Summary

OWNERS (1):
• +1234567890

ADMINS (2):
• +1234567891
• +1234567892

OPERATORS (3):
• +1234567893
• +1234567894
• +1234567895

USERS (10):
• +1234567896
• +1234567897
...and 8 more

Total Users: 16
```

### View User Info

```
!config role info <phoneNumber>
```

**Description:** Show detailed information about a user's role and permissions
**Permission:** ADMIN+

**Example:**
```
!config role info +1234567890
```

**Output:**
```
👤 User Information

📞 Phone: +1234567890
🎭 Role: ADMIN
✅ Whitelisted: Yes
📅 Created: 11/01/2025

Permissions:
• Manage OPERATOR and USER roles
• View audit logs (read-only)
• View all statistics and costs
• Configure all bot settings
• Manage whitelist
```

### Promote User

```
!config role promote <phoneNumber> <OWNER|ADMIN|OPERATOR|USER>
```

**Description:** Promote user to specified role
**Permission:**
- OWNER role: Requires **OWNER**
- ADMIN role: Requires **OWNER**
- OPERATOR role: Requires **ADMIN+**
- USER role: Requires **ADMIN+**

**Example:**
```
!config role promote +1234567890 OPERATOR
```

**Output:**
```
✅ Role Change Successful

👤 User: +1234567890
📊 USER → OPERATOR
✏️ Changed by: +1234567891
```

**Note:** All role changes are automatically logged to the audit system.

### Demote User

```
!config role demote <phoneNumber> <ADMIN|OPERATOR|USER>
```

**Description:** Demote user to specified role
**Permission:** Same as promote (cannot demote TO OWNER)
**Restriction:** Cannot demote yourself

**Example:**
```
!config role demote +1234567890 USER
```

---

## Querying Audit Logs

### Via Commands (WhatsApp)

The easiest way to query audit logs is through the WhatsApp commands documented above.

### Via API (Programmatic)

```typescript
import { AuditLogRepository, AuditCategory } from './db/repositories/auditLog.repository';

// Get all security events from last 7 days
const securityLogs = await AuditLogRepository.query({
  category: AuditCategory.SECURITY,
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  limit: 100
});

// Get all actions by a specific user
const userLogs = await AuditLogRepository.findByUser(userId, 50);

// Get all role changes
const roleChangeLogs = await AuditLogRepository.findByAction('ROLE_CHANGE', 20);

// Export to JSON
const jsonData = await AuditLogRepository.exportToJSON({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// Export to CSV
const csvData = await AuditLogRepository.exportToCSV({
  category: AuditCategory.AUTH
});
```

---

## Retention Policy

### Default Retention

**90 days** - Audit logs are automatically deleted after 90 days.

### Configuration

Set retention period in days via environment variable:

```bash
AUDIT_LOG_RETENTION_DAYS=90
```

**Recommended values:**
- **30 days** - Minimum for security monitoring
- **90 days** - Good balance (GDPR compliant)
- **180 days** - Extended for regulated industries
- **365 days** - Maximum for high-compliance requirements

### Automatic Cleanup

The cleanup scheduler runs automatically every 24 hours and deletes logs older than the retention period.

**Manual cleanup:**

```typescript
import { cleanupExpiredAuditLogs } from './db/audit-cleanup-scheduler';

// Clean up logs older than 90 days
await cleanupExpiredAuditLogs(90);
```

---

## Integration Points

Audit logging is automatically integrated throughout the application:

### Rate Limiter (`src/middleware/rateLimiter.ts`)

Logs rate limit violations (both per-user and global).

### Config Handler (`src/handlers/ai-config.ts`)

Logs all configuration changes made via `!config` commands.

### Circuit Breaker (`src/lib/circuit-breaker.ts`)

Logs when circuit breaker opens or closes (service degradation/recovery).

### Moderation Handler (`src/handlers/moderation.ts`)

Logs when content is flagged by OpenAI's moderation API.

### User Repository (`src/db/repositories/user.repository.ts`)

Logs all role changes, whitelist modifications, and permission denials.

### Error Handler (`src/middleware/errorHandler.ts`)

Logs permission denied errors (attempted unauthorized actions).

---

## Examples

### Example 1: Track who changed bot configuration

```typescript
// Query all config changes in last 30 days
const configChanges = await AuditLogRepository.query({
  category: AuditCategory.CONFIG,
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  limit: 50
});

// Print changes
configChanges.forEach(log => {
  console.log(`${log.createdAt}: ${log.phoneNumber} (${log.userRole})`);
  console.log(`  Action: ${log.description}`);
  const metadata = JSON.parse(log.metadata);
  console.log(`  Setting: ${metadata.setting}`);
  console.log(`  ${metadata.oldValue} → ${metadata.newValue}`);
});
```

### Example 2: Monitor security events

```typescript
// Get recent security events
const securityEvents = await AuditLogRepository.query({
  category: AuditCategory.SECURITY,
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
});

// Group by action type
const byAction = securityEvents.reduce((acc, log) => {
  acc[log.action] = (acc[log.action] || 0) + 1;
  return acc;
}, {});

console.log('Security Events (last 7 days):');
console.log(`  Rate Limit Violations: ${byAction['RATE_LIMIT_VIOLATION'] || 0}`);
console.log(`  Moderation Flags: ${byAction['MODERATION_FLAG'] || 0}`);
console.log(`  Circuit Breaker Opens: ${byAction['CIRCUIT_BREAKER_OPEN'] || 0}`);
```

### Example 3: GDPR data export for a user

```typescript
// Get all actions by a user (for GDPR right-to-access)
const userId = 'user_123';
const userLogs = await AuditLogRepository.findByUser(userId, 1000);

// Export to JSON
const jsonData = await AuditLogRepository.exportToJSON({
  userId
});

// Send to user
console.log(`User has ${userLogs.length} audit log entries`);
// In production: email or download link
```

---

## Security & Compliance

### Data Protection

✅ **No sensitive data** - Message content, passwords, API keys are NEVER logged
✅ **Phone numbers** - Always tracked for accountability
✅ **Metadata only** - Only action types and settings changes logged
✅ **Encrypted at rest** - Database encryption (if enabled)

### GDPR Compliance

✅ **Right to access** - Users can request their audit logs
✅ **Right to deletion** - `deleteByUser()` method available
✅ **Data minimization** - Only necessary data logged
✅ **Retention limits** - Auto-delete after 90 days (default)

### Access Control

✅ **ADMIN+ required** - Only authorized personnel can view logs
✅ **OWNER for export** - Export requires highest privilege
✅ **Permission logging** - Access attempts are logged
✅ **Cannot modify logs** - Audit logs are immutable

### Audit Trail Completeness

✅ **Who** - User phone number and role always captured
✅ **What** - Action type and description logged
✅ **When** - Timestamp with millisecond precision
✅ **Where** - Category classification (AUTH, CONFIG, etc.)
✅ **Why/How** - Metadata with old/new values

---

## Troubleshooting

### "Permission denied" when viewing audit logs

**Solution:** You need ADMIN role or higher. Contact an OWNER to promote you:
```
!config role promote <your-number> ADMIN
```

### "Export requires OWNER role"

**Solution:** Only OWNER can export audit logs. This is a security restriction. Contact the system owner.

### Audit logs not appearing

**Possible causes:**
1. Database not initialized - Run `npx prisma db push`
2. Audit logging disabled (check code)
3. Event not integrated yet

**Debug:**
```typescript
// Check if audit log was created
const logs = await AuditLogRepository.getRecent();
console.log(`Found ${logs.length} recent logs`);
```

### Old logs not being deleted

**Check retention scheduler:**
```typescript
import { isSchedulerRunning } from './db/audit-cleanup-scheduler';

console.log(`Scheduler running: ${isSchedulerRunning()}`);
```

**Manual cleanup:**
```bash
# Check database
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM audit_logs WHERE createdAt < datetime('now', '-90 days');"

# Run cleanup manually if needed
```

---

## Best Practices

### For Developers

1. ✅ **Always log sensitive operations** - Use `AuditLogger` for admin actions
2. ✅ **Include metadata** - Capture old/new values for config changes
3. ✅ **Use correct categories** - AUTH vs CONFIG vs SECURITY
4. ✅ **Fail-safe logging** - Catch errors, don't throw

### For Administrators

1. ✅ **Review logs regularly** - Weekly security review
2. ✅ **Monitor rate limits** - Watch for abuse patterns
3. ✅ **Track role changes** - Verify all promotions/demotions
4. ✅ **Export before retention** - Download important logs

### For Compliance

1. ✅ **Document retention policy** - Include in privacy policy
2. ✅ **Regular audits** - Monthly compliance checks
3. ✅ **Export for regulators** - Keep copies if required
4. ✅ **Incident response** - Use logs for security investigations

---

## API Reference

See [`src/services/auditLogger.ts`](../src/services/auditLogger.ts) for full API documentation.

**Key methods:**
- `logRoleChange()` - Log role promotions/demotions
- `logWhitelistChange()` - Log whitelist modifications
- `logPermissionDenied()` - Log unauthorized access attempts
- `logConfigChange()` - Log configuration updates
- `logRateLimitViolation()` - Log rate limit violations
- `logModerationFlag()` - Log content moderation flags
- `logCircuitBreakerChange()` - Log service degradation/recovery

**Repository methods:**
- `create()` - Create new audit log entry
- `query()` - Query with filters (user, category, date range)
- `findByUser()` - Get all logs for a user
- `findByCategory()` - Filter by category
- `exportToJSON()` - Export to JSON format
- `exportToCSV()` - Export to CSV format
- `deleteExpired()` - Delete logs older than retention period

---

## Support

For questions or issues with audit logging:

1. Check this documentation
2. Review the code in `src/services/auditLogger.ts`
3. Check audit log commands with `!config audit help`
4. Contact your system administrator

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Next Review:** After feedback from beta testing
