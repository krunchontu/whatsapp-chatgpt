# Phase 4: Integration Tests - Detailed Breakdown

**Date:** 2025-11-21
**Status:** 🚧 IN PROGRESS
**Target:** 20 integration tests for full audit logging system
**Estimated Time:** 2-3 hours

---

## Overview

Phase 4 tests the **complete audit logging system** as an integrated whole, simulating real-world usage patterns and multi-user interactions. These tests verify that all components (repositories, services, commands, middleware) work together correctly.

**Goals:**
1. Validate end-to-end audit flows from user action → log creation → retrieval
2. Verify RBAC integration and permission enforcement across the system
3. Test multi-user scenarios and concurrent access patterns
4. Ensure audit logs don't interfere with core functionality

---

## Test File Structure

**File:** `src/__tests__/audit-integration.test.ts`

**Setup Requirements:**
- Real Prisma database (test.db) with all tables
- Mock WhatsApp Message objects
- Mock OpenAI API responses
- Multiple test users (OWNER, ADMIN, OPERATOR, USER)
- Isolated test environment (clean database before/after)

**Test Fixtures:**
- Complete user hierarchy (1 owner, 2 admins, 3 operators, 5 users)
- Mock audit log entries spanning all categories
- Mock WhatsApp messages from different users
- Mock config changes and admin actions

---

## Phase 4A: Full Audit Flow Tests (8 tests)

These tests verify complete audit trails from action to retrieval.

### Test 1: User Action → Audit Log → Admin View
**Scenario:** USER sends message → rate limit triggered → logged → ADMIN views security logs

```typescript
it('should create audit log when user triggers rate limit and admin can view it', async () => {
  // Given: USER exists and has used 9 messages
  const user = await UserRepository.create({
    phoneNumber: '+1111111111',
    role: UserRole.USER,
  });

  // When: Rate limiter logs violation
  await AuditLogger.logRateLimitViolation({
    user,
    limitType: 'per-user',
    limit: 10,
    current: 11,
  });

  // Then: Audit log exists
  const logs = await AuditLogRepository.query({
    userId: user.id,
    category: AuditCategory.SECURITY,
  });

  expect(logs).toHaveLength(1);
  expect(logs[0].action).toBe(AuditAction.RATE_LIMIT_EXCEEDED);

  // And: ADMIN can retrieve it
  const admin = await createAdminUser();
  const message = createMockMessage(admin.phoneNumber);

  await auditCommands.list.handler(message, { command: 'list', value: '1' });

  expect(message.reply).toHaveBeenCalledWith(
    expect.stringContaining('RATE_LIMIT_EXCEEDED')
  );
});
```

**Validation:**
- ✅ AuditLogger creates log entry
- ✅ Log stored in database with correct fields
- ✅ ADMIN permission check passes
- ✅ Log retrieved and displayed correctly

---

### Test 2: Role Change → Audit Log → Visible in AUTH Logs
**Scenario:** OWNER promotes USER to OPERATOR → logged → visible in AUTH category

```typescript
it('should log role change and make it visible in AUTH category', async () => {
  // Given: OWNER and USER exist
  const owner = await createOwnerUser();
  const user = await UserRepository.create({
    phoneNumber: '+2222222222',
    role: UserRole.USER,
  });

  // When: OWNER promotes user to OPERATOR
  const message = createMockMessage(owner.phoneNumber);
  await roleCommands.promote.handler(message, {
    command: 'promote',
    value: `${user.phoneNumber} OPERATOR`
  });

  // Then: Role change logged
  const logs = await AuditLogRepository.query({
    category: AuditCategory.AUTH,
    action: AuditAction.ROLE_CHANGE,
  });

  expect(logs).toHaveLength(1);
  expect(logs[0].phoneNumber).toBe(user.phoneNumber);
  expect(logs[0].metadata).toContain('USER');
  expect(logs[0].metadata).toContain('OPERATOR');

  // And: ADMIN can view AUTH logs
  const admin = await createAdminUser();
  const viewMessage = createMockMessage(admin.phoneNumber);

  await auditCommands.category.handler(viewMessage, {
    command: 'category',
    value: 'AUTH'
  });

  expect(viewMessage.reply).toHaveBeenCalledWith(
    expect.stringContaining('ROLE_CHANGE')
  );
});
```

