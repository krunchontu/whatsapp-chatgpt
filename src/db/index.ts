/**
 * Database Module
 *
 * Central export for all database-related functionality
 *
 * Usage:
 *   import { prisma, testConnection, disconnectPrisma } from './db';
 */

// Export Prisma client singleton
export { prisma, testConnection, disconnectPrisma } from './client';

// Re-export Prisma types for convenience
export type { User, Conversation, UsageMetric, SystemConfig } from '@prisma/client';
