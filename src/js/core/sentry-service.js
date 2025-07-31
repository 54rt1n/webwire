import {
  BrowserClient,
  defaultStackParser,
  getDefaultIntegrations,
  makeFetchTransport,
  Scope,
} from "@sentry/browser";

export class SentryService {
  constructor(config = {}) {
    this.initialized = false;
    this.context = config.context || null;
    this.config = config;
    this.client = null;
    this.scope = null;
  }

  async initialize(crashReportingEnabled = true) {
    if (!crashReportingEnabled) {
      console.log('[SentryService] Crash reporting disabled');
      return;
    }

    try {
      const { 
        dsn, 
        environment = 'production',
        context = 'unknown',
        beforeSend
      } = this.config;

      this.context = context;

      if (!dsn) {
        console.warn('[SentryService] No DSN provided, Sentry not initialized');
        return;
      }

      // Filter integrations that use the global variable (not compatible with extensions)
      const integrations = getDefaultIntegrations({}).filter(
        (defaultIntegration) => {
          return !["BrowserApiErrors", "Breadcrumbs", "GlobalHandlers"].includes(
            defaultIntegration.name,
          );
        },
      );

      this.client = new BrowserClient({
        dsn,
        environment,
        transport: makeFetchTransport,
        stackParser: defaultStackParser,
        integrations: integrations,
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
        tracesSampleRate: 0.1
      });

      this.scope = new Scope();
      this.scope.setClient(this.client);
      
      this.client.init(); // initializing has to be done after setting the client on the scope

      this.initialized = true;
      console.log(`[SentryService] Initialized for ${context} context`);
    } catch (error) {
      console.error('[SentryService] Failed to initialize:', error);
    }
  }

  captureException(error, context = {}) {
    if (this.initialized && this.scope) {
      this.scope.setContext('custom', context);
      this.scope.captureException(error);
    } else {
      console.error('[SentryService] Not initialized:', error, context);
    }
  }

  captureMessage(message, level = 'info', context = {}) {
    if (this.initialized && this.scope) {
      this.scope.setContext('custom', context);
      this.scope.captureMessage(message, level);
    } else {
      console.log(`[${level}] ${message}`, context);
    }
  }

  setUser(user) {
    if (this.initialized && this.scope) {
      this.scope.setUser(user);
    }
  }

  setContext(key, context) {
    if (this.initialized && this.scope) {
      this.scope.setContext(key, context);
    }
  }

  addBreadcrumb(breadcrumb) {
    if (this.initialized && this.scope) {
      this.scope.addBreadcrumb(breadcrumb);
    }
  }
}