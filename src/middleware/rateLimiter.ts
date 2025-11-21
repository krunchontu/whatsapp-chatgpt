/**
 * Rate Limiter Middleware
 *
 * Implements two-level rate limiting:
 * 1. Per-user limits (e.g., 10 messages/minute per user)
 * 2. Global limits (e.g., 100 messages/minute total)
 *
 * Uses Redis for distributed rate limiting, falls back to in-memory if Redis unavailable.
 *
 * MVP Targets:
 * - Per-user: 10 messages/minute
 * - Global: 100 messages/minute
 */

import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { Message } from 'whatsapp-web.js';
import { getRedisClient, isRedisAvailable } from '../lib/redis';
import { createLogger } from '../lib/logger';
import { RateLimitError } from '../lib/errors/RateLimitError';
import { config } from '../config';
import { AuditLogger } from '../services/auditLogger';

const logger = createLogger('rateLimiter');

// Rate limiter instances
let perUserLimiter: RateLimiterRedis | RateLimiterMemory | null = null;
let globalLimiter: RateLimiterRedis | RateLimiterMemory | null = null;

/**
 * Initialize rate limiters (called once at startup)
 */
export function initRateLimiters(): void {
  if (!config.rateLimitEnabled) {
    logger.info('Rate limiting disabled');
    return;
  }

  const redis = getRedisClient();
  const useRedis = isRedisAvailable();

  // Per-user rate limiter
  if (useRedis && redis) {
    perUserLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'rl:user',
      points: config.rateLimitPerUser,
      duration: config.rateLimitPerUserWindow,
      blockDuration: 0, // Don't block, just reject
    });
    logger.info({
      points: config.rateLimitPerUser,
      duration: config.rateLimitPerUserWindow
    }, 'Per-user rate limiter initialized (Redis)');
  } else {
    perUserLimiter = new RateLimiterMemory({
      keyPrefix: 'rl:user',
      points: config.rateLimitPerUser,
      duration: config.rateLimitPerUserWindow,
      blockDuration: 0,
    });
    logger.info({
      points: config.rateLimitPerUser,
      duration: config.rateLimitPerUserWindow
    }, 'Per-user rate limiter initialized (Memory)');
  }

  // Global rate limiter
  if (useRedis && redis) {
    globalLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'rl:global',
      points: config.rateLimitGlobal,
      duration: config.rateLimitGlobalWindow,
      blockDuration: 0,
    });
    logger.info({
      points: config.rateLimitGlobal,
      duration: config.rateLimitGlobalWindow
    }, 'Global rate limiter initialized (Redis)');
  } else {
    globalLimiter = new RateLimiterMemory({
      keyPrefix: 'rl:global',
      points: config.rateLimitGlobal,
      duration: config.rateLimitGlobalWindow,
      blockDuration: 0,
    });
    logger.info({
      points: config.rateLimitGlobal,
      duration: config.rateLimitGlobalWindow
    }, 'Global rate limiter initialized (Memory)');
  }
}

/**
 * Extract user identifier from WhatsApp message
 */
function getUserKey(message: Message): string {
  // Use phone number as key (e.g., "1234567890@c.us")
  return message.from;
}

/**
 * Check if message should bypass rate limiting
 * (e.g., admin users, whitelisted numbers)
 */
function shouldBypassRateLimit(message: Message): boolean {
  // Extract phone number without @c.us suffix
  const phoneNumber = message.from.replace('@c.us', '');

  // Check if user is whitelisted
  if (config.whitelistedEnabled && config.whitelistedPhoneNumbers.includes(phoneNumber)) {
    return true;
  }

  // Add more bypass logic here if needed (e.g., admin role)
  return false;
}

/**
 * Format rate limit error message
 */
function formatRateLimitError(
  limiterRes: RateLimiterRes,
  limitType: 'user' | 'global'
): string {
  const msBeforeNext = limiterRes.msBeforeNext || 0;
  const secondsBeforeNext = Math.ceil(msBeforeNext / 1000);
  const minutesBeforeNext = Math.ceil(secondsBeforeNext / 60);

  if (limitType === 'user') {
    if (minutesBeforeNext > 1) {
      return `⏳ You are sending messages too quickly. Please wait ${minutesBeforeNext} minutes before trying again.`;
    } else if (secondsBeforeNext > 10) {
      return `⏳ You are sending messages too quickly. Please wait ${secondsBeforeNext} seconds before trying again.`;
    } else {
      return '⏳ You are sending messages too quickly. Please wait a moment before trying again.';
    }
  } else {
    return '⏳ The bot is experiencing high traffic. Please try again in a moment.';
  }
}

/**
 * Rate limit middleware for WhatsApp messages
 *
 * Checks both per-user and global rate limits.
 * Throws RateLimitError if limits exceeded.
 *
 * @param message WhatsApp message
 * @throws {RateLimitError} If rate limit exceeded
 */
