/**
 * AppConfig - Hierarchical configuration system for WebWire
 * 
 * Provides a centralized configuration management system with:
 * - Static factory methods for different contexts (background, content, page)
 * - Hierarchical configuration with dot-notation access
 * - Environment-specific defaults
 * - Runtime configuration merging
 * 
 * @example
 * // In background script
 * globalThis.__WEBWIRE_CONFIG__ = AppConfig.backgroundFactory('lite');
 * 
 * // In content script
 * window.__WEBWIRE_CONFIG__ = AppConfig.contentFactory('full');
 * 
 * // In popup/options pages
 * const config = AppConfig.pageFactory('lite');
 * 
 * // Using the config
 * const enableMcp = config.enableMcp;
 * const version = config.version;
 */

export class AppConfig {
    /**
     * Create a configuration object for background script context
     * @param {string} mode - The extension mode ('full' or 'lite')
     * @returns {Object} Configuration object
     */
    static backgroundFactory(mode) {
        const baseConfig = this.#getBaseConfig(mode);
        
        const config = {
            ...baseConfig,
            context: 'background',
            // Background-specific overrides can go here
        };
        
        return new AppConfig(config);
    }

    /**
     * Create a configuration object for content script context
     * @param {string} mode - The extension mode ('full' or 'lite')
     * @returns {Object} Configuration object
     */
    static contentFactory(mode) {
        const baseConfig = this.#getBaseConfig(mode);
        
        const config = {
            ...baseConfig,
            context: 'content',
            // Content-specific overrides can go here
        };
        
        return new AppConfig(config);
    }

    /**
     * Create a configuration object for page contexts (popup, options, etc.)
     * @param {string} mode - The extension mode ('full' or 'lite')
     * @returns {Object} Configuration object
     */
    static pageFactory(mode) {
        const baseConfig = this.#getBaseConfig(mode);
        
        const config = {
            ...baseConfig,
            context: 'page',
            // Page-specific overrides can go here
        };
        
        return new AppConfig(config);
    }

    /**
     * Get base configuration based on mode
     * @private
     * @param {string} mode - The extension mode ('full' or 'lite')
     * @returns {Object} Base configuration object
     */
    static #getBaseConfig(mode) {
        const configs = {
            full: {
                version: 'full',
                features: {
                    mcp: {
                        enabled: true,
                        autoConnect: true,
                        reconnectDelay: 5000,
                        maxReconnectAttempts: 5
                    },
                    tools: {
                        enabled: true,
                        timeout: 30000,
                        maxConcurrent: 5
                    },
                    chat: {
                        streaming: true,
                        maxThreads: 1000,
                        autosave: true
                    },
                    ui: {
                        animations: true,
                        themes: ['light', 'dark'],
                        defaultTheme: 'light'
                    }
                },
                security: {
                    salt: '95v3r53cr37',
                    method: 'AES-GCM',
                },
                sentry: {
                    enabled: true,
                    environment: 'production',
                    dsn: 'https://ccc4f91ba6a758cd37441c35fa311474@o4509755297169408.ingest.us.sentry.io/4509755303723008'
                },
                storage: {
                    compression: true,
                    maxBackups: 2,
                    quotaWarningThreshold: 0.8
                },
                debug: {
                    enabled: true,
                    logLevel: 'debug',
                    performanceMetrics: false,
                    classWhitelist: [
                        { className: 'EventBus', logLevel: 'debug' }
                    ]
                }
            },
            lite: {
                version: 'lite',
                features: {
                    mcp: {
                        enabled: false
                    },
                    tools: {
                        enabled: false
                    },
                    chat: {
                        streaming: true,
                        maxThreads: 100,
                        autosave: true
                    },
                    ui: {
                        animations: false,
                        themes: ['light'],
                        defaultTheme: 'light'
                    }
                },
                security: {
                    salt: 'u7c0m353cr37',
                    method: 'AES-GCM',
                },
                sentry: {
                    enabled: true,
                    environment: 'production-lite',
                    dsn: 'https://ccc4f91ba6a758cd37441c35fa311474@o4509755297169408.ingest.us.sentry.io/4509755303723008'
                },
                storage: {
                    compression: false,
                    maxBackups: 1,
                    quotaWarningThreshold: 0.9
                },
                debug: {
                    enabled: true,
                    logLevel: 'debug',
                    performanceMetrics: false,
                    classWhitelist: [
                        //{ className: 'EventBus', logLevel: 'debug' }
                    ]
                }
            }
        };

        const config = configs[mode];
        if (!config) {
            throw new Error(`Unknown mode: ${mode}. Expected 'full' or 'lite'`);
        }

        return config;
    }

    /**
     * Create an instance with hierarchical configuration management
     * @param {Object} initialConfig - Initial configuration object
     */
    constructor(initialConfig = {}) {
        this.config = { ...initialConfig };
    }

    /**
     * Get a configuration value using dot notation
     * @param {string} path - Dot-notated path (e.g., 'features.mcp.enabled')
     * @param {*} defaultValue - Default value if path not found
     * @returns {*} The configuration value
     * 
     * @example
     * config.get('features.mcp.enabled') // true
     * config.get('storage.compression', false) // true or false
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Set a configuration value using dot notation
     * @param {string} path - Dot-notated path
     * @param {*} value - Value to set
     * 
     * @example
     * config.set('debug.enabled', true)
     * config.set('features.ui.defaultTheme', 'dark')
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.config;

        // Create nested objects as needed
        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[lastKey] = value;
    }

    /**
     * Merge configuration objects deeply
     * @param {Object} updates - Configuration updates to merge
     * 
     * @example
     * config.merge({
     *   debug: { enabled: true },
     *   features: { ui: { animations: false } }
     * })
     */
    merge(updates) {
        this.config = this.#deepMerge(this.config, updates);
    }

    /**
     * Deep merge two objects
     * @private
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    #deepMerge(target, source) {
        const output = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    output[key] = this.#deepMerge(output[key] || {}, source[key]);
                } else {
                    output[key] = source[key];
                }
            }
        }
        
        return output;
    }

    /**
     * Get the entire configuration object
     * @returns {Object} The full configuration
     */
    toObject() {
        return { ...this.config };
    }

    /**
     * Get the extension version/mode
     * @returns {string} The version ('full' or 'lite')
     */
    getVersion() {
        return this.config.version || 'unknown';
    }

    /**
     * Get the execution context
     * @returns {string} The context ('background', 'content', 'page', or 'unknown')
     */
    getContext() {
        return this.config.context || 'unknown';
    }
}