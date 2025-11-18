import { AppError } from './AppError';

/**
 * Error thrown when content fails moderation
 */
export class ModerationError extends AppError {
  public readonly flaggedCategories?: string[];
  public readonly content?: string;

  constructor(
    message: string,
    flaggedCategories?: string[],
    content?: string,
    context?: Record<string, any>
  ) {
    super(message, 400, true, context);
    this.flaggedCategories = flaggedCategories;
    this.content = content;

    Object.setPrototypeOf(this, ModerationError.prototype);
  }

  override toUserMessage(): string {
    return '🚫 Your message was flagged by our content moderation system. Please ensure your message follows our community guidelines.';
  }
}

export default ModerationError;
