import pino from 'pino';

/**
 * Logger configuration and factory for the WhatsApp ChatGPT bot.
 * Uses Pino for high-performance structured logging.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
  enableRequestLogging: boolean;
  redactPaths: string[];
}

/**
 * Get logger configuration from environment variables
 */
function getLoggerConfig(): LoggerConfig {
  const env = process.env.NODE_ENV || 'development';
  const logLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
  const prettyPrint = process.env.LOG_PRETTY_PRINT !== 'false' && env === 'development';

  return {
    level: logLevel,
    prettyPrint,
    enableRequestLogging: process.env.LOG_REQUESTS === 'true',
    redactPaths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'config.apiKey',
      'config.openaiApiKey',
      'config.awsAccessKeyId',
      'config.awsSecretAccessKey',
      '*.apiKey',
      '*.token',
      '*.password',
      '*.secret'
    ]
  };
}

/**
 * Create a Pino logger instance with configuration
 */
function createLogger() {
  const config = getLoggerConfig();

  const pinoConfig: pino.LoggerOptions = {
    level: config.level,
    formatters: {
      level: (label) => {
        return { level: label };
      },
      bindings: (bindings) => {
        return {
          pid: bindings.pid,
          hostname: bindings.hostname,
          node_version: process.version
        };
      }
    },
    redact: {
      paths: config.redactPaths,
      censor: '[REDACTED]'
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: process.env.NODE_ENV || 'development'
    }
  };

  // Add pretty printing for development
  if (config.prettyPrint) {
    pinoConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        singleLine: false,
        messageFormat: '{levelLabel} - {msg}'
      }
    };
  }

  return pino(pinoConfig);
}

/**
 * Singleton logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context
 * @param context - Additional context to include in all log messages
 * @example
 * const gptLogger = createChildLogger({ module: 'gpt-handler' });
 * gptLogger.info('Processing message');
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log levels for dynamic usage
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal'
} as const;

/**
 * Helper to log errors with consistent structure
 * @param error - Error object or message
 * @param context - Additional context
 */
export function logError(error: Error | string, context?: Record<string, any>) {
  if (error instanceof Error) {
    logger.error({
      err: error,
      stack: error.stack,
      ...context
    }, error.message);
  } else {
    logger.error({ ...context }, error);
  }
}

/**
 * Helper to log performance metrics
 * @param operation - Operation name
 * @param duration - Duration in milliseconds
 * @param metadata - Additional metadata
 */
export function logPerformance(
  operation: string,
  duration: number,
  metadata?: Record<string, any>
) {
  logger.info({
    metric: 'performance',
    operation,
    duration_ms: duration,
    ...metadata
  }, `${operation} completed in ${duration}ms`);
}

/**
 * Helper to create a timing function for performance logging
 * @param operation - Operation name
 * @returns Function to call when operation completes
 * @example
 * const endTimer = startTimer('database-query');
 * // ... do work ...
 * endTimer({ query: 'SELECT * FROM users' });
 */
export function startTimer(operation: string) {
  const start = Date.now();
  return (metadata?: Record<string, any>) => {
    const duration = Date.now() - start;
    logPerformance(operation, duration, metadata);
  };
}

export default logger;
