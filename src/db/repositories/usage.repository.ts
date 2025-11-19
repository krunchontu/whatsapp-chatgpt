/**
 * Usage Repository
 *
 * Purpose: Track OpenAI API usage, costs, and token consumption
 * Pattern: Repository pattern for usage metrics and cost analytics
 *
 * Usage:
 *   import { UsageRepository } from './db/repositories/usage.repository';
 *   await UsageRepository.create({ userId, model: 'gpt-4o', totalTokens: 350, costMicros: 5250 });
 */

import { prisma } from '../client';
import type { UsageMetric } from '@prisma/client';

/**
 * Valid operation types (app-level validation for SQLite string field)
 */
export const OperationType = {
  CHAT: 'CHAT',
  TRANSCRIPTION: 'TRANSCRIPTION',
  VISION: 'VISION',
} as const;

export type OperationTypeType = (typeof OperationType)[keyof typeof OperationType];

/**
 * Usage metric creation data
 */
export interface CreateUsageData {
  userId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: number; // Cost in micro-dollars (1/1,000,000 USD)
  model: string; // e.g., "gpt-4o", "whisper-1"
  operation: OperationTypeType;
}

/**
 * Daily usage summary
 */
export interface DailyUsageSummary {
  date: string; // ISO date string (YYYY-MM-DD)
  totalRequests: number;
  totalTokens: number;
  totalCostMicros: number;
  totalCostUsd: number; // Convenience: costMicros / 1,000,000
  operations: {
    [key: string]: {
      requests: number;
      tokens: number;
      costMicros: number;
    };
  };
}

/**
 * User usage statistics
 */
export interface UserUsageStats {
  userId: string;
  periodDays: number;
  totalRequests: number;
  totalTokens: number;
  totalCostMicros: number;
  totalCostUsd: number;
  averageCostPerRequestUsd: number;
  byOperation: {
    [key: string]: {
      requests: number;
      tokens: number;
      costMicros: number;
    };
  };
  byModel: {
    [key: string]: {
      requests: number;
      tokens: number;
      costMicros: number;
    };
  };
  dailyBreakdown: DailyUsageSummary[];
}

/**
 * Usage Repository
 * Manages usage tracking, cost calculation, and analytics
 */
export class UsageRepository {
  /**
   * Create a new usage metric
   *
   * @param data - Usage metric data
   * @returns Created usage metric
   */
  static async create(data: CreateUsageData): Promise<UsageMetric> {
    // Validate operation type
    if (!Object.values(OperationType).includes(data.operation)) {
      throw new Error(
        `Invalid operation: ${data.operation}. Must be CHAT, TRANSCRIPTION, or VISION.`
      );
    }

    // Validate token counts
    if (data.totalTokens < 0 || data.promptTokens < 0 || data.completionTokens < 0) {
      throw new Error('Token counts must be non-negative');
    }

    // Validate cost
    if (data.costMicros < 0) {
      throw new Error('Cost must be non-negative');
    }

    return prisma.usageMetric.create({
      data: {
        userId: data.userId,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        costMicros: data.costMicros,
        model: data.model,
        operation: data.operation,
      },
    });
  }

  /**
   * Find usage metric by ID
   *
   * @param id - Usage metric ID
   * @returns Usage metric or null
   */
  static async findById(id: string): Promise<UsageMetric | null> {
    return prisma.usageMetric.findUnique({
      where: { id },
    });
  }

