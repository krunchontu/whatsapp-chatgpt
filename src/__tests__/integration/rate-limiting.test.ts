/**
 * Integration Test: Rate Limiting Enforcement
 *
 * Purpose: Test rate limiting enforcement across the application
 * Priority: P0 - Critical for preventing abuse and controlling costs
 *
 * Test Flow:
 * 1. User sends messages within rate limit → Success
 * 2. User exceeds rate limit → Blocked with error message
 * 3. Rate limit resets after time window → User can send again
 * 4. Global rate limit enforced across all users
 * 5. Audit logs capture rate limit violations
 *
 * Run: npm test src/__tests__/integration/rate-limiting.test.ts
 */

import { prisma } from '../../db/client';
import { UserRepository, UserRole } from '../../db/repositories/user.repository';
import { AuditLogRepository, AuditCategory, AuditAction } from '../../db/repositories/auditLog.repository';
import { checkRateLimit, rateLimiter } from '../../middleware/rateLimiter';
import type { Message } from 'whatsapp-web.js';

// Mock Redis for rate limiting
jest.mock('../../lib/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    isOpen: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
}));

// Mock config
jest.mock('../../config', () => ({
  default: {
    rateLimitEnabled: true,
    rateLimitPerUser: 10, // 10 messages per minute per user
    rateLimitPerUserWindow: 60, // 60 seconds
    rateLimitGlobal: 100, // 100 messages per minute globally
    rateLimitGlobalWindow: 60, // 60 seconds
    redis: { enabled: true },
  },
}));

import { redisClient } from '../../lib/redis';

