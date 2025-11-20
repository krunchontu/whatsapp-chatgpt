/**
 * Conversation Cleanup Scheduler
 *
 * Periodically deletes expired conversations for GDPR compliance and database maintenance.
 * Runs daily cleanup job to remove conversations older than TTL (7 days by default).
 */

import { ConversationRepository } from './repositories/conversation.repository';
import { logger } from '../lib/logger';

// Cleanup interval: 24 hours (in milliseconds)
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Cleanup immediately on startup (optional, set to false to wait for first interval)
const CLEANUP_ON_STARTUP = true;

let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Run the cleanup job
 * Deletes expired conversations and logs the result
 */
async function runCleanup(): Promise<void> {
  try {
    logger.info({ module: 'cleanup:scheduler' }, 'Starting conversation cleanup job');

    // Get count before cleanup (for logging)
    const expiredCount = await ConversationRepository.countExpired();

    if (expiredCount === 0) {
      logger.info({ module: 'cleanup:scheduler' }, 'No expired conversations to clean up');
      return;
    }

    // Delete expired conversations
    const deletedCount = await ConversationRepository.deleteExpired();

    logger.info(
      {
        module: 'cleanup:scheduler',
        expiredCount,
        deletedCount,
      },
      'Conversation cleanup completed'
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        module: 'cleanup:scheduler',
      },
      'Conversation cleanup failed'
    );
  }
}

/**
 * Start the cleanup scheduler
 * Runs cleanup job at regular intervals
 */
export function startConversationCleanup(): void {
  if (cleanupIntervalId) {
    logger.warn(
      { module: 'cleanup:scheduler' },
      'Cleanup scheduler already running'
    );
    return;
  }

  logger.info(
    {
      module: 'cleanup:scheduler',
      intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1000),
    },
    'Starting conversation cleanup scheduler'
  );

  // Run immediately if configured
  if (CLEANUP_ON_STARTUP) {
    runCleanup().catch((err) => {
      logger.error(
        { err, module: 'cleanup:scheduler' },
        'Initial cleanup failed'
      );
    });
  }

  // Schedule periodic cleanup
  cleanupIntervalId = setInterval(() => {
    runCleanup().catch((err) => {
      logger.error(
        { err, module: 'cleanup:scheduler' },
        'Scheduled cleanup failed'
      );
    });
  }, CLEANUP_INTERVAL_MS);

  logger.info({ module: 'cleanup:scheduler' }, 'Cleanup scheduler started');
}

/**
 * Stop the cleanup scheduler
 * Call this during graceful shutdown
 */
export function stopConversationCleanup(): void {
  if (!cleanupIntervalId) {
    logger.warn(
      { module: 'cleanup:scheduler' },
      'Cleanup scheduler not running'
    );
    return;
  }

  clearInterval(cleanupIntervalId);
  cleanupIntervalId = null;

  logger.info({ module: 'cleanup:scheduler' }, 'Cleanup scheduler stopped');
}

/**
 * Manually trigger a cleanup (for testing or admin commands)
 */
export async function triggerCleanup(): Promise<number> {
  logger.info({ module: 'cleanup:scheduler' }, 'Manual cleanup triggered');
  await runCleanup();

  const remainingExpired = await ConversationRepository.countExpired();
  return remainingExpired;
}

/**
 * Check if cleanup scheduler is running
 */
export function isCleanupRunning(): boolean {
  return cleanupIntervalId !== null;
}
