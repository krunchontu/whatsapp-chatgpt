# Phase 3A: Audit Command Tests - Detailed Breakdown

**Date:** 2025-11-21
**Status:** 📋 PLANNING
**Target:** 20 tests for !audit commands
**Estimated Time:** 1-1.5 hours

---

## Overview

Phase 3A tests the **Audit Commands Module** (`src/commands/audit.ts`) which provides admin commands for viewing and exporting audit logs via WhatsApp.

**Commands to Test:**
1. `!config audit list [days]` - View recent audit logs (ADMIN+)
2. `!config audit user <phoneNumber>` - View logs for specific user (ADMIN+)
3. `!config audit category <category>` - Filter by category (ADMIN+)
4. `!config audit export [days]` - Export logs as JSON (OWNER only)

---

## Test File Structure

**File:** `src/commands/__tests__/audit.test.ts`

**Mocks Needed:**
- `UserRepository` (permission checks)
- `AuditLogRepository` (data queries)
- `AuditLogger` (logging command execution)
- `whatsapp-web.js` Message object
- Logger (createChildLogger)

**Test Fixtures:**
- Mock OWNER user
- Mock ADMIN user
- Mock OPERATOR user
- Mock USER (no permissions)
- Mock audit log entries
- Mock WhatsApp Message objects

---

## Detailed Test Cases

### 1. !audit list Command (6 tests)

**Test:** `should list recent audit logs with default 7 days (ADMIN)`
- Setup: ADMIN user, 5 mock audit logs from last 7 days
- Expectation:
  - Permission check passes
  - Query with correct date range (7 days)
  - Formatted response with log entries
  - logAuditLogViewed() called

**Test:** `should list audit logs with custom day count (OWNER)`
- Setup: OWNER user, request for 30 days
- Input: value = "30"
- Expectation:
  - Query with 30-day date range
  - Response includes "30 days"

**Test:** `should deny permission for OPERATOR`
- Setup: OPERATOR user
- Expectation:
  - Permission denied message
  - logPermissionDenied() called with correct action
  - No audit log query executed

**Test:** `should deny permission for USER`
- Setup: USER role
- Expectation: Same as OPERATOR test

**Test:** `should handle invalid day count`
- Setup: ADMIN user
- Input: value = "500" (exceeds 365), "abc" (non-numeric), "0" (below 1)
- Expectation:
  - Error message about valid range (1-365)
  - No query executed

**Test:** `should handle no audit logs found`
- Setup: ADMIN user, empty audit log result
- Expectation:
  - Message: "No audit logs found for the last X days"
  - Query still executed

---

### 2. !audit user Command (5 tests)

**Test:** `should show audit logs for specific user (ADMIN)`
- Setup: ADMIN user, target phone "+1234567890", 3 mock logs
- Input: value = "+1234567890"
- Expectation:
  - findByPhoneNumber() called with correct phone
  - Formatted response with user's logs
  - logAuditLogViewed() called with phoneNumber filter

**Test:** `should deny permission for non-ADMIN`
- Setup: OPERATOR user
- Expectation:
  - Permission denied
  - logPermissionDenied() called

**Test:** `should handle missing phone number parameter`
- Setup: ADMIN user
- Input: value = "" or undefined
- Expectation:
  - Usage message with command syntax
  - No query executed

**Test:** `should handle user with no audit logs`
- Setup: ADMIN user, valid phone, empty result
- Expectation:
  - Message: "No audit logs found for [phone]"

**Test:** `should handle repository error`
- Setup: ADMIN user, AuditLogRepository.findByPhoneNumber throws error
- Expectation:
  - Error message to user
  - Logger.error() called

---

### 3. !audit category Command (5 tests)

**Test:** `should filter by AUTH category (ADMIN)`
- Setup: ADMIN user, 2 AUTH category logs
- Input: value = "AUTH"
- Expectation:
  - findByCategory('AUTH') called
  - Response shows "AUTH Category"
  - logAuditLogViewed() called with category filter

**Test:** `should filter by SECURITY category (OWNER)`
- Setup: OWNER user
- Input: value = "SECURITY"
- Expectation: Similar to AUTH test

**Test:** `should deny permission for non-ADMIN`
- Setup: USER role
- Expectation: Permission denied

**Test:** `should handle invalid category`
- Setup: ADMIN user
- Input: value = "INVALID_CATEGORY"
- Expectation:
  - Error message with valid categories
  - No query executed

**Test:** `should handle missing category parameter`
- Setup: ADMIN user
- Input: value = "" or undefined
- Expectation:
  - Usage message with valid categories

---

### 4. !audit export Command (4 tests)

**Test:** `should export audit logs as JSON (OWNER)`
- Setup: OWNER user, 100 logs, default 30 days
- Expectation:
  - exportToJSON() called with 30-day range
  - logAuditLogExported() called with format="JSON", recordCount=100
  - Response shows total record count
  - Preview of first 5 records shown

**Test:** `should export with custom day range (OWNER)`
- Setup: OWNER user
- Input: value = "90"
- Expectation:
  - exportToJSON() called with 90-day range
  - Response mentions "90 days"

**Test:** `should deny permission for ADMIN`
- Setup: ADMIN user (not OWNER)
- Expectation:
  - Permission denied message (OWNER only)
  - logPermissionDenied() called with action='EXPORT_AUDIT_LOGS'
  - No export executed

**Test:** `should handle invalid day count`
- Setup: OWNER user
- Input: value = "400", "-5", "abc"
- Expectation:
  - Error message about valid range
  - No export executed

---

## Mock Setup Example

```typescript
// Mock Message object factory
function createMockMessage(from: string, override?: Partial<Message>): Message {
  return {
    from,
    reply: jest.fn(),
    ...override
  } as any;
}

// Mock audit log factory
function createMockAuditLog(override?: Partial<AuditLog>): AuditLog {
  return {
    id: 'log-123',
    userId: 'user-456',
    phoneNumber: '+1234567890',
    userRole: 'ADMIN',
    action: AuditAction.CONFIG_UPDATE,
    category: AuditCategory.CONFIG,
    description: 'Test audit log',
    metadata: '{}',
    createdAt: new Date(),
    ...override
  };
}
```

---

## Success Criteria

✅ **All 20 tests passing**
✅ **Permission checks validated for all commands**
✅ **Input validation tested (missing params, invalid values)**
✅ **Success paths tested with proper mocking**
✅ **Error paths tested (repository errors, invalid input)**
✅ **Audit logging of command execution verified**
✅ **Message formatting validated**

---

## Dependencies

**Code Dependencies:**
- `src/commands/audit.ts` (implementation)
- `src/db/repositories/auditLog.repository.ts` (data layer)
- `src/db/repositories/user.repository.ts` (permissions)
- `src/services/auditLogger.ts` (logging)

**Test Dependencies:**
- `jest` (test runner)
- `@types/jest` (TypeScript types)
- Mock factories from Phase 1 & 2 tests

---

## Risk Assessment

**🟢 Low Risk:**
- Clear command structure with predictable patterns
- Similar to existing command tests (if any)
- Well-defined permission model

**🟡 Medium Risk:**
- WhatsApp Message mocking may require careful setup
- Date range calculations need proper mocking

**Mitigation:**
- Use test fixtures from existing tests
- Mock Date.now() for consistent date testing
- Follow patterns from Phase 1 & 2

---

## Next Steps After Phase 3A

After completing Phase 3A:
1. Update WEEK4_TESTING_PLAN.md with Phase 3A completion
2. Commit Phase 3A implementation
3. Proceed to **Phase 3B: Role Command Tests (20 tests)**

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Prepared for:** Phase 3A Implementation
