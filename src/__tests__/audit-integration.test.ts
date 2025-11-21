/**
 * Phase 4: Audit Integration Tests
 *
 * Purpose: Test complete audit logging system integration with end-to-end flows,
 *          RBAC enforcement, and multi-user scenarios
 * Run: npm test src/__tests__/audit-integration.test.ts
 *
 * Test Structure:
 * - Phase 4A: Full Audit Flow Tests (8 tests)
 * - Phase 4B: RBAC Integration Tests (6 tests)
 * - Phase 4C: Multi-User Scenarios (6 tests)
 * Total: 20 tests
 */

import { prisma } from '../db/client';
import { UserRepository, UserRole } from '../db/repositories/user.repository';
import { AuditLogRepository, AuditCategory, AuditAction } from '../db/repositories/auditLog.repository';
import { AuditLogger } from '../services/auditLogger';
import { AuditModule } from '../commands/audit';
import { RoleModule } from '../commands/role';
import type { User } from '@prisma/client';
import type { Message } from 'whatsapp-web.js';

describe('Phase 4: Audit Integration Tests', () => {
  // ============================================================================
  // Test Utilities & Helpers
  // ============================================================================

  /**
   * Create a mock WhatsApp message
   */
  function createMockMessage(from: string): Message {
    return {
      from,
      reply: jest.fn().mockResolvedValue(undefined),
      body: '',
      hasMedia: false,
    } as any;
  }

  /**
   * Create test user factories
   */
  async function createOwnerUser(phone = '+1111111111'): Promise<User> {
    return UserRepository.create({
      phoneNumber: phone,
      role: UserRole.OWNER,
    });
  }

  async function createAdminUser(phone = '+2222222222'): Promise<User> {
    return UserRepository.create({
      phoneNumber: phone,
      role: UserRole.ADMIN,
    });
  }

  async function createOperatorUser(phone = '+3333333333'): Promise<User> {
    return UserRepository.create({
      phoneNumber: phone,
      role: UserRole.OPERATOR,
    });
  }

  async function createUserWithRole(
    role: UserRole,
    phone = '+4444444444'
  ): Promise<User> {
    return UserRepository.create({
      phoneNumber: phone,
      role,
    });
  }

  /**
   * Create sample audit logs for testing
   */
  async function createSampleAuditLogs(count: number): Promise<void> {
    const categories = Object.values(AuditCategory);
    const actions = Object.values(AuditAction);

    const users = await Promise.all([
      createUserWithRole(UserRole.USER, '+1000000001'),
      createUserWithRole(UserRole.USER, '+1000000002'),
      createUserWithRole(UserRole.USER, '+1000000003'),
    ]);

    const logs = Array.from({ length: count }, (_, i) => ({
      userId: users[i % users.length].id,
      phoneNumber: users[i % users.length].phoneNumber,
      userRole: UserRole.USER,
      action: actions[i % actions.length],
      category: categories[i % categories.length],
      description: `Test audit log ${i}`,
      metadata: JSON.stringify({ testId: i }),
    }));

    for (const log of logs) {
      await AuditLogRepository.create(log);
    }
  }

  /**
   * Get command handlers from modules
   */
  const auditModule = AuditModule.register();
  const roleModule = RoleModule.register();

  const auditCommands = {
    list: auditModule.list,
    user: auditModule.user,
    category: auditModule.category,
    export: auditModule.export,
  };

  const roleCommands = {
    list: roleModule.list,
    info: roleModule.info,
    promote: roleModule.promote,
    demote: roleModule.demote,
  };

  // ============================================================================
  // Database Cleanup
  // ============================================================================

  beforeEach(async () => {
    // Clean database before each test for isolation
    await prisma.auditLog.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.usageMetric.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    // Final cleanup
    await prisma.auditLog.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.usageMetric.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  // ============================================================================
  // Phase 4A: Full Audit Flow Tests (8 tests)
  // ============================================================================

  describe('Phase 4A: Full Audit Flow Tests', () => {
    it('should create audit log when user triggers rate limit and admin can view it', async () => {
      // Given: USER exists
      const user = await createUserWithRole(UserRole.USER, '+5555555555');

      // When: Rate limiter logs violation
      await AuditLogger.logRateLimitViolation({
        phoneNumber: user.phoneNumber,
        userRole: user.role,
        limitType: 'user',
        limit: 10,
        currentRate: 11,
      });

      // Then: Audit log exists
      const logs = await AuditLogRepository.query({
        phoneNumber: user.phoneNumber,
        category: AuditCategory.SECURITY,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe(AuditAction.RATE_LIMIT_VIOLATION);
      expect(logs[0].phoneNumber).toBe(user.phoneNumber);

      // And: ADMIN can retrieve it
      const admin = await createAdminUser();
      const message = createMockMessage(admin.phoneNumber);

      await auditCommands.list.execute(message, '1');

      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('RATE_LIMIT_VIOLATION');
    });

    it('should log role change and make it visible in AUTH category', async () => {
      // Given: OWNER and USER exist
      const owner = await createOwnerUser();
      const user = await createUserWithRole(UserRole.USER, '+6666666666');

      // When: OWNER promotes user to OPERATOR
      const message = createMockMessage(owner.phoneNumber);
      await roleCommands.promote.execute(message, {
        command: 'promote',
        value: `${user.phoneNumber} OPERATOR`,
      });

      // Then: Role change logged
      const logs = await AuditLogRepository.query({
        category: AuditCategory.AUTH,
        action: AuditAction.ROLE_CHANGE,
      });

      expect(logs.length).toBeGreaterThan(0);
      const roleChangeLog = logs.find(log => log.phoneNumber === user.phoneNumber);
      expect(roleChangeLog).toBeDefined();
      expect(roleChangeLog?.metadata).toContain('USER');
      expect(roleChangeLog?.metadata).toContain('OPERATOR');

      // And: ADMIN can view AUTH logs
      const admin = await createAdminUser();
      const viewMessage = createMockMessage(admin.phoneNumber);

      await auditCommands.category.execute(viewMessage, {
        command: 'category',
        value: 'AUTH',
      });

      expect(viewMessage.reply).toHaveBeenCalled();
      const replyCall = (viewMessage.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('ROLE_CHANGE');
    });

    it('should log config changes and make them retrievable by category', async () => {
      // Given: ADMIN exists
      const admin = await createAdminUser();

      // When: ADMIN changes GPT model (simulated)
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
      const configLog = logs.find(
        log =>
          log.action === AuditAction.CONFIG_UPDATE &&
          log.metadata?.includes('model')
      );

      expect(configLog).toBeDefined();
      expect(configLog?.phoneNumber).toBe(admin.phoneNumber);

      // And: OWNER can view config logs
      const owner = await createOwnerUser();
      const viewMessage = createMockMessage(owner.phoneNumber);

      await auditCommands.category.execute(viewMessage, {
        command: 'category',
        value: 'CONFIG',
      });

      expect(viewMessage.reply).toHaveBeenCalled();
      const replyCall = (viewMessage.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('CONFIG_UPDATE');
    });

    it('should log permission denials and make them auditable', async () => {
      // Given: OPERATOR exists (not authorized for export)
      const operator = await createOperatorUser();

      // When: OPERATOR tries to export audit logs
      const message = createMockMessage(operator.phoneNumber);
      await auditCommands.export.execute(message, {
        command: 'export',
        value: '30',
      });

      // Then: Permission denied
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('requires OWNER role');

      // And: Denial logged
      const logs = await AuditLogRepository.query({
        phoneNumber: operator.phoneNumber,
        category: AuditCategory.AUTH,
      });

      const denialLog = logs.find(
        log => log.action === AuditAction.PERMISSION_DENIED
      );

      expect(denialLog).toBeDefined();
      expect(denialLog?.metadata).toContain('EXPORT_AUDIT_LOGS');

      // And: ADMIN can see the denial in logs
      const admin = await createAdminUser();
      const adminMessage = createMockMessage(admin.phoneNumber);

      await auditCommands.user.execute(adminMessage, {
        command: 'user',
        value: operator.phoneNumber,
      });

      expect(adminMessage.reply).toHaveBeenCalled();
      const adminReplyCall = (adminMessage.reply as jest.Mock).mock.calls[0][0];
      expect(adminReplyCall).toContain('PERMISSION_DENIED');
    });

    it('should log moderation flags in security category', async () => {
      // Given: USER exists
      const user = await createUserWithRole(UserRole.USER, '+7777777777');

      // When: Moderation system flags content
      await AuditLogger.logModerationFlag({
        user,
        flaggedCategories: ['harassment', 'hate'],
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

      await auditCommands.category.execute(message, {
        command: 'category',
        value: 'SECURITY',
      });

      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('MODERATION_FLAG');
    });

    it('should log circuit breaker events in security logs', async () => {
      // When: Circuit breaker opens due to failures
      await AuditLogger.logCircuitBreakerChange({
        service: 'OpenAI API',
        state: 'OPEN',
        failureCount: 5,
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
      await AuditLogger.logCircuitBreakerChange({
        service: 'OpenAI API',
        state: 'CLOSED',
      });

      // Then: Another security log created
      const closedLogs = await AuditLogRepository.query({
        category: AuditCategory.SECURITY,
        action: AuditAction.CIRCUIT_BREAKER_CLOSED,
      });

      expect(closedLogs).toHaveLength(1);
    });

    it('should log audit export actions (audit of audit access)', async () => {
      // Given: OWNER exists and there are logs to export
      const owner = await createOwnerUser();
      await createSampleAuditLogs(10);

      // When: OWNER exports audit logs
      const message = createMockMessage(owner.phoneNumber);
      await auditCommands.export.execute(message, {
        command: 'export',
        value: '30',
      });

      // Then: Export succeeds (starts exporting process)
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toMatch(/Exporting|exported|Export/i);

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

    it('should log conversation resets in admin category', async () => {
      // Given: USER with conversation history
      const user = await createUserWithRole(UserRole.USER, '+8888888888');

      // When: USER resets conversation
      await AuditLogger.logConversationReset({
        performedBy: user,
      });

      // Then: Admin log created
      const logs = await AuditLogRepository.query({
        category: AuditCategory.ADMIN,
        action: AuditAction.CONVERSATION_RESET,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].phoneNumber).toBe(user.phoneNumber);
    });
  });

  // ============================================================================
  // Phase 4B: RBAC Integration Tests (6 tests)
  // ============================================================================

  describe('Phase 4B: RBAC Integration Tests', () => {
    it('should allow OWNER full access to all audit commands', async () => {
      const owner = await createOwnerUser();
      await createSampleAuditLogs(20);

      // Test: List logs
      const listMsg = createMockMessage(owner.phoneNumber);
      await auditCommands.list.execute(listMsg, '7');
      expect(listMsg.reply).toHaveBeenCalled();
      let replyCall = (listMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');

      // Test: View user logs
      const userMsg = createMockMessage(owner.phoneNumber);
      await auditCommands.user.execute(userMsg, {
        command: 'user',
        value: '+1000000001',
      });
      expect(userMsg.reply).toHaveBeenCalled();
      replyCall = (userMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');

      // Test: Filter by category
      const catMsg = createMockMessage(owner.phoneNumber);
      await auditCommands.category.execute(catMsg, {
        command: 'category',
        value: 'AUTH',
      });
      expect(catMsg.reply).toHaveBeenCalled();
      replyCall = (catMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');

      // Test: Export logs
      const exportMsg = createMockMessage(owner.phoneNumber);
      await auditCommands.export.execute(exportMsg, {
        command: 'export',
        value: '30',
      });
      expect(exportMsg.reply).toHaveBeenCalled();
      replyCall = (exportMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');

      // Test: Manage all roles
      const promoteMsg = createMockMessage(owner.phoneNumber);
      await roleCommands.promote.execute(promoteMsg, {
        command: 'promote',
        value: '+9999999999 ADMIN',
      });
      expect(promoteMsg.reply).toHaveBeenCalled();
      replyCall = (promoteMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');
    });

    it('should allow ADMIN to view logs but deny export', async () => {
      const admin = await createAdminUser();
      await createSampleAuditLogs(10);

      // Success: List logs
      const listMsg = createMockMessage(admin.phoneNumber);
      await auditCommands.list.execute(listMsg, '7');
      expect(listMsg.reply).toHaveBeenCalled();
      let replyCall = (listMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');

      // Success: View user logs
      const userMsg = createMockMessage(admin.phoneNumber);
      await auditCommands.user.execute(userMsg, {
        command: 'user',
        value: '+1000000001',
      });
      expect(userMsg.reply).toHaveBeenCalled();
      replyCall = (userMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).not.toContain('denied');

      // Failure: Export logs (OWNER only)
      const exportMsg = createMockMessage(admin.phoneNumber);
      await auditCommands.export.execute(exportMsg, {
        command: 'export',
        value: '30',
      });
      expect(exportMsg.reply).toHaveBeenCalled();
      replyCall = (exportMsg.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('requires OWNER role');

      // Verify denial was logged
      const denialLogs = await AuditLogRepository.query({
        phoneNumber: admin.phoneNumber,
        action: AuditAction.PERMISSION_DENIED,
      });

      expect(denialLogs.length).toBeGreaterThan(0);
    });

    it('should deny OPERATOR access to audit commands', async () => {
      const operator = await createOperatorUser();

      // All audit commands should be denied
      const commands = [
        { handler: auditCommands.list, params: '7' },
        {
          handler: auditCommands.user,
          params: '+1234567890',
        },
        {
          handler: auditCommands.category,
          params: 'AUTH',
        },
        {
          handler: auditCommands.export,
          params: '30',
        },
      ];

      for (const { handler, params } of commands) {
        const message = createMockMessage(operator.phoneNumber);
        await handler.execute(message, params);

        expect(message.reply).toHaveBeenCalled();
        const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
        expect(replyCall).toContain('denied');
      }

      // Verify all denials logged
      const denialLogs = await AuditLogRepository.query({
        phoneNumber: operator.phoneNumber,
        category: AuditCategory.AUTH,
      });

      expect(denialLogs.length).toBe(4); // One for each denied command
    });

    it('should deny USER access to all audit commands', async () => {
      const user = await createUserWithRole(UserRole.USER, '+9999999999');

      const message = createMockMessage(user.phoneNumber);
      await auditCommands.list.execute(message, '7');

      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('requires ADMIN');

      // Verify denial logged
      const logs = await AuditLogRepository.query({
        phoneNumber: user.phoneNumber,
        action: AuditAction.PERMISSION_DENIED,
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should create audit log for every permission denial', async () => {
      const operator = await createOperatorUser();
      const user = await createUserWithRole(UserRole.USER, '+8888888888');

      // Operator tries to export (denied)
      const opMsg = createMockMessage(operator.phoneNumber);
      await auditCommands.export.execute(opMsg, '30');

      // User tries to list logs (denied)
      const userMsg = createMockMessage(user.phoneNumber);
      await auditCommands.list.execute(userMsg, '7');

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

    it('should enforce role hierarchy in audit access', async () => {
      const users = {
        owner: await createOwnerUser('+1111111111'),
        admin: await createAdminUser('+2222222222'),
        operator: await createOperatorUser('+3333333333'),
        user: await createUserWithRole(UserRole.USER, '+4444444444'),
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
        await auditCommands.list.execute(viewMsg, '7');

        expect(viewMsg.reply).toHaveBeenCalled();
        const viewReply = (viewMsg.reply as jest.Mock).mock.calls[0][0];

        if (canView) {
          expect(viewReply).not.toContain('denied');
        } else {
          expect(viewReply).toContain('denied');
        }

        // Test export
        const exportMsg = createMockMessage(user.phoneNumber);
        await auditCommands.export.execute(exportMsg, {
          command: 'export',
          value: '30',
        });

        expect(exportMsg.reply).toHaveBeenCalled();
        const exportReply = (exportMsg.reply as jest.Mock).mock.calls[0][0];

        if (canExport) {
          expect(exportReply).not.toContain('denied');
        } else {
          expect(exportReply).toContain('denied');
        }
      }
    });
  });

  // ============================================================================
  // Phase 4C: Multi-User Scenarios (6 tests)
  // ============================================================================

  describe('Phase 4C: Multi-User Scenarios', () => {
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
          auditCommands.list.execute(msg, '7')
        )
      );

      // All should succeed
      messages.forEach(msg => {
        expect(msg.reply).toHaveBeenCalled();
        const replyCall = (msg.reply as jest.Mock).mock.calls[0][0];
        expect(replyCall).not.toContain('denied');
        // Verify they got audit log data (not just denied message)
        expect(replyCall).toMatch(/Audit Logs|audit logs|📋/);
      });

      // Verify all access logged
      const accessLogs = await AuditLogRepository.query({
        category: AuditCategory.ADMIN,
        action: AuditAction.AUDIT_LOG_VIEWED,
      });

      expect(accessLogs.length).toBe(3);
    });

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
            phoneNumber: user.phoneNumber,
            userRole: user.role,
            limitType: 'user',
            limit: 10,
            currentRate: 11,
          })
        )
      );

      // Verify all events logged
      const logs = await AuditLogRepository.query({
        category: AuditCategory.SECURITY,
        action: AuditAction.RATE_LIMIT_VIOLATION,
      });

      expect(logs.length).toBe(3);

      // Verify each user has their own log
      users.forEach(user => {
        const userLog = logs.find(log => log.phoneNumber === user.phoneNumber);
        expect(userLog).toBeDefined();
      });
    });

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

    it('should allow owner export while admin views logs simultaneously', async () => {
      const owner = await createOwnerUser();
      const admin = await createAdminUser();

      await createSampleAuditLogs(100);

      // Simulate concurrent operations
      const ownerMsg = createMockMessage(owner.phoneNumber);
      const adminMsg = createMockMessage(admin.phoneNumber);

      await Promise.all([
        auditCommands.export.execute(ownerMsg, '30'),
        auditCommands.list.execute(adminMsg, '7'),
      ]);

      // Both should succeed
      expect(ownerMsg.reply).toHaveBeenCalled();
      const ownerReply = (ownerMsg.reply as jest.Mock).mock.calls[0][0];
      expect(ownerReply).toMatch(/Exporting|exported|Export/i);

      expect(adminMsg.reply).toHaveBeenCalled();
      const adminReply = (adminMsg.reply as jest.Mock).mock.calls[0][0];
      expect(adminReply).toMatch(/Audit Logs|audit logs|📋/);

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

    it('should isolate audit logs per user without cross-contamination', async () => {
      const user1 = await createUserWithRole(UserRole.USER, '+1111111111');
      const user2 = await createUserWithRole(UserRole.USER, '+2222222222');

      // Create user-specific events
      await AuditLogger.logRateLimitViolation({
        phoneNumber: user1.phoneNumber,
        userRole: user1.role,
        limitType: 'user',
        limit: 10,
        currentRate: 11,
      });

      await AuditLogger.logModerationFlag({
        user: user2,
        flaggedCategories: ['harassment'],
      });

      // Query user1's logs
      const user1Logs = await AuditLogRepository.query({
        phoneNumber: user1.phoneNumber,
      });

      expect(user1Logs.length).toBe(1);
      expect(user1Logs[0].action).toBe(AuditAction.RATE_LIMIT_VIOLATION);

      // Query user2's logs
      const user2Logs = await AuditLogRepository.query({
        phoneNumber: user2.phoneNumber,
      });

      expect(user2Logs.length).toBe(1);
      expect(user2Logs[0].action).toBe(AuditAction.MODERATION_FLAG);

      // Verify no cross-contamination
      expect(user1Logs[0].phoneNumber).not.toBe(user2.phoneNumber);
      expect(user2Logs[0].phoneNumber).not.toBe(user1.phoneNumber);
    });

    it('should track cross-user interactions in audit trail', async () => {
      const owner = await createOwnerUser('+1111111111');
      const admin = await createUserWithRole(UserRole.USER, '+2222222222'); // Start as USER
      const user = await createUserWithRole(UserRole.USER, '+3333333333');

      // Owner promotes user to admin
      const promoteMsg = createMockMessage(owner.phoneNumber);
      await roleCommands.promote.execute(promoteMsg, `${admin.phoneNumber} ADMIN`);

      // Verify promotion succeeded by checking the reply message
      expect(promoteMsg.reply).toHaveBeenCalled();
      const promoteReply = (promoteMsg.reply as jest.Mock).mock.calls[0][0];
      expect(promoteReply).not.toContain('denied');

      // Admin views user's logs (use ADMIN directly for simplicity)
      const actualAdmin = await createAdminUser('+9999999999');
      const viewMsg = createMockMessage(actualAdmin.phoneNumber);
      await auditCommands.user.execute(viewMsg, user.phoneNumber);

      // Verify audit trail shows the sequence
      const ownerActions = await AuditLogRepository.query({
        phoneNumber: owner.phoneNumber,
      });

      const adminActions = await AuditLogRepository.query({
        phoneNumber: actualAdmin.phoneNumber,
      });

      // Owner's action: role change for original admin user
      const roleChange = ownerActions.find(
        log => log.action === AuditAction.ROLE_CHANGE
      );
      expect(roleChange).toBeDefined();
      expect(roleChange?.metadata).toContain(admin.phoneNumber);

      // Actual admin's action: view logs
      const logView = adminActions.find(
        log => log.action === AuditAction.AUDIT_LOG_VIEWED
      );
      expect(logView).toBeDefined();
      expect(logView?.metadata).toContain(user.phoneNumber);

      // Verify both actions occurred
      expect(roleChange!.createdAt).toBeDefined();
      expect(logView!.createdAt).toBeDefined();
    });
  });
});
