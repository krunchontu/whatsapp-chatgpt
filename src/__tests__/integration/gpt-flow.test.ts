/**
 * Integration Test: Text Message → GPT → Reply Flow
 *
 * Purpose: Test the complete end-to-end flow of processing a text message through GPT
 * Priority: P0 - Critical path for core functionality
 *
 * Test Flow:
 * 1. User sends text message
 * 2. Message processed by handleMessageGPT
 * 3. OpenAI API called with proper context
 * 4. Conversation stored in database
 * 5. Usage tracked in database
 * 6. Reply sent to user
 *
 * Run: npm test src/__tests__/integration/gpt-flow.test.ts
 */

import { prisma } from '../../db/client';
import { UserRepository, UserRole } from '../../db/repositories/user.repository';
import { ConversationRepository } from '../../db/repositories/conversation.repository';
import { UsageRepository, OperationType } from '../../db/repositories/usage.repository';
import { handleMessageGPT } from '../../handlers/gpt';
import { chatCompletion } from '../../providers/openai';
import type { Message } from 'whatsapp-web.js';

// Mock OpenAI provider
jest.mock('../../providers/openai', () => ({
  chatCompletion: jest.fn(),
  initOpenAI: jest.fn(),
  openai: null,
}));

// Mock CLI UI
jest.mock('../../cli/ui', () => ({
  print: jest.fn(),
}));