**Validation:**
- ✅ Role promotion succeeds
- ✅ AuditLogger.logRoleChange() called automatically
- ✅ Log has correct metadata (oldRole → newRole)
- ✅ Log retrievable by category filter

---

### Test 3: Config Change → Audit Log → Retrievable by Filter
**Scenario:** ADMIN changes model config → logged → retrievable by CONFIG category

```typescript
it('should log config changes and make them retrievable by category', async () => {
  // Given: ADMIN exists
  const admin = await createAdminUser();

  // When: ADMIN changes GPT model
  const message = createMockMessage(admin.phoneNumber);
  // Simulate config change (would normally go through ai-config handler)
  await AuditLogger.logConfigChange({
    performedBy: admin,
    setting: 'model',
    oldValue: 'gpt-3.5-turbo',
    newValue: 'gpt-4o',
  });

  // Then: Config change logged
  const logs = await AuditLogRepository.query({
    category: AuditCategory.CONFIG,
  });

  expect(logs.length).toBeGreaterThan(0);
  const configLog = logs.find(log =>
    log.action === AuditAction.CONFIG_UPDATE &&
    log.metadata?.includes('model')
  );

  expect(configLog).toBeDefined();
  expect(configLog?.phoneNumber).toBe(admin.phoneNumber);

  // And: OWNER can view config logs
  const owner = await createOwnerUser();
  const viewMessage = createMockMessage(owner.phoneNumber);

  await auditCommands.category.handler(viewMessage, {
    command: 'category',
    value: 'CONFIG'
  });

  expect(viewMessage.reply).toHaveBeenCalledWith(
    expect.stringContaining('CONFIG_UPDATE')
  );
});
```

---

### Test 4: Permission Denied → Audit Log → Visible in AUTH Logs
**Scenario:** OPERATOR tries to export audit logs → denied → logged

```typescript
it('should log permission denials and make them auditable', async () => {
  // Given: OPERATOR exists (not authorized for export)
  const operator = await createOperatorUser();

  // When: OPERATOR tries to export audit logs
  const message = createMockMessage(operator.phoneNumber);
  await auditCommands.export.handler(message, {
    command: 'export',
    value: '30'
  });

  // Then: Permission denied
  expect(message.reply).toHaveBeenCalledWith(
    expect.stringContaining('requires OWNER role')
  );

  // And: Denial logged
  const logs = await AuditLogRepository.query({
    phoneNumber: operator.phoneNumber,
    category: AuditCategory.AUTH,
  });

  const denialLog = logs.find(log =>
    log.action === AuditAction.PERMISSION_DENIED
  );

  expect(denialLog).toBeDefined();
  expect(denialLog?.metadata).toContain('EXPORT_AUDIT_LOGS');

  // And: ADMIN can see the denial in logs
  const admin = await createAdminUser();
  const adminMessage = createMockMessage(admin.phoneNumber);

  await auditCommands.user.handler(adminMessage, {
    command: 'user',
    value: operator.phoneNumber
  });

  expect(adminMessage.reply).toHaveBeenCalledWith(
    expect.stringContaining('PERMISSION_DENIED')
  );
});
```

---

### Test 5: Moderation Flag → Audit Log → Security Category
**Scenario:** User sends inappropriate content → moderation flags → logged → ADMIN notified

```typescript
it('should log moderation flags in security category', async () => {
  // Given: USER exists
  const user = await createUserWithRole(UserRole.USER);

  // When: Moderation system flags content
  await AuditLogger.logModerationFlag({
    user,
    categories: { harassment: true, hate: true },
    messageLength: 150,
  });

  // Then: Security log created
  const logs = await AuditLogRepository.query({
    category: AuditCategory.SECURITY,
    action: AuditAction.MODERATION_FLAG,
  });

  expect(logs).toHaveLength(1);
  expect(logs[0].phoneNumber).toBe(user.phoneNumber);
  expect(logs[0].metadata).toContain('harassment');

  // And: ADMIN can view security logs
  const admin = await createAdminUser();
  const message = createMockMessage(admin.phoneNumber);

  await auditCommands.category.handler(message, {
    command: 'category',
    value: 'SECURITY'
  });

  expect(message.reply).toHaveBeenCalledWith(
    expect.stringContaining('MODERATION_FLAG')
  );
});
```