export async function checkRateLimit(message: Message): Promise<void> {
  // Rate limiting disabled
  if (!config.rateLimitEnabled) {
    return;
  }

  // Rate limiters not initialized
  if (!perUserLimiter || !globalLimiter) {
    logger.warn('Rate limiters not initialized, skipping check');
    return;
  }

  // Check if user should bypass rate limiting
  if (shouldBypassRateLimit(message)) {
    logger.debug({ from: message.from }, 'User bypassing rate limit');
    return;
  }

  const userKey = getUserKey(message);

  try {
    // Check per-user rate limit
    try {
      await perUserLimiter.consume(userKey, 1);
    } catch (rejRes) {
      if (rejRes instanceof Error) {
        // Unexpected error
        logger.error({ err: rejRes, userKey }, 'Per-user rate limiter error');
        // Continue - don't block on rate limiter errors
        return;
      }

      // Rate limit exceeded
      const limiterRes = rejRes as RateLimiterRes;
      const retryAfter = Math.ceil((limiterRes.msBeforeNext || 0) / 1000);

      logger.warn({
        userKey,
        limit: config.rateLimitPerUser,
        retryAfter
      }, 'Per-user rate limit exceeded');

      // Log rate limit violation to audit log
      await AuditLogger.logRateLimitViolation({
        phoneNumber: userKey,
        limitType: 'user',
        limit: config.rateLimitPerUser,
        consumed: limiterRes.consumedPoints
      });

      throw new RateLimitError(
        formatRateLimitError(limiterRes, 'user'),
        config.rateLimitPerUser,
        retryAfter,
        {
          userKey,
          limitType: 'user',
          consumed: limiterRes.consumedPoints,
          remainingPoints: limiterRes.remainingPoints
        }
      );
    }

    // Check global rate limit
    try {
      await globalLimiter.consume('global', 1);
    } catch (rejRes) {
      if (rejRes instanceof Error) {
        // Unexpected error
        logger.error({ err: rejRes }, 'Global rate limiter error');
        // Continue - don't block on rate limiter errors
        return;
      }

      // Rate limit exceeded
      const limiterRes = rejRes as RateLimiterRes;
      const retryAfter = Math.ceil((limiterRes.msBeforeNext || 0) / 1000);

      logger.warn({
        limit: config.rateLimitGlobal,
        retryAfter
      }, 'Global rate limit exceeded');

      // Log rate limit violation to audit log
      await AuditLogger.logRateLimitViolation({
        phoneNumber: 'GLOBAL',
        limitType: 'global',
        limit: config.rateLimitGlobal,
        consumed: limiterRes.consumedPoints
      });

      throw new RateLimitError(
        formatRateLimitError(limiterRes, 'global'),
        config.rateLimitGlobal,
        retryAfter,
        {
          limitType: 'global',
          consumed: limiterRes.consumedPoints,
          remainingPoints: limiterRes.remainingPoints
        }
      );
    }

    logger.debug({ userKey }, 'Rate limit check passed');
  } catch (error) {
    // Re-throw RateLimitError
    if (error instanceof RateLimitError) {
      throw error;
    }

    // Log unexpected errors but don't block
    logger.error({ err: error, userKey }, 'Unexpected rate limiter error');
  }
}

/**
 * Get current rate limit status for a user
 * Useful for debugging and monitoring
 */
export async function getRateLimitStatus(
  phoneNumber: string
): Promise<{ user: any; global: any }> {
  if (!perUserLimiter || !globalLimiter) {
    return {
      user: { available: false },
      global: { available: false }
    };
  }

  try {
    const userKey = `${phoneNumber}@c.us`;

    // This is a hack - rate-limiter-flexible doesn't have a get() method
    // So we "consume" 0 points to check status without affecting the limit
    const userRes = await perUserLimiter.get(userKey);
    const globalRes = await globalLimiter.get('global');

    return {
      user: userRes ? {
        consumed: userRes.consumedPoints,
        remaining: userRes.remainingPoints,
        total: config.rateLimitPerUser,
        resetAt: new Date(Date.now() + (userRes.msBeforeNext || 0))
      } : {
        consumed: 0,
        remaining: config.rateLimitPerUser,
        total: config.rateLimitPerUser
      },
      global: globalRes ? {
        consumed: globalRes.consumedPoints,
        remaining: globalRes.remainingPoints,
        total: config.rateLimitGlobal,
        resetAt: new Date(Date.now() + (globalRes.msBeforeNext || 0))
      } : {
        consumed: 0,
        remaining: config.rateLimitGlobal,
        total: config.rateLimitGlobal
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'Error getting rate limit status');
    return {
      user: { error: 'Failed to get status' },
      global: { error: 'Failed to get status' }
    };
  }
}

/**
 * Reset rate limits for a user (admin function)
 */
export async function resetUserRateLimit(phoneNumber: string): Promise<void> {
  if (!perUserLimiter) {
    return;
  }

  try {
    const userKey = `${phoneNumber}@c.us`;
    await perUserLimiter.delete(userKey);
    logger.info({ phoneNumber }, 'User rate limit reset');
  } catch (error) {
    logger.error({ err: error, phoneNumber }, 'Error resetting user rate limit');
  }
}

/**
 * Export for testing
 */
export {
  perUserLimiter,
  globalLimiter,
};
