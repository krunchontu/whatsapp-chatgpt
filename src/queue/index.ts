/**
 * Queue Infrastructure
 *
 * BullMQ-based job queue for async processing of heavy operations.
 * Used for:
 * - Voice transcription (heavy, 5-15s processing time)
 * - Future: Image processing, bulk operations
 */

import { Queue, QueueOptions, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import config from '../config';
import { logger } from '../lib/logger';

/**
 * Create Redis connection for queues
 */
export function createRedisConnection(): Redis {
  if (!config.redis.enabled) {
    throw new Error('Redis must be enabled to use job queues');
  }

  const connection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    logger.error({ err, module: 'queue:redis' }, 'Redis connection error');
  });

  connection.on('connect', () => {
    logger.info({ module: 'queue:redis' }, 'Redis connected for queues');
  });

  return connection;
}

/**
 * Default queue options
 */
export const defaultQueueOptions: QueueOptions = {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start at 2s, then 4s, 8s
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 604800, // Keep failed jobs for 7 days
      count: 5000, // Keep max 5000 failed jobs
    },
  },
};

/**
 * Create a queue with default options
 */
export function createQueue<T = any>(name: string, options?: Partial<QueueOptions>): Queue<T> {
  const queue = new Queue<T>(name, {
    ...defaultQueueOptions,
    ...options,
  });

  queue.on('error', (err) => {
    logger.error({ err, queue: name, module: 'queue' }, 'Queue error');
  });

  return queue;
}

/**
 * Create a worker with standard error handling
 */
export function createWorker<T = any>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any>,
  options?: {
    concurrency?: number;
    connection?: Redis;
  }
): Worker<T> {
  const worker = new Worker<T>(
    queueName,
    async (job: Job<T>) => {
      const startTime = Date.now();

      try {
        logger.info(
          {
            jobId: job.id,
            jobName: job.name,
            queue: queueName,
            attempt: job.attemptsMade + 1,
            module: 'queue:worker',
          },
          'Processing job'
        );

        const result = await processor(job);

        const duration = Date.now() - startTime;
        logger.info(
          {
            jobId: job.id,
            jobName: job.name,
            queue: queueName,
            duration,
            module: 'queue:worker',
          },
          'Job completed'
        );

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(
          {
            err: error,
            jobId: job.id,
            jobName: job.name,
            queue: queueName,
            attempt: job.attemptsMade + 1,
            duration,
            module: 'queue:worker',
          },
          'Job failed'
        );
        throw error;
      }
    },
    {
      concurrency: options?.concurrency || 5,
      connection: options?.connection || createRedisConnection(),
    }
  );

  worker.on('completed', (job) => {
    logger.debug(
      { jobId: job.id, queue: queueName, module: 'queue:worker' },
      'Worker completed job'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        err,
        jobId: job?.id,
        queue: queueName,
        attempts: job?.attemptsMade,
        module: 'queue:worker',
      },
      'Worker failed job'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err, queue: queueName, module: 'queue:worker' }, 'Worker error');
  });

  return worker;
}

/**
 * Gracefully close queue connections
 */
export async function closeQueue(queue: Queue): Promise<void> {
  try {
    await queue.close();
    logger.info({ queue: queue.name, module: 'queue' }, 'Queue closed');
  } catch (err) {
    logger.error({ err, queue: queue.name, module: 'queue' }, 'Failed to close queue');
  }
}

/**
 * Gracefully close worker connections
 */
export async function closeWorker(worker: Worker): Promise<void> {
  try {
    await worker.close();
    logger.info({ worker: worker.name, module: 'queue:worker' }, 'Worker closed');
  } catch (err) {
    logger.error({ err, worker: worker.name, module: 'queue:worker' }, 'Failed to close worker');
  }
}
