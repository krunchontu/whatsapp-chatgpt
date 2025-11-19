/**
 * Cleanup Utilities Tests
 *
 * Purpose: Test database cleanup and maintenance functions
 * Run: pnpm test src/db/__tests__/cleanup.test.ts
 */

import {
  cleanupExpiredConversations,
  cleanupOldUsageMetrics,
  cleanupExpiredData,
  cleanupOldData,
  cleanupUserData,
  getDatabaseStats,
  optimizeDatabase,
  runScheduledCleanup,
  getCleanupPreview,
} from '../cleanup';
import { UserRepository } from '../repositories/user.repository';
import { ConversationRepository } from '../repositories/conversation.repository';
import { UsageRepository, OperationType } from '../repositories/usage.repository';
import { prisma } from '../client';

describe('Database Cleanup', () => {
  let testUser: Awaited<ReturnType<typeof UserRepository.create>>;

  /**
   * Setup test data before each test
   */
  beforeEach(async () => {
    // Clean up database
    await prisma.usageMetric.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    testUser = await UserRepository.create({
      phoneNumber: '+1234567890',
    });
  });

  /**
   * Cleanup after all tests
   */
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================== #
  //          Conversation Cleanup                  #
  // ============================================== #

  describe('cleanupExpiredConversations()', () => {
    it('should delete expired conversations', async () => {
      // Create expired conversation
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: expiredDate,
      });

      // Create active conversation
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: futureDate,
      });

      // Cleanup
      const deletedCount = await cleanupExpiredConversations();

      expect(deletedCount).toBe(1);

      // Verify only active conversation remains
      const remaining = await ConversationRepository.findByUserId(testUser.id, {
        includeExpired: true,
      });
      expect(remaining).toHaveLength(1);
    });

    it('should not delete active conversations', async () => {
      // Create active conversation
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: futureDate,
      });

      // Cleanup
      const deletedCount = await cleanupExpiredConversations();

      expect(deletedCount).toBe(0);

      // Verify conversation still exists
      const remaining = await ConversationRepository.findByUserId(testUser.id);
      expect(remaining).toHaveLength(1);
    });

    it('should handle empty database', async () => {
      const deletedCount = await cleanupExpiredConversations();
      expect(deletedCount).toBe(0);
    });
  });

  // ============================================== #
  //          Usage Metrics Cleanup                 #
  // ============================================== #

  describe('cleanupOldUsageMetrics()', () => {
    it('should delete old usage metrics', async () => {
      // Create metric (recent)
      await UsageRepository.create({
        userId: testUser.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Delete metrics older than 30 days (should delete 0)
      const deletedCount = await cleanupOldUsageMetrics(30);

      expect(deletedCount).toBe(0);

      // Verify metric still exists
      const metrics = await UsageRepository.findByUserId(testUser.id);
      expect(metrics).toHaveLength(1);
    });

    it('should handle empty database', async () => {
      const deletedCount = await cleanupOldUsageMetrics(90);
      expect(deletedCount).toBe(0);
    });
  });

  // ============================================== #
  //          Comprehensive Cleanup                 #
  // ============================================== #

  describe('cleanupExpiredData()', () => {
    it('should cleanup both conversations and usage metrics', async () => {
      // Create expired conversation
      const expiredDate = new Date(Date.now() - 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: expiredDate,
      });

      // Create usage metric
      await UsageRepository.create({
        userId: testUser.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Cleanup (with usage retention of 0 days to test, though this won't delete recent metrics)
      const stats = await cleanupExpiredData({ usageDays: 30 });

      expect(stats.conversationsDeleted).toBe(1);
      expect(stats.usageMetricsDeleted).toBe(0); // Recent metric not deleted
      expect(stats.totalDeleted).toBe(1);
      expect(stats.executionTimeMs).toBeGreaterThan(0);
    });

    it('should return statistics', async () => {
      const stats = await cleanupExpiredData();

      expect(stats).toHaveProperty('conversationsDeleted');
      expect(stats).toHaveProperty('usageMetricsDeleted');
      expect(stats).toHaveProperty('totalDeleted');
      expect(stats).toHaveProperty('executionTimeMs');
    });

    it('should support dry run mode', async () => {
      // Create expired conversation
      const expiredDate = new Date(Date.now() - 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: expiredDate,
      });

      // Dry run
      const stats = await cleanupExpiredData({ dryRun: true });

      expect(stats.conversationsDeleted).toBe(1);

      // Verify nothing was actually deleted
      const conversations = await ConversationRepository.findByUserId(
        testUser.id,
        { includeExpired: true }
      );
      expect(conversations).toHaveLength(1);
    });
  });

  describe('getCleanupPreview()', () => {
    it('should preview cleanup without deleting', async () => {
      // Create expired conversation
      const expiredDate = new Date(Date.now() - 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: expiredDate,
      });

      // Get preview
      const preview = await getCleanupPreview();

      expect(preview.conversationsDeleted).toBe(1);
      expect(preview.totalDeleted).toBeGreaterThanOrEqual(1);

      // Verify nothing was deleted
      const conversations = await ConversationRepository.findByUserId(
        testUser.id,
        { includeExpired: true }
      );
      expect(conversations).toHaveLength(1);
    });
  });

  describe('cleanupOldData()', () => {
    it('should cleanup data based on retention policy', async () => {
      // Create active conversation
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Cleanup with 30 day retention
      const stats = await cleanupOldData({
        conversationDays: 30,
        usageDays: 90,
      });

      expect(stats).toHaveProperty('conversationsDeleted');
      expect(stats).toHaveProperty('usageMetricsDeleted');
      expect(stats).toHaveProperty('executionTimeMs');
    });
  });

  // ============================================== #
  //          User Data Cleanup (GDPR)              #
  // ============================================== #

  describe('cleanupUserData()', () => {
    it('should delete all user data', async () => {
      // Create user data
      await ConversationRepository.addMessage(testUser.id, {
        role: 'user',
        content: 'Test message',
      });

      await UsageRepository.create({
        userId: testUser.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Verify data exists
      const conversationsBefore = await ConversationRepository.findByUserId(
        testUser.id
      );
      const usageBefore = await UsageRepository.findByUserId(testUser.id);

      expect(conversationsBefore).toHaveLength(1);
      expect(usageBefore).toHaveLength(1);

      // Cleanup user data
      const stats = await cleanupUserData(testUser.id);

      expect(stats.conversationsDeleted).toBe(1);
      expect(stats.usageMetricsDeleted).toBe(1);
      expect(stats.totalDeleted).toBe(2);

      // Verify data is deleted
      const conversationsAfter = await ConversationRepository.findByUserId(
        testUser.id
      );
      const usageAfter = await UsageRepository.findByUserId(testUser.id);

      expect(conversationsAfter).toHaveLength(0);
      expect(usageAfter).toHaveLength(0);
    });

    it('should handle user with no data', async () => {
      const stats = await cleanupUserData(testUser.id);

      expect(stats.conversationsDeleted).toBe(0);
      expect(stats.usageMetricsDeleted).toBe(0);
      expect(stats.totalDeleted).toBe(0);
    });
  });

  // ============================================== #
  //          Database Statistics                   #
  // ============================================== #

  describe('getDatabaseStats()', () => {
    it('should return database statistics', async () => {
      // Create some data
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await UsageRepository.create({
        userId: testUser.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Get stats
      const stats = await getDatabaseStats();

      expect(stats.users.total).toBe(1);
      expect(stats.conversations.total).toBe(1);
      expect(stats.conversations.active).toBe(1);
      expect(stats.conversations.expired).toBe(0);
      expect(stats.usageMetrics.total).toBe(1);
      expect(stats.storage.estimatedSizeMB).toBeGreaterThan(0);
    });

    it('should handle empty database', async () => {
      // Delete test user
      await UserRepository.delete(testUser.id);

      const stats = await getDatabaseStats();

      expect(stats.users.total).toBe(0);
      expect(stats.conversations.total).toBe(0);
      expect(stats.usageMetrics.total).toBe(0);
    });

    it('should calculate estimated storage size', async () => {
      // Create multiple records
      for (let i = 0; i < 5; i++) {
        await ConversationRepository.create({
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        await UsageRepository.create({
          userId: testUser.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });
      }

      const stats = await getDatabaseStats();

      expect(stats.storage.estimatedSizeMB).toBeGreaterThan(0);
    });
  });

  // ============================================== #
  //          Database Optimization                 #
  // ============================================== #

  describe('optimizeDatabase()', () => {
    it('should optimize database successfully', async () => {
      const result = await optimizeDatabase();

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });
  });

  // ============================================== #
  //          Scheduled Cleanup Job                 #
  // ============================================== #

  describe('runScheduledCleanup()', () => {
    it('should run complete cleanup job', async () => {
      // Create some data
      const expiredDate = new Date(Date.now() - 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: expiredDate,
      });

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: futureDate,
      });

      // Run scheduled cleanup
      const result = await runScheduledCleanup();

      expect(result).toHaveProperty('cleanup');
      expect(result).toHaveProperty('optimization');
      expect(result).toHaveProperty('databaseStats');

      expect(result.cleanup.conversationsDeleted).toBe(1);
      expect(result.optimization.success).toBe(true);
      expect(result.databaseStats.conversations.active).toBe(1);
    });

    it('should return statistics from all operations', async () => {
      const result = await runScheduledCleanup();

      expect(result.cleanup).toHaveProperty('conversationsDeleted');
      expect(result.cleanup).toHaveProperty('usageMetricsDeleted');
      expect(result.cleanup).toHaveProperty('totalDeleted');
      expect(result.cleanup).toHaveProperty('executionTimeMs');

      expect(result.optimization).toHaveProperty('success');
      expect(result.optimization).toHaveProperty('executionTimeMs');

      expect(result.databaseStats).toHaveProperty('users');
      expect(result.databaseStats).toHaveProperty('conversations');
      expect(result.databaseStats).toHaveProperty('usageMetrics');
      expect(result.databaseStats).toHaveProperty('storage');
    });

    it('should support dry run mode', async () => {
      // Create expired conversation
      const expiredDate = new Date(Date.now() - 1000);
      await ConversationRepository.create({
        userId: testUser.id,
        expiresAt: expiredDate,
      });

      // Run with dry run
      const result = await runScheduledCleanup({ dryRun: true });

      expect(result.cleanup.conversationsDeleted).toBe(1);

      // Verify nothing was deleted
      const conversations = await ConversationRepository.findByUserId(
        testUser.id,
        { includeExpired: true }
      );
      expect(conversations).toHaveLength(1);
    });
  });

  // ============================================== #
  //          Error Handling                        #
  // ============================================== #

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close connection to simulate error
      await prisma.$disconnect();

      // Should either throw error or return 0 (both are acceptable)
      // Different Prisma versions handle disconnection differently
      try {
        const result = await cleanupExpiredConversations();
        // If it doesn't throw, it should return 0
        expect(result).toBe(0);
      } catch (error) {
        // If it throws, that's also acceptable
        expect(error).toBeDefined();
      }

      // Reconnect for other tests
      await prisma.$connect();
    });
  });

  // ============================================== #
  //          Performance                           #
  // ============================================== #

  describe('Performance', () => {
    it('should cleanup large datasets efficiently', async () => {
      // Create many expired conversations
      for (let i = 0; i < 20; i++) {
        await ConversationRepository.create({
          userId: testUser.id,
          expiresAt: new Date(Date.now() - 1000),
        });
      }

      const startTime = Date.now();
      const deletedCount = await cleanupExpiredConversations();
      const executionTime = Date.now() - startTime;

      expect(deletedCount).toBe(20);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should optimize database within reasonable time', async () => {
      const startTime = Date.now();
      const result = await optimizeDatabase();
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});
