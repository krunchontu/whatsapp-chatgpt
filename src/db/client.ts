/**
 * Prisma Client Singleton
 *
 * Purpose: Create a single Prisma Client instance for the entire application
 * to avoid connection pooling issues and memory leaks.
 *
 * Pattern: Singleton with global caching in development to survive hot reloads
 *
 * Usage:
 *   import { prisma } from './db/client';
 *   const users = await prisma.user.findMany();
 */

import { PrismaClient } from '@prisma/client';
import { createChildLogger } from '../lib/logger';
import { DatabaseError } from '../lib/errors';

const logger = createChildLogger({ module: 'db:client' });

/**
 * Global type augmentation for Prisma singleton
 * This allows us to store the Prisma client on the global object
 * to prevent multiple instances during hot reloads in development
 */
const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma Client instance with singleton pattern
 *
 * In production: Creates one instance
 * In development: Reuses existing instance from global object to prevent
 *                 creating multiple instances during hot module reloading
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
    // SQLite-specific configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'file:./data/whatsapp-bot.db',
      },
    },
  });

// Setup Prisma logging events
prisma.$on('query' as never, (e: any) => {
  logger.debug({
    query: e.query,
    params: e.params,
    duration: e.duration,
  }, 'Database query executed');
});

prisma.$on('error' as never, (e: any) => {
  logger.error({
    message: e.message,
    target: e.target,
  }, 'Database error occurred');
});

prisma.$on('warn' as never, (e: any) => {
  logger.warn({
    message: e.message,
    target: e.target,
  }, 'Database warning');
});

/**
 * Store instance on global object in non-production environments
 * This prevents multiple instances during hot reloads
 */
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

logger.info({
  environment: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./data/whatsapp-bot.db'
}, 'Prisma client initialized');

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed when the process exits
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    logger.info('Disconnecting from database');
    await prisma.$disconnect();
    logger.info('Database connection closed successfully');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting from database');
    throw new DatabaseError(
      'Failed to disconnect from database',
      'disconnect',
      undefined,
      { error }
    );
  }
}

/**
 * Test database connection
 * Useful for health checks and startup verification
 *
 * @returns Promise<boolean> - true if connection successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    logger.debug('Testing database connection');
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database connection test failed');
    return false;
  }
}