---

### Test 6: Circuit Breaker Event → Audit Log → SECURITY Logs
**Scenario:** OpenAI API fails 5 times → circuit breaker opens → logged

```typescript
it('should log circuit breaker events in security logs', async () => {
  // Given: Circuit breaker exists

  // When: Circuit breaker opens due to failures
  await AuditLogger.logCircuitBreakerOpen({
    service: 'OpenAI API',
    failureCount: 5,
    threshold: 5,
  });

  // Then: Security log created
  const logs = await AuditLogRepository.query({
    category: AuditCategory.SECURITY,
    action: AuditAction.CIRCUIT_BREAKER_OPEN,
  });

  expect(logs).toHaveLength(1);
  expect(logs[0].userId).toBeNull(); // System event
  expect(logs[0].metadata).toContain('OpenAI API');

  // When: Circuit breaker closes
  await AuditLogger.logCircuitBreakerClosed({
    service: 'OpenAI API',
  });

  // Then: Another security log created
  const closedLogs = await AuditLogRepository.query({
    category: AuditCategory.SECURITY,
    action: AuditAction.CIRCUIT_BREAKER_CLOSED,
  });

  expect(closedLogs).toHaveLength(1);
});
```

---

### Test 7: Audit Export → Logged → Audit of Audit Access
**Scenario:** OWNER exports audit logs → export action is itself logged

```typescript
it('should log audit export actions (audit of audit access)', async () => {
  // Given: OWNER exists and there are logs to export
  const owner = await createOwnerUser();
  await createSampleAuditLogs(10);

  // When: OWNER exports audit logs
  const message = createMockMessage(owner.phoneNumber);
  await auditCommands.export.handler(message, {
    command: 'export',
    value: '30'
  });

  // Then: Export succeeds
  expect(message.reply).toHaveBeenCalledWith(
    expect.stringContaining('exported')
  );

  // And: Export action is logged
  const logs = await AuditLogRepository.query({
    category: AuditCategory.ADMIN,
    action: AuditAction.AUDIT_LOG_EXPORTED,
  });

  const exportLog = logs.find(log => log.phoneNumber === owner.phoneNumber);

  expect(exportLog).toBeDefined();
  expect(exportLog?.metadata).toContain('JSON');
  expect(exportLog?.metadata).toContain('recordCount');
});
```

---

### Test 8: Conversation Reset → Audit Log → ADMIN Category
**Scenario:** USER resets conversation → logged → visible in admin logs

```typescript
it('should log conversation resets in admin category', async () => {
  // Given: USER with conversation history
  const user = await createUserWithRole(UserRole.USER);

  // When: USER resets conversation
  await AuditLogger.logConversationReset({
    user,
    messageCount: 15,
  });

  // Then: Admin log created
  const logs = await AuditLogRepository.query({
    category: AuditCategory.ADMIN,
    action: AuditAction.CONVERSATION_RESET,
  });

  expect(logs).toHaveLength(1);
  expect(logs[0].phoneNumber).toBe(user.phoneNumber);
  expect(logs[0].metadata).toContain('messageCount');
});
```

---

## Phase 4B: RBAC Integration Tests (6 tests)

These tests verify role-based access control throughout the audit system.

### Test 9: OWNER Can Do Everything
```typescript
it('should allow OWNER full access to all audit commands', async () => {
  const owner = await createOwnerUser();
  await createSampleAuditLogs(20);

  // Test: List logs
  const listMsg = createMockMessage(owner.phoneNumber);
  await auditCommands.list.handler(listMsg, { command: 'list', value: '7' });
  expect(listMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));

  // Test: View user logs
  const userMsg = createMockMessage(owner.phoneNumber);
  await auditCommands.user.handler(userMsg, { command: 'user', value: '+1234567890' });
  expect(userMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));

  // Test: Filter by category
  const catMsg = createMockMessage(owner.phoneNumber);
  await auditCommands.category.handler(catMsg, { command: 'category', value: 'AUTH' });
  expect(catMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));

  // Test: Export logs
  const exportMsg = createMockMessage(owner.phoneNumber);
  await auditCommands.export.handler(exportMsg, { command: 'export', value: '30' });
  expect(exportMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));

  // Test: Manage all roles
  const promoteMsg = createMockMessage(owner.phoneNumber);
  await roleCommands.promote.handler(promoteMsg, {
    command: 'promote',
    value: '+9999999999 ADMIN'
  });
  expect(promoteMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));
});
```

