# Week 4: Security & Access Control - Implementation Plan

**Status:** 🚧 IN PROGRESS
**Date Started:** 2025-11-20
**Branch:** `claude/add-rbac-audit-logs-01D1tkNFoySPdnRU3QJ9VkhZ`
**Baseline:** Week 3 Complete - All 283 tests passing

---

## Overview

Week 4 expands the basic 2-role RBAC system (ADMIN/USER) to a comprehensive 4-role system (OWNER/ADMIN/OPERATOR/USER) with full audit logging capabilities. This was originally deferred from the MVP plan but is now being implemented to provide enterprise-grade security and compliance features.

---

## Current State Analysis

### ✅ What's Already Implemented (Week 1-3)

**RBAC Foundation:**
- ✅ User model with `role` and `isWhitelisted` fields
- ✅ UserRepository with basic role helpers (isAdmin, promoteToAdmin, etc.)
- ✅ 2 roles: ADMIN and USER
- ✅ Whitelist management functionality
- ✅ AuthorizationError class for permission errors

**Infrastructure:**
- ✅ Database layer (SQLite + Prisma)
- ✅ Structured logging (Pino)
- ✅ Error handling framework
- ✅ Rate limiting (Redis-based)
- ✅ Usage tracking and cost monitoring
- ✅ Conversation memory
- ✅ Job queue (BullMQ)
- ✅ Circuit breaker pattern

**Testing:**
- ✅ 283 tests passing (100%)
- ✅ Comprehensive test coverage for existing features

### ❌ What Needs to be Implemented

**RBAC Expansion:**
- ❌ Add OWNER and OPERATOR roles
- ❌ Role hierarchy and permission system
- ❌ Authorization middleware with permission checks
- ❌ Update config to support role-specific phone numbers
- ❌ Update all handlers to enforce permissions
- ❌ Role-based command access control

**Audit Logging:**
- ❌ AuditLog database model
- ❌ AuditLogRepository with querying capabilities
- ❌ Audit logging service/middleware
- ❌ Automatic logging of sensitive actions
- ❌ Audit log viewing commands
- ❌ Audit log retention policy (30-90 days)

---

## Scope & Requirements

### 1. RBAC: 4-Role Hierarchy

#### Role Definitions

| Role | Level | Capabilities | Use Case |
|------|-------|-------------|----------|
| **OWNER** | 4 | Full system access, can manage all roles including admins | Business owner, system administrator |
| **ADMIN** | 3 | Manage operators and users, view all stats, configure bot | Team lead, customer service manager |
| **OPERATOR** | 2 | Handle customer inquiries, limited config access | Customer service agent |
| **USER** | 1 | Chat with bot only, no administrative functions | Customer, end user |

#### Permission Matrix

| Action | OWNER | ADMIN | OPERATOR | USER |
|--------|-------|-------|----------|------|
| Chat with bot | ✅ | ✅ | ✅ | ✅ |
| Reset conversation (!reset) | ✅ | ✅ | ✅ | ✅ |
| View personal usage (!config usage user) | ✅ | ✅ | ✅ | ❌ |
| View global stats (!config usage stats) | ✅ | ✅ | ❌ | ❌ |
| View cost alerts (!config usage cost) | ✅ | ✅ | ❌ | ❌ |
| Change bot config (!config) | ✅ | ✅ | ⚠️ Limited | ❌ |
| Promote/demote operators | ✅ | ✅ | ❌ | ❌ |
| Promote/demote admins | ✅ | ❌ | ❌ | ❌ |
| View audit logs (!audit) | ✅ | ✅ | ❌ | ❌ |
| Export audit logs | ✅ | ❌ | ❌ | ❌ |
| Whitelist management | ✅ | ✅ | ❌ | ❌ |

#### Role Hierarchy Rules

1. **OWNER can:**
   - Manage all roles (promote anyone to OWNER, ADMIN, OPERATOR, or USER)
   - View and export audit logs
   - All ADMIN capabilities

2. **ADMIN can:**
   - Promote/demote OPERATORS and USERS only (cannot touch OWNERs or other ADMINs)
   - View audit logs (read-only)
   - Configure bot settings (all config commands)
   - View all usage statistics

3. **OPERATOR can:**
   - Limited config access (change language, model, reset conversations)
   - View their own usage statistics
   - Cannot manage roles or view sensitive data

