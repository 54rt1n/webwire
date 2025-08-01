import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';
import { logger } from '../../core/logging.js';

/**
 * Stash Adapter - Specialized adapter for stash state management
 * Provides clean stash operations with versioning for storing URIs and other stashed items
 */

export class StashAdapter {
    constructor(config, eventBus = null) {
        this.storage = new StorageAdapter();
        this.eventBus = eventBus;
        this.storageKey = config.storageKey || 'app-stash';
        this.version = config.version || '1.0.0';
        
        // Check Chrome extension storage availability
        this.isChromeExtension = typeof chrome !== 'undefined' && 
                                 chrome.storage && 
                                 chrome.storage.local;
        
        logger.log('StashAdapter', 'Initialized with storage type:', 
                   this.isChromeExtension ? 'Chrome Extension Storage' : 'localStorage');
    }

    /**
     * Get all stash data
     * @returns {Promise<Object|null>}
     */
    async getAll() {
        try {
            let data;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                logger.log('StashAdapter', 'Using Chrome extension storage');
                const result = await chrome.storage.local.get(this.storageKey);
                data = result[this.storageKey] || null;
            } else {
                // Fallback to localStorage for non-extension contexts
                logger.log('StashAdapter', 'Using localStorage fallback');
                data = this.storage.get(this.storageKey);
            }
            
            if (!data) return {};
            
            // Return the stash data without metadata
            const { version, timestamp, ...stashData } = data;
            return stashData;
        } catch (error) {
            logger.error('StashAdapter', 'Error reading stash data:', error);
            return {};
        }
    }

    /**
     * Set all stash data
     * @param {Object} stashData 
     * @returns {Promise<boolean>}
     */
    async setAll(stashData) {
        try {
            const data = {
                ...stashData,
                version: this.version,
                timestamp: Date.now()
            };
            
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                logger.log('StashAdapter', 'Saving to Chrome extension storage');
                await chrome.storage.local.set({ [this.storageKey]: data });
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                logger.log('StashAdapter', 'Saving to localStorage fallback');
                success = this.storage.set(this.storageKey, data);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.STASH?.SAVED || 'stash:saved', data);
            }
            
            return success;
        } catch (error) {
            logger.error('StashAdapter', 'Error saving stash data:', error);
            return false;
        }
    }

    /**
     * Get a specific stash key
     * @param {string} key 
     * @param {Array} defaultValue 
     * @returns {Promise<Array>}
     */
    async get(key, defaultValue = []) {
        const stashData = await this.getAll();
        if (!stashData) return defaultValue;
        
        return stashData.hasOwnProperty(key) ? stashData[key] : defaultValue;
    }

    /**
     * Set a specific stash key
     * @param {string} key 
     * @param {Array} value 
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
     * Remove a specific stash key
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
     * Clear all stash data
     * @returns {Promise<boolean>}
     */
    async clear() {
        try {
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                logger.log('StashAdapter', 'Clearing from Chrome extension storage');
                await chrome.storage.local.remove(this.storageKey);
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                logger.log('StashAdapter', 'Clearing from localStorage fallback');
                success = this.storage.remove(this.storageKey);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.STASH.CLEARED, { operation: 'clear' });
            }
            
            return success;
        } catch (error) {
            logger.error('StashAdapter', 'Error clearing stash data:', error);
            return false;
        }
    }

    /**
     * Check if stash data exists
     * @returns {Promise<boolean>}
     */
    async exists() {
        return (await this.getAll()) !== null;
    }

    /**
     * Get stash statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const stashData = await this.getAll();
        if (!stashData) {
            return {
                keyCount: 0,
                totalItems: 0,
                isEmpty: true
            };
        }

        const keys = Object.keys(stashData);
        const totalItems = Object.values(stashData)
            .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

        return {
            keyCount: keys.length,
            totalItems,
            isEmpty: keys.length === 0,
            keys
        };
    }
} 