/**
 * Error Handler Middleware Tests
 *
 * Tests for central error handling with Sentry integration
 */

import { Message } from 'whatsapp-web.js';
import {
  asyncHandler,
  handleError,
  handleDatabaseError,
  handleAPIError,
} from './errorHandler';
import {
  AppError,
  DatabaseError,
  APIError,
  RateLimitError,
  ValidationError,
} from '../lib/errors';
import * as sentryModule from '../lib/sentry';

// Mock Sentry
jest.mock('../lib/sentry', () => ({
  captureError: jest.fn(),
}));

// Mock logger
jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    info: jest.fn(),
  },
  logError: jest.fn(),
}));

describe('Error Handler Middleware', () => {
  let mockMessage: Partial<Message>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock message
    mockMessage = {
      from: 'test-user@whatsapp.com',
      id: {
        _serialized: 'msg-123',
      } as any,
      reply: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('asyncHandler', () => {
    it('should call handler successfully', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrappedHandler = asyncHandler(handler);

      await wrappedHandler(mockMessage as Message);

      expect(handler).toHaveBeenCalledWith(mockMessage);
    });

    it('should catch and handle errors', async () => {
      const error = new Error('Test error');
      const handler = jest.fn().mockRejectedValue(error);
      const wrappedHandler = asyncHandler(handler);

      await wrappedHandler(mockMessage as Message);

      expect(handler).toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should pass arguments to handler', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrappedHandler = asyncHandler(handler);

      await wrappedHandler(mockMessage as Message, 'arg1', 'arg2');

      expect(handler).toHaveBeenCalledWith(mockMessage, 'arg1', 'arg2');
    });
  });

  describe('handleError', () => {
    it('should handle AppError (operational error)', async () => {
      const error = new ValidationError('Invalid input', [
        { field: 'email', message: 'Invalid email format' },
      ]);

      await handleError(error, mockMessage as Message);

      // Should send user-friendly message
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid input')
      );

      // Should not capture in Sentry (operational error)
      expect(sentryModule.captureError).not.toHaveBeenCalled();
    });

    it('should handle non-AppError (programming error)', async () => {
      const error = new Error('Unexpected error');

      await handleError(error, mockMessage as Message);

      // Should send generic user message
      expect(mockMessage.reply).toHaveBeenCalled();

      // Should capture in Sentry (non-operational error)
      expect(sentryModule.captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          errorType: 'Error',
          chatId: mockMessage.from,
        })
      );
    });

    it('should handle error without message context', async () => {
      const error = new Error('Test error');

      // Should not throw
      await expect(handleError(error)).resolves.not.toThrow();

      // Should not try to reply
      expect(mockMessage.reply).not.toHaveBeenCalled();

      // Should still capture in Sentry
      expect(sentryModule.captureError).toHaveBeenCalled();
    });

    it('should handle non-Error objects', async () => {
      const error = 'String error';

      await handleError(error, mockMessage as Message);

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should handle reply failures gracefully', async () => {
      const error = new Error('Test error');
      (mockMessage.reply as jest.Mock).mockRejectedValue(
        new Error('Reply failed')
      );

      // Should not throw
      await expect(
        handleError(error, mockMessage as Message)
      ).resolves.not.toThrow();
    });

    it('should provide user-friendly messages for specific errors', async () => {
      const rateLimitError = new RateLimitError(
        'Rate limit exceeded',
        'user123',
        60
      );

      await handleError(rateLimitError, mockMessage as Message);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('wait')
      );
    });
  });

  describe('handleDatabaseError', () => {
    it('should execute operation successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await handleDatabaseError(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('success');

      const result = await handleDatabaseError(operation, 'test-operation', 3);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on unique constraint error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('unique constraint violated'));

      await expect(
        handleDatabaseError(operation, 'test-operation', 3)
      ).rejects.toThrow(DatabaseError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on foreign key constraint error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('foreign key constraint failed'));

      await expect(
        handleDatabaseError(operation, 'test-operation', 3)
      ).rejects.toThrow(DatabaseError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw DatabaseError after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('DB error'));

      await expect(
        handleDatabaseError(operation, 'test-operation', 3)
      ).rejects.toThrow(DatabaseError);

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('success');

      const start = Date.now();
      await handleDatabaseError(operation, 'test-operation', 3);
      const duration = Date.now() - start;

      // Should have some delay (at least 1000ms for first retry + 2000ms for second)
      expect(duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('handleAPIError', () => {
    it('should execute API call successfully', async () => {
      const apiCall = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await handleAPIError(apiCall, 'openai', '/chat/completions');

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const apiCall = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: 'success' });

      const result = await handleAPIError(apiCall, 'openai', '/chat', 3);

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalledTimes(2);
    });

    it('should throw RateLimitError on 429', async () => {
      const apiCall = jest
        .fn()
        .mockRejectedValue(new Error('rate limit exceeded - status 429'));

      await expect(
        handleAPIError(apiCall, 'openai', '/chat', 3)
      ).rejects.toThrow(RateLimitError);

      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      const apiCall = jest.fn().mockRejectedValue(new Error('status 400'));

      await expect(
        handleAPIError(apiCall, 'openai', '/chat', 3)
      ).rejects.toThrow(APIError);

      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx errors', async () => {
      const apiCall = jest
        .fn()
        .mockRejectedValueOnce(new Error('status 503'))
        .mockRejectedValueOnce(new Error('status 502'))
        .mockResolvedValueOnce({ data: 'success' });

      const result = await handleAPIError(apiCall, 'openai', '/chat', 3);

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalledTimes(3);
    });

    it('should throw APIError after max retries', async () => {
      const apiCall = jest.fn().mockRejectedValue(new Error('API error'));

      await expect(
        handleAPIError(apiCall, 'openai', '/chat', 2)
      ).rejects.toThrow(APIError);

      expect(apiCall).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const apiCall = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('success');

      const start = Date.now();
      await handleAPIError(apiCall, 'openai', '/chat', 3);
      const duration = Date.now() - start;

      // Should have some delay
      expect(duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('User-Friendly Messages', () => {
    it('should provide friendly message for timeout errors', async () => {
      const error = new Error('Request timeout occurred');

      await handleError(error, mockMessage as Message);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('timed out')
      );
    });

    it('should provide friendly message for network errors', async () => {
      const error = new Error('Network error: ECONNREFUSED');

      await handleError(error, mockMessage as Message);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('Network error')
      );
    });

    it('should provide generic message for unknown errors', async () => {
      const error = new Error('Some random error');

      await handleError(error, mockMessage as Message);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      );
    });
  });

  describe('Sentry Integration', () => {
    it('should capture non-operational errors in Sentry', async () => {
      const error = new TypeError('Cannot read property of undefined');

      await handleError(error, mockMessage as Message);

      expect(sentryModule.captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          errorType: 'TypeError',
          chatId: mockMessage.from,
          messageId: 'msg-123',
          isOperational: false,
        })
      );
    });

    it('should not capture operational errors in Sentry', async () => {
      const error = new ValidationError('Invalid input', []);

      await handleError(error, mockMessage as Message);

      expect(sentryModule.captureError).not.toHaveBeenCalled();
    });

    it('should include message context in Sentry', async () => {
      const error = new Error('Test error');

      await handleError(error, mockMessage as Message);

      expect(sentryModule.captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          chatId: 'test-user@whatsapp.com',
          messageId: 'msg-123',
        })
      );
    });
  });

  describe('Error Conversion', () => {
    it('should convert string to Error', async () => {
      const error = 'String error message';

      await handleError(error, mockMessage as Message);

      // Should still handle it
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should convert number to Error', async () => {
      const error = 404;

      await handleError(error as any, mockMessage as Message);

      // Should still handle it
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should convert object to Error', async () => {
      const error = { code: 'ERROR', message: 'Something went wrong' };

      await handleError(error as any, mockMessage as Message);

      // Should still handle it
      expect(mockMessage.reply).toHaveBeenCalled();
    });
  });
});
