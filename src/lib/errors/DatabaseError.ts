import { AppError } from './AppError';

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends AppError {
  public readonly operation?: string;
  public readonly table?: string;

  constructor(
    message: string,
    operation?: string,
    table?: string,
    context?: Record<string, any>
  ) {
    super(message, 500, true, context);
    this.operation = operation;
    this.table = table;

    Object.setPrototypeOf(this, DatabaseError.prototype);
  }

  override toUserMessage(): string {
    return '💾 Database error occurred. Please try again or contact support if the issue persists.';
  }
}

export default DatabaseError;