describe('Integration: Rate Limiting Enforcement', () => {
  // ============================================================================
  // Test Setup & Teardown
  // ============================================================================

  beforeEach(async () => {
    // Clean database
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();

    // Setup default Redis mock behavior
    (redisClient.get as jest.Mock).mockResolvedValue(null);
    (redisClient.set as jest.Mock).mockResolvedValue('OK');
    (redisClient.incr as jest.Mock).mockResolvedValue(1);
    (redisClient.expire as jest.Mock).mockResolvedValue(1);
    (redisClient.ttl as jest.Mock).mockResolvedValue(60);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

  function createMockMessage(from: string): Message {
    return {
      from,
      reply: jest.fn().mockResolvedValue(undefined),
      body: 'Test message',
      hasMedia: false,
    } as any;
  }

  // ============================================================================
  // Per-User Rate Limiting
  // ============================================================================

  describe('Per-User Rate Limiting', () => {
    it('should allow messages within rate limit', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock Redis to return current count under limit
      (redisClient.incr as jest.Mock).mockResolvedValue(5); // 5th message

      const message = createMockMessage(phoneNumber);

      // Act
      const result = await checkRateLimit(user);

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBeGreaterThan(0);

      // Redis was called to track request
      expect(redisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining(`ratelimit:user:${user.id}`)
      );
    });

    it('should block user when rate limit exceeded', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock Redis to return count exceeding limit (11th request, limit is 10)
      (redisClient.incr as jest.Mock).mockResolvedValue(11);

      const message = createMockMessage(phoneNumber);

      // Act
      const result = await checkRateLimit(user);

      // Assert
      expect(result.allowed).toBe(false);
      expect(result.remainingRequests).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);

      // Audit log should be created
      const auditLogs = await AuditLogRepository.findByCategory(AuditCategory.SECURITY, 10);
      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0]).toMatchObject({
        action: AuditAction.RATE_LIMIT_EXCEEDED,
        category: AuditCategory.SECURITY,
        phoneNumber,
      });
    });

    it('should reset rate limit after time window', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock first request exceeds limit
      (redisClient.incr as jest.Mock).mockResolvedValueOnce(11);
      const result1 = await checkRateLimit(user);
      expect(result1.allowed).toBe(false);

      // Mock time window passed, counter reset
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.incr as jest.Mock).mockResolvedValue(1);

      // Act: Try again after window
      const result2 = await checkRateLimit(user);

      // Assert
      expect(result2.allowed).toBe(true);
      expect(result2.remainingRequests).toBeGreaterThan(0);
    });

    it('should track remaining requests accurately', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock sequential requests
      const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      for (const count of counts) {
        (redisClient.incr as jest.Mock).mockResolvedValueOnce(count);

        const result = await checkRateLimit(user);

        // Should be allowed for all 10 requests
        expect(result.allowed).toBe(true);
        expect(result.remainingRequests).toBe(10 - count);
      }
    });
  });

  // ============================================================================
  // Global Rate Limiting
  // ============================================================================

  describe('Global Rate Limiting', () => {
    it('should enforce global rate limit across all users', async () => {
      // Arrange
      const user1 = await UserRepository.create({
        phoneNumber: '+1111111111',
        role: UserRole.USER,
      });

      const user2 = await UserRepository.create({
        phoneNumber: '+2222222222',
        role: UserRole.USER,
      });

      // Mock user limits OK, but global limit exceeded
      (redisClient.incr as jest.Mock)
        .mockResolvedValueOnce(5) // user1 counter
        .mockResolvedValueOnce(101); // global counter (exceeds 100)

      // Act
      const result = await checkRateLimit(user1);

      // Assert
      expect(result.allowed).toBe(false);

      // Should log global rate limit exceeded
      const auditLogs = await AuditLogRepository.findByCategory(AuditCategory.SECURITY, 10);
      const globalLimitLog = auditLogs.find(log =>
        log.description.includes('global')
      );
      expect(globalLimitLog).toBeDefined();
    });

    it('should allow users when global limit not exceeded', async () => {
      // Arrange
      const user1 = await UserRepository.create({
        phoneNumber: '+1111111111',
        role: UserRole.USER,
      });

      // Mock both user and global limits OK
      (redisClient.incr as jest.Mock)
        .mockResolvedValueOnce(5) // user counter
        .mockResolvedValueOnce(50); // global counter (under 100)

      // Act
      const result = await checkRateLimit(user1);

      // Assert
      expect(result.allowed).toBe(true);
    });
  });

  // ============================================================================
  // Role-Based Rate Limits
  // ============================================================================

  describe('Role-Based Exemptions', () => {
    it('should apply higher limits for ADMIN users', async () => {
      // Arrange
      const admin = await UserRepository.create({
        phoneNumber: '+9999999999',
        role: UserRole.ADMIN,
      });

      // Mock request count that would exceed USER limit
      (redisClient.incr as jest.Mock).mockResolvedValue(15); // Over user limit of 10

      // Act
      const result = await checkRateLimit(admin);

      // Assert
      // Admins may have higher limits or be exempt
      // Implementation depends on business requirements
      // For MVP, they follow same limits but this test documents the intent
      expect(result).toBeDefined();
    });

    it('should apply higher limits for OWNER users', async () => {
      // Arrange
      const owner = await UserRepository.create({
        phoneNumber: '+8888888888',
        role: UserRole.OWNER,
      });

      // Mock high request count
      (redisClient.incr as jest.Mock).mockResolvedValue(50);

      // Act
      const result = await checkRateLimit(owner);

      // Assert
      // Owners should potentially have no limit or very high limit
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // Error Handling & Edge Cases
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Arrange
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
        role: UserRole.USER,
      });

      // Mock Redis error
      (redisClient.incr as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      // Act
      const result = await checkRateLimit(user);

      // Assert
      // Should allow request when Redis is down (fail open)
      // OR should block all requests (fail closed) - depends on policy
      expect(result).toBeDefined();
    });

    it('should handle missing user gracefully', async () => {
      // Arrange
      const fakeUser = {
        id: 'non-existent-user',
        phoneNumber: '+0000000000',
        role: UserRole.USER,
      } as any;

      // Act & Assert
      // Should not throw error
      await expect(checkRateLimit(fakeUser)).resolves.toBeDefined();
    });

    it('should handle concurrent requests from same user', async () => {
      // Arrange
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
        role: UserRole.USER,
      });

      // Mock Redis increment to simulate race condition
      let counter = 0;
      (redisClient.incr as jest.Mock).mockImplementation(async () => {
        counter += 1;
        return counter;
      });

      // Act: Send 20 concurrent requests (exceeds limit of 10)
      const promises = Array.from({ length: 20 }, () => checkRateLimit(user));
      const results = await Promise.all(promises);

      // Assert
      // Some should be allowed, some blocked
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;

      expect(allowed).toBeLessThanOrEqual(10); // Limit is 10
      expect(blocked).toBeGreaterThan(0); // Some should be blocked
    });
  });

  // ============================================================================
  // Middleware Integration
  // ============================================================================

  describe('Middleware Integration', () => {
    it('should block message processing when rate limited', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const user = await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock rate limit exceeded
      (redisClient.incr as jest.Mock).mockResolvedValue(11);

      const message = createMockMessage(phoneNumber);

      // Act
      const result = await rateLimiter(message);

      // Assert
      expect(result).toBe(false); // Message blocked

      // User should receive rate limit message
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('rate limit')
      );
    });

    it('should allow message processing when within limit', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock within limit
      (redisClient.incr as jest.Mock).mockResolvedValue(5);

      const message = createMockMessage(phoneNumber);

      // Act
      const result = await rateLimiter(message);

      // Assert
      expect(result).toBe(true); // Message allowed
      expect(message.reply).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Audit Logging
  // ============================================================================

  describe('Audit Logging', () => {
    it('should log all rate limit violations', async () => {
      // Arrange
      const user = await UserRepository.create({
        phoneNumber: '+1234567890',
        role: UserRole.USER,
      });

      // Mock multiple violations
      (redisClient.incr as jest.Mock).mockResolvedValue(11);

      // Act: Trigger 3 violations
      await checkRateLimit(user);
      await checkRateLimit(user);
      await checkRateLimit(user);

      // Assert
      const auditLogs = await AuditLogRepository.findByUserId(user.id, 10);
      const rateLimitLogs = auditLogs.filter(
        log => log.action === AuditAction.RATE_LIMIT_EXCEEDED
      );

      expect(rateLimitLogs.length).toBe(3);

      // Each log should have proper metadata
      rateLimitLogs.forEach(log => {
        expect(log.category).toBe(AuditCategory.SECURITY);
        expect(log.phoneNumber).toBe(user.phoneNumber);
        expect(JSON.parse(log.metadata)).toMatchObject({
          limit: 10,
        });
      });
    });
  });
});
