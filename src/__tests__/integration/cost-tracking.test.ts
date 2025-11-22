/**
 * Integration Test: Cost Tracking Accuracy
 *
 * Purpose: Test accurate cost calculation and tracking for OpenAI API usage
 * Priority: P1 - Critical for cost management and billing
 *
 * Test Flow:
 * 1. User sends message → GPT processes
 * 2. Token usage captured from OpenAI response
 * 3. Cost calculated based on model pricing
 * 4. Usage metric stored in database with cost
 * 5. Cumulative cost tracked correctly
 * 6. Cost alerts triggered when threshold exceeded
 *
 * Run: npm test src/__tests__/integration/cost-tracking.test.ts
 */

import { prisma } from '../../db/client';
import { UserRepository, UserRole } from '../../db/repositories/user.repository';
import { UsageRepository, OperationType } from '../../db/repositories/usage.repository';
import { handleMessageGPT } from '../../handlers/gpt';
import { chatCompletion } from '../../providers/openai';
import { CostMonitor } from '../../services/costMonitor';
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

// Mock logger
jest.mock('../../lib/logger', () => ({
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Integration: Cost Tracking Accuracy', () => {
  // ============================================================================
  // Test Setup & Teardown
  // ============================================================================

  beforeEach(async () => {
    // Clean database
    await prisma.usageMetric.deleteMany({});
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
      links: [],
    } as any;
  }

  // ============================================================================
  // Cost Calculation Tests
  // ============================================================================

  describe('Cost Calculation', () => {
    it('should calculate GPT-4o cost correctly', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT-4o response with known token counts
      // GPT-4o pricing: $0.0025/1K input tokens, $0.010/1K output tokens
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Paris is the capital of France.',
        model: 'gpt-4o',
        promptTokens: 100, // $0.00025 (100 * 0.0025 / 1000)
        completionTokens: 50, // $0.0005 (50 * 0.010 / 1000)
        totalTokens: 150,
      });

      const message = createMockMessage(phoneNumber, 'What is the capital of France?');

      // Act
      await handleMessageGPT(message, 'What is the capital of France?');

      // Assert
      const metrics = await UsageRepository.findByUserId(user.id);
      expect(metrics).toHaveLength(1);

      const metric = metrics[0];
      expect(metric.model).toBe('gpt-4o');
      expect(metric.promptTokens).toBe(100);
      expect(metric.completionTokens).toBe(50);
      expect(metric.totalTokens).toBe(150);

      // Cost calculation: (100 * 0.0025 / 1000) + (50 * 0.010 / 1000)
      // = 0.00025 + 0.0005 = 0.00075
      const expectedCost = (100 * 0.0025 / 1000) + (50 * 0.010 / 1000);
      expect(metric.cost).toBeCloseTo(expectedCost, 5);
    });

    it('should calculate GPT-3.5-turbo cost correctly', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock GPT-3.5-turbo response
      // GPT-3.5-turbo pricing: $0.0005/1K input, $0.0015/1K output
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Response',
        model: 'gpt-3.5-turbo',
        promptTokens: 200, // $0.0001 (200 * 0.0005 / 1000)
        completionTokens: 100, // $0.00015 (100 * 0.0015 / 1000)
        totalTokens: 300,
      });

      const message = createMockMessage(phoneNumber, 'Test prompt');

      // Act
      await handleMessageGPT(message, 'Test prompt');

      // Assert
      const metrics = await UsageRepository.findByUserId(user.id);
      const expectedCost = (200 * 0.0005 / 1000) + (100 * 0.0015 / 1000);

      expect(metrics[0].cost).toBeCloseTo(expectedCost, 5);
    });

    it('should track cumulative cost across multiple requests', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock 3 GPT responses
      const responses = [
        { content: 'R1', model: 'gpt-4o', promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        { content: 'R2', model: 'gpt-4o', promptTokens: 150, completionTokens: 75, totalTokens: 225 },
        { content: 'R3', model: 'gpt-4o', promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      ];

      let callCount = 0;
      (chatCompletion as jest.Mock).mockImplementation(async () => {
        return responses[callCount++];
      });

      // Act: Send 3 messages
      for (let i = 1; i <= 3; i++) {
        const message = createMockMessage(phoneNumber, `Message ${i}`);
        await handleMessageGPT(message, `Message ${i}`);
      }

      // Assert
      const totalUsage = await UsageRepository.getTotalUsage(user.id);

      // Total tokens: 150 + 225 + 300 = 675
      expect(totalUsage.totalTokens).toBe(675);

      // Total cost: sum of all 3 requests
      const cost1 = (100 * 0.0025 / 1000) + (50 * 0.010 / 1000);
      const cost2 = (150 * 0.0025 / 1000) + (75 * 0.010 / 1000);
      const cost3 = (200 * 0.0025 / 1000) + (100 * 0.010 / 1000);
      const expectedTotalCost = cost1 + cost2 + cost3;

      expect(totalUsage.totalCost).toBeCloseTo(expectedTotalCost, 5);
    });
  });

  // ============================================================================
  // Usage Metric Storage
  // ============================================================================

  describe('Usage Metric Storage', () => {
    it('should store all required fields in usage metric', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Response',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      const message = createMockMessage(phoneNumber, 'Test');

      // Act
      await handleMessageGPT(message, 'Test');

      // Assert
      const metrics = await UsageRepository.findByUserId(user.id);
      expect(metrics).toHaveLength(1);

      const metric = metrics[0];
      expect(metric).toMatchObject({
        userId: user.id,
        operationType: OperationType.CHAT_COMPLETION,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      expect(metric.cost).toBeGreaterThan(0);
      expect(metric.createdAt).toBeInstanceOf(Date);
    });

    it('should store separate metrics for different operation types', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Act: Create chat completion metric
      await UsageRepository.create({
        userId: user.id,
        operationType: OperationType.CHAT_COMPLETION,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.001,
      });

      // Act: Create transcription metric
      await UsageRepository.create({
        userId: user.id,
        operationType: OperationType.TRANSCRIPTION,
        model: 'whisper-1',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 100,
        cost: 0.0006, // $0.006 per minute, assuming 6 seconds
      });

      // Assert
      const metrics = await UsageRepository.findByUserId(user.id);
      expect(metrics).toHaveLength(2);

      const chatMetric = metrics.find(m => m.operationType === OperationType.CHAT_COMPLETION);
      const transcriptionMetric = metrics.find(m => m.operationType === OperationType.TRANSCRIPTION);

      expect(chatMetric).toBeDefined();
      expect(transcriptionMetric).toBeDefined();
      expect(chatMetric?.model).toBe('gpt-4o');
      expect(transcriptionMetric?.model).toBe('whisper-1');
    });
  });

  // ============================================================================
  // Cost Monitoring & Alerts
  // ============================================================================

  describe('Cost Monitoring', () => {
    it('should detect when daily cost threshold exceeded', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Create metrics totaling $55 (threshold is typically $50/day)
      const highCostRequests = [
        { promptTokens: 10000, completionTokens: 5000, totalTokens: 15000 }, // ~$0.075
        { promptTokens: 20000, completionTokens: 10000, totalTokens: 30000 }, // ~$0.15
        // Repeat to exceed $50 threshold
      ];

      // Create enough usage to exceed threshold
      for (let i = 0; i < 400; i++) {
        await UsageRepository.create({
          userId: user.id,
          operationType: OperationType.CHAT_COMPLETION,
          model: 'gpt-4o',
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
          cost: 0.01, // $0.01 per request
          createdAt: new Date(), // Today
        });
      }

      // Act
      const totalUsage = await UsageRepository.getTotalUsage(user.id);
      const dailyUsage = await UsageRepository.getDailyUsage(user.id, new Date());

      // Assert
      expect(totalUsage.totalCost).toBeGreaterThan(50);
      expect(dailyUsage.totalCost).toBeGreaterThan(50);

      // Cost monitor should flag this
      const isOverThreshold = await CostMonitor.checkDailyThreshold(user.id, 50);
      expect(isOverThreshold).toBe(true);
    });

    it('should calculate cost per user accurately', async () => {
      // Arrange
      const user1 = await UserRepository.create({
        phoneNumber: '+1111111111',
        role: UserRole.USER,
      });

      const user2 = await UserRepository.create({
        phoneNumber: '+2222222222',
        role: UserRole.USER,
      });

      // Create different usage for each user
      await UsageRepository.create({
        userId: user1.id,
        operationType: OperationType.CHAT_COMPLETION,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.001,
      });

      await UsageRepository.create({
        userId: user2.id,
        operationType: OperationType.CHAT_COMPLETION,
        model: 'gpt-4o',
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        cost: 0.002,
      });

      // Assert
      const usage1 = await UsageRepository.getTotalUsage(user1.id);
      const usage2 = await UsageRepository.getTotalUsage(user2.id);

      expect(usage1.totalCost).toBeCloseTo(0.001, 5);
      expect(usage2.totalCost).toBeCloseTo(0.002, 5);
      expect(usage1.totalTokens).toBe(150);
      expect(usage2.totalTokens).toBe(300);
    });

    it('should calculate global cost across all users', async () => {
      // Arrange
      const users = await Promise.all([
        UserRepository.create({ phoneNumber: '+1111111111', role: UserRole.USER }),
        UserRepository.create({ phoneNumber: '+2222222222', role: UserRole.USER }),
        UserRepository.create({ phoneNumber: '+3333333333', role: UserRole.USER }),
      ]);

      // Create usage for each user
      for (const user of users) {
        await UsageRepository.create({
          userId: user.id,
          operationType: OperationType.CHAT_COMPLETION,
          model: 'gpt-4o',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
        });
      }

      // Act
      const globalUsage = await UsageRepository.getGlobalUsage();

      // Assert
      expect(globalUsage.totalCost).toBeCloseTo(0.003, 5); // 3 users * $0.001
      expect(globalUsage.totalTokens).toBe(450); // 3 users * 150 tokens
      expect(globalUsage.userCount).toBe(3);
    });
  });

  // ============================================================================
  // Edge Cases & Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle zero-cost operations (cached responses)', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock cached response with 0 tokens
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Cached response',
        model: 'gpt-4o',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });

      const message = createMockMessage(phoneNumber, 'Test');

      // Act
      await handleMessageGPT(message, 'Test');

      // Assert
      const metrics = await UsageRepository.findByUserId(user.id);
      expect(metrics[0].cost).toBe(0);
      expect(metrics[0].totalTokens).toBe(0);
    });

    it('should handle missing cost data gracefully', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock response without token counts
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Response',
        model: 'gpt-4o',
        // Missing: promptTokens, completionTokens, totalTokens
      });

      const message = createMockMessage(phoneNumber, 'Test');

      // Act & Assert
      // Should not throw error
      await expect(handleMessageGPT(message, 'Test')).resolves.not.toThrow();
    });

    it('should handle negative or invalid token counts', async () => {
      // Arrange
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
        role: UserRole.USER,
      });

      // Act & Assert
      // Should reject or sanitize invalid data
      await expect(
        UsageRepository.create({
          userId: user.id,
          operationType: OperationType.CHAT_COMPLETION,
          model: 'gpt-4o',
          promptTokens: -100, // Invalid
          completionTokens: 50,
          totalTokens: -50,
          cost: -0.001, // Invalid
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Historical Usage Queries
  // ============================================================================

  describe('Historical Usage', () => {
    it('should retrieve usage for specific time period', async () => {
      // Arrange
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
        role: UserRole.USER,
      });

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create usage from yesterday
      await UsageRepository.create({
        userId: user.id,
        operationType: OperationType.CHAT_COMPLETION,
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        createdAt: yesterday,
      });

      // Create usage from today
      await UsageRepository.create({
        userId: user.id,
        operationType: OperationType.CHAT_COMPLETION,
        model: 'gpt-4o',
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        cost: 0.002,
        createdAt: today,
      });

      // Act
      const dailyUsage = await UsageRepository.getDailyUsage(user.id, today);

      // Assert
      // Should only include today's usage
      expect(dailyUsage.totalCost).toBeCloseTo(0.002, 5);
      expect(dailyUsage.totalTokens).toBe(300);
    });
  });
});
