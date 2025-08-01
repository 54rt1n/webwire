import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';
import { logger } from '../../core/logging.js';

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
        
        // Check Chrome extension storage availability
        this.isChromeExtension = typeof chrome !== 'undefined' && 
                                 chrome.storage && 
                                 chrome.storage.local;
        
        logger.log('SettingsAdapter', 'Initialized with storage type:', 
                   this.isChromeExtension ? 'Chrome Extension Storage' : 'localStorage');
    }

    /**
     * Get all settings
     * @returns {Promise<Object|null>}
     */
    async getAll() {
        try {
            let data;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                logger.log('SettingsAdapter', 'Using Chrome extension storage');
                const result = await chrome.storage.local.get(this.storageKey);
                data = result[this.storageKey] || null;
            } else {
                // Fallback to localStorage for non-extension contexts
                logger.log('SettingsAdapter', 'Using localStorage fallback');
                data = this.storage.get(this.storageKey);
            }
            
            if (!data) {
                logger.log('SettingsAdapter', 'No settings found');
                return null;
            }
            
            // Handle version migration
            if (data.version !== this.version) {
                logger.log('SettingsAdapter', 'Version mismatch, migrating...');
                const migrated = this._migrate(data);
                await this.setAll(migrated);
                return migrated;
            }

            logger.log('SettingsAdapter', 'Settings read:', data);
            return data;
            
        } catch (error) {
            logger.error('SettingsAdapter', 'Error reading settings:', error);
            return null;
        }
    }

    /**
     * Set all settings
     * @param {Object} settings 
     * @returns {Promise<boolean>}
     */
    async setAll(settings) {
        try {
            const data = {
                ...settings,
                version: this.version,
                timestamp: Date.now()
            };
            
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                logger.log('SettingsAdapter', 'Saving to Chrome extension storage');
                await chrome.storage.local.set({ [this.storageKey]: data });
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                logger.log('SettingsAdapter', 'Saving to localStorage fallback');
                success = this.storage.set(this.storageKey, data);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.SETTINGS.CHANGED, data);
            }

            logger.log('SettingsAdapter', 'Settings saved:', data);
            return success;
            
        } catch (error) {
            logger.error('SettingsAdapter', 'Error saving settings:', error);
            return false;
        }
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
        try {
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                logger.log('SettingsAdapter', 'Clearing from Chrome extension storage');
                await chrome.storage.local.remove(this.storageKey);
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                logger.log('SettingsAdapter', 'Clearing from localStorage fallback');
                success = this.storage.remove(this.storageKey);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.SETTINGS.CLEARED);
            }
            
            return success;
            
        } catch (error) {
            logger.error('SettingsAdapter', 'Error clearing settings:', error);
            return false;
        }
    }

    /**
     * Check if settings exist
     * @returns {Promise<boolean>}
     */
    async exists() {
        try {
            const settings = await this.getAll();
            return settings !== null && typeof settings === 'object';
        } catch (error) {
            logger.error('SettingsAdapter', 'Error checking if settings exist:', error);
            return false;
        }
    }

    /**
     * Migrate settings from older version
     * @param {Object} oldData 
     * @returns {Object}
     * @private
     */
    _migrate(oldData) {
        logger.log("SettingsAdapter", `Migrating from ${oldData.version} to ${this.version}`);
        
        return {
            ...oldData,
            version: this.version,
            timestamp: Date.now(),
            migrated: true,
            migratedFrom: oldData.version
        };
    }
} 