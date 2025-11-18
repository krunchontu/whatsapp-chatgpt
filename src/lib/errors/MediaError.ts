import { AppError } from './AppError';

/**
 * Error thrown when media processing fails
 */
export class MediaError extends AppError {
  public readonly mediaType?: string;
  public readonly operation?: string;

  constructor(
    message: string,
    mediaType?: string,
    operation?: string,
    context?: Record<string, any>
  ) {
    super(message, 400, true, context);
    this.mediaType = mediaType;
    this.operation = operation;

    Object.setPrototypeOf(this, MediaError.prototype);
  }

  override toUserMessage(): string {
    if (this.operation === 'download') {
      return '📥 Failed to download media. Please try sending it again.';
    }
    if (this.operation === 'transcription') {
      return '🎤 Failed to transcribe voice message. Please try again or send a text message.';
    }
    return '📎 Media processing failed. Please try a different file or format.';
  }
}

export default MediaError;