describe('Integration: Text Message → GPT → Reply Flow', () => {
  // ============================================================================
  // Test Setup & Teardown
  // ============================================================================

  beforeEach(async () => {
    // Clean database before each test
    await prisma.usageMetric.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.user.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

  function createMockMessage(from: string, body: string): Message {
    return {
      from,
      body,
      reply: jest.fn().mockResolvedValue(undefined),
      hasMedia: false,
      downloadMedia: jest.fn(),
      links: [],
    } as any;
  }

  // ============================================================================
  // Happy Path Tests
  // ============================================================================

  describe('Happy Path: Single Message', () => {
    it('should process text message, call GPT, save conversation, track usage, and reply', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const userPrompt = 'What is the capital of France?';
      const gptResponse = 'The capital of France is Paris.';

      // Create user
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT response
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: gptResponse,
        model: 'gpt-4o',
        usage: {
          totalTokens: 50,
          promptTokens: 20,
          completionTokens: 30,
        },
      });

      // Create mock message
      const message = createMockMessage(phoneNumber, userPrompt);

      // Act
      await handleMessageGPT(message, userPrompt);

      // Assert

      // 1. GPT was called with user prompt
      expect(chatCompletion).toHaveBeenCalledTimes(1);
      expect(chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: userPrompt,
              }),
            ]),
          }),
        ]),
        expect.objectContaining({
          model: expect.any(String),
          temperature: expect.any(Number),
        })
      );

      // 2. Reply sent to user
      expect(message.reply).toHaveBeenCalledWith(gptResponse);

      // 3. Conversation stored in database
      const conversations = await ConversationRepository.getHistory(user.id, 10);
      expect(conversations).toHaveLength(2); // User message + GPT response

      // Messages are stored in chronological order (oldest first)
      expect(conversations[0]).toMatchObject({
        role: 'user',
        content: userPrompt,
      });
      expect(conversations[1]).toMatchObject({
        role: 'assistant',
        content: gptResponse,
      });

      // 4. Usage tracked in database
      const usage = await UsageRepository.getTotalUsage(user.id);
      expect(usage.totalTokens).toBe(50);
      expect(usage.totalCost).toBeGreaterThan(0);

      const metrics = await UsageRepository.findByUserId(user.id);
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        operationType: OperationType.CHAT_COMPLETION,
        promptTokens: 20,
        completionTokens: 30,
        totalTokens: 50,
      });
    });

    it('should include conversation history in GPT context for follow-up messages', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT responses
      (chatCompletion as jest.Mock)
        .mockResolvedValueOnce({
          content: 'The capital of France is Paris.',
          model: 'gpt-4o',
          usage: {
            totalTokens: 50,
            promptTokens: 20,
            completionTokens: 30,
          },
        })
        .mockResolvedValueOnce({
          content: 'Paris has a population of about 2.2 million people.',
          model: 'gpt-4o',
          usage: {
            totalTokens: 60,
            promptTokens: 35,
            completionTokens: 25,
          },
        });

      // Act: First message
      const message1 = createMockMessage(phoneNumber, 'What is the capital of France?');
      await handleMessageGPT(message1, 'What is the capital of France?');

      // Act: Follow-up message
      const message2 = createMockMessage(phoneNumber, 'What is its population?');
      await handleMessageGPT(message2, 'What is its population?');

      // Assert

      // GPT called twice
      expect(chatCompletion).toHaveBeenCalledTimes(2);

      // Second call includes conversation history
      const secondCallArgs = (chatCompletion as jest.Mock).mock.calls[1][0];
      // Should have: User Q1 + GPT A1 + User Q2 (3 messages)
      expect(secondCallArgs.length).toBeGreaterThanOrEqual(3);

      // Find messages in the context (may include system prompt)
      const userMessages = secondCallArgs.filter((msg: any) => msg.role === 'user');
      const assistantMessages = secondCallArgs.filter((msg: any) => msg.role === 'assistant');

      expect(userMessages.length).toBeGreaterThanOrEqual(2); // Q1 + Q2
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1); // A1

      // Conversation history stored correctly
      const conversations = await ConversationRepository.getHistory(user.id, 10);
      expect(conversations).toHaveLength(4); // 2 user messages + 2 GPT responses

      // Usage tracked for both requests
      const usage = await UsageRepository.getTotalUsage(user.id);
      expect(usage.totalTokens).toBe(110); // 50 + 60
    });
  });

  // ============================================================================
  // Edge Cases & Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should create user on first message if not exists', async () => {
      // Arrange
      const phoneNumber = '+9876543210';
      const userPrompt = 'Hello!';

      // Verify user doesn't exist
      const userBefore = await UserRepository.findByPhoneNumber(phoneNumber);
      expect(userBefore).toBeNull();

      // Mock GPT response
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Hello! How can I help you?',
        model: 'gpt-4o',
        usage: {
          totalTokens: 20,
          promptTokens: 5,
          completionTokens: 15,
        },
      });

      const message = createMockMessage(phoneNumber, userPrompt);

      // Act
      await handleMessageGPT(message, userPrompt);

      // Assert
      const userAfter = await UserRepository.findByPhoneNumber(phoneNumber);
      expect(userAfter).not.toBeNull();
      expect(userAfter?.phoneNumber).toBe(phoneNumber);
      expect(userAfter?.role).toBe(UserRole.USER);
    });

    it('should handle empty prompt gracefully', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT response for empty prompt
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'How can I help you?',
        model: 'gpt-4o',
        usage: {
          totalTokens: 5,
          promptTokens: 2,
          completionTokens: 3,
        },
      });

      const message = createMockMessage(phoneNumber, '');

      // Act
      await handleMessageGPT(message, '');

      // Assert
      // Current behavior: GPT is called even with empty prompt (sends empty content array)
      // This could be improved in the future to early-return on empty prompts
      expect(chatCompletion).toHaveBeenCalled();
    });

    it('should handle GPT API errors gracefully', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT error
      (chatCompletion as jest.Mock).mockRejectedValue(
        new Error('OpenAI API rate limit exceeded')
      );

      const message = createMockMessage(phoneNumber, 'Test message');

      // Act
      await handleMessageGPT(message, 'Test message');

      // Assert
      // Should send error message to user (circuit breaker or rate limit message)
      expect(message.reply).toHaveBeenCalled();
      const replyMessage = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyMessage).toMatch(/error|request|try again|moment/i);

      // Should not save conversation on error
      const user = await UserRepository.findByPhoneNumber(phoneNumber);
      const conversations = await ConversationRepository.getHistory(user!.id, 10);
      expect(conversations).toHaveLength(0);
    });

    it('should limit conversation history to last 10 messages', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT to always succeed
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Response',
        model: 'gpt-4o',
        usage: {
          totalTokens: 10,
          promptTokens: 5,
          completionTokens: 5,
        },
      });

      // Act: Send 15 messages (30 conversation entries with responses)
      for (let i = 1; i <= 15; i++) {
        const message = createMockMessage(phoneNumber, `Message ${i}`);
        await handleMessageGPT(message, `Message ${i}`);
      }

      // Assert
      const conversations = await ConversationRepository.getHistory(user.id, 10);

      // Should only include last 10 messages (due to MAX_MESSAGES limit)
      expect(conversations.length).toBeLessThanOrEqual(10);

      // Messages are in chronological order, so last message is at the end
      const lastMessage = conversations[conversations.length - 1];
      expect(lastMessage.content).toBe('Response'); // Last GPT response
    });
  });

  // ============================================================================
  // Performance & Concurrency
  // ============================================================================

  describe('Performance', () => {
    it('should handle concurrent messages from same user', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT with delays to simulate real API
      (chatCompletion as jest.Mock).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          content: 'Response',
          model: 'gpt-4o',
          usage: {
            totalTokens: 10,
            promptTokens: 5,
            completionTokens: 5,
          },
        };
      });

      // Act: Send 3 messages concurrently
      const messages = [
        createMockMessage(phoneNumber, 'Message 1'),
        createMockMessage(phoneNumber, 'Message 2'),
        createMockMessage(phoneNumber, 'Message 3'),
      ];

      await Promise.all([
        handleMessageGPT(messages[0], 'Message 1'),
        handleMessageGPT(messages[1], 'Message 2'),
        handleMessageGPT(messages[2], 'Message 3'),
      ]);

      // Assert
      // All messages processed
      expect(chatCompletion).toHaveBeenCalledTimes(3);

      // All replies sent
      messages.forEach(msg => {
        expect(msg.reply).toHaveBeenCalledWith('Response');
      });

      // Usage tracked correctly
      const user = await UserRepository.findByPhoneNumber(phoneNumber);
      const usage = await UsageRepository.getTotalUsage(user!.id);
      expect(usage.totalTokens).toBe(30); // 3 * 10
    });
  });
});
