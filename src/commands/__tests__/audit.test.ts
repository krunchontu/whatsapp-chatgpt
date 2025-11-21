/**
 * Audit Command Tests
 *
 * Purpose: Test !config audit commands for viewing and exporting audit logs
 * Run: pnpm test src/commands/__tests__/audit.test.ts
 *
 * Commands tested:
 * - !config audit list [days] (6 tests)
 * - !config audit user <phoneNumber> (5 tests)
 * - !config audit category <category> (5 tests)
 * - !config audit export [days] (4 tests)
 * Total: 20 tests
 */

// Mock dependencies BEFORE importing modules
jest.mock('../../db/repositories/user.repository');
jest.mock('../../db/repositories/auditLog.repository');
jest.mock('../../services/auditLogger');
jest.mock('../../lib/logger', () => ({
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { AuditModule } from '../audit';
import { UserRepository, UserRole } from '../../db/repositories/user.repository';
import { AuditLogRepository, AuditCategory, AuditAction } from '../../db/repositories/auditLog.repository';
import { AuditLogger } from '../../services/auditLogger';
import type { User, AuditLog } from '@prisma/client';
import type { Message } from 'whatsapp-web.js';

describe('Audit Commands', () => {
  // Test fixtures
  let mockOwner: User;
  let mockAdmin: User;
  let mockOperator: User;
  let mockUser: User;

  // Mock message factory
  function createMockMessage(from: string): Message {
    return {
      from,
      reply: jest.fn().mockResolvedValue(undefined),
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
      createdAt: new Date('2025-11-21T12:00:00Z'),
      ...override,
    } as AuditLog;
  }

  beforeAll(() => {
    // Create test user fixtures
    mockOwner = {
      id: 'owner-1',
      phoneNumber: '+1111111111',
      role: UserRole.OWNER,
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockAdmin = {
      id: 'admin-1',
      phoneNumber: '+2222222222',
      role: UserRole.ADMIN,
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockOperator = {
      id: 'operator-1',
      phoneNumber: '+3333333333',
      role: UserRole.OPERATOR,
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockUser = {
      id: 'user-1',
      phoneNumber: '+4444444444',
      role: UserRole.USER,
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup UserRepository helper methods
    (UserRepository.isAdmin as jest.Mock).mockImplementation((user: User) => {
      return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
    });

    (UserRepository.isOwner as jest.Mock).mockImplementation((user: User) => {
      return user.role === UserRole.OWNER;
    });
  });

  // ============================================== #
  //    1. !config audit list [days] (6 tests)     #
  // ============================================== #

  describe('!config audit list', () => {
    const commands = AuditModule.register();
    const listCommand = commands.list;

    it('should list recent audit logs with default 7 days (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const mockLogs = [
        createMockAuditLog({ id: 'log-1', action: AuditAction.ROLE_CHANGE }),
        createMockAuditLog({ id: 'log-2', action: AuditAction.CONFIG_UPDATE }),
        createMockAuditLog({ id: 'log-3', action: AuditAction.PERMISSION_DENIED }),
      ];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (AuditLogRepository.query as jest.Mock).mockResolvedValue(mockLogs);

      await listCommand.execute(message);

      // Verify permission check
      expect(UserRepository.findByPhoneNumber).toHaveBeenCalledWith(mockAdmin.phoneNumber);
      expect(UserRepository.isAdmin).toHaveBeenCalledWith(mockAdmin);

      // Verify query with 7-day default
      expect(AuditLogRepository.query).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
          limit: 20,
        })
      );

      // Verify audit logging
      expect(AuditLogger.logAuditLogViewed).toHaveBeenCalledWith({
        user: mockAdmin,
        filters: expect.objectContaining({
          startDate: expect.any(Date),
          limit: 20,
        }),
      });

      // Verify response
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 *Audit Logs (7 days)')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('ROLE_CHANGE')
      );
    });

    it('should list audit logs with custom day count (OWNER)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const mockLogs = [createMockAuditLog()];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);
      (AuditLogRepository.query as jest.Mock).mockResolvedValue(mockLogs);

      await listCommand.execute(message, '30');

      // Verify query with 30-day range
      const queryCall = (AuditLogRepository.query as jest.Mock).mock.calls[0][0];
      const expectedStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const actualStartDate = queryCall.startDate;

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(expectedStartDate.getTime() - actualStartDate.getTime())).toBeLessThan(1000);

      // Verify response mentions 30 days
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('30 days')
      );
    });

    it('should deny permission for OPERATOR', async () => {
      const message = createMockMessage(mockOperator.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOperator);

      await listCommand.execute(message);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockOperator.phoneNumber,
        userRole: mockOperator.role,
        action: 'VIEW_AUDIT_LOGS',
        reason: 'Requires ADMIN role or higher',
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission to view audit logs")
      );

      // Verify no query executed
      expect(AuditLogRepository.query).not.toHaveBeenCalled();
    });

    it('should deny permission for USER', async () => {
      const message = createMockMessage(mockUser.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockUser);

      await listCommand.execute(message);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalled();
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission")
      );
      expect(AuditLogRepository.query).not.toHaveBeenCalled();
    });

    it('should handle invalid day count', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      // Test exceeding max (365)
      await listCommand.execute(message, '500');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number of days')
      );

      jest.clearAllMocks();

      // Test below min (1)
      await listCommand.execute(message, '0');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number of days')
      );

      jest.clearAllMocks();

      // Test non-numeric
      await listCommand.execute(message, 'abc');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number of days')
      );

      // Verify no queries executed
      expect(AuditLogRepository.query).not.toHaveBeenCalled();
    });

    it('should handle no audit logs found', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (AuditLogRepository.query as jest.Mock).mockResolvedValue([]);

      await listCommand.execute(message);

      expect(message.reply).toHaveBeenCalledWith(
        'No audit logs found for the last 7 days.'
      );
    });
  });

  // ============================================== #
  //   2. !config audit user <phone> (5 tests)     #
  // ============================================== #

  describe('!config audit user', () => {
    const commands = AuditModule.register();
    const userCommand = commands.user;

    it('should show audit logs for specific user (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetPhone = '+1234567890';
      const mockLogs = [
        createMockAuditLog({ phoneNumber: targetPhone, action: AuditAction.ROLE_CHANGE }),
        createMockAuditLog({ phoneNumber: targetPhone, action: AuditAction.CONFIG_UPDATE }),
      ];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (AuditLogRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockLogs);

      await userCommand.execute(message, targetPhone);

      // Verify query with phone number
      expect(AuditLogRepository.findByPhoneNumber).toHaveBeenCalledWith(targetPhone, 20);

      // Verify audit logging
      expect(AuditLogger.logAuditLogViewed).toHaveBeenCalledWith({
        user: mockAdmin,
        filters: { phoneNumber: targetPhone, limit: 20 },
      });

      // Verify response
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining(`📋 *Audit Logs for ${targetPhone}*`)
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('ROLE_CHANGE')
      );
    });

    it('should deny permission for non-ADMIN', async () => {
      const message = createMockMessage(mockOperator.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOperator);

      await userCommand.execute(message, '+1234567890');

      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockOperator.phoneNumber,
        userRole: mockOperator.role,
        action: 'VIEW_AUDIT_LOGS',
        reason: 'Requires ADMIN role or higher',
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission")
      );

      expect(AuditLogRepository.findByPhoneNumber).not.toHaveBeenCalled();
    });

    it('should handle missing phone number parameter', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      // Test with empty string
      await userCommand.execute(message, '');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a phone number')
      );

      jest.clearAllMocks();
      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      // Test with undefined
      await userCommand.execute(message, undefined);
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a phone number')
      );

      expect(AuditLogRepository.findByPhoneNumber).not.toHaveBeenCalled();
    });

    it('should handle user with no audit logs', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetPhone = '+9999999999';

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (AuditLogRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);

      await userCommand.execute(message, targetPhone);

      expect(message.reply).toHaveBeenCalledWith(
        `No audit logs found for ${targetPhone}.`
      );
    });

    it('should handle repository error', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (AuditLogRepository.findByPhoneNumber as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await userCommand.execute(message, '+1234567890');

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching user audit logs')
      );
    });
  });

  // ============================================== #
  //  3. !config audit category <cat> (5 tests)    #
  // ============================================== #

  describe('!config audit category', () => {
    const commands = AuditModule.register();
    const categoryCommand = commands.category;

    it('should filter by AUTH category (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const mockLogs = [
        createMockAuditLog({ category: AuditCategory.AUTH, action: AuditAction.ROLE_CHANGE }),
        createMockAuditLog({ category: AuditCategory.AUTH, action: AuditAction.PERMISSION_DENIED }),
      ];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (AuditLogRepository.findByCategory as jest.Mock).mockResolvedValue(mockLogs);

      await categoryCommand.execute(message, 'AUTH');

      // Verify query with category
      expect(AuditLogRepository.findByCategory).toHaveBeenCalledWith(AuditCategory.AUTH, 20);

      // Verify audit logging
      expect(AuditLogger.logAuditLogViewed).toHaveBeenCalledWith({
        user: mockAdmin,
        filters: { category: 'AUTH', limit: 20 },
      });

      // Verify response
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 *Audit Logs - AUTH Category*')
      );
    });

    it('should filter by SECURITY category (OWNER)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const mockLogs = [
        createMockAuditLog({ category: AuditCategory.SECURITY, action: AuditAction.RATE_LIMIT_VIOLATION }),
      ];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);
      (AuditLogRepository.findByCategory as jest.Mock).mockResolvedValue(mockLogs);

      await categoryCommand.execute(message, 'security');

      // Verify category is converted to uppercase
      expect(AuditLogRepository.findByCategory).toHaveBeenCalledWith(AuditCategory.SECURITY, 20);

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY Category')
      );
    });

    it('should deny permission for non-ADMIN', async () => {
      const message = createMockMessage(mockUser.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockUser);

      await categoryCommand.execute(message, 'AUTH');

      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockUser.phoneNumber,
        userRole: mockUser.role,
        action: 'VIEW_AUDIT_LOGS',
        reason: 'Requires ADMIN role or higher',
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission")
      );

      expect(AuditLogRepository.findByCategory).not.toHaveBeenCalled();
    });

    it('should handle invalid category', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      await categoryCommand.execute(message, 'INVALID_CATEGORY');

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid category')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('AUTH, CONFIG, ADMIN, SECURITY')
      );

      expect(AuditLogRepository.findByCategory).not.toHaveBeenCalled();
    });

    it('should handle missing category parameter', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      await categoryCommand.execute(message, '');

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a category')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('AUTH, CONFIG, ADMIN, SECURITY')
      );

      expect(AuditLogRepository.findByCategory).not.toHaveBeenCalled();
    });
  });

  // ============================================== #
  //   4. !config audit export [days] (4 tests)    #
  // ============================================== #

  describe('!config audit export', () => {
    const commands = AuditModule.register();
    const exportCommand = commands.export;

    it('should export audit logs as JSON (OWNER)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const mockLogs = Array(100).fill(null).map((_, i) =>
        createMockAuditLog({ id: `log-${i}` })
      );
      const jsonData = JSON.stringify(mockLogs);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);
      (AuditLogRepository.exportToJSON as jest.Mock).mockResolvedValue(jsonData);

      await exportCommand.execute(message);

      // Verify export with 30-day default
      expect(AuditLogRepository.exportToJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
        })
      );

      // Verify audit logging
      expect(AuditLogger.logAuditLogExported).toHaveBeenCalledWith({
        user: mockOwner,
        format: 'JSON',
        recordCount: 100,
        dateRange: '30 days',
      });

      // Verify response shows record count
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ *Audit Log Export Complete*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('📊 Total Records: 100')
      );
    });

    it('should export with custom day range (OWNER)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const mockLogs = [createMockAuditLog()];
      const jsonData = JSON.stringify(mockLogs);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);
      (AuditLogRepository.exportToJSON as jest.Mock).mockResolvedValue(jsonData);

      await exportCommand.execute(message, '90');

      // Verify query with 90-day range
      const exportCall = (AuditLogRepository.exportToJSON as jest.Mock).mock.calls[0][0];
      const expectedStartDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const actualStartDate = exportCall.startDate;

      expect(Math.abs(expectedStartDate.getTime() - actualStartDate.getTime())).toBeLessThan(1000);

      // Verify response mentions 90 days
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('90 days')
      );
    });

    it('should deny permission for ADMIN', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      await exportCommand.execute(message);

      // Verify permission denied for ADMIN (only OWNER can export)
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockAdmin.phoneNumber,
        userRole: mockAdmin.role,
        action: 'EXPORT_AUDIT_LOGS',
        reason: 'Requires OWNER role',
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission to export audit logs")
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('OWNER role')
      );

      expect(AuditLogRepository.exportToJSON).not.toHaveBeenCalled();
    });

    it('should handle invalid day count', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);

      // Test exceeding max
      await exportCommand.execute(message, '400');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number of days')
      );

      jest.clearAllMocks();
      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);

      // Test negative
      await exportCommand.execute(message, '-5');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number of days')
      );

      jest.clearAllMocks();
      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);

      // Test non-numeric
      await exportCommand.execute(message, 'abc');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number of days')
      );

      expect(AuditLogRepository.exportToJSON).not.toHaveBeenCalled();
    });
  });
});
