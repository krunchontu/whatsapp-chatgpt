import { AppError } from './AppError';

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly validationErrors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    field?: string,
    validationErrors?: Array<{ field: string; message: string }>,
    context?: Record<string, any>
  ) {
    super(message, 400, true, context);
    this.field = field;
    this.validationErrors = validationErrors;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  override toUserMessage(): string {
    if (this.validationErrors && this.validationErrors.length > 0) {
      const errors = this.validationErrors.map(e => `- ${e.field}: ${e.message}`).join('\n');
      return `❌ Validation failed:\n${errors}`;
    }
    return `❌ Validation error: ${this.message}`;
  }
}

export default ValidationError;
