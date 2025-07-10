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
        this.mcpConnector = null; // Will be set when MCP is available
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
     * Set MCP connector for fetching content
     * @param {Object} mcpConnector - MCP connector instance
     */
    setMCPConnector(mcpConnector) {
        this.mcpConnector = mcpConnector;
        console.log('[StateService::StashState] MCP connector set');
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
     * Fetch and store content from MCP for a Knowledge Base URI
     * @param {string} uri - KB URI (e.g., "kb://document-path")
     * @param {Object} options - Options for fetching
     * @param {boolean} options.includeIndex - Include document metadata
     * @param {boolean} options.forceRefresh - Force fetch even if already cached
     * @returns {Promise<string|null>} The fetched content, or null on error
     */
    async fetchKbContent(uri, { includeIndex = true, forceRefresh = false } = {}) {
        if (!this.mcpConnector) {
            console.error('[StateService::StashState] No MCP connector available for KB fetch');
            return null;
        }

        // Return cached content if available and not forcing refresh
        if (!forceRefresh && this.has(uri)) {
            console.log(`[StateService::StashState] Returning cached content for KB URI '${uri}'`);
            return this.get(uri);
        }

        try {
            console.log(`[StateService::StashState] Fetching KB content for '${uri}'`);
            const result = await this.mcpConnector.executeTool('kb_read', {
                uri: uri,
                include_content: true,
                include_index: includeIndex
            });

            if (result.success && result.content) {
                const content = result.content;
                this.set(uri, content);
                console.log(`[StateService::StashState] Fetched and cached KB content: ${content.length} chars`);
                return content;
            } else {
                console.warn(`[StateService::StashState] Failed to fetch KB content for '${uri}':`, result.error);
                return null;
            }
        } catch (error) {
            console.error(`[StateService::StashState] Error fetching KB content for '${uri}':`, error);
            return null;
        }
    }

    /**
     * Fetch and store content from MCP for a filesystem path
     * @param {string} path - File path (will be stored as "fs://{path}")
     * @param {Object} options - Options for fetching
     * @param {string} options.encoding - File encoding (default: utf-8)
     * @param {boolean} options.forceRefresh - Force fetch even if already cached
     * @returns {Promise<string|null>} The fetched content, or null on error
     */
    async fetchFsContent(path, { encoding = 'utf-8', forceRefresh = false } = {}) {
        if (!this.mcpConnector) {
            console.error('[StateService::StashState] No MCP connector available for FS fetch');
            return null;
        }

        const uri = `fs://${path}`;

        // Return cached content if available and not forcing refresh
        if (!forceRefresh && this.has(uri)) {
            console.log(`[StateService::StashState] Returning cached content for FS path '${path}'`);
            return this.get(uri);
        }

        try {
            console.log(`[StateService::StashState] Fetching FS content for '${path}'`);
            const result = await this.mcpConnector.executeTool('fs_read', {
                path: path,
                encoding: encoding
            });

            if (result.success && result.content) {
                const content = result.content;
                this.set(uri, content);
                console.log(`[StateService::StashState] Fetched and cached FS content: ${content.length} chars`);
                return content;
            } else {
                console.warn(`[StateService::StashState] Failed to fetch FS content for '${path}':`, result.error);
                return null;
            }
        } catch (error) {
            console.error(`[StateService::StashState] Error fetching FS content for '${path}':`, error);
            return null;
        }
    }

    /**
     * Fetch content for any URI (auto-detects type)
     * @param {string} uri - URI to fetch (kb://, fs://, or file path)
     * @param {Object} options - Options for fetching
     * @returns {Promise<string|null>} The fetched content, or null on error
     */
    async fetch(uri, options = {}) {
        if (uri.startsWith('kb://')) {
            return this.fetchKbContent(uri, options);
        } else if (uri.startsWith('fs://')) {
            const path = uri.substring(5); // Remove 'fs://' prefix
            return this.fetchFsContent(path, options);
        } else {
            // Assume it's a file path
            return this.fetchFsContent(uri, options);
        }
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
     * Get all URIs in the stash
     * @returns {Array<string>} Array of all URIs
     */
    getAllURIs() {
        this._ensureStashExists();
        const uris = Object.keys(this.stateService.state.stash);
        console.log(`[StateService::StashState] All URIs: ${uris.length} URIs`);
        return [...uris]; // Return a copy
    }

    /**
     * Get all entries (URI-content pairs)
     * @returns {Array<{uri: string, content: string, contentLength: number}>} Array of all entries
     */
    getAllEntries() {
        this._ensureStashExists();
        const entries = Object.entries(this.stateService.state.stash).map(([uri, content]) => ({
            uri,
            content,
            contentLength: content ? content.length : 0
        }));
        console.log(`[StateService::StashState] All entries: ${entries.length} entries`);
        return entries;
    }

    /**
     * Filter URIs by pattern
     * @param {string|RegExp} pattern - Pattern to match URIs against
     * @returns {Array<string>} Array of matching URIs
     */
    filterURIs(pattern) {
        this._ensureStashExists();
        const allURIs = this.getAllURIs();
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        const matching = allURIs.filter(uri => regex.test(uri));
        console.log(`[StateService::StashState] Filtered URIs by pattern '${pattern}': ${matching.length} matches`);
        return matching;
    }

    /**
     * Get stash statistics
     * @returns {Object} Statistics object with URI count, total content size, etc.
     */
    getStats() {
        this._ensureStashExists();
        const uris = Object.keys(this.stateService.state.stash);
        const uriCount = uris.length;
        
        let totalContentSize = 0;
        const uriStats = uris.map(uri => {
            const content = this.stateService.state.stash[uri];
            const contentLength = content ? content.length : 0;
            totalContentSize += contentLength;
            
            return {
                uri,
                contentLength,
                type: uri.startsWith('kb://') ? 'knowledge_base' : 
                      uri.startsWith('fs://') ? 'filesystem' : 'unknown'
            };
        });

        // Group by type
        const typeStats = uriStats.reduce((acc, stat) => {
            if (!acc[stat.type]) {
                acc[stat.type] = { count: 0, totalSize: 0 };
            }
            acc[stat.type].count++;
            acc[stat.type].totalSize += stat.contentLength;
            return acc;
        }, {});

        const stats = {
            uriCount,
            totalContentSize,
            typeStats,
            uriStats,
            isEmpty: uriCount === 0
        };

        console.log('[StateService::StashState] Stats:', stats);
        return stats;
    }
}
