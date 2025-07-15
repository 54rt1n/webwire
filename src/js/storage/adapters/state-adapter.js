import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';

/**
 * State Adapter - Specialized adapter for game state management
 * Provides clean state operations with validation using Chrome storage
 */

export class StateAdapter {
    constructor(config, validator = null, eventBus = null) {
        this.storage = new StorageAdapter();
        this.validator = validator;
        this.eventBus = eventBus;
        
        this.storageKey = config.storageKey || 'app-state';
        this.version = config.version || '1.0.0';
        this.maxSize = config.maxSize || 5 * 1024 * 1024; // 5MB
        
        // Check Chrome extension storage availability
        this.isChromeExtension = typeof chrome !== 'undefined' && 
                                 chrome.storage && 
                                 chrome.storage.local;
        
        console.log('[StateAdapter] Initialized with storage type:', 
                   this.isChromeExtension ? 'Chrome Extension Storage' : 'localStorage');
    }

    /**
     * Save state with validation
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

            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[StateAdapter] Saving to Chrome extension storage');
                await chrome.storage.local.set({ [this.storageKey]: data });
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[StateAdapter] Saving to localStorage fallback');
                success = this.storage.set(this.storageKey, data);
            }

            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.STATE.SAVED, data);
            }

            console.log('[StateAdapter] State saved:', data);
            return success;

        } catch (error) {
            console.error('[StateAdapter] Failed to save state:', error);
            return false;
        }
    }

    /**
     * Load state
     * @returns {Promise<Object|null>}
     */
    async load() {
        try {
            let data;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[StateAdapter] Using Chrome extension storage');
                const result = await chrome.storage.local.get(this.storageKey);
                data = result[this.storageKey] || null;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[StateAdapter] Using localStorage fallback');
                data = this.storage.get(this.storageKey);
            }
            
            if (!data) {
                console.log('[StateAdapter] No state found');
                return null;
            }

            // Validate if validator provided
            if (this.validator && !this.validator.validate(data)) {
                console.warn('[StateAdapter] State validation failed');
                return null;
            }

            console.log('[StateAdapter] State loaded:', data);
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
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[StateAdapter] Clearing from Chrome extension storage');
                await chrome.storage.local.remove(this.storageKey);
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[StateAdapter] Clearing from localStorage fallback');
                success = this.storage.remove(this.storageKey);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.STATE.CLEARED);
            }
            
            return success;

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
        try {
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                const result = await chrome.storage.local.get(this.storageKey);
                return result[this.storageKey] !== undefined;
            } else {
                // Fallback to localStorage for non-extension contexts
                return this.storage.get(this.storageKey) !== null;
            }
        } catch (error) {
            console.error('[StateAdapter] Error checking if state exists:', error);
            return false;
        }
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