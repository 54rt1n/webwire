import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../constants/events.js';

/**
 * Settings Adapter - Specialized adapter for settings management
 * Provides clean settings operations with versioning
 */

export class SettingsAdapter {
    constructor(config, eventBus = null) {
        this.storage = new StorageAdapter();
        this.eventBus = eventBus;
        this.storageKey = config.storageKey || 'app-settings';
        this.version = config.version || '1.0.0';
    }

    /**
     * Get all settings
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
     * Set all settings
     * @param {Object} settings 
     * @returns {Promise<boolean>}
     */
    async setAll(settings) {
        const data = {
            ...settings,
            version: this.version,
            timestamp: Date.now()
        };
        
        const success = this.storage.set(this.storageKey, data);
        
        if (success && this.eventBus) {
            this.eventBus.emit(EVENTS.SETTINGS.CHANGED, data);
        }
        
        return success;
    }

    /**
     * Get a specific setting
     * @param {string} key 
     * @param {any} defaultValue 
     * @returns {Promise<any>}
     */
    async get(key, defaultValue = null) {
        const settings = await this.getAll();
        if (!settings) return defaultValue;
        
        return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
    }

    /**
     * Set a specific setting
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
     * Remove a specific setting
     * @param {string} key 
     * @returns {Promise<boolean>}
     */
    async remove(key) {
        const current = await this.getAll();
        if (!current || !current.hasOwnProperty(key)) {
            return true; // Already doesn't exist
        }
        
        const { [key]: removed, ...remaining } = current;
        return this.setAll(remaining);
    }

    /**
     * Clear all settings
     * @returns {Promise<boolean>}
     */
    async clear() {
        const success = this.storage.remove(this.storageKey);
        
        if (success && this.eventBus) {
            this.eventBus.emit(EVENTS.SETTINGS.CLEARED);
        }
        
        return success;
    }

    /**
     * Check if settings exist
     * @returns {Promise<boolean>}
     */
    async exists() {
        return (await this.getAll()) !== null;
    }

    /**
     * Migrate settings from older version
     * @param {Object} oldData 
     * @returns {Object}
     * @private
     */
    _migrate(oldData) {
        console.log(`[SettingsAdapter] Migrating from ${oldData.version} to ${this.version}`);
        
        return {
            ...oldData,
            version: this.version,
            timestamp: Date.now(),
            migrated: true,
            migratedFrom: oldData.version
        };
    }
} 