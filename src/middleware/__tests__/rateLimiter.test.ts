/**
 * Rate Limiter Middleware Tests
 */

import { Message } from 'whatsapp-web.js';
import { initRateLimiters, checkRateLimit, getRateLimitStatus, resetUserRateLimit } from '../rateLimiter';
import { RateLimitError } from '../../lib/errors/RateLimitError';
import { config } from '../../config';

// Mock dependencies
jest.mock('../../lib/redis', () => ({
  getRedisClient: jest.fn(() => null),
  isRedisAvailable: jest.fn(() => false),
}));

// Mock config (will use in-memory rate limiter)
jest.mock('../../config', () => ({
  config: {
    rateLimitEnabled: true,
    rateLimitPerUser: 10,
    rateLimitPerUserWindow: 60,
    rateLimitGlobal: 100,
    rateLimitGlobalWindow: 60,
    whitelistedEnabled: false,
    whitelistedPhoneNumbers: [],
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Helper to create mock message
function createMockMessage(from: string): Message {
  return {
    from,
    to: 'bot@c.us',
    body: 'Test message',
    fromMe: false,
    hasQuotedMsg: false,
    id: {
      _serialized: 'test-id',
    },
    reply: jest.fn().mockResolvedValue({}),
  } as any;
}

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-initialize rate limiters for each test
    initRateLimiters();
  });

  describe('initRateLimiters()', () => {
    it('should initialize rate limiters', () => {
      expect(() => initRateLimiters()).not.toThrow();
    });

    it('should skip initialization when rate limiting disabled', () => {
      const originalEnabled = config.rateLimitEnabled;
      (config as any).rateLimitEnabled = false;
      expect(() => initRateLimiters()).not.toThrow();
      (config as any).rateLimitEnabled = originalEnabled;
    });
  });

  describe('checkRateLimit()', () => {
    it('should allow message when under rate limit', async () => {
      const message = createMockMessage('1234567890@c.us');
      await expect(checkRateLimit(message)).resolves.not.toThrow();
    });

    it('should throw RateLimitError when per-user limit exceeded', async () => {
      const message = createMockMessage('1234567890@c.us');

      // Consume all points (10 messages)
      for (let i = 0; i < config.rateLimitPerUser; i++) {
        await checkRateLimit(message);
      }

      // 11th message should be rate limited
      await expect(checkRateLimit(message)).rejects.toThrow(RateLimitError);
    });

    it('should throw RateLimitError when global limit exceeded', async () => {
      // Create 101 different users
      const messages = [];
      for (let i = 0; i < config.rateLimitGlobal + 1; i++) {
        messages.push(createMockMessage(`user${i}@c.us`));
      }

      // Consume all global points
      for (let i = 0; i < config.rateLimitGlobal; i++) {
        await checkRateLimit(messages[i]);
      }

      // Next message should be rate limited (global limit)
      await expect(checkRateLimit(messages[config.rateLimitGlobal])).rejects.toThrow(RateLimitError);
    });

    it('should bypass rate limit for whitelisted users', async () => {
      // Enable whitelist
      const originalWhitelistEnabled = config.whitelistedEnabled;
      const originalWhitelist = config.whitelistedPhoneNumbers;
      (config as any).whitelistedEnabled = true;
      (config as any).whitelistedPhoneNumbers = ['1234567890'];

      const message = createMockMessage('1234567890@c.us');

      // Send more than limit
      for (let i = 0; i < config.rateLimitPerUser + 5; i++) {
        await expect(checkRateLimit(message)).resolves.not.toThrow();
      }

      // Restore config
      (config as any).whitelistedEnabled = originalWhitelistEnabled;
      (config as any).whitelistedPhoneNumbers = originalWhitelist;
    });

    it('should skip check when rate limiting disabled', async () => {
      const originalEnabled = config.rateLimitEnabled;
      (config as any).rateLimitEnabled = false;

      const message = createMockMessage('1234567890@c.us');

      // Send more than limit
      for (let i = 0; i < config.rateLimitPerUser + 5; i++) {
        await expect(checkRateLimit(message)).resolves.not.toThrow();
      }

      // Restore config
      (config as any).rateLimitEnabled = originalEnabled;
    });

    it('should include retryAfter in error', async () => {
      const message = createMockMessage('1234567890@c.us');

      // Consume all points
      for (let i = 0; i < config.rateLimitPerUser; i++) {
        await checkRateLimit(message);
      }

      // Check error details
      try {
        await checkRateLimit(message);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.limit).toBe(config.rateLimitPerUser);
        expect(rateLimitError.retryAfter).toBeGreaterThan(0);
      }
    });

    it('should rate limit different users independently', async () => {
      const user1 = createMockMessage('user1@c.us');
      const user2 = createMockMessage('user2@c.us');

      // User 1 consumes all points
      for (let i = 0; i < config.rateLimitPerUser; i++) {
        await checkRateLimit(user1);
      }

      // User 1 should be rate limited
      await expect(checkRateLimit(user1)).rejects.toThrow(RateLimitError);

      // User 2 should still be able to send
      await expect(checkRateLimit(user2)).resolves.not.toThrow();
    });
  });

  describe('getRateLimitStatus()', () => {
    it('should return rate limit status for a user', async () => {
      const phoneNumber = '1234567890';
      const message = createMockMessage(`${phoneNumber}@c.us`);

      // Send some messages
      await checkRateLimit(message);
      await checkRateLimit(message);

      const status = await getRateLimitStatus(phoneNumber);
      expect(status.user).toBeDefined();
      expect(status.global).toBeDefined();
    });

    it('should return status for user without prior activity', async () => {
      // Get status for user who hasn't sent messages yet
      const status = await getRateLimitStatus('9999999999');
      expect(status.user).toBeDefined();
      expect(status.global).toBeDefined();
      // User with no activity should have full limit available
      if (status.user.consumed !== undefined) {
        expect(status.user.consumed).toBe(0);
      }
    });
  });

  describe('resetUserRateLimit()', () => {
    it('should reset rate limit for a user', async () => {
      const phoneNumber = '1234567890';
      const message = createMockMessage(`${phoneNumber}@c.us`);

      // Consume all points
      for (let i = 0; i < config.rateLimitPerUser; i++) {
        await checkRateLimit(message);
      }

      // Should be rate limited
      await expect(checkRateLimit(message)).rejects.toThrow(RateLimitError);

      // Reset rate limit
      await resetUserRateLimit(phoneNumber);

      // Should be able to send again
      await expect(checkRateLimit(message)).resolves.not.toThrow();
    });

    it('should not throw when resetting non-existent user', async () => {
      await expect(resetUserRateLimit('9999999999')).resolves.not.toThrow();
    });
  });

  describe('RateLimitError messages', () => {
    it('should return user-friendly error messages', async () => {
      const message = createMockMessage('1234567890@c.us');

      // Consume all points
      for (let i = 0; i < config.rateLimitPerUser; i++) {
        await checkRateLimit(message);
      }

      try {
        await checkRateLimit(message);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        const userMessage = rateLimitError.toUserMessage();
        expect(userMessage).toContain('⏳');
        expect(userMessage).toMatch(/wait|slow down|try again/i);
      }
    });
  });
});