4. **USER can:**
   - Chat with bot
   - Reset their own conversation
   - No administrative access

### 2. Audit Logging System

#### What to Log

**Authentication & Authorization:**
- ✅ User role changes (USER → OPERATOR, ADMIN → USER, etc.)
- ✅ Whitelist additions/removals
- ✅ Permission denied events (attempted unauthorized actions)

**Configuration Changes:**
- ✅ Bot configuration updates (!config commands)
- ✅ System settings changes (rate limits, cost thresholds, etc.)

**Administrative Actions:**
- ✅ Usage stats queries (!config usage)
- ✅ Audit log queries (!audit)
- ✅ Cost threshold breaches
- ✅ Manual conversation resets

**Security Events:**
- ✅ Rate limit violations
- ✅ Moderation flags
- ✅ Circuit breaker state changes (OPEN/CLOSED)

#### Audit Log Schema

```typescript
model AuditLog {
  id          String   @id @default(cuid())

  // Who performed the action
  userId      String?  // Nullable for system-generated events
  phoneNumber String   // Always track phone number
  userRole    String   // Role at time of action

  // What happened
  action      String   // e.g., "ROLE_CHANGE", "CONFIG_UPDATE", "PERMISSION_DENIED"
  category    String   // "AUTH", "CONFIG", "ADMIN", "SECURITY"
  description String   // Human-readable description

  // Context
  metadata    String   // JSON: { oldValue, newValue, targetUserId, command, etc. }

  // When
  createdAt   DateTime @default(now())

  // Relations
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([category, createdAt])
  @@index([action, createdAt])
  @@index([createdAt]) // For retention policy cleanup
  @@map("audit_logs")
}
```

#### Audit Log Retention Policy

- **Default:** 90 days (GDPR compliant)
- **Configurable:** AUDIT_LOG_RETENTION_DAYS environment variable
- **Cleanup:** Daily job (similar to conversation cleanup)

---

## Implementation Plan (Detailed Breakdown)

### Phase 1: RBAC Expansion (Days 1-2)

#### Task 1.1: Update Database Schema
**Estimated Time:** 1 hour

- [ ] Add OWNER and OPERATOR to UserRole enum (src/db/repositories/user.repository.ts)
- [ ] Update role validation in UserRepository
- [ ] Update Prisma schema comments to document 4 roles
- [ ] Run migration (Prisma db push)

**Files to Modify:**
- `src/db/repositories/user.repository.ts` (add OWNER, OPERATOR to UserRole)
- `prisma/schema.prisma` (update comments)

**Testing:**
- [ ] Update user.repository.test.ts to test all 4 roles
- [ ] Verify role validation works correctly

---

#### Task 1.2: Update Configuration System
**Estimated Time:** 1 hour

- [ ] Add OWNER_PHONE_NUMBERS to .env-example
- [ ] Add ADMIN_PHONE_NUMBERS to .env-example (already exists but update docs)
- [ ] Add OPERATOR_PHONE_NUMBERS to .env-example
- [ ] Update config.ts to parse these environment variables
- [ ] Create config type definitions for role-based phone numbers

**Files to Modify:**
- `.env-example` (add OWNER_PHONE_NUMBERS, OPERATOR_PHONE_NUMBERS)
- `src/config.ts` (add ownerPhoneNumbers, adminPhoneNumbers, operatorPhoneNumbers)

**Testing:**
- [ ] Verify config parsing works correctly
- [ ] Test with comma-separated phone numbers

---

#### Task 1.3: Create Permission System
**Estimated Time:** 2 hours

- [ ] Create `src/lib/permissions.ts` with permission definitions
- [ ] Define permission sets for each role
- [ ] Create `hasPermission()` helper function
- [ ] Create role hierarchy helpers (isRoleHigherThan, canManageRole, etc.)

**New Files:**
- `src/lib/permissions.ts`
- `src/lib/__tests__/permissions.test.ts`

