import { EVENT_TYPES } from './events.js';

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

    console.error(`[EventErrorBoundary] Event ${event} failed:`, {
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
      await this.dispatcher.dispatch('ERROR_OCCURRED', errorReport, { 
        target: 'background',
        timeout: 2000 
      });
    } catch (dispatchError) {
      console.error('[EventErrorBoundary] Failed to report error to background:', dispatchError);
    }
  }

  /**
   * Handle errors in event dispatch itself
   */
  handleDispatchError(event, error, data, options) {
    console.error(`[EventErrorBoundary] Dispatch failed for ${event}:`, {
      error: error.message,
      data,
      options
    });

    // Try to recover based on event type
    if (options.target === 'background' && error.message.includes('Extension context invalidated')) {
      console.warn('[EventErrorBoundary] Extension context invalidated, queuing for retry');
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
      console.error(`[EventErrorBoundary] Recovery strategy failed for ${event}:`, recoveryError);
    }
  }

  /**
   * Define recovery strategies for different event types
   */
  setupRecoveryStrategies() {
    this.recoveryStrategies = {
      // AI Streaming errors - try to continue streaming
      [EVENT_TYPES.LOCAL.AI_STREAM_CHUNK]: async (errorReport) => {
        console.log('[Recovery] AI streaming error, attempting to continue...');
        await this.dispatcher.dispatch('AI_STREAM_ERROR_RECOVERY', {
          originalError: errorReport
        });
      },

      // MCP connection errors - attempt reconnection
      [EVENT_TYPES.LOCAL.MCP_TOOL_EXECUTED]: async (errorReport, handler, args) => {
        const errorCount = this.errorCount.get(`${errorReport.event}:${handler.name}`) || 0;
        
        if (errorCount < this.maxRetries) {
          console.log(`[Recovery] MCP tool error, retrying (${errorCount}/${this.maxRetries})...`);
          
          setTimeout(async () => {
            try {
              await handler(...args);
              console.log('[Recovery] MCP tool retry succeeded');
            } catch (retryError) {
              console.error('[Recovery] MCP tool retry failed:', retryError);
            }
          }, this.retryDelay * errorCount);
        }
      },

      // State sync errors - reload from storage
      [EVENT_TYPES.GLOBAL.STATE_SYNC]: async (errorReport) => {
        console.log('[Recovery] State sync error, reloading from storage...');
        await this.dispatcher.dispatch('STATE_RELOAD_FROM_STORAGE');
      },

      // UI errors - reset UI state
      [EVENT_TYPES.PANEL.CHAT_MESSAGE]: async (errorReport) => {
        console.log('[Recovery] Chat UI error, resetting chat state...');
        await this.dispatcher.dispatch('CHAT_RESET_STATE');
      },

      // Default strategy - log and continue
      default: async (errorReport) => {
        console.log(`[Recovery] No specific recovery strategy for ${errorReport.event}, logging only`);
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
      .sort(([,a], [,b]) => b - a)
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