  /**
   * Get all usage metrics for a user
   *
   * @param userId - User ID
   * @param options - Query options
   * @returns Array of usage metrics
   */
  static async findByUserId(
    userId: string,
    options?: {
      skip?: number;
      take?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<UsageMetric[]> {
    return prisma.usageMetric.findMany({
      where: {
        userId,
        ...(options?.startDate || options?.endDate
          ? {
              createdAt: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // ============================================== #
  //          Daily Totals & Aggregations           #
  // ============================================== #

  /**
   * Get daily usage total for a specific user
   *
   * @param userId - User ID
   * @param date - Date to calculate for (defaults to today)
   * @returns Daily usage summary
   */
  static async getDailyTotal(
    userId: string,
    date: Date = new Date()
  ): Promise<DailyUsageSummary> {
    // Get start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all metrics for the day
    const metrics = await prisma.usageMetric.findMany({
      where: {
        userId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    return this.aggregateMetrics(metrics, date);
  }

  /**
   * Get global daily usage total (all users)
   *
   * @param date - Date to calculate for (defaults to today)
   * @returns Daily usage summary
   */
  static async getGlobalDailyTotal(
    date: Date = new Date()
  ): Promise<DailyUsageSummary> {
    // Get start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all metrics for the day
    const metrics = await prisma.usageMetric.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    return this.aggregateMetrics(metrics, date);
  }

  /**
   * Get user usage statistics for the last N days
   *
   * @param userId - User ID
   * @param days - Number of days to look back (default: 30)
   * @returns User usage statistics
   */
  static async getUserStats(
    userId: string,
    days: number = 30
  ): Promise<UserUsageStats> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1)); // Include today in the range
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Get all metrics for the period
    const metrics = await this.findByUserId(userId, {
      startDate,
      endDate,
    });

    // Calculate totals
    const totalRequests = metrics.length;
    const totalTokens = metrics.reduce((sum, m) => sum + m.totalTokens, 0);
    const totalCostMicros = metrics.reduce((sum, m) => sum + m.costMicros, 0);
    const totalCostUsd = totalCostMicros / 1_000_000;
    const averageCostPerRequestUsd = totalRequests > 0 ? totalCostUsd / totalRequests : 0;

    // Group by operation
    const byOperation: UserUsageStats['byOperation'] = {};
    for (const metric of metrics) {
      if (!byOperation[metric.operation]) {
        byOperation[metric.operation] = { requests: 0, tokens: 0, costMicros: 0 };
      }
      byOperation[metric.operation].requests++;
      byOperation[metric.operation].tokens += metric.totalTokens;
      byOperation[metric.operation].costMicros += metric.costMicros;
    }

    // Group by model
    const byModel: UserUsageStats['byModel'] = {};
    for (const metric of metrics) {
      if (!byModel[metric.model]) {
        byModel[metric.model] = { requests: 0, tokens: 0, costMicros: 0 };
      }
      byModel[metric.model].requests++;
      byModel[metric.model].tokens += metric.totalTokens;
      byModel[metric.model].costMicros += metric.costMicros;
    }

    // Generate daily breakdown
    const dailyBreakdown: DailyUsageSummary[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayMetrics = metrics.filter(
        (m) => m.createdAt >= dayStart && m.createdAt <= dayEnd
      );

      dailyBreakdown.push(this.aggregateMetrics(dayMetrics, date));
    }

    return {
      userId,
      periodDays: days,
      totalRequests,
      totalTokens,
      totalCostMicros,
      totalCostUsd,
      averageCostPerRequestUsd,
      byOperation,
      byModel,
      dailyBreakdown,
    };
  }

  /**
   * Get global usage statistics for the last N days
   *
   * @param days - Number of days to look back (default: 30)
   * @returns Global usage statistics
   */
  static async getGlobalStats(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1)); // Include today in the range
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Get all metrics for the period
    const metrics = await prisma.usageMetric.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Calculate totals
    const totalRequests = metrics.length;
    const totalTokens = metrics.reduce((sum, m) => sum + m.totalTokens, 0);
    const totalCostMicros = metrics.reduce((sum, m) => sum + m.costMicros, 0);
    const totalCostUsd = totalCostMicros / 1_000_000;

    // Count unique users
    const uniqueUsers = new Set(metrics.map((m) => m.userId)).size;

    // Group by operation
    const byOperation: Record<string, { requests: number; tokens: number; costMicros: number }> =
      {};
    for (const metric of metrics) {
      if (!byOperation[metric.operation]) {
        byOperation[metric.operation] = { requests: 0, tokens: 0, costMicros: 0 };
      }
      byOperation[metric.operation].requests++;
      byOperation[metric.operation].tokens += metric.totalTokens;
      byOperation[metric.operation].costMicros += metric.costMicros;
    }

    return {
      periodDays: days,
      totalRequests,
      totalTokens,
      totalCostMicros,
      totalCostUsd,
      uniqueUsers,
      averageCostPerUserUsd: uniqueUsers > 0 ? totalCostUsd / uniqueUsers : 0,
      byOperation,
    };
  }

  // ============================================== #
  //          Cost Calculations                     #
  // ============================================== #

  /**
   * Convert cost from micro-dollars to USD
   *
   * @param costMicros - Cost in micro-dollars
   * @returns Cost in USD
   */
  static microToUsd(costMicros: number): number {
    return costMicros / 1_000_000;
  }

  /**
   * Convert cost from USD to micro-dollars
   *
   * @param costUsd - Cost in USD
   * @returns Cost in micro-dollars
   */
  static usdToMicro(costUsd: number): number {
    return Math.round(costUsd * 1_000_000);
  }

  /**
   * Calculate cost for OpenAI GPT models
   * Pricing as of 2025 (update as needed)
   *
   * @param model - Model name
   * @param promptTokens - Prompt tokens
   * @param completionTokens - Completion tokens
   * @returns Cost in micro-dollars
   */
  static calculateGptCost(
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    // Pricing per 1M tokens (as of 2025)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-4o': { prompt: 2.5, completion: 10.0 }, // $2.50/$10.00 per 1M tokens
      'gpt-4o-mini': { prompt: 0.15, completion: 0.6 }, // $0.15/$0.60 per 1M tokens
      'gpt-4-turbo': { prompt: 10.0, completion: 30.0 }, // $10/$30 per 1M tokens
      'gpt-4': { prompt: 30.0, completion: 60.0 }, // $30/$60 per 1M tokens
      'gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 }, // $0.50/$1.50 per 1M tokens
    };

    const modelPricing = pricing[model] || pricing['gpt-4o']; // Default to gpt-4o

    // Calculate cost per token
    const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt;
    const completionCost = (completionTokens / 1_000_000) * modelPricing.completion;

    // Return in micro-dollars
    return this.usdToMicro(promptCost + completionCost);
  }

  // ============================================== #
  //          Cleanup & Maintenance                 #
  // ============================================== #

  /**
   * Delete usage metrics older than N days
   * For data retention compliance
   *
   * @param days - Keep metrics newer than this many days
   * @returns Count of deleted metrics
   */
  static async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.usageMetric.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Delete all usage metrics for a user
   * For GDPR compliance (right to be forgotten)
   *
   * @param userId - User ID
   * @returns Count of deleted metrics
   */
  static async deleteByUserId(userId: string): Promise<number> {
    const result = await prisma.usageMetric.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  /**
   * Count total usage metrics
   *
   * @param options - Filter options
   * @returns Total count
   */
  static async count(options?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    return prisma.usageMetric.count({
      where: {
        ...(options?.userId ? { userId: options.userId } : {}),
        ...(options?.startDate || options?.endDate
          ? {
              createdAt: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
    });
  }

  // ============================================== #
  //          Helper Methods                        #
  // ============================================== #

  /**
   * Aggregate metrics into daily summary
   *
   * @param metrics - Array of usage metrics
   * @param date - Date for the summary
   * @returns Daily usage summary
   */
  private static aggregateMetrics(
    metrics: UsageMetric[],
    date: Date
  ): DailyUsageSummary {
    const totalRequests = metrics.length;
    const totalTokens = metrics.reduce((sum, m) => sum + m.totalTokens, 0);
    const totalCostMicros = metrics.reduce((sum, m) => sum + m.costMicros, 0);

    // Group by operation
    const operations: DailyUsageSummary['operations'] = {};
    for (const metric of metrics) {
      if (!operations[metric.operation]) {
        operations[metric.operation] = { requests: 0, tokens: 0, costMicros: 0 };
      }
      operations[metric.operation].requests++;
      operations[metric.operation].tokens += metric.totalTokens;
      operations[metric.operation].costMicros += metric.costMicros;
    }

    return {
      date: date.toISOString().split('T')[0], // YYYY-MM-DD
      totalRequests,
      totalTokens,
      totalCostMicros,
      totalCostUsd: this.microToUsd(totalCostMicros),
      operations,
    };
  }

  /**
   * Validate operation type
   *
   * @param operation - Operation type to validate
   * @returns True if valid
   */
  static isValidOperation(operation: string): operation is OperationTypeType {
    return Object.values(OperationType).includes(operation as OperationTypeType);
  }
}
