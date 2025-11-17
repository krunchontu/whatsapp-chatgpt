/**
 * Database Module
 *
 * Central export for all database-related functionality
 *
 * Usage:
 *   import { prisma, testConnection, disconnectPrisma } from './db';
 *   import { UserRepository } from './db';
 */

// Export Prisma client singleton
export { prisma, testConnection, disconnectPrisma } from './client';

// Export repositories
export { UserRepository, UserRole } from './repositories/user.repository';
export type { CreateUserData, UpdateUserData, UserRoleType } from './repositories/user.repository';

export { ConversationRepository, MessageRole } from './repositories/conversation.repository';
export type {
  ChatMessage,
  MessageRoleType,
  CreateConversationData,
  ConversationWithMessages,
} from './repositories/conversation.repository';

// Re-export Prisma types for convenience
export type { User, Conversation, UsageMetric, SystemConfig } from '@prisma/client';
