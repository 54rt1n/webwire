import { BACKGROUND_ACTIONS } from './cc-actions.js';
import { logger } from './logging.js';

/**
 * EventErrorBoundary provides automatic error handling for event systems.
 * Wraps all event handlers to catch errors and implement recovery strategies.
 */
export class EventErrorBoundary {
  constructor(dispatcher) {
    this.dispatcher = dispatcher;
    this.errorCount = new Map(); // Track error frequency per event
    this.maxRetries = 3;
    this.retryDelay = 1000;

    this.setupGlobalErrorHandling();
    this.setupRecoveryStrategies();
  }

  /**
   * Wrap the dispatcher's event registration to add error boundaries
   */
  setupGlobalErrorHandling() {
    const originalDispatch = this.dispatcher.dispatch.bind(this.dispatcher);

    this.dispatcher.dispatch = async (event, data, options = {}) => {
      try {
        return await originalDispatch(event, data, options);
      } catch (error) {
        this.handleDispatchError(event, error, data, options);
        throw error; // Re-throw after logging
      }
    };
  }

  /**
   * Create an error boundary wrapper for event handlers
   */
  createErrorBoundaryWrapper(event, handler, options) {
    return async (...args) => {
      const errorKey = `${event}:${handler.name || 'anonymous'}`;

      try {
        return await handler(...args);

      } catch (error) {
        await this.handleEventError(event, error, args, errorKey, handler, options);
      }
    };
  }

  /**
   * Handle errors that occur in event handlers
   */
  async handleEventError(event, error, args, errorKey, handler, options) {
    // Track error frequency
    const currentCount = this.errorCount.get(errorKey) || 0;
    this.errorCount.set(errorKey, currentCount + 1);

    logger.error('EventErrorBoundary', `Event ${event} failed:`, {
      error: error.message,
      stack: error.stack,
      args,
      errorCount: currentCount + 1,
      handler: handler.name || 'anonymous'
    });

    // Create error report
    const errorReport = {
      event,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context: {
        args,
        errorCount: currentCount + 1,
        handlerName: handler.name || 'anonymous',
        timestamp: Date.now()
      }
    };

    // Apply recovery strategy
    await this.applyRecoveryStrategy(event, errorReport, handler, args, options);

    // Send error to background for centralized logging
    try {
      await this.dispatcher.dispatch(BACKGROUND_ACTIONS.REPORT_ERROR, {
        error: errorReport.error,
        context: {
          ...errorReport.context,
          operation: 'event_handler_error'
        }
      }, {
        target: 'background',
        timeout: 2000
      });
    } catch (dispatchError) {
      logger.error('EventErrorBoundary', 'Failed to report error to background:', dispatchError);
    }
  }

  /**
   * Handle errors in event dispatch itself
   */
  handleDispatchError(event, error, data, options) {
    logger.error('EventErrorBoundary', `Dispatch failed for ${event}:`, {
      error: error.message,
      data,
      options
    });

    // Try to recover based on event type
    if (options.target === 'background' && error.message.includes('Extension context invalidated')) {
      logger.warn('EventErrorBoundary', 'Extension context invalidated, queuing for retry');
      // Could implement a retry queue here
    }
  }

  /**
   * Apply context-specific recovery strategies
   */
  async applyRecoveryStrategy(event, errorReport, handler, args, options) {
    const strategy = this.getRecoveryStrategy(event);

    try {
      await strategy(errorReport, handler, args, options);
    } catch (recoveryError) {
      logger.error('EventErrorBoundary', `Recovery strategy failed for ${event}:`, recoveryError);
    }
  }

  /**
   * Define recovery strategies for different event types
   */
  setupRecoveryStrategies() {
    this.recoveryStrategies = {
      // Default strategy - log and continue
      default: async (errorReport) => {
        logger.log('EventErrorBoundary', `No specific recovery strategy for ${errorReport.event}, logging only`);
      }
    };
  }

  /**
   * Get the appropriate recovery strategy for an event
   */
  getRecoveryStrategy(event) {
    return this.recoveryStrategies[event] || this.recoveryStrategies.default;
  }

  /**
   * Get error statistics for debugging
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      errorsByEvent: {},
      topErrors: []
    };

    for (const [errorKey, count] of this.errorCount.entries()) {
      const [event] = errorKey.split(':');
      stats.totalErrors += count;
      stats.errorsByEvent[event] = (stats.errorsByEvent[event] || 0) + count;
    }

    stats.topErrors = Array.from(this.errorCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => ({ error: key, count }));

    return stats;
  }

  /**
   * Clear error tracking (useful for testing)
   */
  clearErrorTracking() {
    this.errorCount.clear();
  }
}