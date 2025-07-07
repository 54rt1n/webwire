import { SettingsAdapter } from './adapters/settings-adapter.js';
import { StateAdapter, StateValidator } from './adapters/state-adapter.js';
import { UiAdapter } from './adapters/ui-adapter.js';

/**
 * Storage Manager - Clean adapter factory and container
 * Provides specialized storage adapters for different data types
 */

export class StorageManager {
    constructor(eventBus, config = {}) {
        if (!eventBus) {
            throw new Error('Event bus is required');
        }

        this.eventBus = eventBus;
        this.config = config.storage || {};
        this.version = config.version || '1.0.0';

        // Clean interface - specialized adapters
        this.storage = {
            settings: new SettingsAdapter({
                storageKey: this.config.keys?.settings || 'app-settings',
                version: this.version
            }, eventBus),
            
            state: new StateAdapter({
                storageKey: this.config.keys?.state || 'app-state',
                dbName: this.config.db?.state || 'app-db',
                storeName: 'saves',
                version: this.version,
                maxSize: this.config.maxSaveSize || 5 * 1024 * 1024
            }, new StateValidator(['session']), eventBus),

            ui: new UiAdapter({
                storageKey: this.config.keys?.ui || 'app-ui',
                version: this.version
            }, eventBus)
        };

        console.log('[StorageManager] Initialized with clean adapter interface');
    }

    /**
     * Optional initialization for backwards compatibility with existing code
     * Most configuration is now done in constructor
     */
    initialize() {
        if (!this.config.keys) {
            console.warn('[StorageManager] No storage keys provided in config');
        }
        console.log('[StorageManager] Storage adapters ready');
    }
}
