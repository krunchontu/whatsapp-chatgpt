# Phase 3B: Role Command Tests - Detailed Breakdown

**Date:** 2025-11-21
**Status:** 📋 IN PROGRESS
**Target:** 20 tests for !role commands
**Estimated Time:** 1-1.5 hours

---

## Overview

Phase 3B tests the **Role Management Commands Module** (`src/commands/role.ts`) which provides admin commands for managing user roles and permissions via WhatsApp.

**Commands to Test:**
1. `!config role list` - List all users and their roles (ADMIN+)
2. `!config role info <phoneNumber>` - Show role and permissions for a user (ADMIN+)
3. `!config role promote <phoneNumber> <role>` - Promote user to role (OWNER for OWNER/ADMIN, ADMIN+ for OPERATOR/USER)
4. `!config role demote <phoneNumber> <role>` - Demote user to role (OWNER for OWNER/ADMIN, ADMIN+ for OPERATOR/USER)

---

## Test File Structure

**File:** `src/commands/__tests__/role.test.ts`

**Mocks Needed:**
- `UserRepository` (user management, permission checks)
- `AuditLogger` (logging role changes and permission denials)
- `whatsapp-web.js` Message object
- Logger (createChildLogger)

**Test Fixtures:**
- Mock OWNER user
- Mock ADMIN user
- Mock OPERATOR user
- Mock USER (regular user)
- Mock WhatsApp Message objects
- Mock user lists (for list command)

---

## Detailed Test Cases

### 1. !role list Command (4 tests)

**Test:** `should list all users grouped by role (ADMIN)`
- Setup: ADMIN user, mixed user list (2 owners, 3 admins, 5 operators, 20 users)
- Expectation:
  - Permission check passes
  - findAllOwners(), findAllAdmins(), findAllOperators(), findAll() called
  - Formatted response with role groups
  - Shows first 10 users for USER role (truncated list)
  - Shows total user count

**Test:** `should list users as OWNER`
- Setup: OWNER user, user list
- Expectation:
  - Permission check passes
  - All users listed by role
  - Total count displayed

**Test:** `should deny permission for OPERATOR`
- Setup: OPERATOR user
- Expectation:
  - Permission denied message
  - logPermissionDenied() called with action='LIST_USERS'
  - No repository queries executed

**Test:** `should deny permission for USER`
- Setup: USER role
- Expectation: Same as OPERATOR test

---

### 2. !role info Command (5 tests)

