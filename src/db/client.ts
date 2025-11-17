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
        ? ['query', 'error', 'warn']
        : ['error'],
    // SQLite-specific configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'file:./data/whatsapp-bot.db',
      },
    },
  });

/**
 * Store instance on global object in non-production environments
 * This prevents multiple instances during hot reloads
 */
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed when the process exits
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Test database connection
 * Useful for health checks and startup verification
 *
 * @returns Promise<boolean> - true if connection successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
