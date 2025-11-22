/**
 * Conversation Repository
 *
 * Purpose: Manage conversation history and message context for AI chat
 * Pattern: Repository pattern with JSON message storage (SQLite limitation)
 *
 * Usage:
 *   import { ConversationRepository } from './db/repositories/conversation.repository';
 *   await ConversationRepository.addMessage(userId, { role: 'user', content: 'Hello' });
 */

import { prisma } from '../client';
import type { Conversation } from '@prisma/client';
import { createChildLogger } from '../../lib/logger';

const logger = createChildLogger({ module: 'db:repository:conversation' });

/**
 * Message roles
 */
export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole];

/**
 * Message structure (stored as JSON in SQLite)
 */
export interface ChatMessage {
  role: MessageRoleType;
  content: string;
  timestamp: string; // ISO 8601 format
}

/**
 * Conversation creation data
 */
export interface CreateConversationData {
  userId: string;
  expiresAt?: Date;
  messages?: ChatMessage[];
}

/**
 * Conversation with parsed messages
 */
export interface ConversationWithMessages extends Omit<Conversation, 'messages'> {
  messages: ChatMessage[];
}

/**
 * Conversation Repository
 * Manages conversation history with JSON message storage
 */
export class ConversationRepository {
  /**
   * Default TTL for conversations (7 days)
   */
  static readonly DEFAULT_TTL_DAYS = 7;

  /**
   * Maximum messages to keep per conversation (context window limit)
   */
  static readonly MAX_MESSAGES = 10;

  /**
   * Create a new conversation
   *
   * @param data - Conversation creation data
   * @returns Created conversation with parsed messages
   */
  static async create(
    data: CreateConversationData
  ): Promise<ConversationWithMessages> {
    const expiresAt =
      data.expiresAt ||
      new Date(Date.now() + this.DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);

    const messages = data.messages || [];

    const conversation = await prisma.conversation.create({
      data: {
        userId: data.userId,
        messages: JSON.stringify(messages),
        messageCount: messages.length,
        expiresAt,
      },
    });

    return this.parseMessages(conversation);
  }

  /**
   * Find conversation by ID
   *
   * @param id - Conversation ID
   * @returns Conversation with parsed messages or null
   */
  static async findById(id: string): Promise<ConversationWithMessages | null> {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    return conversation ? this.parseMessages(conversation) : null;
  }

  /**
   * Find active conversation for user
   * Returns most recent non-expired conversation
   *
   * @param userId - User ID
   * @returns Active conversation or null
   */
  static async findActiveByUserId(
    userId: string
  ): Promise<ConversationWithMessages | null> {
    const conversation = await prisma.conversation.findFirst({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return conversation ? this.parseMessages(conversation) : null;
  }

  /**
   * Find or create active conversation for user
   * Useful for seamless chat experience
   *
   * @param userId - User ID
   * @returns Active conversation (existing or newly created)
   */
  static async findOrCreateForUser(
    userId: string
  ): Promise<ConversationWithMessages> {
    const existing = await this.findActiveByUserId(userId);

    if (existing) {
      return existing;
    }

    return this.create({ userId });
  }

  /**
   * Get all conversations for a user
   *
   * @param userId - User ID
   * @param options - Query options
   * @returns Array of conversations with parsed messages
   */
  static async findByUserId(
    userId: string,
    options?: {
      includeExpired?: boolean;
      skip?: number;
      take?: number;
    }
  ): Promise<ConversationWithMessages[]> {
    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
        ...(options?.includeExpired
          ? {}
          : {
              expiresAt: {
                gt: new Date(),
              },
            }),
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip: options?.skip,
      take: options?.take,
    });

    return conversations.map((c) => this.parseMessages(c));
  }

  /**
   * Delete conversation by ID
   *
   * @param id - Conversation ID
   * @returns Deleted conversation
   */
  static async delete(id: string): Promise<Conversation> {
    return prisma.conversation.delete({
      where: { id },
    });
  }

