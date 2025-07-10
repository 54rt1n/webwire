import { EVENTS } from '../../core/events.js';

/**
 * Plugin for handling stash state - URI-based content store with MCP integration
 * 
 * Stores content fetched from MCP tools using URI as key:
 * stash = {
 *   "kb://document-uri": "document content",
 *   "fs://path/to/file": "file content",
 *   ...
 * }
 */
export class StashStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.stashAdapter = stateService.storage.stash;
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
     * Check if a URI exists in the stash
     * @param {string} uri - URI to check
     * @returns {boolean} True if the URI exists
     */
    has(uri) {
        this._ensureStashExists();
        const exists = uri in this.stateService.state.stash;
        console.log(`[StateService::StashState] Check URI '${uri}': ${exists}`);
        return exists;
    }

    /**
     * Get content for a URI
     * @param {string} uri - URI to retrieve content for
     * @returns {string|null} Content string, or null if not found
     */
    get(uri) {
        this._ensureStashExists();
        const content = this.stateService.state.stash[uri] || null;
        console.log(`[StateService::StashState] Get content for '${uri}':`, content ? `${content.length} chars` : 'not found');
        return content;
    }

    /**
     * Set content for a URI
     * @param {string} uri - URI to store content for
     * @param {string} content - Content to store
     */
    set(uri, content) {
        this._ensureStashExists();
        this.stateService.state.stash[uri] = content;
        console.log(`[StateService::StashState] Set content for '${uri}': ${content.length} chars`);
        
        this.eventBus.emit(EVENTS.STASH?.UPDATED || 'stash:updated', { 
            uri, 
            operation: 'set', 
            contentLength: content.length 
        });
    }

    /**
     * Delete content for a URI
     * @param {string} uri - URI to delete
     * @returns {boolean} True if the URI existed and was deleted
     */
    delete(uri) {
        this._ensureStashExists();
        const existed = uri in this.stateService.state.stash;
        
        if (existed) {
            delete this.stateService.state.stash[uri];
            console.log(`[StateService::StashState] Deleted content for '${uri}'`);
            
            this.eventBus.emit(EVENTS.STASH?.UPDATED || 'stash:updated', { 
                uri, 
                operation: 'delete'
            });
        } else {
            console.log(`[StateService::StashState] URI '${uri}' does not exist, nothing to delete`);
        }
        
        return existed;
    }

    /**
     * Load stash data from storage
     * @returns {Object} The loaded stash data
     */
    async loadFromStorage() {
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
    async saveToStorage() {
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
     * Clear all stash data
     */
    clearAll() {
        const uriCount = this.stateService.state.stash ? Object.keys(this.stateService.state.stash).length : 0;
        this.stateService.state.stash = {};
        console.log(`[StateService::StashState] Cleared all stash data: ${uriCount} URIs removed`);
        
        this.eventBus.emit(EVENTS.STASH?.CLEARED_ALL || 'stash:cleared_all', { 
            operation: 'clear_all',
            urisRemoved: uriCount
        });
    }

    /**
     * Get all keys in the stash
     * @returns {Array<string>} Array of all URIs
     */
    getAllKeys() {
        this._ensureStashExists();
        const keys = Object.keys(this.stateService.state.stash);
        return [...keys];
    }

    /**
     * Get all entries (key-value pairs)
     * @returns {Array<{key: string, value: string, valueLength: number}>} Array of all entries
     */
    getAllEntries() {
        this._ensureStashExists();
        const entries = Object.entries(this.stateService.state.stash).map(([key, value]) => ({
            key,
            value,
            valueLength: value ? value.length : 0
        }));
        return entries;
    }

    /**
     * Filter keys by pattern
     * @param {string|RegExp} pattern - Pattern to match keys against
     * @returns {Array<string>} Array of matching keys
     */
    filter(pattern) {
        this._ensureStashExists();
        const allKeys = this.getAll();
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        const matching = allKeys.filter(key => regex.test(key));
        console.log(`[StateService::StashState] Filtered keys by pattern '${pattern}': ${matching.length} matches`);
        return matching;
    }

    /**
     * Get stash statistics
     * @returns {Object} Statistics object with key count, total value size, etc.
     */
    getStats() {
        this._ensureStashExists();
        const keys = Object.keys(this.stateService.state.stash);
        const keyCount = keys.length;
        
        let totalValueSize = 0;
        const keyStats = keys.map(key => {
            const value = this.stateService.state.stash[key];
            const valueLength = value ? value.length : 0;
            totalValueSize += valueLength;
            
            return {
                key,
                valueLength
            };
        });

        const stats = {
            keyCount,
            totalValueSize,
            keyStats,
            isEmpty: keyCount === 0
        };

        console.log('[StateService::StashState] Stats:', stats);
        return stats;
    }
}