**Test:** `should show OWNER role information (ADMIN)`
- Setup: ADMIN user, target user is OWNER
- Input: value = "+1234567890" (OWNER's phone)
- Expectation:
  - findByPhoneNumber() called for both users
  - Response shows:
    - Phone number
    - Role: OWNER
    - Whitelisted status
    - Created date
    - Full permissions list (manage all roles, export logs, etc.)

**Test:** `should show ADMIN role information (OWNER)`
- Setup: OWNER user, target user is ADMIN
- Input: value = "+1234567890" (ADMIN's phone)
- Expectation:
  - Response shows ADMIN permissions (manage OPERATOR/USER, view logs, configure)

**Test:** `should show OPERATOR role information (ADMIN)`
- Setup: ADMIN user, target user is OPERATOR
- Expectation:
  - Response shows OPERATOR permissions (view stats, limited config, handle customers)

**Test:** `should deny permission for non-ADMIN`
- Setup: OPERATOR user
- Expectation:
  - Permission denied
  - logPermissionDenied() called with action='VIEW_USER_INFO'

**Test:** `should handle missing phone number parameter`
- Setup: ADMIN user
- Input: value = "" or undefined
- Expectation:
  - Usage message with command syntax
  - No repository query executed

---

### 3. !role promote Command (6 tests)

**Test:** `should promote USER to OPERATOR (ADMIN)`
- Setup: ADMIN user, target user is USER
- Input: value = "+1234567890 OPERATOR"
- Expectation:
  - Permission checks pass (ADMIN can promote to OPERATOR)
  - promoteToOperator() called
  - Success message with old role → new role
  - Shows who made the change

**Test:** `should promote USER to ADMIN (OWNER only)`
- Setup: OWNER user, target user is USER
- Input: value = "+1234567890 ADMIN"
- Expectation:
  - Permission check passes (only OWNER can promote to ADMIN)
  - promoteToAdmin() called
  - Success message displayed

**Test:** `should deny ADMIN promoting to ADMIN`
- Setup: ADMIN user (not OWNER)
- Input: value = "+1234567890 ADMIN"
- Expectation:
  - Permission denied message
  - logPermissionDenied() called with action='PROMOTE_TO_ADMIN'
  - No promotion executed

**Test:** `should deny ADMIN promoting to OWNER`
- Setup: ADMIN user (not OWNER)
- Input: value = "+1234567890 OWNER"
- Expectation:
  - Permission denied message
  - logPermissionDenied() called with action='PROMOTE_TO_OWNER'

**Test:** `should create user if doesn't exist`
- Setup: ADMIN user, target phone doesn't exist
- Input: value = "+9999999999 OPERATOR"
- Expectation:
  - UserRepository.create() called with default USER role
  - Then promoteToOperator() called
  - Success message displayed

**Test:** `should handle invalid role`
- Setup: ADMIN user
- Input: value = "+1234567890 INVALID_ROLE"
- Expectation:
  - Error message with valid roles list
  - No promotion executed

---

### 4. !role demote Command (5 tests)

**Test:** `should demote OPERATOR to USER (ADMIN)`
- Setup: ADMIN user, target user is OPERATOR
- Input: value = "+1234567890 USER"
- Expectation:
  - Permission check passes
  - demoteToUser() called
  - Success message with old role → new role

**Test:** `should demote ADMIN to OPERATOR (OWNER only)`
- Setup: OWNER user, target user is ADMIN
- Input: value = "+1234567890 OPERATOR"
- Expectation:
  - Permission check passes (only OWNER can demote ADMIN)
  - promoteToOperator() called (note: reuses promote method)
  - Success message displayed

**Test:** `should deny ADMIN demoting ADMIN`
- Setup: ADMIN user (not OWNER), target is ADMIN
- Input: value = "+1234567890 USER"
- Expectation:
  - Permission denied message
  - logPermissionDenied() called with action='DEMOTE_ADMIN'
  - No demotion executed

**Test:** `should prevent self-demotion`
- Setup: ADMIN user tries to demote themselves
- Input: value = "<admin's own phone> USER"
- Expectation:
  - Error message: "You cannot demote yourself"
  - No demotion executed

**Test:** `should handle user not found`
- Setup: ADMIN user, target phone doesn't exist
- Input: value = "+9999999999 USER"
- Expectation:
  - Error message: "User not found: +9999999999"
  - No demotion attempted

---

## Mock Setup Example

```typescript
// Mock Message object factory
function createMockMessage(from: string, override?: Partial<Message>): Message {
  return {
    from,
    reply: jest.fn().mockResolvedValue(undefined),
    ...override
  } as any;
}

// Mock User factory
function createMockUser(override?: Partial<User>): User {
  return {
    id: 'user-123',
    phoneNumber: '+1234567890',
    role: UserRole.USER,
    isWhitelisted: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...override
  } as User;
}
```

---

## Success Criteria

✅ **All 20 tests passing**
✅ **Permission checks validated for all commands**
✅ **Role hierarchy enforced (OWNER > ADMIN > OPERATOR > USER)**
✅ **Input validation tested (missing params, invalid roles)**
✅ **Success paths tested with proper mocking**
✅ **Error paths tested (user not found, permission denied)**
✅ **Audit logging verified for role changes and denials**
✅ **Self-protection tested (can't demote yourself)**

---

## Dependencies

**Code Dependencies:**
- `src/commands/role.ts` (implementation)
- `src/db/repositories/user.repository.ts` (user management)
- `src/services/auditLogger.ts` (logging)

**Test Dependencies:**
- `jest` (test runner)
- `@types/jest` (TypeScript types)
- Mock patterns from Phase 3A

---

## Risk Assessment

**🟢 Low Risk:**
- Clear command structure similar to audit commands
- Well-defined permission model
- Straightforward test cases

**🟡 Medium Risk:**
- Role promotion/demotion logic has multiple permission checks
- Need to test all role combinations (4 roles × 4 target roles)

**Mitigation:**
- Use test matrix to ensure all combinations covered
- Follow patterns from audit.test.ts
- Test permission checks independently

---

## Test Matrix

| Performing User | Target Role | Action | Expected Result |
|-----------------|-------------|--------|-----------------|
| OWNER | any | promote | ✅ Success |
| OWNER | any | demote | ✅ Success |
| ADMIN | OWNER | promote | ❌ Denied |
| ADMIN | ADMIN | promote | ❌ Denied |
| ADMIN | OPERATOR | promote | ✅ Success |
| ADMIN | USER | promote | ✅ Success |
| ADMIN | ADMIN | demote | ❌ Denied |
| ADMIN | OPERATOR | demote | ✅ Success |
| OPERATOR | any | promote | ❌ Denied |
| OPERATOR | any | demote | ❌ Denied |
| USER | any | promote | ❌ Denied |
| USER | any | demote | ❌ Denied |

---

## Next Steps After Phase 3B

After completing Phase 3B:
1. Update WEEK4_TESTING_PLAN.md with Phase 3B completion
2. Commit Phase 3B implementation
3. Proceed to **Phase 4: Integration Tests (20 tests)**

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Prepared for:** Phase 3B Implementation
