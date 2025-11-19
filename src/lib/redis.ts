/**
 * Redis Client Singleton
 *
 * Provides a centralized Redis connection for:
 * - Rate limiting
 * - Job queues (BullMQ)
 * - Session caching
 *
 * Features:
 * - Auto-reconnect
 * - Connection pooling
 * - Health checking
 * - Graceful shutdown
 */

import Redis from 'ioredis';
import { createLogger } from './logger';

const logger = createLogger('redis');

let redisClient: Redis | null = null;
let isRedisEnabled = false;

/**
 * Redis Configuration
 */
interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  enabled?: boolean;
  maxRetriesPerRequest?: number;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
}

/**
 * Parse Redis URL or use individual connection params
 */
function getRedisConfig(): RedisConfig {
  const enabled = process.env.REDIS_ENABLED?.toLowerCase() === 'true';
  const url = process.env.REDIS_URL;

  if (!enabled) {
    logger.info('Redis is disabled');
    return { enabled: false };
  }

  if (url) {
    return {
      url,
      enabled: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false, // Don't queue commands when offline
      lazyConnect: true, // Connect on first command
    };
  }

  // Fallback to individual params
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    enabled: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: true,
  };
}

/**
 * Initialize Redis client (singleton pattern)
 */
export function initRedis(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const config = getRedisConfig();

  if (!config.enabled) {
    isRedisEnabled = false;
    logger.info('Redis disabled, rate limiting will use in-memory fallback');
    return null;
  }

  try {
    // Create Redis client
    if (config.url) {
      redisClient = new Redis(config.url, {
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        enableOfflineQueue: config.enableOfflineQueue,
        lazyConnect: config.lazyConnect,
      });
    } else {
      redisClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        enableOfflineQueue: config.enableOfflineQueue,
        lazyConnect: config.lazyConnect,
      });
    }

    // Connection event handlers
    redisClient.on('connect', () => {
      logger.info({
        host: config.host || 'url',
        port: config.port || 'N/A'
      }, 'Redis connected');
      isRedisEnabled = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready to accept commands');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
      isRedisEnabled = false;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      isRedisEnabled = false;
    });

    redisClient.on('reconnecting', (delay: number) => {
      logger.info({ delay }, 'Redis reconnecting');
    });

    return redisClient;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Redis client');
    isRedisEnabled = false;
    return null;
  }
}

/**
 * Get Redis client (lazy initialization)
 */
export function getRedisClient(): Redis | null {
  if (!redisClient) {
    return initRedis();
  }
  return redisClient;
}

/**
 * Check if Redis is enabled and connected
 */
export function isRedisAvailable(): boolean {
  return isRedisEnabled && redisClient !== null && redisClient.status === 'ready';
}

/**
 * Health check - test Redis connection
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; error?: string }> {
  if (!isRedisEnabled) {
    return { healthy: false, error: 'Redis disabled' };
  }

  if (!redisClient) {
    return { healthy: false, error: 'Redis client not initialized' };
  }

  try {
    // Try to ping Redis
    const result = await redisClient.ping();
    if (result === 'PONG') {
      return { healthy: true };
    }
    return { healthy: false, error: 'Unexpected ping response' };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Graceful shutdown - close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (!redisClient) {
    logger.info('Redis not initialized, nothing to close');
    return;
  }

  try {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    redisClient = null;
    isRedisEnabled = false;
    logger.info('Redis connection closed successfully');
  } catch (error) {
    logger.error({ err: error }, 'Error closing Redis connection');
    // Force disconnect if graceful shutdown fails
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
  }
}

/**
 * Export Redis client for direct use
 */
export { redisClient };

/**
 * Re-export Redis types for convenience
 */
export type { Redis };
