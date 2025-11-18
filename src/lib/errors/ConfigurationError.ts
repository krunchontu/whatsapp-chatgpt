import { AppError } from './AppError';

/**
 * Error thrown when there's a configuration issue
 */
export class ConfigurationError extends AppError {
  public readonly configKey?: string;

  constructor(
    message: string,
    configKey?: string,
    context?: Record<string, any>
  ) {
    super(message, 500, false, context);
    this.configKey = configKey;

    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }

  override toUserMessage(): string {
    return '⚙️ System configuration error. Please contact support.';
  }
}

export default ConfigurationError;
