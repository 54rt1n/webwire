import { EVENTS } from '../../core/events.js';

/**
 * Plugin for handling stash state - a generic multilevel-index key value store
 */
export class StashStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.stashAdapter = stateService.storage.stash;
    }

    /**
     * Generate a key path from variable arguments
     * @param {...string} keyParts - Variable key parts to create a path
     * @returns {string} The joined key path
     */
    _createKeyPath(...keyParts) {
        return keyParts.filter(part => part !== undefined && part !== null).join('.');
    }

    /**
     * Initialize stash data structure if it doesn't exist
     */
    _ensureStashExists() {
        if (!this.stateService.state.stash) {
            this.stateService.state.stash = {};
        }
    }

    /**
     * Check if a key path exists in the stash
     * @param {...string} key - Variable key parts
     * @returns {boolean} True if the key path exists
     */
    check(...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        const exists = keyPath in this.stateService.state.stash;
        console.log(`[StateService::StashState] Check key '${keyPath}': ${exists}`);
        return exists;
    }

    /**
     * Get all values at a key path
     * @param {...string} key - Variable key parts
     * @returns {Array} Array of all values at the key path, or empty array if not found
     */
    getAll(...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        const values = this.stateService.state.stash[keyPath] || [];
        return [...values]; // Return a copy to prevent external mutation
    }

    /**
     * Get value at specific index in a key path
     * @param {number} index - Index to retrieve
     * @param {...string} key - Variable key parts
     * @returns {any} Value at the specified index, or undefined if not found
     */
    get(index, ...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        const values = this.stateService.state.stash[keyPath] || [];
        const value = values[index];
        console.log(`[StateService::StashState] Get index ${index} from '${keyPath}':`, value);
        return value;
    }

    /**
     * Append a value to the end of a key path array
     * @param {any} value - Value to append
     * @param {...string} key - Variable key parts
     * @returns {number} New length of the array
     */
    append(value, ...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        
        if (!this.stateService.state.stash[keyPath]) {
            this.stateService.state.stash[keyPath] = [];
        }
        
        const newLength = this.stateService.state.stash[keyPath].push(value);
        console.log(`[StateService::StashState] Appended to '${keyPath}': ${newLength} items total`);
        
        this.eventBus.emit(EVENTS.STASH?.UPDATED || 'stash:updated', { 
            keyPath, 
            operation: 'append', 
            value, 
            length: newLength 
        });
        
        return newLength;
    }

    /**
     * Insert a value at a specific index in a key path array
     * @param {any} value - Value to insert
     * @param {number} index - Index to insert at
     * @param {...string} key - Variable key parts
     * @returns {number} New length of the array
     */
    insert(value, index, ...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        
        if (!this.stateService.state.stash[keyPath]) {
            this.stateService.state.stash[keyPath] = [];
        }
        
        this.stateService.state.stash[keyPath].splice(index, 0, value);
        const newLength = this.stateService.state.stash[keyPath].length;
        console.log(`[StateService::StashState] Inserted at index ${index} in '${keyPath}': ${newLength} items total`);
        
        this.eventBus.emit(EVENTS.STASH?.UPDATED || 'stash:updated', { 
            keyPath, 
            operation: 'insert', 
            value, 
            index, 
            length: newLength 
        });
        
        return newLength;
    }

    /**
     * Get the first value in a key path array
     * @param {...string} key - Variable key parts
     * @returns {any} First value, or undefined if array is empty or doesn't exist
     */
    first(...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        const values = this.stateService.state.stash[keyPath] || [];
        const value = values[0];
        console.log(`[StateService::StashState] First from '${keyPath}':`, value);
        return value;
    }

    /**
     * Get the last value in a key path array
     * @param {...string} key - Variable key parts
     * @returns {any} Last value, or undefined if array is empty or doesn't exist
     */
    last(...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        const values = this.stateService.state.stash[keyPath] || [];
        const value = values[values.length - 1];
        console.log(`[StateService::StashState] Last from '${keyPath}':`, value);
        return value;
    }

    /**
     * Remove value at specific index from a key path array
     * @param {number} index - Index to remove
     * @param {...string} key - Variable key parts
     * @returns {any} The removed value, or undefined if index was out of bounds
     */
    remove(index, ...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        
        if (!this.stateService.state.stash[keyPath]) {
            console.log(`[StateService::StashState] Cannot remove from non-existent key '${keyPath}'`);
            return undefined;
        }
        
        const removed = this.stateService.state.stash[keyPath].splice(index, 1);
        const removedValue = removed.length > 0 ? removed[0] : undefined;
        const newLength = this.stateService.state.stash[keyPath].length;
        
        console.log(`[StateService::StashState] Removed index ${index} from '${keyPath}': ${newLength} items remaining`);
        
        this.eventBus.emit(EVENTS.STASH?.UPDATED || 'stash:updated', { 
            keyPath, 
            operation: 'remove', 
            removedValue, 
            index, 
            length: newLength 
        });
        
        return removedValue;
    }

    /**
     * Load stash data from storage
     * @returns {Object} The loaded stash data
     */
    async load() {
        try {
            const stashData = await this.stashAdapter.getAll();
            this.stateService.state.stash = stashData || {};
            console.log('[StateService::StashState] Stash data loaded:', Object.keys(this.stateService.state.stash).length, 'keys');
            return this.stateService.state.stash;
        } catch (error) {
            console.error('[StateService::StashState] Error loading stash data:', error);
            this.stateService.state.stash = {};
            return {};
        }
    }

    /**
     * Save stash data to storage
     */
    async save() {
        try {
            this._ensureStashExists();
            await this.stashAdapter.setAll(this.stateService.state.stash);
            console.log('[StateService::StashState] Stash data saved:', Object.keys(this.stateService.state.stash).length, 'keys');
        } catch (error) {
            console.error('[StateService::StashState] Error saving stash data:', error);
            throw error;
        }
    }

    /**
     * Clear all values at a specific key path
     * @param {...string} key - Variable key parts
     * @returns {boolean} True if the key existed and was cleared, false otherwise
     */
    clear(...key) {
        this._ensureStashExists();
        const keyPath = this._createKeyPath(...key);
        const existed = keyPath in this.stateService.state.stash;
        
        if (existed) {
            delete this.stateService.state.stash[keyPath];
            console.log(`[StateService::StashState] Cleared key '${keyPath}'`);
            
            this.eventBus.emit(EVENTS.STASH?.CLEARED || 'stash:cleared', { 
                keyPath, 
                operation: 'clear' 
            });
        } else {
            console.log(`[StateService::StashState] Key '${keyPath}' does not exist, nothing to clear`);
        }
        
        return existed;
    }

    /**
     * Clear all stash data
     */
    clearAll() {
        const keyCount = this.stateService.state.stash ? Object.keys(this.stateService.state.stash).length : 0;
        this.stateService.state.stash = {};
        console.log(`[StateService::StashState] Cleared all stash data: ${keyCount} keys removed`);
        
        this.eventBus.emit(EVENTS.STASH?.CLEARED_ALL || 'stash:cleared_all', { 
            operation: 'clear_all',
            keysRemoved: keyCount
        });
    }

    /**
     * Get all key paths in the stash
     * @returns {Array<string>} Array of all key paths
     */
    getAllKeys() {
        this._ensureStashExists();
        const keys = Object.keys(this.stateService.state.stash);
        console.log(`[StateService::StashState] All keys: ${keys.length} keys`);
        return [...keys]; // Return a copy
    }

    /**
     * Get the total number of items across all key paths
     * @returns {number} Total item count
     */
    getTotalItemCount() {
        this._ensureStashExists();
        const total = Object.values(this.stateService.state.stash)
            .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        console.log(`[StateService::StashState] Total items across all keys: ${total}`);
        return total;
    }

    /**
     * Get stash statistics
     * @returns {Object} Statistics object with key count, total items, etc.
     */
    getStats() {
        this._ensureStashExists();
        const keys = Object.keys(this.stateService.state.stash);
        const keyCount = keys.length;
        const totalItems = this.getTotalItemCount();
        const keyStats = keys.map(key => ({
            key,
            itemCount: Array.isArray(this.stateService.state.stash[key]) ? this.stateService.state.stash[key].length : 0
        }));

        const stats = {
            keyCount,
            totalItems,
            keyStats,
            isEmpty: keyCount === 0
        };

        console.log('[StateService::StashState] Stats:', stats);
        return stats;
    }
}
