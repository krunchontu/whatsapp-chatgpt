/**
 * Cost Monitor Tests
 *
 * Tests for cost monitoring and alerting service
 */

// Mock dependencies BEFORE importing modules that use them
jest.mock('../../db/repositories/usage.repository');
jest.mock('../../lib/logger', () => ({
	createChildLogger: jest.fn(() => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn()
	}))
}));
jest.mock('../../db/client', () => ({
	prisma: {
		user: { findUnique: jest.fn(), create: jest.fn() },
		usageMetric: { findMany: jest.fn() },
		conversation: { findMany: jest.fn() }
	}
}));

import { CostMonitor } from '../costMonitor';
import { UsageRepository } from '../../db/repositories/usage.repository';

describe('CostMonitor', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		CostMonitor.resetAlertState();
	});

	describe('getCurrentDailyCost', () => {
		it('should return current daily cost', async () => {
			const mockDailyTotal = {
				date: '2025-11-19',
				totalRequests: 10,
				totalTokens: 1000,
				totalCostMicros: 5000000, // $5.00
				totalCostUsd: 5.0,
				operations: {}
			};

			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockResolvedValue(mockDailyTotal);

			const cost = await CostMonitor.getCurrentDailyCost();

			expect(cost).toBe(5.0);
			expect(UsageRepository.getGlobalDailyTotal).toHaveBeenCalled();
		});

		it('should return 0 on error', async () => {
			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockRejectedValue(
				new Error('Database error')
			);

			const cost = await CostMonitor.getCurrentDailyCost();

			expect(cost).toBe(0);
		});
	});

	describe('getUserDailyCost', () => {
		it('should return user daily cost', async () => {
			const userId = 'user123';
			const mockDailyTotal = {
				date: '2025-11-19',
				totalRequests: 5,
				totalTokens: 500,
				totalCostMicros: 2500000, // $2.50
				totalCostUsd: 2.5,
				operations: {}
			};

			(UsageRepository.getDailyTotal as jest.Mock).mockResolvedValue(mockDailyTotal);

			const cost = await CostMonitor.getUserDailyCost(userId);

			expect(cost).toBe(2.5);
			expect(UsageRepository.getDailyTotal).toHaveBeenCalledWith(userId);
		});

		it('should return 0 on error', async () => {
			(UsageRepository.getDailyTotal as jest.Mock).mockRejectedValue(
				new Error('Database error')
			);

			const cost = await CostMonitor.getUserDailyCost('user123');

			expect(cost).toBe(0);
		});
	});

	describe('checkDailyThreshold', () => {
		it('should return false when alerts are disabled', async () => {
			const result = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: false
			});

			expect(result).toBe(false);
			expect(UsageRepository.getGlobalDailyTotal).not.toHaveBeenCalled();
		});

		it('should return false when cost is below threshold', async () => {
			const mockDailyTotal = {
				date: '2025-11-19',
				totalRequests: 10,
				totalTokens: 1000,
				totalCostMicros: 10000000, // $10.00
				totalCostUsd: 10.0,
				operations: {}
			};

			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockResolvedValue(mockDailyTotal);

			const result = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});

			expect(result).toBe(false);
		});

		it('should return true and trigger alert when threshold exceeded', async () => {
			const mockDailyTotal = {
				date: '2025-11-19',
				totalRequests: 100,
				totalTokens: 100000,
				totalCostMicros: 60000000, // $60.00
				totalCostUsd: 60.0,
				operations: {
					CHAT: { requests: 80, tokens: 80000, costMicros: 50000000 },
					VISION: { requests: 20, tokens: 20000, costMicros: 10000000 }
				}
			};

			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockResolvedValue(mockDailyTotal);

			const result = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});

			expect(result).toBe(true);
		});

		it('should not trigger alert twice on same day', async () => {
			const mockDailyTotal = {
				date: '2025-11-19',
				totalRequests: 100,
				totalTokens: 100000,
				totalCostMicros: 60000000, // $60.00
				totalCostUsd: 60.0,
				operations: {}
			};

			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockResolvedValue(mockDailyTotal);

			// First check - should trigger alert
			const result1 = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});
			expect(result1).toBe(true);

			// Second check on same day - should not trigger alert again
			const result2 = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});
			expect(result2).toBe(false);
		});

		it('should return false on error', async () => {
			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockRejectedValue(
				new Error('Database error')
			);

			const result = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});

			expect(result).toBe(false);
		});
	});

	describe('resetAlertState', () => {
		it('should reset alert state', async () => {
			const mockDailyTotal = {
				date: '2025-11-19',
				totalRequests: 100,
				totalTokens: 100000,
				totalCostMicros: 60000000,
				totalCostUsd: 60.0,
				operations: {}
			};

			(UsageRepository.getGlobalDailyTotal as jest.Mock).mockResolvedValue(mockDailyTotal);

			// Trigger alert
			await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});

			// Reset state
			CostMonitor.resetAlertState();

			// Should trigger alert again after reset
			const result = await CostMonitor.checkDailyThreshold({
				dailyThresholdUsd: 50,
				enabled: true
			});
			expect(result).toBe(true);
		});
	});
});