**Permission Enum:**
```typescript
export enum Permission {
  // Basic permissions
  CHAT = "CHAT",
  RESET_CONVERSATION = "RESET_CONVERSATION",

  // Usage tracking
  VIEW_OWN_USAGE = "VIEW_OWN_USAGE",
  VIEW_GLOBAL_USAGE = "VIEW_GLOBAL_USAGE",
  VIEW_COST_ALERTS = "VIEW_COST_ALERTS",

  // Configuration
  UPDATE_CONFIG = "UPDATE_CONFIG",
  UPDATE_CONFIG_LIMITED = "UPDATE_CONFIG_LIMITED",

  // Role management
  MANAGE_USERS = "MANAGE_USERS",
  MANAGE_OPERATORS = "MANAGE_OPERATORS",
  MANAGE_ADMINS = "MANAGE_ADMINS",
  MANAGE_OWNERS = "MANAGE_OWNERS",

  // Whitelist
  MANAGE_WHITELIST = "MANAGE_WHITELIST",

  // Audit logs
  VIEW_AUDIT_LOGS = "VIEW_AUDIT_LOGS",
  EXPORT_AUDIT_LOGS = "EXPORT_AUDIT_LOGS",
}
```

**Testing:**
- [ ] Test permission checks for all roles
- [ ] Test role hierarchy (OWNER > ADMIN > OPERATOR > USER)
- [ ] Test edge cases (demoting yourself, circular permissions, etc.)

---

#### Task 1.4: Create Authorization Middleware
**Estimated Time:** 2 hours

- [ ] Create `src/middleware/authorization.ts`
- [ ] Implement `requireRole()` middleware factory
- [ ] Implement `requirePermission()` middleware factory
- [ ] Create `getUserRole()` helper to get role from phone number
- [ ] Integrate with existing error handling

**New Files:**
- `src/middleware/authorization.ts`
- `src/middleware/__tests__/authorization.test.ts`

**Middleware Functions:**
```typescript
// Require specific role or higher
export function requireRole(minRole: UserRoleType) {
  return async (phoneNumber: string) => {
    const user = await UserRepository.findByPhoneNumber(phoneNumber);
    if (!user || !hasRoleLevel(user.role, minRole)) {
      throw new AuthorizationError(`This command requires ${minRole} role or higher.`);
    }
    return user;
  };
}

// Require specific permission
export function requirePermission(permission: Permission) {
  return async (phoneNumber: string) => {
    const user = await UserRepository.findByPhoneNumber(phoneNumber);
    if (!user || !hasPermission(user.role, permission)) {
      throw new AuthorizationError(`You don't have permission to ${permission}.`);
    }
    return user;
  };
}
```

**Testing:**
- [ ] Test requireRole() with all roles
- [ ] Test requirePermission() with all permissions
- [ ] Test authorization errors are thrown correctly
- [ ] Test user-friendly error messages

---

#### Task 1.5: Update UserRepository
**Estimated Time:** 1.5 hours

- [ ] Add isOwner(), isOperator() helpers
- [ ] Add isOwnerByPhone(), isOperatorByPhone() helpers
- [ ] Add findAllOwners(), findAllOperators() helpers
- [ ] Add promoteToOwner(), promoteToOperator() helpers
- [ ] Add demoteFrom* helpers
- [ ] Update validation logic for 4 roles

**Files to Modify:**
- `src/db/repositories/user.repository.ts`
- `src/db/repositories/__tests__/user.repository.test.ts`

**Testing:**
- [ ] Test all new role helpers
- [ ] Test promotion/demotion logic
- [ ] Test role validation (cannot skip levels, etc.)

---

### Phase 2: Audit Logging (Days 2-3)

#### Task 2.1: Create Audit Log Database Model
**Estimated Time:** 1 hour

- [ ] Add AuditLog model to Prisma schema
- [ ] Add relation to User model (optional, nullable)
- [ ] Add indexes for common queries (userId, category, action, createdAt)
- [ ] Run migration (Prisma db push)

**Files to Modify:**
- `prisma/schema.prisma`

**Testing:**
- [ ] Verify schema changes applied successfully
- [ ] Test database connection to new table

---

#### Task 2.2: Create AuditLogRepository
**Estimated Time:** 2.5 hours

- [ ] Create `src/db/repositories/auditLog.repository.ts`
- [ ] Implement create() method
- [ ] Implement query methods (findByUser, findByCategory, findByAction, findByDateRange)
- [ ] Implement export functionality (JSON, CSV)
- [ ] Implement cleanup method (delete logs older than retention period)

**New Files:**
- `src/db/repositories/auditLog.repository.ts`
- `src/db/repositories/__tests__/auditLog.repository.test.ts`

**Core Methods:**
```typescript
export class AuditLogRepository {
  // Create new audit log entry
  static async create(data: CreateAuditLogData): Promise<AuditLog>;

