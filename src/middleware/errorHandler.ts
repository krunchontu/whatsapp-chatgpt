import { Message } from 'whatsapp-web.js';
import { logger, logError } from '../lib/logger';
import {
  AppError,
  isAppError,
  isOperationalError,
  APIError,
  DatabaseError,
  RateLimitError
} from '../lib/errors';
import { captureError } from '../lib/sentry';

/**
 * Async handler wrapper for message handlers.
 * Catches errors and provides consistent error handling.
 */
export function asyncHandler(
  handler: (message: Message, ...args: any[]) => Promise<void>
) {
  return async (message: Message, ...args: any[]) => {
    try {
      await handler(message, ...args);
    } catch (error) {
      await handleError(error, message);
    }
  };
}

/**
 * Central error handling function.
 * Logs errors appropriately and sends user-friendly messages.
 */
export async function handleError(error: unknown, message?: Message): Promise<void> {
  // Convert to Error object if it's not already
  const err = error instanceof Error ? error : new Error(String(error));

  // Log the error with appropriate level
  if (isAppError(err)) {
    // Operational errors are expected and logged at warn level
    logger.warn({
      err,
      errorType: err.name,
      isOperational: err.isOperational,
      context: err.context,
      chatId: message?.from,
      messageId: message?.id?._serialized
    }, `Operational error: ${err.message}`);
  } else {
    // Programming errors are unexpected and logged at error level
    logger.error({
      err,
      errorType: err.name,
      stack: err.stack,
      chatId: message?.from,
      messageId: message?.id?._serialized
    }, `Unexpected error: ${err.message}`);
  }

  // Send user-friendly message if we have a WhatsApp message context
  if (message) {
    try {
      const userMessage = getUserFriendlyMessage(err);
      await message.reply(userMessage);
    } catch (replyError) {
      logger.error({
        err: replyError,
        originalError: err.message
      }, 'Failed to send error message to user');
    }
  }

  // Send to Sentry for non-operational errors (programming errors)
  if (!isOperationalError(err)) {
    logger.fatal({
      err,
      message: 'Non-operational error occurred - this indicates a programming error'
    });

    // Capture in Sentry with context
    captureError(err, {
      errorType: err.name,
      chatId: message?.from,
      messageId: message?.id?._serialized,
      isOperational: isOperationalError(err),
    });
  }
}

/**
 * Get user-friendly error message based on error type
 */
function getUserFriendlyMessage(error: Error): string {
  if (isAppError(error)) {
    return error.toUserMessage();
  }

  // Handle specific error types
  if (error.message.includes('timeout')) {
    return '⏱️ Request timed out. Please try again.';
  }

  if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
    return '🌐 Network error. Please check your connection and try again.';
  }

  // Default generic message
  return '❌ An unexpected error occurred. Please try again later or contact support if the issue persists.';
}

/**
 * Error handler for database operations with retry logic
 */
export async function handleDatabaseError<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn({
        err: lastError,
        attempt,
        maxRetries,
        operationName
      }, `Database operation failed (attempt ${attempt}/${maxRetries})`);

      // Don't retry on certain errors
      if (lastError.message.includes('unique constraint') ||
          lastError.message.includes('foreign key constraint')) {
        throw new DatabaseError(
          lastError.message,
          operationName,
          undefined,
          { attempt, originalError: lastError.message }
        );
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new DatabaseError(
    `Database operation failed after ${maxRetries} attempts`,
    operationName,
    undefined,
    { maxRetries, lastError: lastError?.message }
  );
}

/**
 * Error handler for API calls with retry logic
 */
export async function handleAPIError<T>(
  apiCall: () => Promise<T>,
  provider: string,
  endpoint?: string,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn({
        err: lastError,
        attempt,
        maxRetries,
        provider,
        endpoint
      }, `API call failed (attempt ${attempt}/${maxRetries})`);

      // Check if it's a rate limit error
      if (lastError.message.includes('rate limit') ||
          lastError.message.includes('429')) {
        throw new RateLimitError(
          'Rate limit exceeded',
          undefined,
          60,
          { provider, endpoint }
        );
      }

      // Don't retry on 4xx errors (except 429)
      const statusMatch = lastError.message.match(/status.*?(\d{3})/i);
      if (statusMatch) {
        const statusCode = parseInt(statusMatch[1]);
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          throw new APIError(
            lastError.message,
            statusCode,
            provider,
            endpoint,
            undefined,
            { attempt }
          );
        }
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new APIError(
    `API call to ${provider} failed after ${maxRetries} attempts`,
    500,
    provider,
    endpoint,
    undefined,
    { maxRetries, lastError: lastError?.message }
  );
}

/**
 * Global unhandled rejection handler
 */
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error({
      err: reason,
      promise
    }, 'Unhandled Promise Rejection');

    // Don't exit the process in production for operational errors
    if (!isOperationalError(reason)) {
      logger.fatal('Unhandled rejection - shutting down gracefully');
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({
      err: error,
      stack: error.stack
    }, 'Uncaught Exception - shutting down');

    // Always exit on uncaught exceptions
    process.exit(1);
  });

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  // Graceful shutdown on SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

export default {
  asyncHandler,
  handleError,
  handleDatabaseError,
  handleAPIError,
  setupGlobalErrorHandlers
};
