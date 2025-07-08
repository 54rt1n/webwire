import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';

/**
 * UI Adapter - Specialized adapter for UI state management
 * Provides clean UI state operations with versioning
 */

export class UiAdapter {
    constructor(config, eventBus = null) {
        this.storage = new StorageAdapter();
        this.eventBus = eventBus;
        this.storageKey = config.storageKey || 'app-ui';
        this.version = config.version || '1.0.0';
    }

    /**
     * Get all UI state
     * @returns {Promise<Object|null>}
     */
    async getAll() {
        const data = this.storage.get(this.storageKey);
        if (!data) return null;
        
        // Handle version migration
        if (data.version !== this.version) {
            const migrated = this._migrate(data);
            await this.setAll(migrated);
            return migrated;
        }
        
        return data;
    }

    /**
     * Set all UI state
     * @param {Object} uiState 
     * @returns {Promise<boolean>}
     */
    async setAll(uiState) {
        const data = {
            ...uiState,
            version: this.version,
            timestamp: Date.now()
        };
        
        const success = this.storage.set(this.storageKey, data);
        
        if (success && this.eventBus) {
            this.eventBus.emit(EVENTS.UI.CHANGED, data);
        }
        
        return success;
    }

    /**
     * Get a specific UI state
     * @param {string} key 
     * @param {any} defaultValue 
     * @returns {Promise<any>}
     */
    async get(key, defaultValue = null) {
        const uiState = await this.getAll();
        if (!uiState) return defaultValue;
        
        return uiState.hasOwnProperty(key) ? uiState[key] : defaultValue;
    }

    /**
     * Set a specific UI state
     * @param {string} key 
     * @param {any} value 
     * @returns {Promise<boolean>}
     */
    async set(key, value) {
        const current = await this.getAll() || {};
        return this.setAll({
            ...current,
            [key]: value
        });
    }

    /**
     * Remove a specific UI state
     * @param {string} key 
     * @returns {Promise<boolean>}
     */
    async remove(key) {
        const current = await this.getAll();
        if (!current) return true;
        delete current[key];
        return this.setAll(current);
    }

    /**
     * Clear all settings
     * @returns {Promise<boolean>}
     */
    async clear() {
        const success = this.storage.remove(this.storageKey);
        
        return success;
    }

    /**
     * Check if settings exist
     * @returns {Promise<boolean>}
     */
    async exists() {
        return (await this.getAll()) !== null;
    }
} 
