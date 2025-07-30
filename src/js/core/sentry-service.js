export class SentryService {
  constructor() {
    this.initialized = false;
    this.sentry = null;
    this.fallbackHandler = null;
    this.context = null;
  }

  async initialize(config = {}) {
    try {
      const { 
        dsn, 
        environment = 'production',
        context = 'unknown',
        beforeSend,
        integrations = []
      } = config;

      this.context = context;

      if (typeof window !== 'undefined' && window.Sentry) {
        this.sentry = window.Sentry;
        
        this.sentry.init({
          dsn,
          environment,
          integrations: [
            ...integrations,
            this.sentry.replayIntegration({
              maskAllText: false,
              blockAllMedia: false,
            }),
          ],
          beforeSend: (event, hint) => {
            event.contexts = {
              ...event.contexts,
              extension: {
                context: this.context,
                version: chrome?.runtime?.getManifest?.()?.version || 'unknown'
              }
            };

            if (beforeSend) {
              return beforeSend(event, hint);
            }
            return event;
          },
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
        });

        this.initialized = true;
        console.log(`Sentry initialized for ${context} context`);
      } else {
        console.warn('Sentry not available in this context');
        this.setupFallbackHandler();
      }
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
      this.setupFallbackHandler();
    }
  }

  setupFallbackHandler() {
    // Background context doesn't need a fallback - just log
    this.fallbackHandler = (error, context = {}) => {
      console.error('Sentry not initialized, logging error:', {
        message: error.message || String(error),
        stack: error.stack,
        context: this.context,
        ...context
      });
    };
  }

  captureException(error, context = {}) {
    if (this.initialized && this.sentry) {
      this.sentry.captureException(error, {
        contexts: {
          custom: context
        }
      });
    } else if (this.fallbackHandler) {
      this.fallbackHandler(error, context);
    } else {
      console.error('No error handler available:', error, context);
    }
  }

  captureMessage(message, level = 'info', context = {}) {
    if (this.initialized && this.sentry) {
      this.sentry.captureMessage(message, level, {
        contexts: {
          custom: context
        }
      });
    } else {
      console.log(`[${level}] ${message}`, context);
    }
  }

  setUser(user) {
    if (this.initialized && this.sentry) {
      this.sentry.setUser(user);
    }
  }

  setContext(key, context) {
    if (this.initialized && this.sentry) {
      this.sentry.setContext(key, context);
    }
  }

  addBreadcrumb(breadcrumb) {
    if (this.initialized && this.sentry) {
      this.sentry.addBreadcrumb(breadcrumb);
    }
  }

  withScope(callback) {
    if (this.initialized && this.sentry) {
      this.sentry.withScope(callback);
    } else {
      callback({
        setTag: () => {},
        setContext: () => {},
        setLevel: () => {}
      });
    }
  }

  wrap(fn, context = {}) {
    return (...args) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch(error => {
            this.captureException(error, {
              ...context,
              functionName: fn.name || 'anonymous',
              arguments: args
            });
            throw error;
          });
        }
        return result;
      } catch (error) {
        this.captureException(error, {
          ...context,
          functionName: fn.name || 'anonymous',
          arguments: args
        });
        throw error;
      }
    };
  }
}

