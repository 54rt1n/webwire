import { SettingsAdapter } from './adapters/settings-adapter.js';
import { StateAdapter, StateValidator } from './adapters/state-adapter.js';
import { TabAdapter } from './adapters/tab-adapter.js';
import { StashAdapter } from './adapters/stash-adapter.js';
import { PromptAdapter } from './adapters/prompt-adapter.js';
import { logger } from '../core/logging.js';

/**
 * Factory and container for specialized storage adapters handling different data types.
 * Provides unified access to settings, state, and UI persistence with automatic
 * validation and version management.
 * 
 * @example
 * const storageManager = new StorageManager(eventBus, {
 *   storage: {
 *     keys: { settings: 'my-app-settings' },
 *     maxSaveSize: 10 * 1024 * 1024
 *   }
 * });
 * 
 * // Access specialized adapters
 * await storageManager.storage.settings.set('theme', 'dark');
 * await storageManager.storage.state.save(appState);
 */

export class StorageManager {
    constructor(eventBus, config = {}) {
        if (!eventBus) {
            throw new Error('Event bus is required');
        }

        this.eventBus = eventBus;
        this.storageConfig = config.storage || {};
        this.version = config.version || '1.0.0';

        // Clean interface - specialized adapters
        this.storage = {
            settings: new SettingsAdapter({
                storageKey: this.storageConfig.keys?.settings || 'app-settings',
                version: this.version
            }, eventBus),
            
            state: new StateAdapter({
                storageKey: this.storageConfig.keys?.state || 'app-state',
                dbName: this.storageConfig.db?.state || 'app-db',
                storeName: 'saves',
                version: this.version,
                maxSize: this.storageConfig.maxSaveSize || 5 * 1024 * 1024
            }, new StateValidator(['session']), eventBus),

            tab: new TabAdapter({
                storageKey: this.storageConfig.keys?.tab || 'app-tab',
                version: this.version
            }, eventBus),

            stash: new StashAdapter({
                storageKey: this.storageConfig.keys?.stash || 'app-stash',
                version: this.version
            }, eventBus),

            prompts: new PromptAdapter({
                storageKey: this.storageConfig.keys?.prompts || 'webwire-prompts',
                version: this.version
            }, eventBus)
        };

        logger.log('StorageManager', 'Initialized with clean adapter interface');
    }

    /**
     * Optional initialization for backwards compatibility with existing code
     * Most configuration is now done in constructor
     */
    initialize() {
        if (!this.storageConfig.keys) {
            logger.warn('StorageManager', 'No storage keys provided in config');
        }
        logger.log('StorageManager', 'Storage adapters ready');
    }
}
