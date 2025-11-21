/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by stopping requests to a failing service.
 * After N consecutive failures, the circuit "opens" and requests fail fast.
 * After a timeout period, it transitions to "half-open" to test recovery.
 */

import { logger } from './logger';
import { AuditLogger } from '../services/auditLogger';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation, requests allowed
  OPEN = 'OPEN',         // Failing, requests blocked
  HALF_OPEN = 'HALF_OPEN' // Testing recovery, limited requests
}

export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening circuit
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before transitioning to half-open
   */
  resetTimeout: number;

  /**
   * Number of successful requests in half-open state to close circuit
   */
  successThreshold: number;

  /**
   * Name of the circuit (for logging)
   */
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
    logger.info(
      {
        name: options.name,
        failureThreshold: options.failureThreshold,
        resetTimeout: options.resetTimeout,
        module: 'circuit-breaker',
      },
      'Circuit breaker initialized'
    );
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn(
          {
            name: this.options.name,
            state: this.state,
            nextAttempt: new Date(this.nextAttempt).toISOString(),
            module: 'circuit-breaker',
          },
          'Circuit breaker is OPEN, failing fast'
        );
        throw new Error(`Circuit breaker is OPEN for ${this.options.name}. Service temporarily unavailable.`);
      }

      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(
        {
          name: this.options.name,
          state: this.state,
          module: 'circuit-breaker',
        },
        'Circuit breaker transitioning to HALF_OPEN'
      );
    }

    try {
      const result = await fn();

      // Success handling
      this.onSuccess();

      return result;
    } catch (error) {
      // Failure handling
      this.onFailure(error);

      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      logger.debug(
        {
          name: this.options.name,
          successCount: this.successCount,
          successThreshold: this.options.successThreshold,
          module: 'circuit-breaker',
        },
        'Successful request in HALF_OPEN state'
      );

      if (this.successCount >= this.options.successThreshold) {
        // Close circuit
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;

        logger.info(
          {
            name: this.options.name,
            state: this.state,
            module: 'circuit-breaker',
          },
          'Circuit breaker closed (service recovered)'
        );

        // Log circuit breaker state change to audit log
        await AuditLogger.logCircuitBreakerChange({
          service: this.options.name,
          state: 'CLOSED',
          failureCount: 0
        }).catch(err => {
          logger.error({ err }, 'Failed to log circuit breaker state change');
        });
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: any): void {
    this.failureCount++;

    logger.warn(
      {
        err: error,
        name: this.options.name,
        state: this.state,
        failureCount: this.failureCount,
        failureThreshold: this.options.failureThreshold,
        module: 'circuit-breaker',
      },
      'Request failed'
    );

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens circuit
      this.openCircuit();
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit (block requests)
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.options.resetTimeout;

    logger.error(
      {
        name: this.options.name,
        state: this.state,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
        module: 'circuit-breaker',
      },
      'Circuit breaker opened (service unavailable)'
    );

    // Log circuit breaker state change to audit log
    AuditLogger.logCircuitBreakerChange({
      service: this.options.name,
      state: 'OPEN',
      failureCount: this.failureCount
    }).catch(err => {
      logger.error({ err }, 'Failed to log circuit breaker state change');
    });
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN && Date.now() < this.nextAttempt;
  }

  /**
   * Check if circuit is closed (normal operation)
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Manually reset the circuit breaker (for testing/admin)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();

    logger.info(
      {
        name: this.options.name,
        module: 'circuit-breaker',
      },
      'Circuit breaker manually reset'
    );
  }

  /**
   * Get circuit breaker stats
   */
  getStats() {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt) : null,
    };
  }
}
