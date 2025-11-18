import { AppError } from './AppError';

/**
 * Error thrown when an external API call fails
 */
export class APIError extends AppError {
  public readonly provider?: string;
  public readonly endpoint?: string;
  public readonly responseBody?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    provider?: string,
    endpoint?: string,
    responseBody?: any,
    context?: Record<string, any>
  ) {
    super(message, statusCode, true, context);
    this.provider = provider;
    this.endpoint = endpoint;
    this.responseBody = responseBody;

    Object.setPrototypeOf(this, APIError.prototype);
  }

  override toUserMessage(): string {
    if (this.provider === 'OpenAI') {
      return '🤖 Sorry, I\'m having trouble connecting to the AI service. Please try again in a moment.';
    }
    return '⚠️ An external service is temporarily unavailable. Please try again later.';
  }
}

export default APIError;
