/**
 * Audit Logger Service
 *
 * Purpose: High-level service for creating audit log entries
 * Pattern: Service layer with convenience methods for common audit actions
 *
 * Usage:
 *   import { AuditLogger } from './services/auditLogger';
 *   await AuditLogger.logRoleChange({
 *     performedBy: adminUser,
 *     targetUser: user,
 *     oldRole: 'USER',
 *     newRole: 'OPERATOR'
 *   });
 */

import { AuditLogRepository, AuditCategory, AuditAction } from '../db/repositories/auditLog.repository';
import type { User } from '@prisma/client';
import { logger } from '../lib/logger';

// ============================================== #
//          Helper Types                          #
// ============================================== #

interface AuditLogParams {
  performedBy?: User;
  phoneNumber?: string;
  userRole?: string;
}

interface RoleChangeParams extends AuditLogParams {
  performedBy: User;
  targetUser: User;
  oldRole: string;
  newRole: string;
}

interface WhitelistChangeParams extends AuditLogParams {
  performedBy: User;
  targetPhoneNumber: string;
  action: 'ADD' | 'REMOVE';
}

interface PermissionDeniedParams extends AuditLogParams {
  user?: User;
  phoneNumber: string;
  userRole?: string;
  action: string;
  reason?: string;
}

interface ConfigChangeParams extends AuditLogParams {
  performedBy: User;
  setting: string;
  oldValue: any;
  newValue: any;
}

interface UsageQueryParams extends AuditLogParams {
  performedBy: User;
  queryType: string;
  filters?: Record<string, any>;
}

interface AuditLogViewedParams extends AuditLogParams {
  performedBy: User;
  filters: Record<string, any>;
}

interface AuditLogExportedParams extends AuditLogParams {
  performedBy: User;
  format: 'JSON' | 'CSV';
  recordCount: number;
}

interface RateLimitViolationParams {
  phoneNumber: string;
  userRole?: string;
  limitType: 'user' | 'global';
  currentRate?: number;
  limit?: number;
  consumed?: number;
}

interface ModerationFlagParams {
  user: User;
  content?: string; // Redacted or omitted
  flaggedCategories: string[];
}

interface CircuitBreakerParams {
  service: string;
  state: 'OPEN' | 'CLOSED';
  failureCount?: number;
}

interface CostThresholdBreachParams {
  performedBy?: User;
  phoneNumber?: string;
  userRole?: string;
  threshold: number;
  actual: number;
  period: string; // e.g., "daily", "monthly"
}

// ============================================== #
//          Audit Logger Service                  #
// ============================================== #

export class AuditLogger {
  // ============================================== #
  //          Authentication & Authorization        #
  // ============================================== #

