/**
 * Custom error classes for the WhatsApp ChatGPT bot.
 * Provides structured error handling with consistent formatting.
 */

export { AppError } from './AppError';
export { ValidationError } from './ValidationError';
export { ConfigurationError } from './ConfigurationError';
export { APIError } from './APIError';
export { DatabaseError } from './DatabaseError';
export { RateLimitError } from './RateLimitError';
export { AuthorizationError } from './AuthorizationError';
export { ModerationError } from './ModerationError';
export { MediaError } from './MediaError';

/**
 * Type guard to check if error is an AppError instance
 */
export function isAppError(error: any): error is AppError {
  return error && error.name && error.isOperational !== undefined;
}

/**
 * Type guard to check if error is operational (recoverable)
 */
export function isOperationalError(error: any): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}
