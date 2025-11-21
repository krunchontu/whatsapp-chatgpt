/**
 * Audit Log Repository
 *
 * Purpose: Handle CRUD operations and queries for audit logs
 * Pattern: Repository pattern with static methods
 *
 * Usage:
 *   import { AuditLogRepository } from './db/repositories/auditLog.repository';
 *   const logs = await AuditLogRepository.findByUser(userId, 50);
 */

import { prisma } from '../client';
import type { AuditLog } from '@prisma/client';

// ============================================== #
//          Types & Enums                         #
// ============================================== #

/**
 * Audit log categories
 * Maps to the category field in the database
 */
export enum AuditCategory {
  AUTH = 'AUTH', // Authentication and authorization events
  CONFIG = 'CONFIG', // Configuration changes
  ADMIN = 'ADMIN', // Administrative actions
  SECURITY = 'SECURITY', // Security events
}

/**
 * Common audit actions
 * These are the standard action values used throughout the app
 */
export enum AuditAction {
  // Authentication & Authorization
  ROLE_CHANGE = 'ROLE_CHANGE',
  WHITELIST_ADD = 'WHITELIST_ADD',
  WHITELIST_REMOVE = 'WHITELIST_REMOVE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // Configuration
  CONFIG_UPDATE = 'CONFIG_UPDATE',
  SYSTEM_SETTING_UPDATE = 'SYSTEM_SETTING_UPDATE',

  // Administrative
  USAGE_QUERY = 'USAGE_QUERY',
  AUDIT_LOG_VIEWED = 'AUDIT_LOG_VIEWED',
  AUDIT_LOG_EXPORTED = 'AUDIT_LOG_EXPORTED',
  COST_THRESHOLD_BREACH = 'COST_THRESHOLD_BREACH',
  CONVERSATION_RESET = 'CONVERSATION_RESET',

  // Security
  RATE_LIMIT_VIOLATION = 'RATE_LIMIT_VIOLATION',
  MODERATION_FLAG = 'MODERATION_FLAG',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  CIRCUIT_BREAKER_CLOSED = 'CIRCUIT_BREAKER_CLOSED',
}

/**
 * Input data for creating an audit log entry
 */
export interface CreateAuditLogData {
  userId?: string | null; // Nullable for system-generated events
  phoneNumber: string;
  userRole: string;
  action: string;
  category: string;
  description: string;
  metadata?: Record<string, any>; // Will be JSON.stringify'd
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  userId?: string;
  phoneNumber?: string;
  category?: AuditCategory;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Audit log with parsed metadata
 */
export interface AuditLogWithMetadata extends Omit<AuditLog, 'metadata'> {
  metadata: Record<string, any>;
}

// ============================================== #
//          Repository Class                      #
// ============================================== #

export class AuditLogRepository {
  // ============================================== #
  //          Create                                #
  // ============================================== #

