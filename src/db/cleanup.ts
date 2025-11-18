/**
 * Database Cleanup Utilities
 *
 * Purpose: Automated cleanup of expired data for GDPR compliance and data retention
 * Pattern: Scheduled job utilities for database maintenance
 *
 * Usage:
 *   import { cleanupExpiredData, cleanupOldData } from './db/cleanup';
 *   await cleanupExpiredData(); // Daily cron job
 *   await cleanupOldData({ conversationDays: 30, usageDays: 90 }); // Retention policy
 */

import { ConversationRepository } from './repositories/conversation.repository';
import { UsageRepository } from './repositories/usage.repository';
import { prisma } from './client';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'db:cleanup' });

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  conversationsDeleted: number;
  usageMetricsDeleted: number;
  totalDeleted: number;
  executionTimeMs: number;
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
  conversationDays?: number; // Delete conversations older than N days
  usageDays?: number; // Delete usage metrics older than N days
  dryRun?: boolean; // Preview what would be deleted without actually deleting
}

/**
 * Cleanup expired conversations (TTL-based)
 * Should be run daily via cron job
 *
 * @returns Number of conversations deleted
 */
export async function cleanupExpiredConversations(): Promise<number> {
  try {
    const deletedCount = await ConversationRepository.deleteExpired();
    logger.info({ deletedCount }, 'Expired conversations cleaned up');
    return deletedCount;
  } catch (error) {
    logger.error({ err: error }, 'Failed to cleanup expired conversations');
    throw error;
  }
}

/**
 * Cleanup old usage metrics (retention policy)
 * For data retention compliance (e.g., keep only last 90 days)
 *
 * @param days - Keep metrics newer than this many days
 * @returns Number of usage metrics deleted
 */
export async function cleanupOldUsageMetrics(days: number): Promise<number> {
  try {
    const deletedCount = await UsageRepository.deleteOlderThan(days);
    logger.info({ deletedCount, days }, 'Old usage metrics cleaned up');
    return deletedCount;
  } catch (error) {
    logger.error({ err: error, days }, 'Failed to cleanup old usage metrics');
    throw error;
  }
}

/**
 * Get cleanup preview (dry run)
 * Shows what would be deleted without actually deleting
 *
 * @param options - Cleanup options
 * @returns Preview statistics
 */
export async function getCleanupPreview(
  options: CleanupOptions = {}
): Promise<CleanupStats> {
  const startTime = Date.now();

  // Count expired conversations
  const expiredConversations = await ConversationRepository.countExpired();

  // Count old usage metrics
  let oldUsageMetrics = 0;
  if (options.usageDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.usageDays);

    oldUsageMetrics = await UsageRepository.count({
      endDate: cutoffDate,
    });
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    conversationsDeleted: expiredConversations,
    usageMetricsDeleted: oldUsageMetrics,
    totalDeleted: expiredConversations + oldUsageMetrics,
    executionTimeMs,
  };
}

/**
 * Cleanup expired data (comprehensive cleanup)
 * Combines conversation and usage cleanup
 *
 * @param options - Cleanup options
 * @returns Cleanup statistics
 */
export async function cleanupExpiredData(
  options: CleanupOptions = {}
): Promise<CleanupStats> {
  const startTime = Date.now();

  // Dry run: preview without deleting
  if (options.dryRun) {
    return getCleanupPreview(options);
  }

  let conversationsDeleted = 0;
  let usageMetricsDeleted = 0;

  try {
    // 1. Cleanup expired conversations
    conversationsDeleted = await cleanupExpiredConversations();

    // 2. Cleanup old usage metrics (if retention days specified)
    if (options.usageDays) {
      usageMetricsDeleted = await cleanupOldUsageMetrics(options.usageDays);
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      conversationsDeleted,
      usageMetricsDeleted,
      totalDeleted: conversationsDeleted + usageMetricsDeleted,
      executionTimeMs,
    };
  } catch (error) {
    logger.error({ err: error, options }, 'Failed to cleanup expired data');
    throw error;
  }
}

/**
 * Cleanup old data based on retention policy
 * For GDPR compliance and data retention requirements
 *
 * @param options - Cleanup options (retention days for each data type)
 * @returns Cleanup statistics
 */
export async function cleanupOldData(
  options: Required<Omit<CleanupOptions, 'dryRun'>>
): Promise<CleanupStats> {
  const startTime = Date.now();

  try {
    let conversationsDeleted = 0;
    let usageMetricsDeleted = 0;

    // 1. Delete old conversations (beyond retention period)
    if (options.conversationDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.conversationDays);

      const result = await prisma.conversation.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      conversationsDeleted = result.count;
    }

    // 2. Delete old usage metrics
    if (options.usageDays) {
      usageMetricsDeleted = await cleanupOldUsageMetrics(options.usageDays);
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      conversationsDeleted,
      usageMetricsDeleted,
      totalDeleted: conversationsDeleted + usageMetricsDeleted,
      executionTimeMs,
    };
  } catch (error) {
    logger.error({ err: error, options }, 'Failed to cleanup old data');
    throw error;
  }
}

