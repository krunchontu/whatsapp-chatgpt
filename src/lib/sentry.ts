/**
 * Sentry Error Tracking Integration
 *
 * Purpose: Centralized error tracking and monitoring for production
 * Pattern: Initialize once at startup, automatically capture errors
 *
 * Usage:
 *   import { initSentry } from './lib/sentry';
 *   initSentry(); // Call at application startup
 */

import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { createChildLogger } from './logger';

const logger = createChildLogger({ module: 'sentry' });

/**
 * Sentry configuration interface
 */
export interface SentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
  enabled?: boolean;
}

/**
 * Check if Sentry should be enabled
 */
function shouldEnableSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  const enabled = process.env.SENTRY_ENABLED !== 'false'; // Enabled by default if DSN is present
  const env = process.env.NODE_ENV || 'development';

  // Only enable in production by default, or if explicitly enabled
  return !!(dsn && enabled && (env === 'production' || process.env.SENTRY_ENABLED === 'true'));
}

/**
 * Get Sentry configuration from environment
 */
function getSentryConfig(): SentryConfig {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    enabled: shouldEnableSentry(),
  };
}

/**
 * Initialize Sentry error tracking
 *
 * @returns True if Sentry was initialized successfully
 */
export function initSentry(): boolean {
  const config = getSentryConfig();

  if (!config.enabled) {
    logger.info('Sentry is disabled (no DSN or not in production)');
    return false;
  }

  if (!config.dsn) {
    logger.warn('Sentry DSN not configured, error tracking disabled');
    return false;
  }

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,

      // Performance Monitoring
      tracesSampleRate: config.tracesSampleRate,
      profilesSampleRate: config.profilesSampleRate,

      // Integrations
      integrations: [
        new ProfilingIntegration(),
      ],

      // PII scrubbing - do not send sensitive data
      beforeSend(event, hint) {
        // Remove PII from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
            if (breadcrumb.data) {
              // Redact phone numbers and sensitive fields
              const redactedData = { ...breadcrumb.data };
              const sensitiveFields = ['phoneNumber', 'apiKey', 'token', 'password', 'secret'];

              for (const field of sensitiveFields) {
                if (redactedData[field]) {
                  redactedData[field] = '[REDACTED]';
                }
              }

              breadcrumb.data = redactedData;
            }
            return breadcrumb;
          });
        }

        // Remove PII from extra data
        if (event.extra) {
          const redactedExtra = { ...event.extra };
          const sensitiveFields = ['phoneNumber', 'apiKey', 'token', 'password', 'secret'];

          for (const field of sensitiveFields) {
            if (redactedExtra[field]) {
              redactedExtra[field] = '[REDACTED]';
            }
          }

          event.extra = redactedExtra;
        }

        return event;
      },

      // Error filtering - don't send certain errors
      beforeSendTransaction(transaction) {
        // Filter out health check transactions
        if (transaction.name?.includes('/healthz') || transaction.name?.includes('/readyz')) {
          return null;
        }
        return transaction;
      },
    });

    logger.info({
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate
    }, 'Sentry initialized successfully');

    return true;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Sentry');
    return false;
  }
}

/**
 * Capture an error in Sentry
 *
 * @param error - Error to capture
 * @param context - Additional context
 */
export function captureError(
  error: Error,
  context?: Record<string, any>
): string | undefined {
  if (!shouldEnableSentry()) {
    return undefined;
  }

  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message in Sentry
 *
 * @param message - Message to capture
 * @param level - Severity level
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, any>
): string | undefined {
  if (!shouldEnableSentry()) {
    return undefined;
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context for Sentry
 * (use anonymized user ID, never real phone numbers)
 *
 * @param userId - Anonymized user ID
 * @param extra - Additional user context
 */
export function setUserContext(userId: string, extra?: Record<string, any>) {
  if (!shouldEnableSentry()) {
    return;
  }

  Sentry.setUser({
    id: userId,
    ...extra,
  });
}

/**
 * Clear user context
 */
export function clearUserContext() {
  if (!shouldEnableSentry()) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 *
 * @param message - Breadcrumb message
 * @param category - Breadcrumb category
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, any>
) {
  if (!shouldEnableSentry()) {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

/**
 * Close Sentry connection gracefully
 * Call this before application shutdown
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 */
export async function closeSentry(timeout: number = 2000): Promise<void> {
  if (!shouldEnableSentry()) {
    return;
  }

  try {
    await Sentry.close(timeout);
    logger.info('Sentry connection closed');
  } catch (error) {
    logger.error({ err: error }, 'Failed to close Sentry connection');
  }
}

export default {
  init: initSentry,
  captureError,
  captureMessage,
  setUserContext,
  clearUserContext,
  addBreadcrumb,
  close: closeSentry,
};