  // Query methods
  static async findByUser(userId: string, limit?: number): Promise<AuditLog[]>;
  static async findByCategory(category: string, limit?: number): Promise<AuditLog[]>;
  static async findByAction(action: string, limit?: number): Promise<AuditLog[]>;
  static async findByDateRange(startDate: Date, endDate: Date): Promise<AuditLog[]>;

  // Combined query
  static async query(filters: AuditLogFilters): Promise<AuditLog[]>;

  // Export
  static async exportToJSON(filters: AuditLogFilters): Promise<string>;
  static async exportToCSV(filters: AuditLogFilters): Promise<string>;

  // Cleanup
  static async deleteExpired(retentionDays: number): Promise<number>;
}
```

**Testing:**
- [ ] Test audit log creation
- [ ] Test all query methods
- [ ] Test export functionality (JSON, CSV)
- [ ] Test cleanup/retention policy

---

#### Task 2.3: Create Audit Logging Service
**Estimated Time:** 2 hours

- [ ] Create `src/services/auditLogger.ts`
- [ ] Create helper functions for common audit actions
- [ ] Create audit action enums/constants
- [ ] Integrate with error handling (log permission denials)

**New Files:**
- `src/services/auditLogger.ts`
- `src/services/__tests__/auditLogger.test.ts`

**Helper Functions:**
```typescript
export class AuditLogger {
  // Auth & Authorization
  static async logRoleChange(params: {
    performedBy: User;
    targetUser: User;
    oldRole: string;
    newRole: string;
  }): Promise<void>;

  static async logPermissionDenied(params: {
    user: User;
    action: string;
    reason: string;
  }): Promise<void>;

  // Configuration
  static async logConfigChange(params: {
    performedBy: User;
    setting: string;
    oldValue: any;
    newValue: any;
  }): Promise<void>;

  // Administrative
  static async logUsageQuery(params: {
    performedBy: User;
    queryType: string;
  }): Promise<void>;

  static async logAuditLogViewed(params: {
    performedBy: User;
    filters: AuditLogFilters;
  }): Promise<void>;

  // Security
  static async logRateLimitViolation(params: {
    phoneNumber: string;
    limitType: 'user' | 'global';
  }): Promise<void>;

  static async logModerationFlag(params: {
    user: User;
    content: string;
    flaggedCategories: string[];
  }): Promise<void>;
}
```

**Testing:**
- [ ] Test all audit logging helpers
- [ ] Verify metadata is stored correctly
- [ ] Test integration with database

---

#### Task 2.4: Integrate Audit Logging Throughout App
**Estimated Time:** 3 hours

- [ ] Update message handler to log permission denials
- [ ] Update GPT handler to log moderation flags
- [ ] Update rate limiter to log violations
- [ ] Update config commands to log changes
- [ ] Update user repository to log role changes
- [ ] Update circuit breaker to log state changes

**Files to Modify:**
- `src/handlers/message.ts`
- `src/handlers/gpt.ts`
- `src/middleware/rateLimiter.ts`
- `src/handlers/ai-config.ts`
- `src/db/repositories/user.repository.ts`
- `src/lib/circuit-breaker.ts`
- `src/middleware/errorHandler.ts`

**Integration Pattern:**
```typescript
import { AuditLogger } from '../services/auditLogger';

// Example: Log role change in UserRepository
static async promoteToAdmin(userId: string, performedBy: User): Promise<User> {
  const targetUser = await this.findById(userId);
  const oldRole = targetUser.role;

  const updatedUser = await this.update(userId, { role: UserRole.ADMIN });

  // Log the change
  await AuditLogger.logRoleChange({
    performedBy,
    targetUser: updatedUser,
    oldRole,
    newRole: UserRole.ADMIN,
  });

  return updatedUser;
}
```

**Testing:**
- [ ] Verify audit logs created for all integrated actions
- [ ] Test audit log metadata is complete
- [ ] Test performance impact (should be minimal)

---

### Phase 3: Commands & UI (Day 3)

#### Task 3.1: Update Existing Commands for RBAC
**Estimated Time:** 2 hours

- [ ] Update !config commands to check permissions
- [ ] Update !usage commands to check role
- [ ] Add permission checks to all admin commands
- [ ] Update command help text to show required role

**Files to Modify:**
- `src/commands/usage.ts`
- `src/commands/general.ts`
- `src/handlers/ai-config.ts`

**Permission Integration:**
```typescript
import { requirePermission } from '../middleware/authorization';

