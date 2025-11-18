/**
 * Sentry Integration Tests
 *
 * Tests for Sentry error tracking with PII redaction
 */

import * as Sentry from '@sentry/node';
import {
  initSentry,
  captureError,
  captureMessage,
  setUserContext,
  clearUserContext,
  addBreadcrumb,
  closeSentry,
} from './sentry';

// Mock Sentry SDK
jest.mock('@sentry/node');
jest.mock('@sentry/profiling-node', () => ({
  ProfilingIntegration: jest.fn(),
}));

describe('Sentry Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Sentry Initialization', () => {
    it('should not initialize when SENTRY_DSN is not set', () => {
      delete process.env.SENTRY_DSN;
      process.env.NODE_ENV = 'production';

      const result = initSentry();

      expect(result).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('should not initialize in development by default', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'development';

      const result = initSentry();

      expect(result).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('should initialize in production with DSN', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      const result = initSentry();

      expect(result).toBe(true);
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          environment: 'production',
        })
      );
    });

    it('should initialize when explicitly enabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'development';
      process.env.SENTRY_ENABLED = 'true';

      const result = initSentry();

      expect(result).toBe(true);
      expect(Sentry.init).toHaveBeenCalled();
    });

    it('should not initialize when explicitly disabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      process.env.SENTRY_ENABLED = 'false';

      const result = initSentry();

      expect(result).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('should use custom release version', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      process.env.SENTRY_RELEASE = '1.2.3';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          release: '1.2.3',
        })
      );
    });

    it('should use custom traces sample rate', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 0.5,
        })
      );
    });

    it('should use custom profiles sample rate', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      process.env.SENTRY_PROFILES_SAMPLE_RATE = '0.3';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          profilesSampleRate: 0.3,
        })
      );
    });
  });

  describe('PII Redaction in beforeSend', () => {
    it('should configure beforeSend hook', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(initCall.beforeSend).toBeDefined();
      expect(typeof initCall.beforeSend).toBe('function');
    });

    it('should redact phoneNumber from breadcrumbs', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const beforeSend = (Sentry.init as jest.Mock).mock.calls[0][0].beforeSend;
      const event = {
        breadcrumbs: [
          {
            data: {
              phoneNumber: '+1234567890',
              action: 'test',
            },
          },
        ],
      };

      const result = beforeSend(event, {});

      expect(result.breadcrumbs[0].data.phoneNumber).toBe('[REDACTED]');
      expect(result.breadcrumbs[0].data.action).toBe('test');
    });

    it('should redact apiKey from extra data', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const beforeSend = (Sentry.init as jest.Mock).mock.calls[0][0].beforeSend;
      const event = {
        extra: {
          apiKey: 'sk-secret-key',
          userId: 'user123',
        },
      };

      const result = beforeSend(event, {});

      expect(result.extra.apiKey).toBe('[REDACTED]');
      expect(result.extra.userId).toBe('user123');
    });

    it('should redact multiple sensitive fields', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const beforeSend = (Sentry.init as jest.Mock).mock.calls[0][0].beforeSend;
      const event = {
        extra: {
          phoneNumber: '+1234567890',
          apiKey: 'sk-secret',
          token: 'bearer-token',
          password: 'password123',
          secret: 'my-secret',
          safeData: 'this-is-safe',
        },
      };

      const result = beforeSend(event, {});

      expect(result.extra.phoneNumber).toBe('[REDACTED]');
      expect(result.extra.apiKey).toBe('[REDACTED]');
      expect(result.extra.token).toBe('[REDACTED]');
      expect(result.extra.password).toBe('[REDACTED]');
      expect(result.extra.secret).toBe('[REDACTED]');
      expect(result.extra.safeData).toBe('this-is-safe');
    });
  });

  describe('Transaction Filtering', () => {
    it('should configure beforeSendTransaction hook', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(initCall.beforeSendTransaction).toBeDefined();
      expect(typeof initCall.beforeSendTransaction).toBe('function');
    });

    it('should filter out /healthz transactions', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const beforeSendTransaction = (Sentry.init as jest.Mock).mock.calls[0][0]
        .beforeSendTransaction;
      const transaction = {
        name: 'GET /healthz',
      };

      const result = beforeSendTransaction(transaction);

      expect(result).toBeNull();
    });

    it('should filter out /readyz transactions', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const beforeSendTransaction = (Sentry.init as jest.Mock).mock.calls[0][0]
        .beforeSendTransaction;
      const transaction = {
        name: 'GET /readyz',
      };

      const result = beforeSendTransaction(transaction);

      expect(result).toBeNull();
    });

    it('should allow non-health-check transactions', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      initSentry();

      const beforeSendTransaction = (Sentry.init as jest.Mock).mock.calls[0][0]
        .beforeSendTransaction;
      const transaction = {
        name: 'POST /api/messages',
      };

      const result = beforeSendTransaction(transaction);

      expect(result).toEqual(transaction);
    });
  });

  describe('Error Capture', () => {
    it('should not capture errors when Sentry is disabled', () => {
      delete process.env.SENTRY_DSN;

      const error = new Error('Test error');
      const result = captureError(error);

      expect(result).toBeUndefined();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should capture errors when Sentry is enabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const context = { userId: 'user123', action: 'test' };

      captureError(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: context,
      });
    });

    it('should handle errors without context', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');

      captureError(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: undefined,
      });
    });
  });

  describe('Message Capture', () => {
    it('should not capture messages when Sentry is disabled', () => {
      delete process.env.SENTRY_DSN;

      const result = captureMessage('Test message');

      expect(result).toBeUndefined();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('should capture messages when Sentry is enabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      const message = 'Test message';
      const context = { userId: 'user123' };

      captureMessage(message, 'warning', context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, {
        level: 'warning',
        extra: context,
      });
    });

    it('should use default info level', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      captureMessage('Test message');

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', {
        level: 'info',
        extra: undefined,
      });
    });
  });

  describe('User Context', () => {
    it('should not set user context when Sentry is disabled', () => {
      delete process.env.SENTRY_DSN;

      setUserContext('user123', { role: 'admin' });

      expect(Sentry.setUser).not.toHaveBeenCalled();
    });

    it('should set user context when Sentry is enabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      setUserContext('user123', { role: 'admin' });

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: 'user123',
        role: 'admin',
      });
    });

    it('should set user context without extra data', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      setUserContext('user123');

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: 'user123',
      });
    });

    it('should clear user context', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      clearUserContext();

      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe('Breadcrumbs', () => {
    it('should not add breadcrumbs when Sentry is disabled', () => {
      delete process.env.SENTRY_DSN;

      addBreadcrumb('Test message', 'navigation', { page: '/home' });

      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should add breadcrumbs when Sentry is enabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      addBreadcrumb('Test message', 'navigation', { page: '/home' });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        message: 'Test message',
        category: 'navigation',
        data: { page: '/home' },
        level: 'info',
      });
    });

    it('should add breadcrumbs without data', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      addBreadcrumb('Test message', 'user-action');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        message: 'Test message',
        category: 'user-action',
        data: undefined,
        level: 'info',
      });
    });
  });

  describe('Sentry Closure', () => {
    it('should not close when Sentry is disabled', async () => {
      delete process.env.SENTRY_DSN;

      await closeSentry();

      expect(Sentry.close).not.toHaveBeenCalled();
    });

    it('should close when Sentry is enabled', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      await closeSentry();

      expect(Sentry.close).toHaveBeenCalledWith(2000);
    });

    it('should accept custom timeout', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      await closeSentry(5000);

      expect(Sentry.close).toHaveBeenCalledWith(5000);
    });

    it('should handle close errors gracefully', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      (Sentry.close as jest.Mock).mockRejectedValue(new Error('Close failed'));

      // Should not throw
      await expect(closeSentry()).resolves.not.toThrow();
    });
  });
});
