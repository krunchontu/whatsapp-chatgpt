/**
 * Conversation Repository Tests
 *
 * Purpose: Test conversation management, message handling, and TTL functionality
 * Run: pnpm test src/db/repositories/__tests__/conversation.repository.test.ts
 */

import { ConversationRepository, MessageRole } from '../conversation.repository';
import { UserRepository } from '../user.repository';
import { prisma } from '../../client';
import type { ChatMessage } from '../conversation.repository';

describe('ConversationRepository', () => {
  let testUserId: string;

  /**
   * Setup: Create test user before each test
   */
  beforeEach(async () => {
    // Clean up
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const user = await UserRepository.create({
      phoneNumber: '+1234567890',
    });
    testUserId = user.id;
  });

  /**
   * Cleanup after all tests
   */
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================== #
  //              CRUD Operations                   #
  // ============================================== #

  describe('CRUD Operations', () => {
    describe('create()', () => {
      it('should create a new conversation with default TTL', async () => {
        const conversation = await ConversationRepository.create({
          userId: testUserId,
        });

        expect(conversation).toBeDefined();
        expect(conversation.id).toBeDefined();
        expect(conversation.userId).toBe(testUserId);
        expect(conversation.messages).toEqual([]);
        expect(conversation.messageCount).toBe(0);
        expect(conversation.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });

      it('should create conversation with custom expiry', async () => {
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        const conversation = await ConversationRepository.create({
          userId: testUserId,
          expiresAt,
        });

        expect(conversation.expiresAt.getTime()).toBeCloseTo(
          expiresAt.getTime(),
          -2
        );
      });

      it('should create conversation with initial messages', async () => {
        const messages: ChatMessage[] = [
          {
            role: MessageRole.USER,
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ];

        const conversation = await ConversationRepository.create({
          userId: testUserId,
          messages,
        });

        expect(conversation.messages).toHaveLength(1);
        expect(conversation.messageCount).toBe(1);
        expect(conversation.messages[0].content).toBe('Hello');
      });
    });

    describe('findById()', () => {
      it('should find conversation by ID', async () => {
        const created = await ConversationRepository.create({
          userId: testUserId,
        });

        const found = await ConversationRepository.findById(created.id);

        expect(found).toBeDefined();
        expect(found?.id).toBe(created.id);
        expect(found?.messages).toEqual([]);
      });

      it('should return null for non-existent ID', async () => {
        const found = await ConversationRepository.findById('non-existent-id');
        expect(found).toBeNull();
      });
    });

    describe('findActiveByUserId()', () => {
      it('should find active conversation for user', async () => {
        const created = await ConversationRepository.create({
          userId: testUserId,
        });

        const found = await ConversationRepository.findActiveByUserId(
          testUserId
        );

        expect(found).toBeDefined();
        expect(found?.id).toBe(created.id);
      });

      it('should return null for expired conversations', async () => {
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000), // Expired
        });

        const found = await ConversationRepository.findActiveByUserId(
          testUserId
        );

        expect(found).toBeNull();
      });

      it('should return most recent active conversation', async () => {
        await ConversationRepository.create({ userId: testUserId });

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));

        const newer = await ConversationRepository.create({ userId: testUserId });

        const found = await ConversationRepository.findActiveByUserId(
          testUserId
        );

        expect(found?.id).toBe(newer.id);
      });
    });

    describe('findOrCreateForUser()', () => {
      it('should return existing active conversation', async () => {
        const existing = await ConversationRepository.create({
          userId: testUserId,
        });

        const found = await ConversationRepository.findOrCreateForUser(
          testUserId
        );

        expect(found.id).toBe(existing.id);
      });

      it('should create new conversation if none exists', async () => {
        const conversation = await ConversationRepository.findOrCreateForUser(
          testUserId
        );

        expect(conversation).toBeDefined();
        expect(conversation.userId).toBe(testUserId);
      });

      it('should create new conversation if all are expired', async () => {
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        });

        const conversation = await ConversationRepository.findOrCreateForUser(
          testUserId
        );

        expect(conversation).toBeDefined();
        expect(conversation.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });
    });

    describe('findByUserId()', () => {
      it('should return all active conversations for user', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({ userId: testUserId });

        const conversations = await ConversationRepository.findByUserId(
          testUserId
        );

        expect(conversations).toHaveLength(2);
      });

      it('should exclude expired conversations by default', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        });

        const conversations = await ConversationRepository.findByUserId(
          testUserId
        );

        expect(conversations).toHaveLength(1);
      });

      it('should include expired conversations when requested', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        });

        const conversations = await ConversationRepository.findByUserId(
          testUserId,
          { includeExpired: true }
        );

        expect(conversations).toHaveLength(2);
      });

      it('should support pagination', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({ userId: testUserId });

        const page1 = await ConversationRepository.findByUserId(testUserId, {
          take: 2,
        });
        expect(page1).toHaveLength(2);

        const page2 = await ConversationRepository.findByUserId(testUserId, {
          skip: 2,
          take: 2,
        });
        expect(page2).toHaveLength(1);
      });
    });

    describe('delete()', () => {
      it('should delete conversation', async () => {
        const conversation = await ConversationRepository.create({
          userId: testUserId,
        });

        await ConversationRepository.delete(conversation.id);

        const found = await ConversationRepository.findById(conversation.id);
        expect(found).toBeNull();
      });
    });

    describe('deleteByUserId()', () => {
      it('should delete all conversations for user', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({ userId: testUserId });

        const count = await ConversationRepository.deleteByUserId(testUserId);

        expect(count).toBe(2);

        const remaining = await ConversationRepository.findByUserId(
          testUserId,
          { includeExpired: true }
        );
        expect(remaining).toHaveLength(0);
      });
    });
  });

  // ============================================== #
  //          Message Management                    #
  // ============================================== #

  describe('Message Management', () => {
    describe('addMessage()', () => {
      it('should add message to existing conversation', async () => {
        await ConversationRepository.create({ userId: testUserId });

        const updated = await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Hello',
        });

        expect(updated.messages).toHaveLength(1);
        expect(updated.messages[0].content).toBe('Hello');
        expect(updated.messages[0].role).toBe(MessageRole.USER);
        expect(updated.messages[0].timestamp).toBeDefined();
        expect(updated.messageCount).toBe(1);
      });

      it('should create conversation if none exists', async () => {
        const updated = await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Hello',
        });

        expect(updated).toBeDefined();
        expect(updated.messages).toHaveLength(1);
      });

      it('should append multiple messages in order', async () => {
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'First',
        });

        const updated = await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.ASSISTANT,
          content: 'Second',
        });

        expect(updated.messages).toHaveLength(2);
        expect(updated.messages[0].content).toBe('First');
        expect(updated.messages[1].content).toBe('Second');
      });

      it('should trim messages to MAX_MESSAGES limit', async () => {
        // Add more than MAX_MESSAGES (10)
        for (let i = 0; i < 15; i++) {
          await ConversationRepository.addMessage(testUserId, {
            role: MessageRole.USER,
            content: `Message ${i}`,
          });
        }

        const conversation = await ConversationRepository.findActiveByUserId(
          testUserId
        );

        expect(conversation?.messages).toHaveLength(
          ConversationRepository.MAX_MESSAGES
        );
        expect(conversation?.messages[0].content).toBe('Message 5'); // First 5 trimmed
        expect(conversation?.messages[9].content).toBe('Message 14'); // Last message
      });
    });

    describe('getMessages()', () => {
      it('should return messages from active conversation', async () => {
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Hello',
        });

        const messages = await ConversationRepository.getMessages(testUserId);

        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe('Hello');
      });

      it('should return empty array if no active conversation', async () => {
        const messages = await ConversationRepository.getMessages(testUserId);
        expect(messages).toEqual([]);
      });
    });

    describe('getLastMessages()', () => {
      it('should return last N messages', async () => {
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'First',
        });
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Second',
        });
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Third',
        });

        const last2 = await ConversationRepository.getLastMessages(
          testUserId,
          2
        );

        expect(last2).toHaveLength(2);
        expect(last2[0].content).toBe('Second');
        expect(last2[1].content).toBe('Third');
      });
    });

    describe('clearHistory()', () => {
      it('should expire current conversation and create new one', async () => {
        const old = await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Old message',
        });

        const newConv = await ConversationRepository.clearHistory(testUserId);

        expect(newConv.id).not.toBe(old.id);
        expect(newConv.messages).toEqual([]);

        // Old conversation should be expired
        const oldFound = await ConversationRepository.findById(old.id);
        expect(oldFound?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      });
    });

    describe('getContext()', () => {
      it('should return messages in OpenAI format', async () => {
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Hello',
        });
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.ASSISTANT,
          content: 'Hi there',
        });

        const context = await ConversationRepository.getContext(testUserId);

        expect(context).toHaveLength(2);
        expect(context[0]).toEqual({ role: 'user', content: 'Hello' });
        expect(context[1]).toEqual({ role: 'assistant', content: 'Hi there' });
      });

      it('should return empty array if no conversation', async () => {
        const context = await ConversationRepository.getContext(testUserId);
        expect(context).toEqual([]);
      });
    });
  });

  // ============================================== #
  //          TTL & Cleanup                         #
  // ============================================== #

  describe('TTL & Cleanup', () => {
    describe('extendExpiry()', () => {
      it('should extend conversation expiry', async () => {
        const conversation = await ConversationRepository.create({
          userId: testUserId,
        });

        const extended = await ConversationRepository.extendExpiry(
          conversation.id,
          14
        );

        const expectedExpiry =
          Date.now() + 14 * 24 * 60 * 60 * 1000;
        expect(extended.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
      });
    });

    describe('deleteExpired()', () => {
      it('should delete only expired conversations', async () => {
        // Create active conversation
        await ConversationRepository.create({ userId: testUserId });

        // Create expired conversation
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        });

        const deletedCount = await ConversationRepository.deleteExpired();

        expect(deletedCount).toBe(1);

        const remaining = await ConversationRepository.findByUserId(
          testUserId
        );
        expect(remaining).toHaveLength(1);
      });

      it('should return 0 if no expired conversations', async () => {
        await ConversationRepository.create({ userId: testUserId });

        const deletedCount = await ConversationRepository.deleteExpired();
        expect(deletedCount).toBe(0);
      });
    });

    describe('countExpired()', () => {
      it('should count expired conversations', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        });
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 2000),
        });

        const count = await ConversationRepository.countExpired();
        expect(count).toBe(2);
      });
    });

    describe('findExpiringSoon()', () => {
      it('should find conversations expiring within timeframe', async () => {
        // Expires in 12 hours
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        });

        // Expires in 2 days
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        });

        const expiringSoon = await ConversationRepository.findExpiringSoon(1);

        expect(expiringSoon).toHaveLength(1);
      });
    });
  });

  // ============================================== #
  //          Statistics & Analytics                #
  // ============================================== #

  describe('Statistics', () => {
    describe('count()', () => {
      it('should count all conversations', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({ userId: testUserId });

        const count = await ConversationRepository.count();
        expect(count).toBe(2);
      });

      it('should count only active conversations when requested', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.create({
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        });

        const count = await ConversationRepository.count(true);
        expect(count).toBe(1);
      });
    });

    describe('getUserStats()', () => {
      it('should return conversation statistics for user', async () => {
        await ConversationRepository.create({ userId: testUserId });
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.USER,
          content: 'Hello',
        });
        await ConversationRepository.addMessage(testUserId, {
          role: MessageRole.ASSISTANT,
          content: 'Hi',
        });

        const stats = await ConversationRepository.getUserStats(testUserId);

        expect(stats.totalConversations).toBeGreaterThan(0);
        expect(stats.activeConversations).toBeGreaterThan(0);
        expect(stats.totalMessages).toBeGreaterThan(0);
      });
    });
  });

  // ============================================== #
  //          Helper Methods                        #
  // ============================================== #

  describe('Helper Methods', () => {
    describe('isValidRole()', () => {
      it('should validate message roles', () => {
        expect(ConversationRepository.isValidRole('user')).toBe(true);
        expect(ConversationRepository.isValidRole('assistant')).toBe(true);
        expect(ConversationRepository.isValidRole('system')).toBe(true);
        expect(ConversationRepository.isValidRole('invalid')).toBe(false);
      });
    });
  });
});