// Example: Update usage stats command
export function register(): ICommandsMap {
  return {
    stats: {
      description: 'View global usage statistics (ADMIN+ only)',
      execute: async (value, message) => {
        // Check permission
        const user = await requirePermission(Permission.VIEW_GLOBAL_USAGE)(
          message.from
        );

        // Original logic...
      },
    },
  };
}
```

**Testing:**
- [ ] Test commands with different roles
- [ ] Test permission denied errors
- [ ] Test user-friendly error messages

---

#### Task 3.2: Create Audit Log Viewing Commands
**Estimated Time:** 2.5 hours

- [ ] Create `src/commands/audit.ts`
- [ ] Implement !audit list <days> (show recent audit logs)
- [ ] Implement !audit user <phoneNumber> (show logs for specific user)
- [ ] Implement !audit category <category> (filter by category)
- [ ] Implement !audit export (export logs - OWNER only)
- [ ] Add pagination for large result sets

**New Files:**
- `src/commands/audit.ts`
- `src/commands/__tests__/audit.test.ts`

**Commands:**
```typescript
export function register(): ICommandsMap {
  return {
    list: {
      description: 'View recent audit logs (!audit list <days>)',
      execute: async (value, message) => { /* ... */ },
    },
    user: {
      description: 'View logs for specific user (!audit user <phoneNumber>)',
      execute: async (value, message) => { /* ... */ },
    },
    category: {
      description: 'Filter logs by category (!audit category <AUTH|CONFIG|ADMIN|SECURITY>)',
      execute: async (value, message) => { /* ... */ },
    },
    export: {
      description: 'Export audit logs as JSON (OWNER only)',
      execute: async (value, message) => { /* ... */ },
    },
  };
}
```

**Testing:**
- [ ] Test all audit commands with OWNER role
- [ ] Test permission denied for non-OWNER users
- [ ] Test pagination for large result sets
- [ ] Test export functionality

---

#### Task 3.3: Create Role Management Commands
**Estimated Time:** 2 hours

- [ ] Create `src/commands/role.ts`
- [ ] Implement !role list (list all users and their roles)
- [ ] Implement !role promote <phoneNumber> <role>
- [ ] Implement !role demote <phoneNumber> <role>
- [ ] Implement !role info <phoneNumber> (show user's role and permissions)

**New Files:**
- `src/commands/role.ts`
- `src/commands/__tests__/role.test.ts`

**Commands:**
```typescript
export function register(): ICommandsMap {
  return {
    list: {
      description: 'List all users and their roles (ADMIN+)',
      execute: async (value, message) => { /* ... */ },
    },
    promote: {
      description: 'Promote user to role (!role promote +1234567890 OPERATOR)',
      execute: async (value, message) => { /* ... */ },
    },
    demote: {
      description: 'Demote user to role (!role demote +1234567890 USER)',
      execute: async (value, message) => { /* ... */ },
    },
    info: {
      description: 'Show user role and permissions',
      execute: async (value, message) => { /* ... */ },
    },
  };
}
```

**Testing:**
- [ ] Test role promotion/demotion with different roles
- [ ] Test permission checks (OWNER can promote to ADMIN, ADMIN cannot)
- [ ] Test role info display
- [ ] Test user-friendly error messages

---

### Phase 4: Audit Log Cleanup & Retention (Day 4)

#### Task 4.1: Create Audit Log Cleanup Scheduler
**Estimated Time:** 1.5 hours

- [ ] Create `src/db/audit-cleanup-scheduler.ts`
- [ ] Implement daily cleanup job (delete expired audit logs)
- [ ] Add configuration for retention period (AUDIT_LOG_RETENTION_DAYS)
- [ ] Integrate with app startup (src/index.ts)

**New Files:**
- `src/db/audit-cleanup-scheduler.ts`
- `src/db/__tests__/audit-cleanup-scheduler.test.ts`

**Cleanup Scheduler:**
```typescript
import { AuditLogRepository } from './repositories/auditLog.repository';

