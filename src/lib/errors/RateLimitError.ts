import { AppError } from './AppError';

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends AppError {
  public readonly limit?: number;
  public readonly retryAfter?: number; // seconds until retry allowed

  constructor(
    message: string,
    limit?: number,
    retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message, 429, true, context);
    this.limit = limit;
    this.retryAfter = retryAfter;

    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  override toUserMessage(): string {
    if (this.retryAfter) {
      const minutes = Math.ceil(this.retryAfter / 60);
      return `⏳ You're sending messages too quickly. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.`;
    }
    return '⏳ Rate limit exceeded. Please slow down and try again in a moment.';
  }
}

export default RateLimitError;
