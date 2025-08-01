/**
 * Logging - Singleton logger with explicit context and configurable filtering
 * 
 * Provides a unified logging interface that:
 * - Accepts context as either 'this' (for class instances) or a string
 * - Adds consistent [ClassName] prefixes to all log messages
 * - Supports per-class log level configuration via whitelist
 * - Falls back to global debug settings for non-whitelisted classes
 * - Exposes the same interface as console (log, warn, error, debug, info)
 * 
 * @example
 * import { logger } from '../core/logging.js';
 * 
 * class MyService {
 *     constructor() {
 *         logger.log(this, 'Service initialized'); // Output: [MyService] Service initialized
 *     }
 *     
 *     static doSomething() {
 *         logger.log('MyService', 'Static method called'); // Output: [MyService] Static method called
 *     }
 * }
 */

class Logger {
    constructor() {
        this.appConfig = null;
        this.initialized = false;
        
        // Cache for performance
        this._globalLogLevel = 'error';
        this._globalDebugEnabled = false;
        this._classWhitelist = [];
        this._whitelistMap = new Map(); // className -> logLevel for fast lookup
        
        // Log level hierarchy (lower values are more important)
        this._logLevels = {
            'error': 0,
            'warn': 1,
            'info': 2,
            'log': 3,
            'debug': 4
        };
    }
    
    /**
     * Initialize the logger with app configuration
     * @param {AppConfig} appConfig - WebWire app configuration instance
     */
    initialize(appConfig) {
        this.appConfig = appConfig;
        this._updateConfig();
        this.initialized = true;
    }
    
    /**
     * Update cached configuration values
     * @private
     */
    _updateConfig() {
        if (!this.appConfig) {
            return;
        }
        
        this._globalLogLevel = this.appConfig.get('debug.logLevel', 'error');
        this._globalDebugEnabled = this.appConfig.get('debug.enabled', false);
        this._classWhitelist = this.appConfig.get('debug.classWhitelist', []);
        
        // Build fast lookup map
        this._whitelistMap.clear();
        for (const entry of this._classWhitelist) {
            if (entry.className && entry.logLevel) {
                this._whitelistMap.set(entry.className, entry.logLevel);
            }
        }
    }
    
    /**
     * Extract class name from context
     * @private
     * @param {Object|string} context - Either 'this' or a string class name
     * @returns {string} The class name or 'Unknown'
     */
    _getClassName(context) {
        if (typeof context === 'string') {
            return context || 'Unknown';
        }
        
        if (context && typeof context === 'object') {
            // Try to get class name from constructor
            if (context.constructor && context.constructor.name) {
                return context.constructor.name;
            }
        }
        
        return 'Unknown';
    }
    
    /**
     * Check if a log level should be displayed for a given class
     * @private
     * @param {string} level - Log level to check
     * @param {string} className - Class name to check
     * @returns {boolean} True if log should be displayed
     */
    _shouldLog(level, className) {
        // Check if class is whitelisted
        const whitelistLevel = this._whitelistMap.get(className);
        
        let effectiveLogLevel;
        let effectiveDebugEnabled;
        
        if (whitelistLevel) {
            // Use whitelist settings
            effectiveLogLevel = whitelistLevel;
            effectiveDebugEnabled = true; // Whitelisted classes can always debug
        } else {
            // Use global settings
            effectiveLogLevel = this._globalLogLevel;
            effectiveDebugEnabled = this._globalDebugEnabled;
        }
        
        // If debug is disabled and level is debug, don't log (unless whitelisted)
        if (level === 'debug' && !effectiveDebugEnabled && !whitelistLevel) {
            return false;
        }
        
        // Check log level hierarchy
        const currentLevelNum = this._logLevels[effectiveLogLevel] ?? 0;
        const checkLevelNum = this._logLevels[level] ?? 0;
        
        return checkLevelNum <= currentLevelNum;
    }
    
    /**
     * Format arguments with class prefix
     * @private
     * @param {string} className - Class name for prefix
     * @param {...*} args - Arguments to format
     * @returns {Array} Formatted arguments
     */
    _formatArgs(className, args) {
        const prefix = `[${className}]`;
        
        if (args.length === 0) {
            return [prefix];
        }
        
        // If first argument is a string, prepend prefix to it
        if (typeof args[0] === 'string') {
            return [`${prefix} ${args[0]}`, ...args.slice(1)];
        }
        
        // Otherwise, add prefix as first argument
        return [prefix, ...args];
    }
    
