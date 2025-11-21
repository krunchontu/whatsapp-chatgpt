/**
 * AuditLog Repository Tests
 *
 * Purpose: Test all CRUD operations, queries, exports, and cleanup
 * Run: pnpm test src/db/repositories/__tests__/auditLog.repository.test.ts
 */

import { AuditLogRepository, AuditCategory, AuditAction } from '../auditLog.repository';
import { UserRepository, UserRole } from '../user.repository';
import { prisma } from '../../client';
import type { AuditLog, User } from '@prisma/client';

describe('AuditLogRepository', () => {
  let testUser: User;
  let testAdmin: User;

  /**
   * Set up test users before tests
   */
  beforeAll(async () => {
    // Create test users
    testUser = await UserRepository.create({
      phoneNumber: '+1234567890',
      role: UserRole.USER,
    });

    testAdmin = await UserRepository.create({
      phoneNumber: '+0987654321',
      role: UserRole.ADMIN,
    });
  });

  /**
   * Clean up audit logs before each test
   */
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  /**
   * Cleanup after all tests
   */
  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // ============================================== #
  //              Create Operations                 #
  // ============================================== #

  describe('Create Operations', () => {
    it('should create audit log with all required fields', async () => {
      const log = await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Updated bot configuration',
        metadata: {},
      });

      expect(log).toBeDefined();
      expect(log.id).toBeDefined();
      expect(log.userId).toBe(testUser.id);
      expect(log.phoneNumber).toBe(testUser.phoneNumber);
      expect(log.userRole).toBe(testUser.role);
      expect(log.action).toBe(AuditAction.CONFIG_UPDATE);
      expect(log.category).toBe(AuditCategory.CONFIG);
      expect(log.description).toBe('Updated bot configuration');
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('should create audit log with null userId for system events', async () => {
      const log = await AuditLogRepository.create({
        userId: null,
        phoneNumber: 'SYSTEM',
        userRole: 'SYSTEM',
        action: AuditAction.CIRCUIT_BREAKER_OPEN,
        category: AuditCategory.SECURITY,
        description: 'Circuit breaker opened',
        metadata: { service: 'OpenAI' },
      });

      expect(log.userId).toBeNull();
      expect(log.phoneNumber).toBe('SYSTEM');
      expect(log.userRole).toBe('SYSTEM');
    });

    it('should create audit log with JSON metadata', async () => {
      const metadata = {
        oldValue: 'gpt-3.5-turbo',
        newValue: 'gpt-4o',
        setting: 'model',
      };

      const log = await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Changed model',
        metadata,
      });

      expect(log.metadata).toBe(JSON.stringify(metadata));
      const parsed = JSON.parse(log.metadata);
      expect(parsed.oldValue).toBe('gpt-3.5-turbo');
      expect(parsed.newValue).toBe('gpt-4o');
    });

    it('should handle empty metadata object', async () => {
      const log = await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.PERMISSION_DENIED,
        category: AuditCategory.AUTH,
        description: 'Access denied',
        metadata: {},
      });

      expect(log.metadata).toBe('{}');
    });
  });

  // ============================================== #
  //              Query Operations                  #
  // ============================================== #

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Create test audit logs
      await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Config change 1',
        metadata: {},
      });

      await AuditLogRepository.create({
        userId: testAdmin.id,
        phoneNumber: testAdmin.phoneNumber,
        userRole: testAdmin.role,
        action: AuditAction.ROLE_CHANGE,
        category: AuditCategory.AUTH,
        description: 'Role change',
        metadata: {},
      });

      await AuditLogRepository.create({
        userId: null,
        phoneNumber: 'SYSTEM',
        userRole: 'SYSTEM',
        action: AuditAction.CIRCUIT_BREAKER_OPEN,
        category: AuditCategory.SECURITY,
        description: 'Circuit breaker',
        metadata: {},
      });
    });

    it('should query logs by userId', async () => {
      const logs = await AuditLogRepository.findByUser(testUser.id, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe(testUser.id);
    });

    it('should query logs by phoneNumber', async () => {
      const logs = await AuditLogRepository.findByPhoneNumber(testAdmin.phoneNumber, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].phoneNumber).toBe(testAdmin.phoneNumber);
    });

    it('should query logs by category AUTH', async () => {
      const logs = await AuditLogRepository.findByCategory(AuditCategory.AUTH, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe(AuditCategory.AUTH);
    });

    it('should query logs by category CONFIG', async () => {
      const logs = await AuditLogRepository.findByCategory(AuditCategory.CONFIG, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe(AuditCategory.CONFIG);
    });

    it('should query logs by category SECURITY', async () => {
      const logs = await AuditLogRepository.findByCategory(AuditCategory.SECURITY, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe(AuditCategory.SECURITY);
    });

    it('should query logs by action type', async () => {
      const logs = await AuditLogRepository.findByAction(AuditAction.ROLE_CHANGE, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe(AuditAction.ROLE_CHANGE);
    });

    it('should query logs by date range', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const logs = await AuditLogRepository.findByDateRange(yesterday, tomorrow);

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach(log => {
        expect(log.createdAt).toBeInstanceOf(Date);
        expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(log.createdAt.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    it('should support combined query with multiple filters', async () => {
      const logs = await AuditLogRepository.query({
        category: AuditCategory.CONFIG,
        userId: testUser.id,
        limit: 10,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe(AuditCategory.CONFIG);
      expect(logs[0].userId).toBe(testUser.id);
    });

    it('should respect query limit', async () => {
      // Create 10 more logs
      for (let i = 0; i < 10; i++) {
        await AuditLogRepository.create({
          userId: testUser.id,
          phoneNumber: testUser.phoneNumber,
          userRole: testUser.role,
          action: AuditAction.CONFIG_UPDATE,
          category: AuditCategory.CONFIG,
          description: `Config change ${i}`,
          metadata: {},
        });
      }

      const logs = await AuditLogRepository.query({ limit: 5 });

      expect(logs).toHaveLength(5);
    });

    it('should return logs sorted by createdAt descending', async () => {
      const logs = await AuditLogRepository.query({ limit: 10 });

      for (let i = 1; i < logs.length; i++) {
        expect(logs[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          logs[i].createdAt.getTime()
        );
      }
    });

    it('should return empty array when no results', async () => {
      const logs = await AuditLogRepository.query({
        phoneNumber: 'non-existent',
        limit: 10,
      });

      expect(logs).toEqual([]);
    });

    it('should count total matching logs', async () => {
      const count = await AuditLogRepository.count({
        category: AuditCategory.CONFIG,
      });

      expect(count).toBe(1);
    });
  });

  // ============================================== #
  //              Export Operations                 #
  // ============================================== #

  describe('Export Operations', () => {
    beforeEach(async () => {
      // Create test logs
      await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Test log 1',
        metadata: { key: 'value' },
      });

      await AuditLogRepository.create({
        userId: testAdmin.id,
        phoneNumber: testAdmin.phoneNumber,
        userRole: testAdmin.role,
        action: AuditAction.ROLE_CHANGE,
        category: AuditCategory.AUTH,
        description: 'Test log 2',
        metadata: {},
      });
    });

    it('should export logs to JSON format', async () => {
      const jsonData = await AuditLogRepository.exportToJSON({});

      expect(jsonData).toBeDefined();
      const logs = JSON.parse(jsonData);
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should export logs to CSV format', async () => {
      const csvData = await AuditLogRepository.exportToCSV({});

      expect(csvData).toBeDefined();
      expect(typeof csvData).toBe('string');
      expect(csvData).toContain('ID,Timestamp,Phone Number'); // CSV header
      expect(csvData).toContain('Test log 1');
    });

    it('should export with date range filter', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const jsonData = await AuditLogRepository.exportToJSON({
        startDate: yesterday,
        endDate: tomorrow,
      });

      const logs = JSON.parse(jsonData);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should export with category filter', async () => {
      const jsonData = await AuditLogRepository.exportToJSON({
        category: AuditCategory.AUTH,
      });

      const logs = JSON.parse(jsonData);
      expect(logs.length).toBe(1);
      expect(logs[0].category).toBe(AuditCategory.AUTH);
    });

    it('should respect export 10k record limit', async () => {
      const jsonData = await AuditLogRepository.exportToJSON({});

      const logs = JSON.parse(jsonData);
      expect(logs.length).toBeLessThanOrEqual(10000);
    });

    it('should export empty array when no results', async () => {
      const jsonData = await AuditLogRepository.exportToJSON({
        phoneNumber: 'non-existent',
      });

      const logs = JSON.parse(jsonData);
      expect(logs).toEqual([]);
    });
  });

  // ============================================== #
  //              Cleanup Operations                #
  // ============================================== #

  describe('Cleanup Operations', () => {
    beforeEach(async () => {
      // Create recent log
      await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Recent log',
        metadata: {},
      });
    });

    it('should delete expired logs older than retention period', async () => {
      // Create old log by directly manipulating database
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      await prisma.auditLog.create({
        data: {
          userId: testUser.id,
          phoneNumber: testUser.phoneNumber,
          userRole: testUser.role,
          action: AuditAction.CONFIG_UPDATE,
          category: AuditCategory.CONFIG,
          description: 'Old log',
          metadata: '{}',
          createdAt: oldDate,
        },
      });

      const deletedCount = await AuditLogRepository.deleteExpired(90);

      expect(deletedCount).toBe(1);

      const remaining = await AuditLogRepository.query({ limit: 100 });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].description).toBe('Recent log');
    });

    it('should delete all logs for a user (GDPR)', async () => {
      await AuditLogRepository.deleteByUser(testUser.id);

      const logs = await AuditLogRepository.findByUser(testUser.id, 10);
      expect(logs).toEqual([]);
    });

    it('should return count of deleted records', async () => {
      // Create more logs for testUser
      for (let i = 0; i < 5; i++) {
        await AuditLogRepository.create({
          userId: testUser.id,
          phoneNumber: testUser.phoneNumber,
          userRole: testUser.role,
          action: AuditAction.CONFIG_UPDATE,
          category: AuditCategory.CONFIG,
          description: `Log ${i}`,
          metadata: {},
        });
      }

      const deletedCount = await AuditLogRepository.deleteByUser(testUser.id);

      expect(deletedCount).toBe(6); // 1 from beforeEach + 5 new
    });

    it('should not delete recent logs during cleanup', async () => {
      const deletedCount = await AuditLogRepository.deleteExpired(90);

      expect(deletedCount).toBe(0);

      const logs = await AuditLogRepository.query({ limit: 100 });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  // ============================================== #
  //          Statistics & Aggregation              #
  // ============================================== #

  describe('Statistics & Aggregation', () => {
    beforeEach(async () => {
      // Create logs in different categories
      await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Config log',
        metadata: {},
      });

      await AuditLogRepository.create({
        userId: testAdmin.id,
        phoneNumber: testAdmin.phoneNumber,
        userRole: testAdmin.role,
        action: AuditAction.ROLE_CHANGE,
        category: AuditCategory.AUTH,
        description: 'Auth log',
        metadata: {},
      });

      await AuditLogRepository.create({
        userId: null,
        phoneNumber: 'SYSTEM',
        userRole: 'SYSTEM',
        action: AuditAction.RATE_LIMIT_VIOLATION,
        category: AuditCategory.SECURITY,
        description: 'Security log',
        metadata: {},
      });
    });

    it('should get recent logs from last 24 hours', async () => {
      const logs = await AuditLogRepository.getRecent();

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach(log => {
        const age = Date.now() - log.createdAt.getTime();
        expect(age).toBeLessThan(24 * 60 * 60 * 1000);
      });
    });

    it('should get statistics by category using count', async () => {
      const configCount = await AuditLogRepository.count({
        category: AuditCategory.CONFIG,
      });
      const authCount = await AuditLogRepository.count({
        category: AuditCategory.AUTH,
      });
      const securityCount = await AuditLogRepository.count({
        category: AuditCategory.SECURITY,
      });

      expect(configCount).toBe(1);
      expect(authCount).toBe(1);
      expect(securityCount).toBe(1);
    });

    it('should get statistics by action using count', async () => {
      const configUpdateCount = await AuditLogRepository.count({
        action: AuditAction.CONFIG_UPDATE,
      });
      const roleChangeCount = await AuditLogRepository.count({
        action: AuditAction.ROLE_CHANGE,
      });

      expect(configUpdateCount).toBe(1);
      expect(roleChangeCount).toBe(1);
    });

    it('should get statistics by user using query', async () => {
      const userLogs = await AuditLogRepository.findByUser(testUser.id, 100);
      const adminLogs = await AuditLogRepository.findByUser(testAdmin.id, 100);

      expect(userLogs.length).toBeGreaterThan(0);
      expect(adminLogs.length).toBeGreaterThan(0);
      expect(userLogs[0].userRole).toBe(UserRole.USER);
      expect(adminLogs[0].userRole).toBe(UserRole.ADMIN);
    });

    it('should get user activity summary', async () => {
      const logs = await AuditLogRepository.findByUser(testUser.id, 100);

      expect(logs.length).toBeGreaterThan(0);

      const actionCounts = logs.reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(actionCounts).toBeDefined();
    });
  });

  // ============================================== #
  //          Edge Cases & Error Handling           #
  // ============================================== #

  describe('Edge Cases & Error Handling', () => {
    it('should handle invalid date range gracefully', async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      // Future to past (invalid)
      const logs = await AuditLogRepository.findByDateRange(futureDate, pastDate);

      expect(logs).toEqual([]);
    });

    it('should handle very long descriptions', async () => {
      const longDescription = 'A'.repeat(1000);

      const log = await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: longDescription,
        metadata: {},
      });

      expect(log.description).toBe(longDescription);
    });

    it('should handle special characters in description', async () => {
      const description = 'Test "quotes" and \'apostrophes\' and <tags>';

      const log = await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description,
        metadata: {},
      });

      expect(log.description).toBe(description);
    });

    it('should handle large metadata objects', async () => {
      const largeMetadata = {
        array: new Array(100).fill({ key: 'value', number: 123 }),
        nested: {
          deep: {
            object: {
              with: {
                many: {
                  levels: 'test',
                },
              },
            },
          },
        },
      };

      const log = await AuditLogRepository.create({
        userId: testUser.id,
        phoneNumber: testUser.phoneNumber,
        userRole: testUser.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: 'Large metadata',
        metadata: largeMetadata,
      });

      const parsed = JSON.parse(log.metadata);
      expect(parsed.array).toHaveLength(100);
    });

    it('should handle concurrent log creation', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          AuditLogRepository.create({
            userId: testUser.id,
            phoneNumber: testUser.phoneNumber,
            userRole: testUser.role,
            action: AuditAction.CONFIG_UPDATE,
            category: AuditCategory.CONFIG,
            description: `Concurrent log ${i}`,
            metadata: {},
          })
        );
      }

      const logs = await Promise.all(promises);

      expect(logs).toHaveLength(10);
      logs.forEach(log => expect(log.id).toBeDefined());
    });
  });
});
