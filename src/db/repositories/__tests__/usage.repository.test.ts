/**
 * Usage Repository Tests
 *
 * Purpose: Test usage tracking, cost calculations, and analytics
 * Run: pnpm test src/db/repositories/__tests__/usage.repository.test.ts
 */

import { UsageRepository, OperationType } from '../usage.repository';
import { UserRepository } from '../user.repository';
import { prisma } from '../../client';
import type { UsageMetric, User } from '@prisma/client';

describe('UsageRepository', () => {
  let testUser1: User;
  let testUser2: User;

  /**
   * Set up test users before each test
   */
  beforeEach(async () => {
    // Clean up database
    await prisma.usageMetric.deleteMany();
    await prisma.user.deleteMany();

    // Create test users
    testUser1 = await UserRepository.create({
      phoneNumber: '+1111111111',
    });

    testUser2 = await UserRepository.create({
      phoneNumber: '+2222222222',
    });
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
      it('should create a new usage metric', async () => {
        const usage = await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        expect(usage).toBeDefined();
        expect(usage.id).toBeDefined();
        expect(usage.userId).toBe(testUser1.id);
        expect(usage.promptTokens).toBe(100);
        expect(usage.completionTokens).toBe(50);
        expect(usage.totalTokens).toBe(150);
        expect(usage.costMicros).toBe(2500);
        expect(usage.model).toBe('gpt-4o');
        expect(usage.operation).toBe(OperationType.CHAT);
        expect(usage.createdAt).toBeInstanceOf(Date);
      });

      it('should create transcription usage', async () => {
        const usage = await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 1000,
          model: 'whisper-1',
          operation: OperationType.TRANSCRIPTION,
        });

        expect(usage.operation).toBe(OperationType.TRANSCRIPTION);
        expect(usage.model).toBe('whisper-1');
      });

      it('should create vision usage', async () => {
        const usage = await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o',
          operation: OperationType.VISION,
        });

        expect(usage.operation).toBe(OperationType.VISION);
      });

      it('should throw error for invalid operation', async () => {
        await expect(
          UsageRepository.create({
            userId: testUser1.id,
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            costMicros: 2500,
            model: 'gpt-4o',
            operation: 'INVALID_OPERATION' as any,
          })
        ).rejects.toThrow('Invalid operation');
      });

      it('should throw error for negative token counts', async () => {
        await expect(
          UsageRepository.create({
            userId: testUser1.id,
            promptTokens: -100,
            completionTokens: 50,
            totalTokens: 150,
            costMicros: 2500,
            model: 'gpt-4o',
            operation: OperationType.CHAT,
          })
        ).rejects.toThrow('Token counts must be non-negative');
      });

      it('should throw error for negative cost', async () => {
        await expect(
          UsageRepository.create({
            userId: testUser1.id,
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            costMicros: -2500,
            model: 'gpt-4o',
            operation: OperationType.CHAT,
          })
        ).rejects.toThrow('Cost must be non-negative');
      });
    });

    describe('findById()', () => {
      it('should find usage metric by ID', async () => {
        const created = await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const found = await UsageRepository.findById(created.id);

        expect(found).toBeDefined();
        expect(found?.id).toBe(created.id);
        expect(found?.userId).toBe(testUser1.id);
      });

      it('should return null for non-existent ID', async () => {
        const found = await UsageRepository.findById('non-existent-id');
        expect(found).toBeNull();
      });
    });

    describe('findByUserId()', () => {
      it('should find all metrics for a user', async () => {
        // Create metrics for user1
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o',
          operation: OperationType.VISION,
        });

        // Create metric for user2
        await UsageRepository.create({
          userId: testUser2.id,
          promptTokens: 50,
          completionTokens: 25,
          totalTokens: 75,
          costMicros: 1250,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const user1Metrics = await UsageRepository.findByUserId(testUser1.id);

        expect(user1Metrics).toHaveLength(2);
        expect(user1Metrics.every((m) => m.userId === testUser1.id)).toBe(true);
      });

      it('should support pagination', async () => {
        // Create 5 metrics
        for (let i = 0; i < 5; i++) {
          await UsageRepository.create({
            userId: testUser1.id,
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            costMicros: 2500,
            model: 'gpt-4o',
            operation: OperationType.CHAT,
          });
        }

        const page1 = await UsageRepository.findByUserId(testUser1.id, {
          take: 2,
        });
        expect(page1).toHaveLength(2);

        const page2 = await UsageRepository.findByUserId(testUser1.id, {
          skip: 2,
          take: 2,
        });
        expect(page2).toHaveLength(2);
      });

      it('should filter by date range', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Create metric with today's date
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const todayMetrics = await UsageRepository.findByUserId(testUser1.id, {
          startDate: yesterday,
          endDate: tomorrow,
        });

        expect(todayMetrics).toHaveLength(1);
      });

      it('should return empty array for user with no metrics', async () => {
        const metrics = await UsageRepository.findByUserId(testUser2.id);
        expect(metrics).toHaveLength(0);
      });
    });

    describe('count()', () => {
      it('should count all usage metrics', async () => {
        expect(await UsageRepository.count()).toBe(0);

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        expect(await UsageRepository.count()).toBe(1);
      });

      it('should count metrics for specific user', async () => {
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser2.id,
          promptTokens: 50,
          completionTokens: 25,
          totalTokens: 75,
          costMicros: 1250,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const count = await UsageRepository.count({ userId: testUser1.id });
        expect(count).toBe(1);
      });

      it('should count metrics within date range', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const count = await UsageRepository.count({
          startDate: yesterday,
        });

        expect(count).toBe(1);
      });
    });
  });

  // ============================================== #
  //          Daily Totals & Aggregations           #
  // ============================================== #

  describe('Daily Totals & Aggregations', () => {
    describe('getDailyTotal()', () => {
      it('should calculate daily total for user', async () => {
        // Create multiple metrics for today
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o',
          operation: OperationType.VISION,
        });

        const dailyTotal = await UsageRepository.getDailyTotal(testUser1.id);

        expect(dailyTotal.totalRequests).toBe(2);
        expect(dailyTotal.totalTokens).toBe(450);
        expect(dailyTotal.totalCostMicros).toBe(7500);
        expect(dailyTotal.totalCostUsd).toBe(0.0075);
        expect(dailyTotal.operations[OperationType.CHAT]).toBeDefined();
        expect(dailyTotal.operations[OperationType.VISION]).toBeDefined();
      });

      it('should group by operation type', async () => {
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o',
          operation: OperationType.VISION,
        });

        const dailyTotal = await UsageRepository.getDailyTotal(testUser1.id);

        expect(dailyTotal.operations[OperationType.CHAT].requests).toBe(2);
        expect(dailyTotal.operations[OperationType.VISION].requests).toBe(1);
      });

      it('should return zero totals for user with no metrics today', async () => {
        const dailyTotal = await UsageRepository.getDailyTotal(testUser1.id);

        expect(dailyTotal.totalRequests).toBe(0);
        expect(dailyTotal.totalTokens).toBe(0);
        expect(dailyTotal.totalCostMicros).toBe(0);
        expect(dailyTotal.totalCostUsd).toBe(0);
      });

      it('should calculate for specific date', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const dailyTotal = await UsageRepository.getDailyTotal(
          testUser1.id,
          yesterday
        );

        expect(dailyTotal.date).toBe(yesterday.toISOString().split('T')[0]);
        expect(dailyTotal.totalRequests).toBe(0);
      });
    });

    describe('getGlobalDailyTotal()', () => {
      it('should calculate global daily total for all users', async () => {
        // Create metrics for both users
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser2.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o',
          operation: OperationType.VISION,
        });

        const globalTotal = await UsageRepository.getGlobalDailyTotal();

        expect(globalTotal.totalRequests).toBe(2);
        expect(globalTotal.totalTokens).toBe(450);
        expect(globalTotal.totalCostMicros).toBe(7500);
        expect(globalTotal.totalCostUsd).toBe(0.0075);
      });

      it('should return zero totals when no metrics exist', async () => {
        const globalTotal = await UsageRepository.getGlobalDailyTotal();

        expect(globalTotal.totalRequests).toBe(0);
        expect(globalTotal.totalTokens).toBe(0);
      });
    });

    describe('getUserStats()', () => {
      it('should calculate user statistics for N days', async () => {
        // Create metrics
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o-mini',
          operation: OperationType.VISION,
        });

        const stats = await UsageRepository.getUserStats(testUser1.id, 30);

        expect(stats.userId).toBe(testUser1.id);
        expect(stats.periodDays).toBe(30);
        expect(stats.totalRequests).toBe(2);
        expect(stats.totalTokens).toBe(450);
        expect(stats.totalCostMicros).toBe(7500);
        expect(stats.totalCostUsd).toBe(0.0075);
        expect(stats.averageCostPerRequestUsd).toBe(0.00375);
        expect(stats.byOperation[OperationType.CHAT]).toBeDefined();
        expect(stats.byOperation[OperationType.VISION]).toBeDefined();
        expect(stats.byModel['gpt-4o']).toBeDefined();
        expect(stats.byModel['gpt-4o-mini']).toBeDefined();
        expect(stats.dailyBreakdown).toHaveLength(30);
      });

      it('should group by operation type', async () => {
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const stats = await UsageRepository.getUserStats(testUser1.id, 7);

        expect(stats.byOperation[OperationType.CHAT].requests).toBe(2);
        expect(stats.byOperation[OperationType.CHAT].tokens).toBe(300);
        expect(stats.byOperation[OperationType.CHAT].costMicros).toBe(5000);
      });

      it('should group by model', async () => {
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 50,
          completionTokens: 25,
          totalTokens: 75,
          costMicros: 750,
          model: 'gpt-4o-mini',
          operation: OperationType.CHAT,
        });

        const stats = await UsageRepository.getUserStats(testUser1.id, 7);

        expect(stats.byModel['gpt-4o'].requests).toBe(1);
        expect(stats.byModel['gpt-4o-mini'].requests).toBe(1);
      });

      it('should return zero stats for user with no metrics', async () => {
        const stats = await UsageRepository.getUserStats(testUser1.id, 7);

        expect(stats.totalRequests).toBe(0);
        expect(stats.totalTokens).toBe(0);
        expect(stats.totalCostMicros).toBe(0);
        expect(stats.averageCostPerRequestUsd).toBe(0);
      });

      it('should include daily breakdown', async () => {
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const stats = await UsageRepository.getUserStats(testUser1.id, 7);

        expect(stats.dailyBreakdown).toHaveLength(7);
        expect(stats.dailyBreakdown[0].date).toBeDefined();

        // Today should have 1 request
        const today = stats.dailyBreakdown.find(
          (day) => day.date === new Date().toISOString().split('T')[0]
        );
        expect(today?.totalRequests).toBe(1);
      });
    });

    describe('getGlobalStats()', () => {
      it('should calculate global statistics', async () => {
        // Create metrics for both users
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser2.id,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          costMicros: 5000,
          model: 'gpt-4o',
          operation: OperationType.VISION,
        });

        const stats = await UsageRepository.getGlobalStats(30);

        expect(stats.periodDays).toBe(30);
        expect(stats.totalRequests).toBe(2);
        expect(stats.totalTokens).toBe(450);
        expect(stats.totalCostMicros).toBe(7500);
        expect(stats.totalCostUsd).toBe(0.0075);
        expect(stats.uniqueUsers).toBe(2);
        expect(stats.averageCostPerUserUsd).toBe(0.00375);
        expect(stats.byOperation[OperationType.CHAT]).toBeDefined();
        expect(stats.byOperation[OperationType.VISION]).toBeDefined();
      });

      it('should count unique users', async () => {
        // Create multiple metrics for same user
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        const stats = await UsageRepository.getGlobalStats(30);

        expect(stats.totalRequests).toBe(2);
        expect(stats.uniqueUsers).toBe(1);
      });
    });
  });

  // ============================================== #
  //          Cost Calculations                     #
  // ============================================== #

  describe('Cost Calculations', () => {
    describe('microToUsd()', () => {
      it('should convert micro-dollars to USD', () => {
        expect(UsageRepository.microToUsd(1_000_000)).toBe(1.0);
        expect(UsageRepository.microToUsd(2_500)).toBe(0.0025);
        expect(UsageRepository.microToUsd(500_000)).toBe(0.5);
        expect(UsageRepository.microToUsd(0)).toBe(0);
      });
    });

    describe('usdToMicro()', () => {
      it('should convert USD to micro-dollars', () => {
        expect(UsageRepository.usdToMicro(1.0)).toBe(1_000_000);
        expect(UsageRepository.usdToMicro(0.0025)).toBe(2_500);
        expect(UsageRepository.usdToMicro(0.5)).toBe(500_000);
        expect(UsageRepository.usdToMicro(0)).toBe(0);
      });
    });

    describe('calculateGptCost()', () => {
      it('should calculate cost for gpt-4o', () => {
        // gpt-4o: $2.50/$10.00 per 1M tokens
        const cost = UsageRepository.calculateGptCost('gpt-4o', 1000, 1000);

        // (1000/1M * $2.50) + (1000/1M * $10.00) = $0.0025 + $0.01 = $0.0125
        // In micro-dollars: 12,500
        expect(cost).toBe(12_500);
      });

      it('should calculate cost for gpt-4o-mini', () => {
        // gpt-4o-mini: $0.15/$0.60 per 1M tokens
        const cost = UsageRepository.calculateGptCost('gpt-4o-mini', 1000, 1000);

        // (1000/1M * $0.15) + (1000/1M * $0.60) = $0.00015 + $0.0006 = $0.00075
        // In micro-dollars: 750
        expect(cost).toBe(750);
      });

      it('should calculate cost for gpt-3.5-turbo', () => {
        // gpt-3.5-turbo: $0.50/$1.50 per 1M tokens
        const cost = UsageRepository.calculateGptCost(
          'gpt-3.5-turbo',
          1000,
          1000
        );

        // (1000/1M * $0.50) + (1000/1M * $1.50) = $0.0005 + $0.0015 = $0.002
        // In micro-dollars: 2,000
        expect(cost).toBe(2_000);
      });

      it('should default to gpt-4o pricing for unknown models', () => {
        const cost = UsageRepository.calculateGptCost(
          'unknown-model',
          1000,
          1000
        );

        // Should use gpt-4o pricing
        expect(cost).toBe(12_500);
      });

      it('should handle zero tokens', () => {
        const cost = UsageRepository.calculateGptCost('gpt-4o', 0, 0);
        expect(cost).toBe(0);
      });
    });
  });

  // ============================================== #
  //          Cleanup & Maintenance                 #
  // ============================================== #

  describe('Cleanup & Maintenance', () => {
    describe('deleteOlderThan()', () => {
      it('should delete old metrics', async () => {
        // Create a metric (recent)
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        // Delete metrics older than 30 days
        const deleted = await UsageRepository.deleteOlderThan(30);

        // Should delete 0 (metric is recent)
        expect(deleted).toBe(0);

        // Verify metric still exists
        const count = await UsageRepository.count();
        expect(count).toBe(1);
      });

      it('should keep recent metrics', async () => {
        // Create metric
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        // Delete metrics older than 0 days (keep all from today)
        const deleted = await UsageRepository.deleteOlderThan(1);

        expect(deleted).toBe(0);
      });
    });

    describe('deleteByUserId()', () => {
      it('should delete all metrics for a user', async () => {
        // Create metrics for both users
        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser1.id,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costMicros: 2500,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        await UsageRepository.create({
          userId: testUser2.id,
          promptTokens: 50,
          completionTokens: 25,
          totalTokens: 75,
          costMicros: 1250,
          model: 'gpt-4o',
          operation: OperationType.CHAT,
        });

        // Delete user1's metrics
        const deleted = await UsageRepository.deleteByUserId(testUser1.id);
        expect(deleted).toBe(2);

        // Verify only user2's metrics remain
        const remaining = await UsageRepository.findByUserId(testUser1.id);
        expect(remaining).toHaveLength(0);

        const user2Metrics = await UsageRepository.findByUserId(testUser2.id);
        expect(user2Metrics).toHaveLength(1);
      });

      it('should return 0 for user with no metrics', async () => {
        const deleted = await UsageRepository.deleteByUserId(testUser1.id);
        expect(deleted).toBe(0);
      });
    });
  });

  // ============================================== #
  //          Helper Methods                        #
  // ============================================== #

  describe('Helper Methods', () => {
    describe('isValidOperation()', () => {
      it('should return true for valid operations', () => {
        expect(UsageRepository.isValidOperation('CHAT')).toBe(true);
        expect(UsageRepository.isValidOperation('TRANSCRIPTION')).toBe(true);
        expect(UsageRepository.isValidOperation('VISION')).toBe(true);
      });

      it('should return false for invalid operations', () => {
        expect(UsageRepository.isValidOperation('INVALID')).toBe(false);
        expect(UsageRepository.isValidOperation('chat')).toBe(false);
        expect(UsageRepository.isValidOperation('')).toBe(false);
      });
    });
  });
});
