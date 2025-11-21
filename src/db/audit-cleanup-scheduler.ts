/**
 * Audit Log Cleanup Scheduler
 *
 * Purpose: Automatically delete audit logs older than retention period
 * Pattern: Background job that runs daily
 *
 * Usage:
 *   import { startAuditLogCleanupScheduler } from './db/audit-cleanup-scheduler';
 *   await startAuditLogCleanupScheduler();
 */

import { AuditLogRepository } from './repositories/auditLog.repository';
import { logger } from '../lib/logger';

/**
 * Cleanup interval in milliseconds (24 hours)
 */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Default retention period in days
 */
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Interval timer reference
 */
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Clean up expired audit logs
 *
 * @param retentionDays - Number of days to retain logs
 * @returns Number of logs deleted
 */
export async function cleanupExpiredAuditLogs(retentionDays: number): Promise<number> {
  try {
    logger.info({ retentionDays }, 'Starting audit log cleanup');

    const deletedCount = await AuditLogRepository.deleteExpired(retentionDays);

    logger.info(
      {
        deletedCount,
        retentionDays,
      },
      'Audit log cleanup completed'
    );

    return deletedCount;
  } catch (error) {
    logger.error(
      {
        error,
        retentionDays,
      },
      'Failed to cleanup audit logs'
    );
    return 0;
  }
}

/**
 * Start the audit log cleanup scheduler
 *
 * Runs cleanup immediately on startup, then every 24 hours
 *
 * @param retentionDays - Number of days to retain logs (default: from env or 90)
 * @returns Cleanup interval timer
 *
 * @example
 * // Start scheduler with default retention (90 days)
 * await startAuditLogCleanupScheduler();
 *
 * // Start scheduler with custom retention
 * await startAuditLogCleanupScheduler(30);
 */
export async function startAuditLogCleanupScheduler(
  retentionDays?: number
): Promise<NodeJS.Timeout> {
  // Get retention days from env or use provided value or default
  const retention =
    retentionDays ||
    parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS));

  logger.info(
    {
      retentionDays: retention,
      intervalHours: 24,
    },
    'Starting audit log cleanup scheduler'
  );

  // Run cleanup immediately on startup
  await cleanupExpiredAuditLogs(retention);

  // Schedule cleanup to run daily
  cleanupInterval = setInterval(async () => {
    await cleanupExpiredAuditLogs(retention);
  }, CLEANUP_INTERVAL_MS);

  return cleanupInterval;
}

/**
 * Stop the audit log cleanup scheduler
 *
 * @example
 * stopAuditLogCleanupScheduler();
 */
export function stopAuditLogCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Audit log cleanup scheduler stopped');
  }
}

/**
 * Check if scheduler is running
 *
 * @returns True if scheduler is active
 */
export function isSchedulerRunning(): boolean {
  return cleanupInterval !== null;
}
