/**
 * Transcription Worker
 *
 * Processes voice transcription jobs from the queue.
 * Runs in background, decoupled from main message handler.
 */

import { Job, Worker } from 'bullmq';
import { createWorker } from '../index';
import {
  TranscriptionJobData,
  TranscriptionJobResult,
} from '../transcription.queue';
import { TranscriptionMode } from '../../types/transcription-mode';
import { transcribeAudioLocal } from '../../providers/whisper-local';
import { transcribeWhisperApi } from '../../providers/whisper-api';
import { transcribeRequest } from '../../providers/speech';
import { transcribeOpenAI } from '../../providers/openai';
import { logger } from '../../lib/logger';
import { getWhatsAppClient } from '../../lib/whatsapp-client';

/**
 * Process a transcription job
 */
async function processTranscriptionJob(
  job: Job<TranscriptionJobData>
): Promise<TranscriptionJobResult> {
  const { messageId, audioData, mimeType, phoneNumber, chatId, transcriptionMode, sendTtsResponse } =
    job.data;

  const startTime = Date.now();

  logger.info(
    {
      jobId: job.id,
      messageId,
      phoneNumber,
      transcriptionMode,
      mimeType,
      module: 'worker:transcription',
    },
    'Processing transcription job'
  );

  // Convert base64 to buffer
  const mediaBuffer = Buffer.from(audioData, 'base64');

  // Transcribe based on mode
  let result: { text: string; language?: string };

  try {
    switch (transcriptionMode) {
      case TranscriptionMode.Local:
        result = await transcribeAudioLocal(mediaBuffer);
        break;
      case TranscriptionMode.OpenAI:
        result = await transcribeOpenAI(mediaBuffer);
        break;
      case TranscriptionMode.WhisperAPI:
        result = await transcribeWhisperApi(new Blob([mediaBuffer]));
        break;
      case TranscriptionMode.SpeechAPI:
        result = await transcribeRequest(new Blob([mediaBuffer]));
        break;
      default:
        throw new Error(`Unsupported transcription mode: ${transcriptionMode}`);
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        jobId: job.id,
        messageId,
        transcriptionMode,
        module: 'worker:transcription',
      },
      'Transcription failed'
    );
    throw error;
  }

  const { text: transcribedText, language: transcribedLanguage } = result;

  if (!transcribedText || transcribedText.length === 0) {
    logger.warn(
      {
        jobId: job.id,
        messageId,
        module: 'worker:transcription',
      },
      'Empty transcription result'
    );
    throw new Error('Empty transcription result');
  }

  const processingTime = Date.now() - startTime;

  logger.info(
    {
      jobId: job.id,
      messageId,
      transcribedText,
      transcribedLanguage,
      processingTime,
      module: 'worker:transcription',
    },
    'Transcription completed'
  );

  // Send response back to WhatsApp (if TTS response enabled)
  if (sendTtsResponse) {
    try {
      const client = getWhatsAppClient();
      const chat = await client.getChatById(chatId);
      const reply = `You said: ${transcribedText}${
        transcribedLanguage ? ` (language: ${transcribedLanguage})` : ''
      }`;
      await chat.sendMessage(reply);
      logger.debug(
        {
          jobId: job.id,
          messageId,
          chatId,
          module: 'worker:transcription',
        },
        'TTS response sent'
      );
    } catch (error) {
      // Log but don't fail the job if response sending fails
      logger.error(
        {
          err: error,
          jobId: job.id,
          messageId,
          chatId,
          module: 'worker:transcription',
        },
        'Failed to send TTS response'
      );
    }
  }

  return {
    text: transcribedText,
    language: transcribedLanguage,
    processingTime,
  };
}

/**
 * Create and start the transcription worker
 */
export function createTranscriptionWorker(): Worker<TranscriptionJobData> {
  logger.info({ module: 'worker:transcription' }, 'Starting transcription worker');

  const worker = createWorker<TranscriptionJobData>(
    'transcription',
    processTranscriptionJob,
    {
      concurrency: 3, // Process up to 3 transcriptions concurrently
    }
  );

  // Dead letter queue - jobs that failed all retries
  worker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      logger.error(
        {
          err,
          jobId: job.id,
          messageId: job.data.messageId,
          phoneNumber: job.data.phoneNumber,
          attempts: job.attemptsMade,
          module: 'worker:transcription',
        },
        'Job moved to dead letter queue (all retries exhausted)'
      );

      // Optionally: Send error message to user
      try {
        const client = getWhatsAppClient();
        const chat = await client.getChatById(job.data.chatId);
        await chat.sendMessage(
          "I couldn't transcribe your voice message. Please try again or send a text message."
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            jobId: job.id,
            module: 'worker:transcription',
          },
          'Failed to send error message to user'
        );
      }
    }
  });

  return worker;
}

/**
 * Gracefully shutdown the worker
 */
export async function shutdownTranscriptionWorker(worker: Worker): Promise<void> {
  logger.info({ module: 'worker:transcription' }, 'Shutting down transcription worker');

  try {
    await worker.close();
    logger.info({ module: 'worker:transcription' }, 'Transcription worker shut down gracefully');
  } catch (error) {
    logger.error(
      {
        err: error,
        module: 'worker:transcription',
      },
      'Error shutting down transcription worker'
    );
    throw error;
  }
}