    /**
     * Log a message (equivalent to console.log)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments to log
     */
    log(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('log', className)) {
            console.log(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Log an informational message (equivalent to console.info)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments to log
     */
    info(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('info', className)) {
            console.info(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Log a warning message (equivalent to console.warn)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments to log
     */
    warn(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('warn', className)) {
            console.warn(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Log an error message (equivalent to console.error)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments to log
     */
    error(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('error', className)) {
            console.error(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Log a debug message (equivalent to console.debug)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments to log
     */
    debug(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            console.debug(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Group console messages (equivalent to console.group)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments for group label
     */
    group(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('log', className)) {
            console.group(...this._formatArgs(className, args));
        }
    }
    
    /**
     * End console group (equivalent to console.groupEnd)
     */
    groupEnd() {
        console.groupEnd();
    }
    
    /**
     * Collapsed console group (equivalent to console.groupCollapsed)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments for group label
     */
    groupCollapsed(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('log', className)) {
            console.groupCollapsed(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Log object properties (equivalent to console.dir)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {*} obj - Object to inspect
     * @param {Object} options - Formatting options
     */
    dir(context, obj, options) {
        const className = this._getClassName(context);
        if (this._shouldLog('log', className)) {
            console.log(`[${className}]`);
            console.dir(obj, options);
        }
    }
    
    /**
     * Log object as table (equivalent to console.table)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {*} data - Data to display as table
     * @param {Array} columns - Columns to display
     */
    table(context, data, columns) {
        const className = this._getClassName(context);
        if (this._shouldLog('log', className)) {
            console.log(`[${className}]`);
            console.table(data, columns);
        }
    }
    
    /**
     * Start a timer (equivalent to console.time)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {string} label - Timer label
     */
    time(context, label) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            const timerLabel = `[${className}] ${label || 'default'}`;
            console.time(timerLabel);
        }
    }
    
    /**
     * End a timer and log the result (equivalent to console.timeEnd)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {string} label - Timer label
     */
    timeEnd(context, label) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            const timerLabel = `[${className}] ${label || 'default'}`;
            console.timeEnd(timerLabel);
        }
    }
    
    /**
     * Log current timer value (equivalent to console.timeLog)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {string} label - Timer label
     * @param {...*} args - Additional data to log
     */
    timeLog(context, label, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            const timerLabel = `[${className}] ${label || 'default'}`;
            console.timeLog(timerLabel, ...args);
        }
    }
    
    /**
     * Count occurrences (equivalent to console.count)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {string} label - Counter label
     */
    count(context, label) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            const counterLabel = `[${className}] ${label || 'default'}`;
            console.count(counterLabel);
        }
    }
    
    /**
     * Reset counter (equivalent to console.countReset)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {string} label - Counter label
     */
    countReset(context, label) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            const counterLabel = `[${className}] ${label || 'default'}`;
            console.countReset(counterLabel);
        }
    }
    
    /**
     * Log assertion (equivalent to console.assert)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {boolean} assertion - Assertion to test
     * @param {...*} args - Arguments to log if assertion fails
     */
    assert(context, assertion, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('error', className)) {
            console.assert(assertion, ...this._formatArgs(className, args));
        }
    }
    
    /**
     * Log stack trace (equivalent to console.trace)
     * @param {Object|string} context - Either 'this' or a class name string
     * @param {...*} args - Arguments to log with trace
     */
    trace(context, ...args) {
        const className = this._getClassName(context);
        if (this._shouldLog('debug', className)) {
            console.trace(...this._formatArgs(className, args));
        }
    }
    
    /**
     * Update configuration (call this when app config changes)
     * @param {AppConfig} newConfig - Updated configuration
     */
    updateConfig(newConfig) {
        this.appConfig = newConfig;
        this._updateConfig();
    }
    
    /**
     * Get current logging configuration for debugging
     * @returns {Object} Current logging config
     */
    getLoggingConfig() {
        return {
            globalLogLevel: this._globalLogLevel,
            globalDebugEnabled: this._globalDebugEnabled,
            classWhitelist: this._classWhitelist,
            whitelistMap: Object.fromEntries(this._whitelistMap),
            hasAppConfig: !!this.appConfig
        };
    }
}

// Create singleton instance
const logger = new Logger();

export { logger };