  /**
   * Delete all conversations for a user
   * Used for privacy compliance (GDPR)
   *
   * @param userId - User ID
   * @returns Count of deleted conversations
   */
  static async deleteByUserId(userId: string): Promise<number> {
    const result = await prisma.conversation.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  // ============================================== #
  //          Message Management                    #
  // ============================================== #

  /**
   * Add message to conversation
   * Automatically manages message count and context window
   *
   * @param userId - User ID
   * @param message - Message to add
   * @returns Updated conversation
   */
  static async addMessage(
    userId: string,
    message: Omit<ChatMessage, 'timestamp'>
  ): Promise<ConversationWithMessages> {
    // Get or create active conversation
    const conversation = await this.findOrCreateForUser(userId);

    // Add timestamp to message
    const newMessage: ChatMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    // Append to messages array
    const messages = [...conversation.messages, newMessage];

    // Keep only last MAX_MESSAGES messages (context window limit)
    const trimmedMessages = messages.slice(-this.MAX_MESSAGES);

    // Update conversation
    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messages: JSON.stringify(trimmedMessages),
        messageCount: trimmedMessages.length,
      },
    });

    return this.parseMessages(updated);
  }

  /**
   * Get messages from active conversation
   *
   * @param userId - User ID
   * @returns Array of messages (empty if no active conversation)
   */
  static async getMessages(userId: string): Promise<ChatMessage[]> {
    const conversation = await this.findActiveByUserId(userId);
    return conversation?.messages || [];
  }

  /**
   * Get last N messages from active conversation
   *
   * @param userId - User ID
   * @param count - Number of messages to retrieve
   * @returns Array of messages
   */
  static async getLastMessages(
    userId: string,
    count: number
  ): Promise<ChatMessage[]> {
    const messages = await this.getMessages(userId);
    return messages.slice(-count);
  }

  /**
   * Clear conversation history for user
   * Creates new conversation, expires old one
   *
   * @param userId - User ID
   * @returns New empty conversation
   */
  static async clearHistory(userId: string): Promise<ConversationWithMessages> {
    // Expire current conversation
    const current = await this.findActiveByUserId(userId);
    if (current) {
      await prisma.conversation.update({
        where: { id: current.id },
        data: {
          expiresAt: new Date(), // Expire immediately
        },
      });
    }

    // Create new conversation
    return this.create({ userId });
  }

  /**
   * Get conversation context for AI
   * Returns messages formatted for OpenAI API
   *
   * @param userId - User ID
   * @returns Array of messages in OpenAI format
   */
  static async getContext(
    userId: string
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.getMessages(userId);

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get conversation history (alias for getMessages)
   * Test-compatible method
   *
   * @param userId - User ID
   * @param limit - Maximum number of messages to return (optional)
   * @returns Array of chat messages
   */
  static async getHistory(
    userId: string,
    limit?: number
  ): Promise<ChatMessage[]> {
    const messages = await this.getMessages(userId);
    if (limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  // ============================================== #
  //          TTL & Cleanup                         #
  // ============================================== #

  /**
   * Extend conversation expiry
   *
   * @param conversationId - Conversation ID
   * @param days - Days to extend (default: 7)
   * @returns Updated conversation
   */
  static async extendExpiry(
    conversationId: string,
    days: number = this.DEFAULT_TTL_DAYS
  ): Promise<ConversationWithMessages> {
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { expiresAt },
    });

    return this.parseMessages(updated);
  }

  /**
   * Delete expired conversations
   * Should be run periodically (daily cron job)
   *
   * @returns Count of deleted conversations
   */
  static async deleteExpired(): Promise<number> {
    const result = await prisma.conversation.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Get count of expired conversations
   * Useful for monitoring before cleanup
   *
   * @returns Count of expired conversations
   */
  static async countExpired(): Promise<number> {
    return prisma.conversation.count({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }

  /**
   * Get conversations expiring soon
   * Useful for warning users
   *
   * @param withinDays - Days until expiry
   * @returns Array of conversations expiring soon
   */
  static async findExpiringSoon(
    withinDays: number = 1
  ): Promise<ConversationWithMessages[]> {
    const expiryThreshold = new Date(
      Date.now() + withinDays * 24 * 60 * 60 * 1000
    );

    const conversations = await prisma.conversation.findMany({
      where: {
        expiresAt: {
          lte: expiryThreshold,
          gt: new Date(),
        },
      },
      orderBy: {
        expiresAt: 'asc',
      },
    });

    return conversations.map((c) => this.parseMessages(c));
  }

  // ============================================== #
  //          Statistics & Analytics                #
  // ============================================== #

  /**
   * Count total conversations
   *
   * @param activeOnly - Count only active conversations
   * @returns Total count
   */
  static async count(activeOnly: boolean = false): Promise<number> {
    return prisma.conversation.count({
      where: activeOnly
        ? {
            expiresAt: {
              gt: new Date(),
            },
          }
        : {},
    });
  }

  /**
   * Get conversation statistics for user
   *
   * @param userId - User ID
   * @returns Conversation stats
   */
  static async getUserStats(userId: string) {
    const [total, active, totalMessages] = await Promise.all([
      prisma.conversation.count({ where: { userId } }),
      prisma.conversation.count({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.conversation.aggregate({
        where: { userId },
        _sum: {
          messageCount: true,
        },
      }),
    ]);

    return {
      totalConversations: total,
      activeConversations: active,
      totalMessages: totalMessages._sum.messageCount || 0,
    };
  }

  // ============================================== #
  //          Helper Methods                        #
  // ============================================== #

  /**
   * Parse JSON messages from database
   * Handles SQLite string storage limitation
   *
   * @param conversation - Raw conversation from database
   * @returns Conversation with parsed messages
   */
  private static parseMessages(
    conversation: Conversation
  ): ConversationWithMessages {
    let messages: ChatMessage[] = [];

    try {
      messages = JSON.parse(conversation.messages);
    } catch (error) {
      logger.error({
        err: error,
        conversationId: conversation.id,
        messagesLength: conversation.messages?.length
      }, 'Failed to parse conversation messages');
      messages = [];
    }

    return {
      ...conversation,
      messages,
    };
  }

  /**
   * Validate message role
   *
   * @param role - Message role to validate
   * @returns True if valid
   */
  static isValidRole(role: string): role is MessageRoleType {
    return Object.values(MessageRole).includes(role as MessageRoleType);
  }
}
