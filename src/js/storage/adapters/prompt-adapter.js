import { StorageAdapter } from './storage-adapter.js';
import { EVENTS } from '../../core/events.js';

/**
 * Prompt Adapter - Specialized adapter for prompt library management
 * Provides prompt storage operations with versioning
 */
export class PromptAdapter {
    constructor(config, eventBus = null) {
        this.storage = new StorageAdapter();
        this.eventBus = eventBus;
        this.storageKey = config.storageKey || 'webwire-prompts';
        this.version = config.version || '1.0.0';
        
        // Check Chrome extension storage availability
        this.isChromeExtension = typeof chrome !== 'undefined' && 
                                 chrome.storage && 
                                 chrome.storage.local;
        
        console.log('[PromptAdapter] Initialized with storage type:', 
                   this.isChromeExtension ? 'Chrome Extension Storage' : 'localStorage');
    }

    /**
     * Load prompts from storage
     * @returns {Promise<Object|null>} Prompt configurations or null if none found
     */
    async load() {
        try {
            let data;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[PromptAdapter] Loading from Chrome extension storage');
                const result = await chrome.storage.local.get(this.storageKey);
                data = result[this.storageKey] || null;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[PromptAdapter] Loading from localStorage fallback');
                data = this.storage.get(this.storageKey);
            }
            
            if (!data) {
                console.log('[PromptAdapter] No prompts found in storage');
                return null;
            }
            
            // Handle version migration if needed
            if (data.version !== this.version) {
                console.log('[PromptAdapter] Version mismatch, migrating...');
                const migrated = this._migrate(data);
                await this.save(migrated);
                return migrated;
            }

            console.log('[PromptAdapter] Prompts loaded:', Object.keys(data.prompts || {}));
            return data;
            
        } catch (error) {
            console.error('[PromptAdapter] Error loading prompts:', error);
            return null;
        }
    }

    /**
     * Save prompts to storage
     * @param {Object} promptsData - Object containing prompts
     * @returns {Promise<boolean>} Success status
     */
    async save(promptsData) {
        try {
            const data = {
                ...promptsData,
                version: this.version,
                timestamp: Date.now()
            };
            
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[PromptAdapter] Saving to Chrome extension storage');
                await chrome.storage.local.set({ [this.storageKey]: data });
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[PromptAdapter] Saving to localStorage fallback');
                success = this.storage.set(this.storageKey, data);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.PROMPT.UPDATED, data);
            }

            console.log('[PromptAdapter] Prompts saved:', Object.keys(data.prompts || {}));
            return success;
            
        } catch (error) {
            console.error('[PromptAdapter] Error saving prompts:', error);
            return false;
        }
    }

    /**
     * Clear all prompts from storage
     * @returns {Promise<boolean>} Success status
     */
    async clear() {
        try {
            let success;
            
            // Use Chrome extension storage if available (for extension contexts)
            if (this.isChromeExtension) {
                console.log('[PromptAdapter] Clearing from Chrome extension storage');
                await chrome.storage.local.remove(this.storageKey);
                success = true;
            } else {
                // Fallback to localStorage for non-extension contexts
                console.log('[PromptAdapter] Clearing from localStorage fallback');
                success = this.storage.remove(this.storageKey);
            }
            
            if (success && this.eventBus) {
                this.eventBus.emit(EVENTS.PROMPT.UPDATED, { prompts: {} });
            }
            
            return success;
            
        } catch (error) {
            console.error('[PromptAdapter] Error clearing prompts:', error);
            return false;
        }
    }

    /**
     * Check if prompts exist in storage
     * @returns {Promise<boolean>} True if prompts exist
     */
    async exists() {
        try {
            const data = await this.load();
            return data !== null && typeof data === 'object' && data.prompts;
        } catch (error) {
            console.error('[PromptAdapter] Error checking if prompts exist:', error);
            return false;
        }
    }

    /**
     * Migrate prompts from older version
     * @param {Object} oldData 
     * @returns {Object}
     * @private
     */
    _migrate(oldData) {
        console.log(`[PromptAdapter] Migrating from ${oldData.version} to ${this.version}`);
        
        return {
            ...oldData,
            version: this.version,
            timestamp: Date.now(),
            migrated: true,
            migratedFrom: oldData.version
        };
    }
}