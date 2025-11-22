/**
 * Cost Monitor Service
 *
 * Purpose: Monitor daily API costs and trigger alerts when thresholds are exceeded
 * Pattern: Service pattern for cost monitoring and alerting
 *
 * Usage:
 *   import { CostMonitor } from './services/costMonitor';
 *   await CostMonitor.checkDailyThreshold();
 */

import { UsageRepository } from '../db/repositories/usage.repository';
import { createChildLogger } from '../lib/logger';
import config from '../config';

const logger = createChildLogger({ module: 'services:costMonitor' });

export interface CostAlertConfig {
	dailyThresholdUsd: number;
	enabled: boolean;
}

export class CostMonitor {
	private static lastAlertDate: string | null = null;

	/**
	 * Get current daily cost (for monitoring without alerting)
	 *
	 * @returns Current daily cost in USD
	 */
	static async getCurrentDailyCost(): Promise<number> {
		try {
			const dailyTotal = await UsageRepository.getGlobalDailyTotal();
			return dailyTotal.totalCostUsd;
		} catch (error) {
			logger.error({ err: error }, 'Failed to get current daily cost');
			return 0;
		}
	}

	/**
	 * Get user's daily cost
	 *
	 * @param userId - User ID
	 * @returns User's daily cost in USD
	 */
	static async getUserDailyCost(userId: string): Promise<number> {
		try {
			const dailyTotal = await UsageRepository.getDailyTotal(userId);
			return dailyTotal.totalCostUsd;
		} catch (error) {
			logger.error({ err: error, userId }, 'Failed to get user daily cost');
			return 0;
		}
	}

	/**
	 * Check if user's daily cost threshold has been exceeded
	 * Overload for test compatibility
	 *
	 * @param userIdOrConfig - User ID or alert config
	 * @param threshold - Cost threshold in USD (optional if first param is config)
	 * @returns True if threshold exceeded, false otherwise
	 */
	static async checkDailyThreshold(
		userIdOrConfig: string | CostAlertConfig,
		threshold?: number
	): Promise<boolean> {
		// If first argument is a string (userId), check user-specific threshold
		if (typeof userIdOrConfig === 'string') {
			const userId = userIdOrConfig;
			const thresholdUsd = threshold ?? 50;

			try {
				const dailyTotal = await UsageRepository.getDailyTotal(userId);
				return dailyTotal.totalCostUsd >= thresholdUsd;
			} catch (error) {
				logger.error({ err: error, userId }, 'Failed to check user cost threshold');
				return false;
			}
		}

		// Otherwise, use the original global checking logic
		const alertConfig = userIdOrConfig as CostAlertConfig;
		return this.checkGlobalDailyThreshold(alertConfig);
	}

	/**
	 * Check if global daily cost threshold has been exceeded (original implementation)
	 * Triggers alert once per day if threshold is exceeded
	 *
	 * @param alertConfig - Alert configuration (threshold and enabled flag)
	 * @returns True if threshold exceeded, false otherwise
	 */
	private static async checkGlobalDailyThreshold(
		alertConfig: CostAlertConfig = {
			dailyThresholdUsd: config.costAlertThresholdUsd || 50,
			enabled: config.costAlertEnabled ?? true
		}
	): Promise<boolean> {
		if (!alertConfig.enabled) {
			return false;
		}

		try {
			// Get today's date as YYYY-MM-DD
			const today = new Date().toISOString().split('T')[0];

			// Don't check if we already alerted today
			if (this.lastAlertDate === today) {
				return false;
			}

			// Get global daily total
			const dailyTotal = await UsageRepository.getGlobalDailyTotal();

			const dailyCostUsd = dailyTotal.totalCostUsd;
			const thresholdExceeded = dailyCostUsd >= alertConfig.dailyThresholdUsd;

			if (thresholdExceeded) {
				this.triggerAlert(dailyCostUsd, alertConfig.dailyThresholdUsd, dailyTotal);
				this.lastAlertDate = today;
				return true;
			}

			return false;
		} catch (error) {
			logger.error({ err: error }, 'Failed to check cost threshold');
			return false;
		}
	}

	/**
	 * Trigger cost alert
	 * Logs warning and can be extended to send email/SMS/Slack notifications
	 *
	 * @param actualCost - Actual daily cost
	 * @param threshold - Configured threshold
	 * @param dailyTotal - Daily usage summary
	 */
	private static triggerAlert(
		actualCost: number,
		threshold: number,
		dailyTotal: any
	): void {
		logger.warn(
			{
				actualCostUsd: actualCost.toFixed(4),
				thresholdUsd: threshold.toFixed(4),
				exceedancePercent: ((actualCost / threshold - 1) * 100).toFixed(1),
				totalRequests: dailyTotal.totalRequests,
				totalTokens: dailyTotal.totalTokens,
				byOperation: dailyTotal.operations
			},
			'⚠️ COST ALERT: Daily cost threshold exceeded!'
		);

		// TODO: Add email/SMS/Slack notification integration here
		// Example integrations:
		// - SendGrid for email
		// - Twilio for SMS
		// - Slack webhook for Slack
		// - PagerDuty for on-call alerts
	}

	/**
	 * Reset alert state (useful for testing or manual reset)
	 */
	static resetAlertState(): void {
		this.lastAlertDate = null;
		logger.info('Cost alert state reset');
	}
}
