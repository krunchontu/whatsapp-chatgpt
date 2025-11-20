/**
 * Transcription Queue
 *
 * Async processing of voice message transcription.
 * Heavy operation (5-15s) that should not block the main message handler.
 */

import { Queue, Job } from 'bullmq';
import { createQueue } from './index';
import { logger } from '../lib/logger';

export interface TranscriptionJobData {
  /**
   * Unique message ID from WhatsApp
   */
  messageId: string;

  /**
   * Base64-encoded audio data
   */
  audioData: string;

  /**
   * Audio MIME type (e.g., "audio/ogg; codecs=opus")
   */
  mimeType: string;

  /**
   * User's phone number (for tracking and rate limiting)
   */
  phoneNumber: string;

  /**
   * Chat ID (to send response back)
   */
  chatId: string;

  /**
   * Transcription mode to use
   */
  transcriptionMode: string;

  /**
   * Whether to send TTS response
   */
  sendTtsResponse: boolean;
}

export interface TranscriptionJobResult {
  /**
   * Transcribed text
   */
  text: string;

  /**
   * Detected language (if available)
   */
  language?: string;

  /**
   * Processing time in milliseconds
   */
  processingTime: number;
}

/**
 * Transcription queue instance
 */
export const transcriptionQueue: Queue<TranscriptionJobData> = createQueue<TranscriptionJobData>(
  'transcription',
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s
      },
      // Voice messages are time-sensitive, expire after 5 minutes
      removeOnComplete: {
        age: 300, // 5 minutes
        count: 100,
      },
      removeOnFail: {
        age: 3600, // 1 hour
        count: 50,
      },
    },
  }
);

/**
 * Add a transcription job to the queue
 */
export async function queueTranscription(data: TranscriptionJobData): Promise<Job<TranscriptionJobData>> {
  logger.info(
    {
      messageId: data.messageId,
      phoneNumber: data.phoneNumber,
      transcriptionMode: data.transcriptionMode,
      module: 'queue:transcription',
    },
    'Queueing transcription job'
  );

  const job = await transcriptionQueue.add('transcribe', data, {
    jobId: data.messageId, // Use message ID to prevent duplicates
  });

  return job;
}

/**
 * Get queue metrics for monitoring
 */
export async function getTranscriptionQueueMetrics() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    transcriptionQueue.getWaitingCount(),
    transcriptionQueue.getActiveCount(),
    transcriptionQueue.getCompletedCount(),
    transcriptionQueue.getFailedCount(),
    transcriptionQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}

/**
 * Clean up old jobs (run periodically)
 */
export async function cleanupTranscriptionQueue(): Promise<void> {
  logger.info({ module: 'queue:transcription' }, 'Cleaning up transcription queue');

  // Clean completed jobs older than 5 minutes
  await transcriptionQueue.clean(300 * 1000, 100, 'completed');

  // Clean failed jobs older than 1 hour
  await transcriptionQueue.clean(3600 * 1000, 50, 'failed');

  logger.info({ module: 'queue:transcription' }, 'Transcription queue cleanup complete');
}