---

### Test 10: ADMIN Can View But Not Export
```typescript
it('should allow ADMIN to view logs but deny export', async () => {
  const admin = await createAdminUser();
  await createSampleAuditLogs(10);

  // Success: List logs
  const listMsg = createMockMessage(admin.phoneNumber);
  await auditCommands.list.handler(listMsg, { command: 'list', value: '7' });
  expect(listMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));

  // Success: View user logs
  const userMsg = createMockMessage(admin.phoneNumber);
  await auditCommands.user.handler(userMsg, { command: 'user', value: '+1234567890' });
  expect(userMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));

  // Failure: Export logs (OWNER only)
  const exportMsg = createMockMessage(admin.phoneNumber);
  await auditCommands.export.handler(exportMsg, { command: 'export', value: '30' });
  expect(exportMsg.reply).toHaveBeenCalledWith(
    expect.stringContaining('requires OWNER role')
  );

  // Verify denial was logged
  const denialLogs = await AuditLogRepository.query({
    phoneNumber: admin.phoneNumber,
    action: AuditAction.PERMISSION_DENIED,
  });

  expect(denialLogs.length).toBeGreaterThan(0);
});
```

---

### Test 11: OPERATOR Cannot Access Audit Logs
```typescript
it('should deny OPERATOR access to audit commands', async () => {
  const operator = await createOperatorUser();

  // All audit commands should be denied
  const commands = [
    { handler: auditCommands.list, params: { command: 'list', value: '7' } },
    { handler: auditCommands.user, params: { command: 'user', value: '+1234567890' } },
    { handler: auditCommands.category, params: { command: 'category', value: 'AUTH' } },
    { handler: auditCommands.export, params: { command: 'export', value: '30' } },
  ];

  for (const { handler, params } of commands) {
    const message = createMockMessage(operator.phoneNumber);
    await handler.handler(message, params);

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining('denied')
    );
  }

  // Verify all denials logged
  const denialLogs = await AuditLogRepository.query({
    phoneNumber: operator.phoneNumber,
    category: AuditCategory.AUTH,
  });

  expect(denialLogs.length).toBe(4); // One for each denied command
});
```

---

### Test 12: USER Cannot Access Audit Logs
```typescript
it('should deny USER access to all audit commands', async () => {
  const user = await createUserWithRole(UserRole.USER);

  const message = createMockMessage(user.phoneNumber);
  await auditCommands.list.handler(message, { command: 'list', value: '7' });

  expect(message.reply).toHaveBeenCalledWith(
    expect.stringContaining('requires ADMIN')
  );

  // Verify denial logged
  const logs = await AuditLogRepository.query({
    phoneNumber: user.phoneNumber,
    action: AuditAction.PERMISSION_DENIED,
  });

  expect(logs.length).toBeGreaterThan(0);
});
```

---

### Test 13: Permission Denial Creates Audit Log
```typescript
it('should create audit log for every permission denial', async () => {
  const operator = await createOperatorUser();
  const user = await createUserWithRole(UserRole.USER);

  // Operator tries to export (denied)
  const opMsg = createMockMessage(operator.phoneNumber);
  await auditCommands.export.handler(opMsg, { command: 'export', value: '30' });

  // User tries to list logs (denied)
  const userMsg = createMockMessage(user.phoneNumber);
  await auditCommands.list.handler(userMsg, { command: 'list', value: '7' });

  // Verify both denials logged
  const denialLogs = await AuditLogRepository.query({
    category: AuditCategory.AUTH,
    action: AuditAction.PERMISSION_DENIED,
  });

  expect(denialLogs.length).toBe(2);

  const opLog = denialLogs.find(log => log.phoneNumber === operator.phoneNumber);
  const userLog = denialLogs.find(log => log.phoneNumber === user.phoneNumber);

  expect(opLog).toBeDefined();
  expect(opLog?.metadata).toContain('EXPORT_AUDIT_LOGS');

  expect(userLog).toBeDefined();
  expect(userLog?.metadata).toContain('VIEW_AUDIT_LOGS');
});
```

