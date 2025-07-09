import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';

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
    }

    /**
     * Get all stash data
     * @returns {Promise<Object|null>}
     */
    async getAll() {
        const data = await this.storage.get(this.storageKey);
        if (!data) return {};
        
        // Return the stash data without metadata
        const { version, timestamp, ...stashData } = data;
        return stashData;
    }

    /**
     * Set all stash data
     * @param {Object} stashData 
     * @returns {Promise<boolean>}
     */
    async setAll(stashData) {
        const data = {
            ...stashData,
            version: this.version,
            timestamp: Date.now()
        };
        
        const success = await this.storage.set(this.storageKey, data);
        
        if (success && this.eventBus) {
            this.eventBus.emit(EVENTS.STASH?.SAVED || 'stash:saved', data);
        }
        
        return success;
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
        const success = await this.storage.remove(this.storageKey);
        
        if (success && this.eventBus) {
            this.eventBus.emit(EVENTS.STASH?.CLEARED_ALL || 'stash:cleared_all', {});
        }
        
        return success;
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