  /**
   * Create a new audit log entry
   *
   * @param data - Audit log data
   * @returns Created audit log
   *
   * @example
   * await AuditLogRepository.create({
   *   userId: 'user_123',
   *   phoneNumber: '+1234567890',
   *   userRole: 'ADMIN',
   *   action: 'ROLE_CHANGE',
   *   category: AuditCategory.AUTH,
   *   description: 'Promoted user to OPERATOR',
   *   metadata: { oldRole: 'USER', newRole: 'OPERATOR', targetUserId: 'user_456' }
   * });
   */
  static async create(data: CreateAuditLogData): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        phoneNumber: data.phoneNumber,
        userRole: data.userRole,
        action: data.action,
        category: data.category,
        description: data.description,
        metadata: JSON.stringify(data.metadata || {}),
      },
    });
  }

  // ============================================== #
  //          Query Methods                         #
  // ============================================== #

  /**
   * Find audit logs by user ID
   *
   * @param userId - User ID
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Array of audit logs
   *
   * @example
   * const logs = await AuditLogRepository.findByUser('user_123', 100);
   */
  static async findByUser(
    userId: string,
    limit: number = 50
  ): Promise<AuditLogWithMetadata[]> {
    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(this.parseMetadata);
  }

  /**
   * Find audit logs by phone number
   *
   * @param phoneNumber - Phone number
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Array of audit logs
   *
   * @example
   * const logs = await AuditLogRepository.findByPhoneNumber('+1234567890', 100);
   */
  static async findByPhoneNumber(
    phoneNumber: string,
    limit: number = 50
  ): Promise<AuditLogWithMetadata[]> {
    const logs = await prisma.auditLog.findMany({
      where: { phoneNumber },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(this.parseMetadata);
  }

  /**
   * Find audit logs by category
   *
   * @param category - Audit category
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Array of audit logs
   *
   * @example
   * const logs = await AuditLogRepository.findByCategory(AuditCategory.SECURITY, 100);
   */
  static async findByCategory(
    category: AuditCategory,
    limit: number = 50
  ): Promise<AuditLogWithMetadata[]> {
    const logs = await prisma.auditLog.findMany({
      where: { category },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(this.parseMetadata);
  }

  /**
   * Find audit logs by action
   *
   * @param action - Audit action
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Array of audit logs
   *
   * @example
   * const logs = await AuditLogRepository.findByAction(AuditAction.ROLE_CHANGE, 100);
   */
  static async findByAction(
    action: string,
    limit: number = 50
  ): Promise<AuditLogWithMetadata[]> {
    const logs = await prisma.auditLog.findMany({
      where: { action },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(this.parseMetadata);
  }

  /**
   * Find audit logs by date range
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Array of audit logs
   *
   * @example
   * const logs = await AuditLogRepository.findByDateRange(
   *   new Date('2025-01-01'),
   *   new Date('2025-01-31'),
   *   1000
   * );
   */
  static async findByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 50
  ): Promise<AuditLogWithMetadata[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(this.parseMetadata);
  }

  /**
   * Query audit logs with multiple filters
   *
   * @param filters - Query filters
   * @returns Array of audit logs
   *
   * @example
   * const logs = await AuditLogRepository.query({
   *   userId: 'user_123',
   *   category: AuditCategory.AUTH,
   *   startDate: new Date('2025-01-01'),
   *   limit: 100
   * });
   */
  static async query(filters: AuditLogFilters): Promise<AuditLogWithMetadata[]> {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.phoneNumber) {
      where.phoneNumber = filters.phoneNumber;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    return logs.map(this.parseMetadata);
  }

  /**
   * Count audit logs matching filters
   *
   * @param filters - Query filters
   * @returns Total count
   *
   * @example
   * const count = await AuditLogRepository.count({
   *   category: AuditCategory.SECURITY,
   *   startDate: new Date('2025-01-01')
   * });
   */
  static async count(filters: AuditLogFilters): Promise<number> {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.phoneNumber) {
      where.phoneNumber = filters.phoneNumber;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    return prisma.auditLog.count({ where });
  }

  // ============================================== #
  //          Export Methods                        #
  // ============================================== #

  /**
   * Export audit logs to JSON
   *
   * @param filters - Query filters
   * @returns JSON string
   *
   * @example
   * const json = await AuditLogRepository.exportToJSON({
   *   startDate: new Date('2025-01-01'),
   *   endDate: new Date('2025-01-31')
   * });
   */
  static async exportToJSON(filters: AuditLogFilters): Promise<string> {
    const logs = await this.query({ ...filters, limit: 10000 }); // Max 10k logs per export
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Export audit logs to CSV
   *
   * @param filters - Query filters
   * @returns CSV string
   *
   * @example
   * const csv = await AuditLogRepository.exportToCSV({
   *   category: AuditCategory.AUTH
   * });
   */
  static async exportToCSV(filters: AuditLogFilters): Promise<string> {
    const logs = await this.query({ ...filters, limit: 10000 }); // Max 10k logs per export

    if (logs.length === 0) {
      return 'No audit logs found';
    }

    // CSV header
    const headers = [
      'ID',
      'Timestamp',
      'Phone Number',
      'User Role',
      'Category',
      'Action',
      'Description',
      'Metadata',
    ];

    // CSV rows
    const rows = logs.map((log) => [
      log.id,
      log.createdAt.toISOString(),
      log.phoneNumber,
      log.userRole,
      log.category,
      log.action,
      log.description,
      JSON.stringify(log.metadata),
    ]);

    // Combine headers and rows
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')
      ),
    ];

    return csvLines.join('\n');
  }

  // ============================================== #
  //          Cleanup Methods                       #
  // ============================================== #

  /**
   * Delete audit logs older than retention period
   *
   * @param retentionDays - Number of days to retain logs (default: 90)
   * @returns Number of logs deleted
   *
   * @example
   * const deletedCount = await AuditLogRepository.deleteExpired(90);
   */
  static async deleteExpired(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Delete all audit logs for a user (GDPR compliance)
   *
   * @param userId - User ID
   * @returns Number of logs deleted
   *
   * @example
   * const deletedCount = await AuditLogRepository.deleteByUser('user_123');
   */
  static async deleteByUser(userId: string): Promise<number> {
    const result = await prisma.auditLog.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  // ============================================== #
  //          Utility Methods                       #
  // ============================================== #

  /**
   * Parse metadata JSON string to object
   *
   * @param log - Audit log with JSON metadata
   * @returns Audit log with parsed metadata
   */
  private static parseMetadata(log: AuditLog): AuditLogWithMetadata {
    let metadata: Record<string, any> = {};

    try {
      metadata = JSON.parse(log.metadata);
    } catch (error) {
      // If parsing fails, return empty object
      metadata = {};
    }

    return {
      ...log,
      metadata,
    };
  }

  /**
   * Get recent audit logs (last 24 hours)
   *
   * @param limit - Maximum number of logs to return (default: 50)
   * @returns Array of audit logs
   *
   * @example
   * const recentLogs = await AuditLogRepository.getRecent(100);
   */
  static async getRecent(limit: number = 50): Promise<AuditLogWithMetadata[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return this.findByDateRange(yesterday, new Date(), limit);
  }

  /**
   * Get statistics about audit logs
   *
   * @returns Statistics object
   *
   * @example
   * const stats = await AuditLogRepository.getStatistics();
   * // Returns: { total: 1000, byCategory: { AUTH: 500, CONFIG: 300, ... }, ... }
   */
  static async getStatistics(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byAction: Record<string, number>;
    last24Hours: number;
    last7Days: number;
  }> {
    const [
      total,
      authCount,
      configCount,
      adminCount,
      securityCount,
      last24HoursLogs,
      last7DaysLogs,
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { category: AuditCategory.AUTH } }),
      prisma.auditLog.count({ where: { category: AuditCategory.CONFIG } }),
      prisma.auditLog.count({ where: { category: AuditCategory.ADMIN } }),
      prisma.auditLog.count({ where: { category: AuditCategory.SECURITY } }),
      prisma.auditLog.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.auditLog.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Get top actions
    const actionCounts: Record<string, number> = {};
    const allLogs = await prisma.auditLog.findMany({
      select: { action: true },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Sample last 1000 logs
    });

    allLogs.forEach((log) => {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    });

    return {
      total,
      byCategory: {
        [AuditCategory.AUTH]: authCount,
        [AuditCategory.CONFIG]: configCount,
        [AuditCategory.ADMIN]: adminCount,
        [AuditCategory.SECURITY]: securityCount,
      },
      byAction: actionCounts,
      last24Hours: last24HoursLogs,
      last7Days: last7DaysLogs,
    };
  }
}
