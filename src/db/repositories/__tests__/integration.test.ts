/**
 * Repository Integration Tests
 *
 * Purpose: Test repositories working together (user → conversation → usage flow)
 * Run: pnpm test src/db/repositories/__tests__/integration.test.ts
 */

import { UserRepository, UserRole } from '../user.repository';
import { ConversationRepository } from '../conversation.repository';
import { UsageRepository, OperationType } from '../usage.repository';
import { prisma } from '../../client';

describe('Repository Integration Tests', () => {
  /**
   * Clean up database before each test
   */
  beforeEach(async () => {
    // Clean up in correct order (respecting foreign keys)
    await prisma.usageMetric.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();
  });

  /**
   * Cleanup after all tests
   */
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================== #
  //          User → Conversation Flow              #
  // ============================================== #

  describe('User → Conversation Flow', () => {
    it('should create user and conversation, then add messages', async () => {
      // 1. Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      expect(user).toBeDefined();
      expect(user.phoneNumber).toBe('+1234567890');

      // 2. Create conversation
      const conversation = await ConversationRepository.findOrCreateForUser(
        user.id
      );

      expect(conversation).toBeDefined();
      expect(conversation.userId).toBe(user.id);
      expect(conversation.messages).toHaveLength(0);

      // 3. Add messages
      await ConversationRepository.addMessage(user.id, {
        role: 'user',
        content: 'Hello',
      });

      await ConversationRepository.addMessage(user.id, {
        role: 'assistant',
        content: 'Hi! How can I help you?',
      });

      // 4. Verify messages
      const messages = await ConversationRepository.getMessages(user.id);

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi! How can I help you?');
    });

    it('should maintain conversation context across messages', async () => {
      // Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      // Add multiple messages
      for (let i = 1; i <= 5; i++) {
        await ConversationRepository.addMessage(user.id, {
          role: 'user',
          content: `Message ${i}`,
        });
      }

      // Verify all messages are stored
      const messages = await ConversationRepository.getMessages(user.id);
      expect(messages).toHaveLength(5);
    });

    it('should delete conversations when user is deleted (cascade)', async () => {
      // Create user and conversation
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      await ConversationRepository.addMessage(user.id, {
        role: 'user',
        content: 'Test message',
      });

      // Verify conversation exists
      const conversationsBefore = await ConversationRepository.findByUserId(
        user.id
      );
      expect(conversationsBefore).toHaveLength(1);

      // Delete user
      await UserRepository.delete(user.id);

      // Verify conversations are deleted (cascade)
      const conversationsAfter = await ConversationRepository.findByUserId(
        user.id
      );
      expect(conversationsAfter).toHaveLength(0);
    });
  });

  // ============================================== #
  //          User → Usage Flow                     #
  // ============================================== #

  describe('User → Usage Flow', () => {
    it('should create user and track usage', async () => {
      // 1. Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      // 2. Track usage
      const usage = await UsageRepository.create({
        userId: user.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      expect(usage).toBeDefined();
      expect(usage.userId).toBe(user.id);

      // 3. Get user stats
      const stats = await UsageRepository.getUserStats(user.id, 7);

      expect(stats.userId).toBe(user.id);
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(150);
      expect(stats.totalCostMicros).toBe(2500);
    });

    it('should track multiple operations for a user', async () => {
      // Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      // Track different operations
      await UsageRepository.create({
        userId: user.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      await UsageRepository.create({
        userId: user.id,
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        costMicros: 5000,
        model: 'gpt-4o',
        operation: OperationType.VISION,
      });

      await UsageRepository.create({
        userId: user.id,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 1000,
        model: 'whisper-1',
        operation: OperationType.TRANSCRIPTION,
      });

      // Get stats
      const stats = await UsageRepository.getUserStats(user.id, 7);

      expect(stats.totalRequests).toBe(3);
      expect(stats.byOperation[OperationType.CHAT]).toBeDefined();
      expect(stats.byOperation[OperationType.VISION]).toBeDefined();
      expect(stats.byOperation[OperationType.TRANSCRIPTION]).toBeDefined();
    });

    it('should delete usage metrics when user is deleted (cascade)', async () => {
      // Create user and usage
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      await UsageRepository.create({
        userId: user.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Verify usage exists
      const usageBefore = await UsageRepository.findByUserId(user.id);
      expect(usageBefore).toHaveLength(1);

      // Delete user
      await UserRepository.delete(user.id);

      // Verify usage is deleted (cascade)
      const usageAfter = await UsageRepository.findByUserId(user.id);
      expect(usageAfter).toHaveLength(0);
    });
  });

  // ============================================== #
  //          Complete User Flow                    #
  // ============================================== #

  describe('Complete User Flow', () => {
    it('should handle complete user journey (conversation + usage)', async () => {
      // 1. User sends message (creates user if first time)
      const user = await UserRepository.findOrCreate('+1234567890');

      // 2. Add user message to conversation
      await ConversationRepository.addMessage(user.id, {
        role: 'user',
        content: 'What is the weather like?',
      });

      // 3. Track usage for processing the request
      await UsageRepository.create({
        userId: user.id,
        promptTokens: 20,
        completionTokens: 15,
        totalTokens: 35,
        costMicros: 500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // 4. Add assistant response
      await ConversationRepository.addMessage(user.id, {
        role: 'assistant',
        content: "I don't have access to real-time weather data.",
      });

      // 5. Verify conversation
      const messages = await ConversationRepository.getMessages(user.id);
      expect(messages).toHaveLength(2);

      // 6. Verify usage stats
      const stats = await UsageRepository.getUserStats(user.id, 7);
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(35);

      // 7. Verify user stats include both conversation and usage
      const userWithStats = await UserRepository.getUserWithStats(user.id);
      expect(userWithStats?._count.conversations).toBe(1);
      expect(userWithStats?._count.usageMetrics).toBe(1);
    });

    it('should handle multiple users with independent data', async () => {
      // Create two users
      const user1 = await UserRepository.create({
        phoneNumber: '+1111111111',
      });
      const user2 = await UserRepository.create({
        phoneNumber: '+2222222222',
      });

      // User 1: Add messages and usage
      await ConversationRepository.addMessage(user1.id, {
        role: 'user',
        content: 'User 1 message',
      });

      await UsageRepository.create({
        userId: user1.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // User 2: Add messages and usage
      await ConversationRepository.addMessage(user2.id, {
        role: 'user',
        content: 'User 2 message',
      });

      await UsageRepository.create({
        userId: user2.id,
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        costMicros: 5000,
        model: 'gpt-4o',
        operation: OperationType.VISION,
      });

      // Verify user 1 data
      const user1Messages = await ConversationRepository.getMessages(user1.id);
      expect(user1Messages).toHaveLength(1);
      expect(user1Messages[0].content).toBe('User 1 message');

      const user1Stats = await UsageRepository.getUserStats(user1.id, 7);
      expect(user1Stats.totalTokens).toBe(150);

      // Verify user 2 data
      const user2Messages = await ConversationRepository.getMessages(user2.id);
      expect(user2Messages).toHaveLength(1);
      expect(user2Messages[0].content).toBe('User 2 message');

      const user2Stats = await UsageRepository.getUserStats(user2.id, 7);
      expect(user2Stats.totalTokens).toBe(300);

      // Verify global stats
      const globalStats = await UsageRepository.getGlobalStats(7);
      expect(globalStats.uniqueUsers).toBe(2);
      expect(globalStats.totalRequests).toBe(2);
      expect(globalStats.totalTokens).toBe(450);
    });

    it('should handle admin user with elevated permissions', async () => {
      // Create admin user
      const admin = await UserRepository.create({
        phoneNumber: '+1234567890',
        role: UserRole.ADMIN,
      });

      // Verify admin status
      const isAdmin = await UserRepository.isAdmin(admin.id);
      expect(isAdmin).toBe(true);

      // Admin can access global stats
      const globalStats = await UsageRepository.getGlobalStats(7);
      expect(globalStats).toBeDefined();

      // Regular user
      const regularUser = await UserRepository.create({
        phoneNumber: '+9876543210',
      });

      const isRegularUserAdmin = await UserRepository.isAdmin(regularUser.id);
      expect(isRegularUserAdmin).toBe(false);
    });
  });

  // ============================================== #
  //          Data Retention & Cleanup              #
  // ============================================== #

  describe('Data Retention & Cleanup', () => {
    it('should clean up expired conversations', async () => {
      // Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      // Create conversation that expires immediately
      const expiredConversation = await ConversationRepository.create({
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      // Create active conversation
      const activeConversation = await ConversationRepository.create({
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
      });

      // Clean up expired conversations
      const deletedCount = await ConversationRepository.deleteExpired();
      expect(deletedCount).toBe(1);

      // Verify only active conversation remains
      const remaining = await ConversationRepository.findByUserId(user.id, {
        includeExpired: true,
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(activeConversation.id);
    });

    it('should clean up old usage metrics', async () => {
      // Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      // Create usage metric
      await UsageRepository.create({
        userId: user.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Delete metrics older than 90 days (should delete 0 since metric is recent)
      const deletedCount = await UsageRepository.deleteOlderThan(90);
      expect(deletedCount).toBe(0);

      // Verify metric still exists
      const metrics = await UsageRepository.findByUserId(user.id);
      expect(metrics).toHaveLength(1);
    });

    it('should handle user data export (GDPR compliance)', async () => {
      // Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
        isWhitelisted: true,
      });

      // Add conversation
      await ConversationRepository.addMessage(user.id, {
        role: 'user',
        content: 'My message',
      });

      // Add usage
      await UsageRepository.create({
        userId: user.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Export user data
      const userData = await UserRepository.findById(user.id);
      const userStats = await UserRepository.getUserWithStats(user.id);
      const conversations = await ConversationRepository.findByUserId(user.id);
      const usage = await UsageRepository.findByUserId(user.id);

      expect(userData).toBeDefined();
      expect(userStats?._count.conversations).toBe(1);
      expect(userStats?._count.usageMetrics).toBe(1);
      expect(conversations).toHaveLength(1);
      expect(usage).toHaveLength(1);
    });

    it('should handle user data deletion (right to be forgotten)', async () => {
      // Create user with data
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      await ConversationRepository.addMessage(user.id, {
        role: 'user',
        content: 'Message',
      });

      await UsageRepository.create({
        userId: user.id,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 2500,
        model: 'gpt-4o',
        operation: OperationType.CHAT,
      });

      // Delete all user data
      await UserRepository.delete(user.id);

      // Verify all data is deleted (cascade)
      const userData = await UserRepository.findById(user.id);
      const conversations = await ConversationRepository.findByUserId(user.id);
      const usage = await UsageRepository.findByUserId(user.id);

      expect(userData).toBeNull();
      expect(conversations).toHaveLength(0);
      expect(usage).toHaveLength(0);
    });
  });

  // ============================================== #
  //          Performance & Scale                   #
  // ============================================== #

  describe('Performance & Scale', () => {
    it('should handle bulk operations efficiently', async () => {
      // Create multiple users
      const users = await Promise.all([
        UserRepository.create({ phoneNumber: '+1111111111' }),
        UserRepository.create({ phoneNumber: '+2222222222' }),
        UserRepository.create({ phoneNumber: '+3333333333' }),
      ]);

      // Add conversations for each user
      await Promise.all(
        users.map((user) =>
          ConversationRepository.addMessage(user.id, {
            role: 'user',
            content: 'Test',
          })
        )
      );

      // Add usage for each user
      await Promise.all(
        users.map((user) =>
          UsageRepository.create({
            userId: user.id,
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            costMicros: 2500,
            model: 'gpt-4o',
            operation: OperationType.CHAT,
          })
        )
      );

      // Verify data
      const userCount = await UserRepository.count();
      const conversationCount = await ConversationRepository.count();
      const usageCount = await UsageRepository.count();

      expect(userCount).toBe(3);
      expect(conversationCount).toBe(3);
      expect(usageCount).toBe(3);
    });

    it('should handle pagination for large datasets', async () => {
      // Create user
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
      });

      // Create 25 usage metrics
      for (let i = 0; i < 25; i++) {
        await UsageRepository.create({
          userId: user.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });
      }

      // Paginate through results
      const page1 = await UsageRepository.findByUserId(user.id, { take: 10 });
      const page2 = await UsageRepository.findByUserId(user.id, {
        skip: 10,
        take: 10,
      });
      const page3 = await UsageRepository.findByUserId(user.id, {
        skip: 20,
        take: 10,
      });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      expect(page3).toHaveLength(5);

      // Verify total
      const total = await UsageRepository.count({ userId: user.id });
      expect(total).toBe(25);
    });
  });
});