/**
 * Cleanup user data (GDPR: Right to be forgotten)
 * Deletes all data for a specific user
 *
 * @param userId - User ID
 * @returns Cleanup statistics
 */
export async function cleanupUserData(userId: string): Promise<CleanupStats> {
  const startTime = Date.now();

  try {
    // Delete all user data (cascades to conversations and usage metrics)
    const conversationsDeleted = await ConversationRepository.deleteByUserId(
      userId
    );
    const usageMetricsDeleted = await UsageRepository.deleteByUserId(userId);

    const executionTimeMs = Date.now() - startTime;

    return {
      conversationsDeleted,
      usageMetricsDeleted,
      totalDeleted: conversationsDeleted + usageMetricsDeleted,
      executionTimeMs,
    };
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to cleanup user data');
    throw error;
  }
}

/**
 * Get database statistics
 * Useful for monitoring and capacity planning
 *
 * @returns Database statistics
 */
export async function getDatabaseStats() {
  try {
    const [
      totalUsers,
      totalConversations,
      activeConversations,
      expiredConversations,
      totalUsageMetrics,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      ConversationRepository.count(true), // Active only
      ConversationRepository.countExpired(),
      prisma.usageMetric.count(),
    ]);

    return {
      users: {
        total: totalUsers,
      },
      conversations: {
        total: totalConversations,
        active: activeConversations,
        expired: expiredConversations,
      },
      usageMetrics: {
        total: totalUsageMetrics,
      },
      storage: {
        estimatedSizeMB: calculateEstimatedDatabaseSize({
          totalUsers,
          totalConversations,
          totalUsageMetrics,
        }),
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get database stats');
    throw error;
  }
}

/**
 * Calculate estimated database size
 * Rough estimation based on record counts
 *
 * @param counts - Record counts
 * @returns Estimated size in MB
 */
function calculateEstimatedDatabaseSize(counts: {
  totalUsers: number;
  totalConversations: number;
  totalUsageMetrics: number;
}): number {
  // Rough estimates (in KB):
  // - User: 1 KB (basic fields)
  // - Conversation: 5 KB (with 10 messages @ ~0.5KB each)
  // - UsageMetric: 0.5 KB (small record)

  const userSizeKB = counts.totalUsers * 1;
  const conversationSizeKB = counts.totalConversations * 5;
  const usageSizeKB = counts.totalUsageMetrics * 0.5;

  const totalSizeKB = userSizeKB + conversationSizeKB + usageSizeKB;
  const totalSizeMB = totalSizeKB / 1024;

  return Math.round(totalSizeMB * 100) / 100; // Round to 2 decimal places
}

/**
 * Optimize database (SQLite-specific)
 * Runs VACUUM and ANALYZE to optimize database performance
 *
 * @returns Optimization statistics
 */
export async function optimizeDatabase(): Promise<{
  success: boolean;
  executionTimeMs: number;
}> {
  const startTime = Date.now();

  try {
    // SQLite VACUUM: Rebuild database file to reclaim unused space
    await prisma.$executeRawUnsafe('VACUUM;');

    // SQLite ANALYZE: Update query planner statistics
    await prisma.$executeRawUnsafe('ANALYZE;');

    const executionTimeMs = Date.now() - startTime;

    return {
      success: true,
      executionTimeMs,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to optimize database');
    throw error;
  }
}

/**
 * Scheduled cleanup job
 * Runs all cleanup tasks (intended for daily cron job)
 *
 * @param options - Cleanup options
 * @returns Combined cleanup statistics
 */
export async function runScheduledCleanup(
  options: CleanupOptions = {}
): Promise<{
  cleanup: CleanupStats;
  optimization: { success: boolean; executionTimeMs: number };
  databaseStats: Awaited<ReturnType<typeof getDatabaseStats>>;
}> {
  const startTime = Date.now();

  try {
    logger.info({ options }, 'Starting scheduled cleanup job');

    // 1. Get database stats before cleanup
    const statsBefore = await getDatabaseStats();
    logger.info({ stats: statsBefore }, 'Database stats before cleanup');

    // 2. Run cleanup
    const cleanupStats = await cleanupExpiredData(options);
    logger.info({ stats: cleanupStats }, 'Cleanup completed');

    // 3. Optimize database
    const optimizationStats = await optimizeDatabase();
    logger.info({ stats: optimizationStats }, 'Database optimization completed');

    // 4. Get database stats after cleanup
    const statsAfter = await getDatabaseStats();
    logger.info({ stats: statsAfter }, 'Database stats after cleanup');

    const totalExecutionTimeMs = Date.now() - startTime;
    logger.info({ executionTimeMs: totalExecutionTimeMs }, 'Scheduled cleanup job completed');

    return {
      cleanup: cleanupStats,
      optimization: optimizationStats,
      databaseStats: statsAfter,
    };
  } catch (error) {
    logger.error({ err: error, options }, 'Scheduled cleanup job failed');
    throw error;
  }
}
