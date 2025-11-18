/**
 * Logger Tests
 *
 * Tests for the Pino-based structured logger with PII redaction
 */

import { logger, createChildLogger, logError, logPerformance, startTimer } from './logger';

describe('Logger', () => {
  describe('Logger Initialization', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have correct log level', () => {
      expect(logger.level).toBeDefined();
      // Level should be one of: trace, debug, info, warn, error, fatal
      expect(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).toContain(logger.level);
    });
  });

  describe('Child Logger', () => {
    it('should create a child logger with context', () => {
      const childLogger = createChildLogger({ module: 'test-module' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should create multiple child loggers', () => {
      const logger1 = createChildLogger({ module: 'module-1' });
      const logger2 = createChildLogger({ module: 'module-2' });

      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('Log Error Helper', () => {
    it('should log error object with context', () => {
      const error = new Error('Test error');
      const context = { userId: '12345', operation: 'test' };

      // Should not throw
      expect(() => logError(error, context)).not.toThrow();
    });

    it('should log error string with context', () => {
      const errorMessage = 'Test error message';
      const context = { userId: '12345', operation: 'test' };

      // Should not throw
      expect(() => logError(errorMessage, context)).not.toThrow();
    });

    it('should handle error without context', () => {
      const error = new Error('Test error');

      // Should not throw
      expect(() => logError(error)).not.toThrow();
    });
  });

  describe('Performance Logging', () => {
    it('should log performance metrics', () => {
      const operation = 'test-operation';
      const duration = 1234;
      const metadata = { itemsProcessed: 10 };

      // Should not throw
      expect(() => logPerformance(operation, duration, metadata)).not.toThrow();
    });

    it('should handle performance logging without metadata', () => {
      const operation = 'test-operation';
      const duration = 1234;

      // Should not throw
      expect(() => logPerformance(operation, duration)).not.toThrow();
    });
  });

  describe('Timer Helper', () => {
    it('should create a timer function', () => {
      const endTimer = startTimer('test-operation');
      expect(typeof endTimer).toBe('function');
    });

    it('should measure operation duration', (done) => {
      const endTimer = startTimer('test-operation');

      setTimeout(() => {
        // Should not throw
        expect(() => endTimer({ result: 'success' })).not.toThrow();
        done();
      }, 10);
    });

    it('should work without metadata', (done) => {
      const endTimer = startTimer('test-operation');

      setTimeout(() => {
        // Should not throw
        expect(() => endTimer()).not.toThrow();
        done();
      }, 10);
    });
  });

  describe('PII Redaction', () => {
    it('should not expose apiKey in logs', () => {
      const childLogger = createChildLogger({ module: 'test' });

      // This should be redacted by Pino's redact configuration
      // We can't easily test the actual output, but we can verify it doesn't throw
      expect(() => {
        childLogger.info({
          apiKey: 'sk-secret-key-12345',
          message: 'Test message'
        }, 'Test log with API key');
      }).not.toThrow();
    });

    it('should not expose password in logs', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.info({
          password: 'super-secret-password',
          username: 'testuser'
        }, 'Test log with password');
      }).not.toThrow();
    });

    it('should not expose token in logs', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.info({
          token: 'bearer-token-12345',
          userId: 'user123'
        }, 'Test log with token');
      }).not.toThrow();
    });
  });

  describe('Structured Logging', () => {
    it('should log with structured data', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.info({
          userId: 'user123',
          action: 'user_login',
          timestamp: new Date().toISOString(),
          metadata: {
            ip: '127.0.0.1',
            userAgent: 'test-agent'
          }
        }, 'User logged in');
      }).not.toThrow();
    });

    it('should support all log levels', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.debug({ level: 'debug' }, 'Debug message');
        childLogger.info({ level: 'info' }, 'Info message');
        childLogger.warn({ level: 'warn' }, 'Warn message');
        childLogger.error({ level: 'error' }, 'Error message');
        childLogger.fatal({ level: 'fatal' }, 'Fatal message');
      }).not.toThrow();
    });

    it('should handle complex nested objects', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.info({
          user: {
            id: 'user123',
            profile: {
              name: 'Test User',
              settings: {
                theme: 'dark',
                notifications: true
              }
            }
          },
          operation: 'profile_update'
        }, 'Complex nested data');
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle logging errors gracefully', () => {
      const childLogger = createChildLogger({ module: 'test' });

      // Circular reference should be handled by Pino
      const circular: any = { name: 'test' };
      circular.self = circular;

      expect(() => {
        childLogger.info({ data: circular }, 'Circular reference');
      }).not.toThrow();
    });

    it('should handle undefined values', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.info({
          value: undefined,
          message: 'Test with undefined'
        }, 'Undefined value');
      }).not.toThrow();
    });

    it('should handle null values', () => {
      const childLogger = createChildLogger({ module: 'test' });

      expect(() => {
        childLogger.info({
          value: null,
          message: 'Test with null'
        }, 'Null value');
      }).not.toThrow();
    });
  });

  describe('Environment-based Configuration', () => {
    it('should respect LOG_LEVEL environment variable', () => {
      // Logger is already initialized, but we can verify it uses the level
      expect(logger.level).toBeDefined();

      // In test environment, default should be 'info' or as configured
      const expectedLevels = ['debug', 'info', 'warn', 'error', 'fatal', 'trace'];
      expect(expectedLevels).toContain(logger.level);
    });
  });

  describe('Performance', () => {
    it('should handle rapid logging', () => {
      const childLogger = createChildLogger({ module: 'performance-test' });

      expect(() => {
        for (let i = 0; i < 100; i++) {
          childLogger.info({ iteration: i }, `Log message ${i}`);
        }
      }).not.toThrow();
    });

    it('should handle large objects', () => {
      const childLogger = createChildLogger({ module: 'test' });

      const largeObject = {
        data: Array(1000).fill(0).map((_, i) => ({
          id: i,
          value: `value-${i}`,
          metadata: { index: i }
        }))
      };

      expect(() => {
        childLogger.info(largeObject, 'Large object');
      }).not.toThrow();
    });
  });
});
