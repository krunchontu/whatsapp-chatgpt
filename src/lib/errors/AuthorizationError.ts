import { AppError } from './AppError';

/**
 * Error thrown when user lacks permission to perform an action
 */
export class AuthorizationError extends AppError {
  public readonly requiredRole?: string;
  public readonly userRole?: string;
  public readonly action?: string;

  constructor(
    message: string,
    requiredRole?: string,
    userRole?: string,
    action?: string,
    context?: Record<string, any>
  ) {
    super(message, 403, true, context);
    this.requiredRole = requiredRole;
    this.userRole = userRole;
    this.action = action;

    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }

  override toUserMessage(): string {
    if (this.requiredRole) {
      return `🔒 Access denied. This action requires ${this.requiredRole} role.`;
    }
    return '🔒 You do not have permission to perform this action.';
  }
}

export default AuthorizationError;
