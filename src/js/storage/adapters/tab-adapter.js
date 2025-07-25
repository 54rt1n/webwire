import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';

/**
 * Tab Adapter - Specialized adapter for tab state management
 * Provides clean tab state operations with versioning
 */

export class TabAdapter {
    constructor(config, eventBus = null) {
        this.storage = new StorageAdapter();
        this.eventBus = eventBus;
        this.storageKey = config.storageKey || 'app-tab';
        this.version = config.version || '1.0.0';
        
        // Check Chrome extension storage availability
        this.isChromeExtension = typeof chrome !== 'undefined' && 
                                 chrome.storage && 
                                 chrome.storage.local;
        
        console.log('[TabAdapter] Initialized with storage type:', 
                   this.isChromeExtension ? 'Chrome Extension Storage' : 'localStorage');
    }

    /**
     * Get all tab state
     * @returns {Promise<Object|null>}
     */
    async getAll() {
        try {
            let data;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[TabAdapter] Using Chrome extension storage');
                const result = await chrome.storage.local.get(this.storageKey);
                data = result[this.storageKey] || null;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[TabAdapter] Using localStorage fallback');
                data = this.storage.get(this.storageKey);
            }
            
            if (!data) {
                console.log('[TabAdapter] No tab state found');
                return null;
            }
            
            // Handle version migration
            if (data.version !== this.version) {
                console.log('[TabAdapter] Version mismatch, migrating...');
                const migrated = this._migrate(data);
                await this.setAll(migrated);
                return migrated;
            }

            console.log('[TabAdapter] Tab state read:', data);
            return data;
            
        } catch (error) {
            console.error('[TabAdapter] Error reading tab state:', error);
            return null;
        }
    }

    /**
     * Set all tab state
     * @param {Object} tabState 
     * @returns {Promise<boolean>}
     */
    async setAll(tabState) {
        try {
            const data = {
                ...tabState,
                version: this.version,
                timestamp: Date.now()
            };
            
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[TabAdapter] Saving to Chrome extension storage');
                await chrome.storage.local.set({ [this.storageKey]: data });
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[TabAdapter] Saving to localStorage fallback');
                success = this.storage.set(this.storageKey, data);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.TAB.CHANGED, data);
            }

            console.log('[TabAdapter] Tab state saved:', data);
            return success;
            
        } catch (error) {
            console.error('[TabAdapter] Error saving tab state:', error);
            return false;
        }
    }

    /**
     * Get a specific tab state
     * @param {string} key 
     * @param {any} defaultValue 
     * @returns {Promise<any>}
     */
    async get(key, defaultValue = null) {
        const tabState = await this.getAll();
        if (!tabState) return defaultValue;
        
        return tabState.hasOwnProperty(key) ? tabState[key] : defaultValue;
    }

    /**
     * Set a specific tab state
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
     * Remove a specific tab state
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
     * Clear all tab state
     * @returns {Promise<boolean>}
     */
    async clear() {
        try {
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[TabAdapter] Clearing from Chrome extension storage');
                await chrome.storage.local.remove(this.storageKey);
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[TabAdapter] Clearing from localStorage fallback');
                success = this.storage.remove(this.storageKey);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.TAB.CLEARED, { 'scope': 'all' });
            }
            
            return success;
            
        } catch (error) {
            console.error('[TabAdapter] Error clearing tab state:', error);
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
     * Migrate tab state from older version
     * @param {Object} oldData 
     * @returns {Object}
     * @private
     */
    _migrate(oldData) {
        console.log(`[TabAdapter] Migrating from ${oldData.version} to ${this.version}`);
        
        return {
            ...oldData,
            version: this.version,
            timestamp: Date.now(),
            migrated: true,
            migratedFrom: oldData.version
        };
    }
} 