---

### Test 14: Role Hierarchy Enforced
```typescript
it('should enforce role hierarchy in audit access', async () => {
  const users = {
    owner: await createOwnerUser(),
    admin: await createAdminUser(),
    operator: await createOperatorUser(),
    user: await createUserWithRole(UserRole.USER),
  };

  await createSampleAuditLogs(10);

  // Test access matrix
  const accessTests = [
    { user: users.owner, canView: true, canExport: true },
    { user: users.admin, canView: true, canExport: false },
    { user: users.operator, canView: false, canExport: false },
    { user: users.user, canView: false, canExport: false },
  ];

  for (const { user, canView, canExport } of accessTests) {
    // Test view
    const viewMsg = createMockMessage(user.phoneNumber);
    await auditCommands.list.handler(viewMsg, { command: 'list', value: '7' });

    if (canView) {
      expect(viewMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));
    } else {
      expect(viewMsg.reply).toHaveBeenCalledWith(expect.stringContaining('denied'));
    }

    // Test export
    const exportMsg = createMockMessage(user.phoneNumber);
    await auditCommands.export.handler(exportMsg, { command: 'export', value: '30' });

    if (canExport) {
      expect(exportMsg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));
    } else {
      expect(exportMsg.reply).toHaveBeenCalledWith(expect.stringContaining('denied'));
    }
  }
});
```

---

## Phase 4C: Multi-User Scenarios (6 tests)

These tests simulate concurrent and multi-user interactions.

### Test 15: Multiple Admins Viewing Logs Simultaneously
```typescript
it('should handle multiple admins viewing logs concurrently', async () => {
  const admin1 = await createAdminUser('+1111111111');
  const admin2 = await createAdminUser('+2222222222');
  const admin3 = await createAdminUser('+3333333333');

  await createSampleAuditLogs(50);

  // Simulate concurrent access
  const messages = [
    createMockMessage(admin1.phoneNumber),
    createMockMessage(admin2.phoneNumber),
    createMockMessage(admin3.phoneNumber),
  ];

  await Promise.all(
    messages.map(msg =>
      auditCommands.list.handler(msg, { command: 'list', value: '7' })
    )
  );

  // All should succeed
  messages.forEach(msg => {
    expect(msg.reply).not.toHaveBeenCalledWith(expect.stringContaining('denied'));
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('audit logs'));
  });

  // Verify all access logged
  const accessLogs = await AuditLogRepository.query({
    category: AuditCategory.ADMIN,
    action: AuditAction.AUDIT_LOG_VIEWED,
  });

  expect(accessLogs.length).toBe(3);
});
```

---

### Test 16: Multiple Users Triggering Audit Events
```typescript
it('should handle multiple users triggering events simultaneously', async () => {
  const users = await Promise.all([
    createUserWithRole(UserRole.USER, '+1111111111'),
    createUserWithRole(UserRole.USER, '+2222222222'),
    createUserWithRole(UserRole.USER, '+3333333333'),
  ]);

  // Simulate concurrent rate limit violations
  await Promise.all(
    users.map(user =>
      AuditLogger.logRateLimitViolation({
        user,
        limitType: 'per-user',
        limit: 10,
        current: 11,
      })
    )
  );

  // Verify all events logged
  const logs = await AuditLogRepository.query({
    category: AuditCategory.SECURITY,
    action: AuditAction.RATE_LIMIT_EXCEEDED,
  });

  expect(logs.length).toBe(3);

  // Verify each user has their own log
  users.forEach(user => {
    const userLog = logs.find(log => log.userId === user.id);
    expect(userLog).toBeDefined();
  });
});
```

---

