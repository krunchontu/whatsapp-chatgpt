/**
 * Base error class for all application errors.
 * Provides consistent error structure with context and metadata.
 */
export class AppError extends Error {
  public readonly name: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();

    // Set the prototype explicitly to maintain instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to JSON for logging and API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }

  /**
   * Format error for user-facing WhatsApp messages
   */
  toUserMessage(): string {
    return this.message;
  }
}

export default AppError;
