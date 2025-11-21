/**
 * AuditLogger Service Tests
 *
 * Purpose: Test all logging helper methods in AuditLogger service
 * Run: pnpm test src/services/__tests__/auditLogger.test.ts
 *
 * Coverage:
 * - Authentication & Authorization logging (8 tests)
 * - Configuration change logging (6 tests)
 * - Administrative action logging (6 tests)
 * - Security event logging (6 tests)
 * - Error handling & resilience (4 tests)
 * Total: 30 tests
 */

// Mock dependencies BEFORE importing modules that use them
jest.mock('../../db/repositories/auditLog.repository');
jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { AuditLogger } from '../auditLogger';
import { AuditLogRepository, AuditCategory, AuditAction } from '../../db/repositories/auditLog.repository';
import { logger } from '../../lib/logger';
import type { User } from '@prisma/client';

describe('AuditLogger Service', () => {
  // Test fixtures
  let mockUser: User;
  let mockAdmin: User;
  let mockOperator: User;
  let mockTargetUser: User;

  beforeAll(() => {
    // Create test user fixtures
    mockUser = {
      id: 'user-123',
      phoneNumber: '+1234567890',
      role: 'USER',
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockAdmin = {
      id: 'admin-456',
      phoneNumber: '+0987654321',
      role: 'ADMIN',
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockOperator = {
      id: 'operator-789',
      phoneNumber: '+1122334455',
      role: 'OPERATOR',
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockTargetUser = {
      id: 'target-999',
      phoneNumber: '+9876543210',
      role: 'USER',
      whitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================== #
  //    A. Authentication & Authorization (8)       #
  // ============================================== #

  describe('Authentication & Authorization Logging', () => {
    describe('logRoleChange', () => {
      it('should log role change from USER to OPERATOR', async () => {
        await AuditLogger.logRoleChange({
          performedBy: mockAdmin,
          targetUser: mockUser,
          oldRole: 'USER',
          newRole: 'OPERATOR',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.ROLE_CHANGE,
          category: AuditCategory.AUTH,
          description: `Changed role from USER to OPERATOR for user ${mockUser.phoneNumber}`,
          metadata: {
            targetUserId: mockUser.id,
            targetPhoneNumber: mockUser.phoneNumber,
            oldRole: 'USER',
            newRole: 'OPERATOR',
          },
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            performedBy: mockAdmin.phoneNumber,
            targetUser: mockUser.phoneNumber,
            oldRole: 'USER',
            newRole: 'OPERATOR',
          }),
          'Role change logged'
        );
      });

      it('should log role change from ADMIN to USER', async () => {
        await AuditLogger.logRoleChange({
          performedBy: mockAdmin,
          targetUser: mockOperator,
          oldRole: 'ADMIN',
          newRole: 'USER',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.ROLE_CHANGE,
            category: AuditCategory.AUTH,
            metadata: expect.objectContaining({
              oldRole: 'ADMIN',
              newRole: 'USER',
            }),
          })
        );
      });

      it('should log role change with full metadata', async () => {
        await AuditLogger.logRoleChange({
          performedBy: mockAdmin,
          targetUser: mockTargetUser,
          oldRole: 'OPERATOR',
          newRole: 'ADMIN',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: {
              targetUserId: mockTargetUser.id,
              targetPhoneNumber: mockTargetUser.phoneNumber,
              oldRole: 'OPERATOR',
              newRole: 'ADMIN',
            },
          })
        );
      });
    });

    describe('logWhitelistChange', () => {
      it('should log whitelist addition', async () => {
        await AuditLogger.logWhitelistChange({
          performedBy: mockAdmin,
          targetPhoneNumber: '+1111111111',
          action: 'ADD',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.WHITELIST_ADD,
          category: AuditCategory.AUTH,
          description: 'Added +1111111111 to whitelist',
          metadata: {
            targetPhoneNumber: '+1111111111',
          },
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            performedBy: mockAdmin.phoneNumber,
            targetPhoneNumber: '+1111111111',
            action: 'ADD',
          }),
          'Whitelist change logged'
        );
      });

      it('should log whitelist removal', async () => {
        await AuditLogger.logWhitelistChange({
          performedBy: mockAdmin,
          targetPhoneNumber: '+2222222222',
          action: 'REMOVE',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.WHITELIST_REMOVE,
          category: AuditCategory.AUTH,
          description: 'Removed +2222222222 from whitelist',
          metadata: {
            targetPhoneNumber: '+2222222222',
          },
        });
      });
    });

    describe('logPermissionDenied', () => {
      it('should log permission denied with reason', async () => {
        await AuditLogger.logPermissionDenied({
          user: mockUser,
          phoneNumber: mockUser.phoneNumber,
          action: 'VIEW_AUDIT_LOGS',
          reason: 'Requires ADMIN role or higher',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockUser.id,
          phoneNumber: mockUser.phoneNumber,
          userRole: mockUser.role,
          action: AuditAction.PERMISSION_DENIED,
          category: AuditCategory.AUTH,
          description: 'Permission denied for action: VIEW_AUDIT_LOGS - Requires ADMIN role or higher',
          metadata: {
            attemptedAction: 'VIEW_AUDIT_LOGS',
            reason: 'Requires ADMIN role or higher',
          },
        });

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            phoneNumber: mockUser.phoneNumber,
            userRole: mockUser.role,
            action: 'VIEW_AUDIT_LOGS',
          }),
          'Permission denied logged'
        );
      });

      it('should log permission denied without user object', async () => {
        await AuditLogger.logPermissionDenied({
          phoneNumber: '+9999999999',
          userRole: 'UNKNOWN',
          action: 'UNAUTHORIZED_ACCESS',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: null,
          phoneNumber: '+9999999999',
          userRole: 'UNKNOWN',
          action: AuditAction.PERMISSION_DENIED,
          category: AuditCategory.AUTH,
          description: 'Permission denied for action: UNAUTHORIZED_ACCESS',
          metadata: {
            attemptedAction: 'UNAUTHORIZED_ACCESS',
            reason: 'Insufficient permissions',
          },
        });
      });

      it('should handle repository errors gracefully (auth)', async () => {
        (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('DB Error'));

        await expect(
          AuditLogger.logWhitelistChange({
            performedBy: mockAdmin,
            targetPhoneNumber: '+1111111111',
            action: 'ADD',
          })
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  // ============================================== #
  //      B. Configuration Changes (6)              #
  // ============================================== #

  describe('Configuration Change Logging', () => {
    describe('logConfigChange', () => {
      it('should log basic config change', async () => {
        await AuditLogger.logConfigChange({
          performedBy: mockAdmin,
          setting: 'gpt.model',
          oldValue: 'gpt-3.5-turbo',
          newValue: 'gpt-4o',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.CONFIG_UPDATE,
          category: AuditCategory.CONFIG,
          description: 'Updated configuration: gpt.model',
          metadata: {
            setting: 'gpt.model',
            oldValue: 'gpt-3.5-turbo',
            newValue: 'gpt-4o',
          },
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            performedBy: mockAdmin.phoneNumber,
            setting: 'gpt.model',
            oldValue: 'gpt-3.5-turbo',
            newValue: 'gpt-4o',
          }),
          'Config change logged'
        );
      });

      it('should log config change with complex metadata', async () => {
        await AuditLogger.logConfigChange({
          performedBy: mockAdmin,
          setting: 'dalle.size',
          oldValue: { width: 512, height: 512 },
          newValue: { width: 1024, height: 1024 },
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.CONFIG_UPDATE,
            category: AuditCategory.CONFIG,
            metadata: expect.objectContaining({
              setting: 'dalle.size',
              oldValue: { width: 512, height: 512 },
              newValue: { width: 1024, height: 1024 },
            }),
          })
        );
      });

      it('should log config changes by different users', async () => {
        // First change by admin
        await AuditLogger.logConfigChange({
          performedBy: mockAdmin,
          setting: 'language',
          oldValue: 'en',
          newValue: 'es',
        });

        // Second change by operator
        await AuditLogger.logConfigChange({
          performedBy: mockOperator,
          setting: 'language',
          oldValue: 'es',
          newValue: 'fr',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledTimes(2);
        expect(AuditLogRepository.create).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            userId: mockAdmin.id,
            phoneNumber: mockAdmin.phoneNumber,
          })
        );
        expect(AuditLogRepository.create).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            userId: mockOperator.id,
            phoneNumber: mockOperator.phoneNumber,
          })
        );
      });

      it('should log config change with null/undefined values', async () => {
        await AuditLogger.logConfigChange({
          performedBy: mockAdmin,
          setting: 'optional.feature',
          oldValue: null,
          newValue: undefined,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.CONFIG_UPDATE,
            category: AuditCategory.CONFIG,
            metadata: expect.objectContaining({
              setting: 'optional.feature',
              oldValue: null,
              newValue: undefined,
            }),
          })
        );
      });

      it('should log config change with boolean values', async () => {
        await AuditLogger.logConfigChange({
          performedBy: mockAdmin,
          setting: 'feature.enabled',
          oldValue: false,
          newValue: true,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              oldValue: false,
              newValue: true,
            }),
          })
        );
      });

      it('should handle repository errors gracefully', async () => {
        (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('Database error'));

        // Should not throw
        await expect(
          AuditLogger.logConfigChange({
            performedBy: mockAdmin,
            setting: 'test.setting',
            oldValue: 'old',
            newValue: 'new',
          })
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          'Failed to log config change'
        );
      });
    });
  });

  // ============================================== #
  //    C. Administrative Actions (6)               #
  // ============================================== #

  describe('Administrative Action Logging', () => {
    describe('logUsageQuery', () => {
      it('should log usage query with filters', async () => {
        await AuditLogger.logUsageQuery({
          performedBy: mockAdmin,
          queryType: 'global_stats',
          filters: { days: 30, operation: 'CHAT' },
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.USAGE_QUERY,
          category: AuditCategory.ADMIN,
          description: 'Queried usage statistics: global_stats',
          metadata: {
            queryType: 'global_stats',
            filters: { days: 30, operation: 'CHAT' },
          },
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            performedBy: mockAdmin.phoneNumber,
            queryType: 'global_stats',
          }),
          'Usage query logged'
        );
      });
    });

    describe('logAuditLogViewed', () => {
      it('should log audit log viewed with filters', async () => {
        await AuditLogger.logAuditLogViewed({
          performedBy: mockAdmin,
          filters: { category: 'AUTH', days: 7 },
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.AUDIT_LOG_VIEWED,
          category: AuditCategory.ADMIN,
          description: 'Viewed audit logs',
          metadata: {
            filters: { category: 'AUTH', days: 7 },
          },
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            performedBy: mockAdmin.phoneNumber,
            filters: { category: 'AUTH', days: 7 },
          }),
          'Audit log viewed logged'
        );
      });
    });

    describe('logAuditLogExported', () => {
      it('should log audit log exported as JSON', async () => {
        await AuditLogger.logAuditLogExported({
          performedBy: mockAdmin,
          format: 'JSON',
          recordCount: 1000,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockAdmin.id,
          phoneNumber: mockAdmin.phoneNumber,
          userRole: mockAdmin.role,
          action: AuditAction.AUDIT_LOG_EXPORTED,
          category: AuditCategory.ADMIN,
          description: 'Exported 1000 audit logs as JSON',
          metadata: {
            format: 'JSON',
            recordCount: 1000,
          },
        });
      });

      it('should log audit log exported with record count', async () => {
        await AuditLogger.logAuditLogExported({
          performedBy: mockAdmin,
          format: 'CSV',
          recordCount: 500,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Exported 500 audit logs as CSV',
            metadata: {
              format: 'CSV',
              recordCount: 500,
            },
          })
        );
      });
    });

    describe('logCostThresholdBreach', () => {
      it('should log cost threshold breach with system user', async () => {
        await AuditLogger.logCostThresholdBreach({
          phoneNumber: 'SYSTEM',
          userRole: 'SYSTEM',
          threshold: 50.0,
          actual: 75.5,
          period: 'daily',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: null,
          phoneNumber: 'SYSTEM',
          userRole: 'SYSTEM',
          action: AuditAction.COST_THRESHOLD_BREACH,
          category: AuditCategory.ADMIN,
          description: 'Cost threshold breached: daily cost $75.50 exceeded threshold $50.00',
          metadata: {
            threshold: 50.0,
            actual: 75.5,
            period: 'daily',
          },
        });

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            threshold: 50.0,
            actual: 75.5,
            period: 'daily',
          }),
          'Cost threshold breach logged'
        );
      });
    });

    describe('logConversationReset', () => {
      it('should log conversation reset', async () => {
        await AuditLogger.logConversationReset({
          performedBy: mockUser,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockUser.id,
          phoneNumber: mockUser.phoneNumber,
          userRole: mockUser.role,
          action: AuditAction.CONVERSATION_RESET,
          category: AuditCategory.ADMIN,
          description: 'Reset conversation history',
          metadata: {},
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            performedBy: mockUser.phoneNumber,
          }),
          'Conversation reset logged'
        );
      });
    });
  });

  // ============================================== #
  //       D. Security Events (6)                   #
  // ============================================== #

  describe('Security Event Logging', () => {
    describe('logRateLimitViolation', () => {
      it('should log per-user rate limit violation', async () => {
        await AuditLogger.logRateLimitViolation({
          phoneNumber: mockUser.phoneNumber,
          userRole: mockUser.role,
          limitType: 'user',
          currentRate: 15,
          limit: 10,
          consumed: 15,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: null,
          phoneNumber: mockUser.phoneNumber,
          userRole: mockUser.role,
          action: AuditAction.RATE_LIMIT_VIOLATION,
          category: AuditCategory.SECURITY,
          description: 'Rate limit exceeded: user limit',
          metadata: {
            limitType: 'user',
            currentRate: 15,
            limit: 10,
            consumed: 15,
          },
        });

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            phoneNumber: mockUser.phoneNumber,
            limitType: 'user',
            currentRate: 15,
          }),
          'Rate limit violation logged'
        );
      });

      it('should log global rate limit violation', async () => {
        await AuditLogger.logRateLimitViolation({
          phoneNumber: 'SYSTEM',
          limitType: 'global',
          currentRate: 1500,
          limit: 1000,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: null,
          phoneNumber: 'SYSTEM',
          userRole: 'UNKNOWN',
          action: AuditAction.RATE_LIMIT_VIOLATION,
          category: AuditCategory.SECURITY,
          description: 'Rate limit exceeded: global limit',
          metadata: {
            limitType: 'global',
            currentRate: 1500,
            limit: 1000,
            consumed: undefined,
          },
        });
      });
    });

    describe('logModerationFlag', () => {
      it('should log moderation flag with categories', async () => {
        await AuditLogger.logModerationFlag({
          user: mockUser,
          flaggedCategories: ['harassment', 'violence'],
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: mockUser.id,
          phoneNumber: mockUser.phoneNumber,
          userRole: mockUser.role,
          action: AuditAction.MODERATION_FLAG,
          category: AuditCategory.SECURITY,
          description: 'Content flagged by moderation: harassment, violence',
          metadata: {
            flaggedCategories: ['harassment', 'violence'],
          },
        });

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: mockUser.id,
            phoneNumber: mockUser.phoneNumber,
            flaggedCategories: ['harassment', 'violence'],
          }),
          'Moderation flag logged'
        );
      });
    });

    describe('logCircuitBreakerChange', () => {
      it('should log circuit breaker open', async () => {
        await AuditLogger.logCircuitBreakerChange({
          service: 'OpenAI',
          state: 'OPEN',
          failureCount: 5,
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: null,
          phoneNumber: 'SYSTEM',
          userRole: 'SYSTEM',
          action: AuditAction.CIRCUIT_BREAKER_OPEN,
          category: AuditCategory.SECURITY,
          description: 'Circuit breaker OPEN for service: OpenAI',
          metadata: {
            service: 'OpenAI',
            state: 'OPEN',
            failureCount: 5,
          },
        });

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            service: 'OpenAI',
            state: 'OPEN',
            failureCount: 5,
          }),
          'Circuit breaker change logged'
        );
      });

      it('should log circuit breaker closed', async () => {
        await AuditLogger.logCircuitBreakerChange({
          service: 'OpenAI',
          state: 'CLOSED',
        });

        expect(AuditLogRepository.create).toHaveBeenCalledWith({
          userId: null,
          phoneNumber: 'SYSTEM',
          userRole: 'SYSTEM',
          action: AuditAction.CIRCUIT_BREAKER_CLOSED,
          category: AuditCategory.SECURITY,
          description: 'Circuit breaker CLOSED for service: OpenAI',
          metadata: {
            service: 'OpenAI',
            state: 'CLOSED',
            failureCount: undefined,
          },
        });
      });

      it('should handle repository errors gracefully (security)', async () => {
        (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('DB Error'));

        await expect(
          AuditLogger.logModerationFlag({
            user: mockUser,
            flaggedCategories: ['test'],
          })
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  // ============================================== #
  //   E. Error Handling & Resilience (4)           #
  // ============================================== #

  describe('Error Handling & Resilience', () => {
    it('should handle repository errors without throwing (role change)', async () => {
      (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      await expect(
        AuditLogger.logRoleChange({
          performedBy: mockAdmin,
          targetUser: mockUser,
          oldRole: 'USER',
          newRole: 'OPERATOR',
        })
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to log role change'
      );
    });

    it('should handle repository errors without throwing (security events)', async () => {
      (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('Database timeout'));

      await expect(
        AuditLogger.logRateLimitViolation({
          phoneNumber: mockUser.phoneNumber,
          userRole: mockUser.role,
          limitType: 'user',
        })
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to log rate limit violation'
      );
    });

    it('should handle repository errors without throwing (admin actions)', async () => {
      (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('Prisma error'));

      await expect(
        AuditLogger.logUsageQuery({
          performedBy: mockAdmin,
          queryType: 'test',
        })
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to log usage query'
      );
    });

    it('should handle repository errors without throwing (config changes)', async () => {
      (AuditLogRepository.create as jest.Mock).mockRejectedValue(new Error('Transaction failed'));

      await expect(
        AuditLogger.logConfigChange({
          performedBy: mockAdmin,
          setting: 'test.setting',
          oldValue: 'old',
          newValue: 'new',
        })
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to log config change'
      );
    });
  });
});
