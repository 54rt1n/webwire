import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';

/**
 * State Adapter - Specialized adapter for game state management
 * Provides clean state operations with validation and IndexedDB fallback
 */

export class StateAdapter {
    constructor(config, validator = null, eventBus = null) {
        this.storage = new StorageAdapter();
        this.validator = validator;
        this.eventBus = eventBus;
        
        this.storageKey = config.storageKey || 'app-state';
        this.dbName = config.dbName || 'app-db';
        this.storeName = config.storeName || 'states';
        this.version = config.version || '1.0.0';
        this.maxSize = config.maxSize || 5 * 1024 * 1024; // 5MB
    }

    /**
     * Save state with validation and fallback
     * @param {Object} state 
     * @returns {Promise<boolean>}
     */
    async save(state) {
        try {
            // Validate state if validator provided
            if (this.validator && !this.validator.validate(state)) {
                throw new Error('State validation failed');
            }

            const { settings, ui, metadata, ...rest } = state;

            const data = {
                ...rest,
                metadata: {
                    ...metadata,
                    version: this.version,
                    timestamp: Date.now(),
                    saveType: 'full'
                }
            };

            // Check size limits
            const serialized = JSON.stringify(data);
            if (serialized.length > this.maxSize) {
                console.warn('[StateAdapter] State exceeds size limit');
                // Could implement compression here if needed
            }

            // Save to localStorage
            const localSuccess = this.storage.set(this.storageKey, data);
            
            // Save to IndexedDB as fallback
            const indexedSuccess = await this.storage.setIndexedDB(
                this.dbName, 
                this.storeName, 
                'current', 
                data
            );

            if (localSuccess && this.eventBus) {
                this.eventBus.emit(EVENTS.STATE.SAVED, data);
            }

            return localSuccess || indexedSuccess;

        } catch (error) {
            console.error('[StateAdapter] Failed to save state:', error);
            return false;
        }
    }

    /**
     * Load state with fallback
     * @returns {Promise<Object|null>}
     */
    async load() {
        try {
            // Try localStorage first
            let data = this.storage.get(this.storageKey);
            
            if (data) {
                if (!this.validator || this.validator.validate(data)) {
                    return data;
                } else {
                    console.warn('[StateAdapter] Local state validation failed');
                }
            }

            // Fallback to IndexedDB
            data = await this.storage.getIndexedDB(
                this.dbName, 
                this.storeName, 
                'current'
            );

            if (data && this.validator && !this.validator.validate(data)) {
                console.warn('[StateAdapter] IndexedDB state validation failed');
                return null;
            }

            return data;

        } catch (error) {
            console.error('[StateAdapter] Failed to load state:', error);
            return null;
        }
    }

    /**
     * Clear all state data
     * @returns {Promise<boolean>}
     */
    async clear() {
        try {
            const localSuccess = this.storage.remove(this.storageKey);
            const indexedSuccess = await this.storage.deleteIndexedDB(this.dbName);
            
            if (this.eventBus) {
                this.eventBus.emit(EVENTS.STATE.CLEARED);
            }
            
            return localSuccess || indexedSuccess;

        } catch (error) {
            console.error('[StateAdapter] Failed to clear state:', error);
            return false;
        }
    }

    /**
     * Check if state exists
     * @returns {Promise<boolean>}
     */
    async exists() {
        const localExists = this.storage.get(this.storageKey) !== null;
        if (localExists) return true;
        
        const indexedData = await this.storage.getIndexedDB(
            this.dbName, 
            this.storeName, 
            'current'
        );
        return indexedData !== null;
    }

    /**
     * Get state metadata without loading full state
     * @returns {Promise<Object|null>}
     */
    async getMetadata() {
        try {
            const state = await this.load();
            return state?.metadata || null;
        } catch (error) {
            console.error('[StateAdapter] Failed to get metadata:', error);
            return null;
        }
    }
}

/**
 * Default State Validator - Basic validation for game states
 */
export class StateValidator {
    constructor(requiredFields = ['session']) {
        this.requiredFields = requiredFields;
    }

    /**
     * Validate state structure
     * @param {Object} state 
     * @returns {boolean}
     */
    validate(state) {
        if (!state || typeof state !== 'object') {
            console.warn('[StateValidator] State is not an object');
            return false;
        }
        
        for (const field of this.requiredFields) {
            if (!state[field]) {
                console.warn(`[StateValidator] Missing required field: ${field}`);
                return false;
            }
        }
        
        return true;
    }
} 