export async function startAuditLogCleanupScheduler() {
  const retentionDays = parseInt(
    process.env.AUDIT_LOG_RETENTION_DAYS || '90'
  );

  // Run immediately on startup
  await cleanupExpiredAuditLogs(retentionDays);

  // Then run daily
  setInterval(
    () => cleanupExpiredAuditLogs(retentionDays),
    24 * 60 * 60 * 1000 // 24 hours
  );
}

async function cleanupExpiredAuditLogs(retentionDays: number) {
  const deletedCount = await AuditLogRepository.deleteExpired(retentionDays);
  logger.info(
    { deletedCount, retentionDays },
    'Audit log cleanup completed'
  );
}
```

**Files to Modify:**
- `src/index.ts` (start cleanup scheduler)
- `.env-example` (add AUDIT_LOG_RETENTION_DAYS)

**Testing:**
- [ ] Test cleanup deletes old audit logs
- [ ] Test retention period configuration
- [ ] Test scheduler runs on startup

---

### Phase 5: Testing (Days 4-5)

#### Task 5.1: Write Comprehensive Tests
**Estimated Time:** 4 hours

- [ ] Test all 4 roles (OWNER, ADMIN, OPERATOR, USER)
- [ ] Test permission system (all permissions for all roles)
- [ ] Test authorization middleware
- [ ] Test audit log creation for all actions
- [ ] Test audit log queries and filtering
- [ ] Test audit log export functionality
- [ ] Test audit log cleanup/retention
- [ ] Test role promotion/demotion logic
- [ ] Test role hierarchy enforcement
- [ ] Integration tests for full RBAC flow

**Test Files to Create/Update:**
- `src/lib/__tests__/permissions.test.ts` (30+ tests)
- `src/middleware/__tests__/authorization.test.ts` (25+ tests)
- `src/db/repositories/__tests__/auditLog.repository.test.ts` (35+ tests)
- `src/services/__tests__/auditLogger.test.ts` (30+ tests)
- `src/commands/__tests__/audit.test.ts` (20+ tests)
- `src/commands/__tests__/role.test.ts` (20+ tests)
- `src/db/__tests__/audit-cleanup-scheduler.test.ts` (10+ tests)

**Test Coverage Goals:**
- Existing: 283 tests passing
- New: ~170+ tests for RBAC and audit logging
- **Target:** 450+ total tests, 100% pass rate

---

#### Task 5.2: Integration Testing
**Estimated Time:** 2 hours

- [ ] Test complete RBAC flow (user promotion → permission check → action → audit log)
- [ ] Test permission denial flow (attempt unauthorized action → audit log created)
- [ ] Test role hierarchy (ADMIN cannot promote to ADMIN, OWNER can)
- [ ] Test audit log viewing with different roles
- [ ] Test audit log export (OWNER only)
- [ ] Test cleanup scheduler

**Integration Test Scenarios:**
1. OWNER promotes user to ADMIN → audit log created
2. ADMIN attempts to view audit logs → allowed, action logged
3. OPERATOR attempts to view audit logs → denied, denial logged
4. USER attempts config change → denied, denial logged
5. Rate limit violation → audit log created
6. Moderation flag → audit log created
7. Audit logs older than retention period → deleted by scheduler

---

### Phase 6: Documentation (Day 5)

#### Task 6.1: Update Documentation
**Estimated Time:** 2.5 hours

- [ ] Update CLAUDE.md with RBAC and audit logging features
- [ ] Update MVP_PLAN.md to mark Week 4 as completed
- [ ] Update .env-example with all new environment variables
- [ ] Create RBAC.md (detailed RBAC guide)
- [ ] Create AUDIT_LOGGING.md (audit logging guide)
- [ ] Update PROGRESS.md with Week 4 completion
- [ ] Update ISSUES.md if any new issues discovered

**New Documentation Files:**
- `docs/RBAC.md` (role definitions, permission matrix, usage examples)
- `docs/AUDIT_LOGGING.md` (audit log schema, querying, export, retention)
- `docs/WEEK4_SUMMARY.md` (Week 4 completion summary)

**Files to Update:**
- `CLAUDE.md` (add RBAC and audit logging sections)
- `MVP_PLAN.md` (mark Week 4 as completed)
- `.env-example` (add all new env vars)
- `PROGRESS.md` (Week 4 completion)
- `ISSUES.md` (log any new issues)

---

## Environment Variables

### New Environment Variables for Week 4

```bash
# ============================================== #
#        RBAC: Role-Based Access Control         #
# ============================================== #
# Owner phone numbers (full system access)
# Format: +1234567890,+0987654321 (comma-separated, with country code)
OWNER_PHONE_NUMBERS=