  /**
   * Log a role change event
   *
   * @param params - Role change parameters
   *
   * @example
   * await AuditLogger.logRoleChange({
   *   performedBy: adminUser,
   *   targetUser: user,
   *   oldRole: 'USER',
   *   newRole: 'OPERATOR'
   * });
   */
  static async logRoleChange(params: RoleChangeParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action: AuditAction.ROLE_CHANGE,
        category: AuditCategory.AUTH,
        description: `Changed role from ${params.oldRole} to ${params.newRole} for user ${params.targetUser.phoneNumber}`,
        metadata: {
          targetUserId: params.targetUser.id,
          targetPhoneNumber: params.targetUser.phoneNumber,
          oldRole: params.oldRole,
          newRole: params.newRole,
        },
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
          targetUser: params.targetUser.phoneNumber,
          oldRole: params.oldRole,
          newRole: params.newRole,
        },
        'Role change logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log role change');
      // Don't throw - audit logging failures shouldn't break the app
    }
  }

  /**
   * Log a whitelist change event
   *
   * @param params - Whitelist change parameters
   *
   * @example
   * await AuditLogger.logWhitelistChange({
   *   performedBy: adminUser,
   *   targetPhoneNumber: '+1234567890',
   *   action: 'ADD'
   * });
   */
  static async logWhitelistChange(params: WhitelistChangeParams): Promise<void> {
    try {
      const action = params.action === 'ADD' ? AuditAction.WHITELIST_ADD : AuditAction.WHITELIST_REMOVE;

      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action,
        category: AuditCategory.AUTH,
        description: `${params.action === 'ADD' ? 'Added' : 'Removed'} ${params.targetPhoneNumber} ${params.action === 'ADD' ? 'to' : 'from'} whitelist`,
        metadata: {
          targetPhoneNumber: params.targetPhoneNumber,
        },
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
          targetPhoneNumber: params.targetPhoneNumber,
          action: params.action,
        },
        'Whitelist change logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log whitelist change');
    }
  }

  /**
   * Log a permission denied event
   *
   * @param params - Permission denied parameters
   *
   * @example
   * await AuditLogger.logPermissionDenied({
   *   user: user,
   *   phoneNumber: '+1234567890',
   *   action: 'VIEW_AUDIT_LOGS',
   *   reason: 'Requires ADMIN role or higher'
   * });
   */
  static async logPermissionDenied(params: PermissionDeniedParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.user?.id || null,
        phoneNumber: params.phoneNumber,
        userRole: params.user?.role || params.userRole || 'UNKNOWN',
        action: AuditAction.PERMISSION_DENIED,
        category: AuditCategory.AUTH,
        description: `Permission denied for action: ${params.action}${params.reason ? ` - ${params.reason}` : ''}`,
        metadata: {
          attemptedAction: params.action,
          reason: params.reason || 'Insufficient permissions',
        },
      });

      logger.warn(
        {
          phoneNumber: params.phoneNumber,
          userRole: params.user?.role || params.userRole,
          action: params.action,
        },
        'Permission denied logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log permission denied');
    }
  }

  // ============================================== #
  //          Configuration Changes                 #
  // ============================================== #

  /**
   * Log a configuration change event
   *
   * @param params - Config change parameters
   *
   * @example
   * await AuditLogger.logConfigChange({
   *   performedBy: adminUser,
   *   setting: 'gpt.model',
   *   oldValue: 'gpt-3.5-turbo',
   *   newValue: 'gpt-4o'
   * });
   */
  static async logConfigChange(params: ConfigChangeParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action: AuditAction.CONFIG_UPDATE,
        category: AuditCategory.CONFIG,
        description: `Updated configuration: ${params.setting}`,
        metadata: {
          setting: params.setting,
          oldValue: params.oldValue,
          newValue: params.newValue,
        },
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
          setting: params.setting,
          oldValue: params.oldValue,
          newValue: params.newValue,
        },
        'Config change logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log config change');
    }
  }

  // ============================================== #
  //          Administrative Actions                #
  // ============================================== #

  /**
   * Log a usage query event
   *
   * @param params - Usage query parameters
   *
   * @example
   * await AuditLogger.logUsageQuery({
   *   performedBy: adminUser,
   *   queryType: 'global_stats',
   *   filters: { days: 30 }
   * });
   */
  static async logUsageQuery(params: UsageQueryParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action: AuditAction.USAGE_QUERY,
        category: AuditCategory.ADMIN,
        description: `Queried usage statistics: ${params.queryType}`,
        metadata: {
          queryType: params.queryType,
          filters: params.filters || {},
        },
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
          queryType: params.queryType,
        },
        'Usage query logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log usage query');
    }
  }

  /**
   * Log an audit log viewed event
   *
   * @param params - Audit log viewed parameters
   *
   * @example
   * await AuditLogger.logAuditLogViewed({
   *   performedBy: adminUser,
   *   filters: { category: 'AUTH', days: 7 }
   * });
   */
  static async logAuditLogViewed(params: AuditLogViewedParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action: AuditAction.AUDIT_LOG_VIEWED,
        category: AuditCategory.ADMIN,
        description: 'Viewed audit logs',
        metadata: {
          filters: params.filters,
        },
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
          filters: params.filters,
        },
        'Audit log viewed logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log audit log viewed');
    }
  }

  /**
   * Log an audit log exported event
   *
   * @param params - Audit log exported parameters
   *
   * @example
   * await AuditLogger.logAuditLogExported({
   *   performedBy: ownerUser,
   *   format: 'JSON',
   *   recordCount: 1000
   * });
   */
  static async logAuditLogExported(params: AuditLogExportedParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action: AuditAction.AUDIT_LOG_EXPORTED,
        category: AuditCategory.ADMIN,
        description: `Exported ${params.recordCount} audit logs as ${params.format}`,
        metadata: {
          format: params.format,
          recordCount: params.recordCount,
        },
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
          format: params.format,
          recordCount: params.recordCount,
        },
        'Audit log export logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log audit log export');
    }
  }

  /**
   * Log a cost threshold breach event
   *
   * @param params - Cost threshold breach parameters
   *
   * @example
   * await AuditLogger.logCostThresholdBreach({
   *   phoneNumber: '+1234567890',
   *   userRole: 'ADMIN',
   *   threshold: 50,
   *   actual: 75.50,
   *   period: 'daily'
   * });
   */
  static async logCostThresholdBreach(params: CostThresholdBreachParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy?.id || null,
        phoneNumber: params.phoneNumber || 'SYSTEM',
        userRole: params.userRole || 'SYSTEM',
        action: AuditAction.COST_THRESHOLD_BREACH,
        category: AuditCategory.ADMIN,
        description: `Cost threshold breached: ${params.period} cost $${params.actual.toFixed(2)} exceeded threshold $${params.threshold.toFixed(2)}`,
        metadata: {
          threshold: params.threshold,
          actual: params.actual,
          period: params.period,
        },
      });

      logger.warn(
        {
          threshold: params.threshold,
          actual: params.actual,
          period: params.period,
        },
        'Cost threshold breach logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log cost threshold breach');
    }
  }

  /**
   * Log a conversation reset event
   *
   * @param params - Conversation reset parameters
   *
   * @example
   * await AuditLogger.logConversationReset({
   *   performedBy: user,
   * });
   */
  static async logConversationReset(params: { performedBy: User }): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.performedBy.id,
        phoneNumber: params.performedBy.phoneNumber,
        userRole: params.performedBy.role,
        action: AuditAction.CONVERSATION_RESET,
        category: AuditCategory.ADMIN,
        description: 'Reset conversation history',
        metadata: {},
      });

      logger.info(
        {
          performedBy: params.performedBy.phoneNumber,
        },
        'Conversation reset logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log conversation reset');
    }
  }

  // ============================================== #
  //          Security Events                       #
  // ============================================== #

  /**
   * Log a rate limit violation event
   *
   * @param params - Rate limit violation parameters
   *
   * @example
   * await AuditLogger.logRateLimitViolation({
   *   phoneNumber: '+1234567890',
   *   userRole: 'USER',
   *   limitType: 'user',
   *   currentRate: 15
   * });
   */
  static async logRateLimitViolation(params: RateLimitViolationParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: null,
        phoneNumber: params.phoneNumber,
        userRole: params.userRole || 'UNKNOWN',
        action: AuditAction.RATE_LIMIT_VIOLATION,
        category: AuditCategory.SECURITY,
        description: `Rate limit exceeded: ${params.limitType} limit`,
        metadata: {
          limitType: params.limitType,
          currentRate: params.currentRate,
          limit: params.limit,
          consumed: params.consumed,
        },
      });

      logger.warn(
        {
          phoneNumber: params.phoneNumber,
          limitType: params.limitType,
          currentRate: params.currentRate,
        },
        'Rate limit violation logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log rate limit violation');
    }
  }

  /**
   * Log a moderation flag event
   *
   * @param params - Moderation flag parameters
   *
   * @example
   * await AuditLogger.logModerationFlag({
   *   user: user,
   *   flaggedCategories: ['harassment', 'violence']
   * });
   */
  static async logModerationFlag(params: ModerationFlagParams): Promise<void> {
    try {
      await AuditLogRepository.create({
        userId: params.user.id,
        phoneNumber: params.user.phoneNumber,
        userRole: params.user.role,
        action: AuditAction.MODERATION_FLAG,
        category: AuditCategory.SECURITY,
        description: `Content flagged by moderation: ${params.flaggedCategories.join(', ')}`,
        metadata: {
          flaggedCategories: params.flaggedCategories,
          // Do NOT include content to protect privacy
        },
      });

      logger.warn(
        {
          userId: params.user.id,
          phoneNumber: params.user.phoneNumber,
          flaggedCategories: params.flaggedCategories,
        },
        'Moderation flag logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log moderation flag');
    }
  }

  /**
   * Log a circuit breaker state change event
   *
   * @param params - Circuit breaker parameters
   *
   * @example
   * await AuditLogger.logCircuitBreakerChange({
   *   service: 'OpenAI',
   *   state: 'OPEN',
   *   failureCount: 5
   * });
   */
  static async logCircuitBreakerChange(params: CircuitBreakerParams): Promise<void> {
    try {
      const action = params.state === 'OPEN' ? AuditAction.CIRCUIT_BREAKER_OPEN : AuditAction.CIRCUIT_BREAKER_CLOSED;

      await AuditLogRepository.create({
        userId: null,
        phoneNumber: 'SYSTEM',
        userRole: 'SYSTEM',
        action,
        category: AuditCategory.SECURITY,
        description: `Circuit breaker ${params.state} for service: ${params.service}`,
        metadata: {
          service: params.service,
          state: params.state,
          failureCount: params.failureCount,
        },
      });

      logger.warn(
        {
          service: params.service,
          state: params.state,
          failureCount: params.failureCount,
        },
        'Circuit breaker change logged'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log circuit breaker change');
    }
  }
}