### Test 17: Concurrent Audit Log Creation
```typescript
it('should handle concurrent audit log creation without conflicts', async () => {
  const admin = await createAdminUser();

  // Create 20 logs concurrently
  const logPromises = Array.from({ length: 20 }, (_, i) =>
    AuditLogger.logConfigChange({
      performedBy: admin,
      setting: `setting_${i}`,
      oldValue: 'old',
      newValue: 'new',
    })
  );

  await Promise.all(logPromises);

  // Verify all logs created
  const logs = await AuditLogRepository.query({
    phoneNumber: admin.phoneNumber,
    category: AuditCategory.CONFIG,
  });

  expect(logs.length).toBe(20);

  // Verify no duplicate IDs
  const ids = logs.map(log => log.id);
  const uniqueIds = new Set(ids);
  expect(uniqueIds.size).toBe(20);
});
```

---

### Test 18: Owner Exports While Admin Views
```typescript
it('should allow owner export while admin views logs simultaneously', async () => {
  const owner = await createOwnerUser();
  const admin = await createAdminUser();

  await createSampleAuditLogs(100);

  // Simulate concurrent operations
  const ownerMsg = createMockMessage(owner.phoneNumber);
  const adminMsg = createMockMessage(admin.phoneNumber);

  await Promise.all([
    auditCommands.export.handler(ownerMsg, { command: 'export', value: '30' }),
    auditCommands.list.handler(adminMsg, { command: 'list', value: '7' }),
  ]);

  // Both should succeed
  expect(ownerMsg.reply).toHaveBeenCalledWith(expect.stringContaining('exported'));
  expect(adminMsg.reply).toHaveBeenCalledWith(expect.stringContaining('audit logs'));

  // Verify both actions logged
  const actionLogs = await AuditLogRepository.query({
    category: AuditCategory.ADMIN,
  });

  const exportLog = actionLogs.find(
    log => log.action === AuditAction.AUDIT_LOG_EXPORTED
  );
  const viewLog = actionLogs.find(
    log => log.action === AuditAction.AUDIT_LOG_VIEWED
  );

  expect(exportLog).toBeDefined();
  expect(viewLog).toBeDefined();
});
```

---

### Test 19: Audit Logs Don't Interfere With Each Other
```typescript
it('should isolate audit logs per user without cross-contamination', async () => {
  const user1 = await createUserWithRole(UserRole.USER, '+1111111111');
  const user2 = await createUserWithRole(UserRole.USER, '+2222222222');
  const admin = await createAdminUser('+3333333333');

  // Create user-specific events
  await AuditLogger.logRateLimitViolation({
    user: user1,
    limitType: 'per-user',
    limit: 10,
    current: 11,
  });

  await AuditLogger.logModerationFlag({
    user: user2,
    categories: { harassment: true },
    messageLength: 100,
  });

  // Query user1's logs
  const user1Logs = await AuditLogRepository.query({
    userId: user1.id,
  });

  expect(user1Logs.length).toBe(1);
  expect(user1Logs[0].action).toBe(AuditAction.RATE_LIMIT_EXCEEDED);

  // Query user2's logs
  const user2Logs = await AuditLogRepository.query({
    userId: user2.id,
  });

  expect(user2Logs.length).toBe(1);
  expect(user2Logs[0].action).toBe(AuditAction.MODERATION_FLAG);

  // Verify no cross-contamination
  expect(user1Logs[0].phoneNumber).not.toBe(user2.phoneNumber);
  expect(user2Logs[0].phoneNumber).not.toBe(user1.phoneNumber);
});
```

---