# Admin phone numbers (team leads, can manage operators/users)
ADMIN_PHONE_NUMBERS=

# Operator phone numbers (customer service agents, limited access)
OPERATOR_PHONE_NUMBERS=

# Whitelisted phone numbers (users who can chat with bot)
WHITELISTED_PHONE_NUMBERS=

# ============================================== #
#             Audit Logging                      #
# ============================================== #
# Enable audit logging (recommended for production)
AUDIT_LOG_ENABLED=true

# Audit log retention period in days (default: 90 days)
# Logs older than this will be automatically deleted
AUDIT_LOG_RETENTION_DAYS=90

# Audit log cleanup schedule (cron format, default: daily at 2 AM)
AUDIT_LOG_CLEANUP_SCHEDULE=0 2 * * *
```

---

## Testing Strategy

### Unit Tests
- Test each repository method independently
- Test permission system in isolation
- Test authorization middleware with mocks
- Test audit logger service

### Integration Tests
- Test complete RBAC flow (user → permission → action → audit)
- Test role hierarchy enforcement
- Test audit log cleanup scheduler
- Test command access control

### Test Coverage Goals
- **Baseline:** 283 tests passing (Week 3)
- **New Tests:** ~170 tests for RBAC and audit logging
- **Total:** 450+ tests
- **Pass Rate:** 100%
- **Coverage:** >85% lines

---

## Success Criteria

### Week 4 is complete when:

**RBAC:**
- ✅ 4 roles implemented (OWNER, ADMIN, OPERATOR, USER)
- ✅ Permission system enforced throughout app
- ✅ Authorization middleware integrated
- ✅ All commands check permissions
- ✅ Role management commands working
- ✅ User-friendly permission denied messages

**Audit Logging:**
- ✅ Audit log database model created
- ✅ AuditLogRepository fully functional
- ✅ Audit logging integrated throughout app
- ✅ Audit log viewing commands working
- ✅ Audit log export working (OWNER only)
- ✅ Audit log retention policy active

**Testing:**
- ✅ All 450+ tests passing (100%)
- ✅ Integration tests for RBAC flow
- ✅ No regressions in existing features

**Documentation:**
- ✅ RBAC guide created
- ✅ Audit logging guide created
- ✅ All env variables documented
- ✅ MVP plan updated
- ✅ Progress tracker updated

---

## Risk Mitigation

### Potential Issues

1. **Schema changes breaking existing data**
   - Mitigation: Test migration on copy of database first
   - Rollback plan: Prisma migration rollback

2. **Performance impact of audit logging**
   - Mitigation: Async audit log writes (don't block main flow)
   - Use indexes on frequently queried columns
   - Monitor audit log table size

3. **Complex permission logic causing bugs**
   - Mitigation: Comprehensive tests for all permission combinations
   - Permission matrix documentation
   - Code reviews for permission checks

4. **Audit log storage growth**
   - Mitigation: Retention policy (90 days default)
   - Cleanup scheduler running daily
   - Monitor database size

---

## Timeline Summary

| Phase | Days | Tasks | Estimated Hours |
|-------|------|-------|----------------|
| Phase 1: RBAC Expansion | 1-2 | 5 tasks | ~8 hours |
| Phase 2: Audit Logging | 2-3 | 4 tasks | ~8.5 hours |
| Phase 3: Commands & UI | 3 | 3 tasks | ~6.5 hours |
| Phase 4: Cleanup & Retention | 4 | 1 task | ~1.5 hours |
| Phase 5: Testing | 4-5 | 2 tasks | ~6 hours |
| Phase 6: Documentation | 5 | 1 task | ~2.5 hours |
| **Total** | **5 days** | **16 tasks** | **~33 hours** |

---

## Next Steps

1. ✅ Review this implementation plan
2. ⏳ Start Phase 1: RBAC Expansion (Task 1.1)
3. ⏳ Create development branches if needed
4. ⏳ Execute tasks incrementally with tests

---

**Last Updated:** 2025-11-20
**Status:** 🚧 IN PROGRESS
**Current Phase:** Phase 1 - RBAC Expansion
