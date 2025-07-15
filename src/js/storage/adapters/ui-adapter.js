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
        
        // Check Chrome extension storage availability
        this.isChromeExtension = typeof chrome !== 'undefined' && 
                                 chrome.storage && 
                                 chrome.storage.local;
        
        console.log('[UiAdapter] Initialized with storage type:', 
                   this.isChromeExtension ? 'Chrome Extension Storage' : 'localStorage');
    }

    /**
     * Get all UI state
     * @returns {Promise<Object|null>}
     */
    async getAll() {
        try {
            let data;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[UiAdapter] Using Chrome extension storage');
                const result = await chrome.storage.local.get(this.storageKey);
                data = result[this.storageKey] || null;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[UiAdapter] Using localStorage fallback');
                data = this.storage.get(this.storageKey);
            }
            
            if (!data) {
                console.log('[UiAdapter] No UI state found');
                return null;
            }
            
            // Handle version migration
            if (data.version !== this.version) {
                console.log('[UiAdapter] Version mismatch, migrating...');
                const migrated = this._migrate(data);
                await this.setAll(migrated);
                return migrated;
            }

            console.log('[UiAdapter] UI state read:', data);
            return data;
            
        } catch (error) {
            console.error('[UiAdapter] Error reading UI state:', error);
            return null;
        }
    }

    /**
     * Set all UI state
     * @param {Object} uiState 
     * @returns {Promise<boolean>}
     */
    async setAll(uiState) {
        try {
            const data = {
                ...uiState,
                version: this.version,
                timestamp: Date.now()
            };
            
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[UiAdapter] Saving to Chrome extension storage');
                await chrome.storage.local.set({ [this.storageKey]: data });
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[UiAdapter] Saving to localStorage fallback');
                success = this.storage.set(this.storageKey, data);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.UI.CHANGED, data);
            }

            console.log('[UiAdapter] UI state saved:', data);
            return success;
            
        } catch (error) {
            console.error('[UiAdapter] Error saving UI state:', error);
            return false;
        }
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
     * Clear all UI state
     * @returns {Promise<boolean>}
     */
    async clear() {
        try {
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[UiAdapter] Clearing from Chrome extension storage');
                await chrome.storage.local.remove(this.storageKey);
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[UiAdapter] Clearing from localStorage fallback');
                success = this.storage.remove(this.storageKey);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.UI.CLEARED);
            }
            
            return success;
            
        } catch (error) {
            console.error('[UiAdapter] Error clearing UI state:', error);
            return false;
        }
    }

    /**
     * Check if settings exist
     * @returns {Promise<boolean>}
     */
    async exists() {
        return (await this.getAll()) !== null;
    }

    /**
     * Migrate UI state from older version
     * @param {Object} oldData 
     * @returns {Object}
     * @private
     */
    _migrate(oldData) {
        console.log(`[UiAdapter] Migrating from ${oldData.version} to ${this.version}`);
        
        return {
            ...oldData,
            version: this.version,
            timestamp: Date.now(),
            migrated: true,
            migratedFrom: oldData.version
        };
    }
} 