### Test 20: Cross-User Audit Trails
```typescript
it('should track cross-user interactions in audit trail', async () => {
  const owner = await createOwnerUser('+1111111111');
  const admin = await createAdminUser('+2222222222');
  const user = await createUserWithRole(UserRole.USER, '+3333333333');

  // Owner promotes admin
  const promoteMsg = createMockMessage(owner.phoneNumber);
  await roleCommands.promote.handler(promoteMsg, {
    command: 'promote',
    value: `${admin.phoneNumber} ADMIN`,
  });

  // Admin views user's logs
  const viewMsg = createMockMessage(admin.phoneNumber);
  await auditCommands.user.handler(viewMsg, {
    command: 'user',
    value: user.phoneNumber,
  });

  // Verify audit trail shows the sequence
  const ownerActions = await AuditLogRepository.query({
    phoneNumber: owner.phoneNumber,
  });

  const adminActions = await AuditLogRepository.query({
    phoneNumber: admin.phoneNumber,
  });

  // Owner's action: role change
  const roleChange = ownerActions.find(
    log => log.action === AuditAction.ROLE_CHANGE
  );
  expect(roleChange).toBeDefined();
  expect(roleChange?.metadata).toContain(admin.phoneNumber);

  // Admin's action: view logs
  const logView = adminActions.find(
    log => log.action === AuditAction.AUDIT_LOG_VIEWED
  );
  expect(logView).toBeDefined();
  expect(logView?.metadata).toContain(user.phoneNumber);

  // Verify timeline (role change before log view)
  expect(roleChange!.createdAt.getTime()).toBeLessThan(
    logView!.createdAt.getTime()
  );
});
```

---

## Test Utilities & Helpers

```typescript
// Test user factories
async function createOwnerUser(phone = '+1234567890'): Promise<User> {
  return UserRepository.create({
    phoneNumber: phone,
    role: UserRole.OWNER,
    isWhitelisted: true,
  });
}

async function createAdminUser(phone = '+2345678901'): Promise<User> {
  return UserRepository.create({
    phoneNumber: phone,
    role: UserRole.ADMIN,
    isWhitelisted: true,
  });
}

async function createOperatorUser(phone = '+3456789012'): Promise<User> {
  return UserRepository.create({
    phoneNumber: phone,
    role: UserRole.OPERATOR,
    isWhitelisted: true,
  });
}

async function createUserWithRole(
  role: UserRole,
  phone = '+4567890123'
): Promise<User> {
  return UserRepository.create({
    phoneNumber: phone,
    role,
    isWhitelisted: role !== UserRole.USER,
  });
}

// Mock message factory
function createMockMessage(from: string): Message {
  return {
    from,
    reply: jest.fn().mockResolvedValue(undefined),
    body: '',
    hasMedia: false,
  } as any;
}

// Sample audit log generator
async function createSampleAuditLogs(count: number): Promise<void> {
  const categories = Object.values(AuditCategory);
  const actions = Object.values(AuditAction);

  const logs = Array.from({ length: count }, (_, i) => ({
    userId: `user-${i % 5}`,
    phoneNumber: `+123456789${i % 10}`,
    userRole: UserRole.USER,
    action: actions[i % actions.length],
    category: categories[i % categories.length],
    description: `Test audit log ${i}`,
    metadata: JSON.stringify({ testId: i }),
  }));

  await Promise.all(
    logs.map(log => AuditLogRepository.create(log))
  );
}
```

---

## Database Cleanup Strategy

```typescript
beforeEach(async () => {
  // Clean database before each test
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.usageMetric.deleteMany({});
});

afterAll(async () => {
  // Final cleanup
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
});
```

---

## Success Criteria

✅ **All 20 tests passing**
✅ **End-to-end flows validated**
✅ **RBAC enforced at all levels**
✅ **Multi-user scenarios working**
✅ **No race conditions or conflicts**
✅ **Audit logs don't impact performance**
✅ **Proper database isolation**

---

## Risk Assessment

**🟢 Low Risk:**
- Well-defined test patterns from Phase 1-3
- Clear user role hierarchy
- Database mocking already established

**🟡 Medium Risk:**
- Concurrent test execution may reveal race conditions
- Database cleanup between tests must be robust
- Mock WhatsApp messages need proper setup

**Mitigation:**
- Use `beforeEach` for strict database cleanup
- Test concurrent scenarios explicitly
- Reuse mock factories from Phase 3

---

## Next Steps After Phase 4

1. ✅ All integration tests passing
2. Update WEEK4_TESTING_PLAN.md with completion status
3. Create Phase 4 completion summary document
4. Run full test suite (all 389+ tests)
5. Commit Phase 4 implementation
6. Push to remote branch
7. Proceed to Phase 5 (Edge Cases) if needed

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Prepared for:** Phase 4 Implementation
