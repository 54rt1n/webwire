/**
 * CMCPHelper
 * A helper class for Container-MCP operations.
 */
export class CMCPHelper {
    /**
     * Constructor
     * @param {Object} mcpConnector - MCP connector instance
     */
    constructor(mcpConnector) {
        this.mcpConnector = mcpConnector;
    }

    /**
     * Set MCP connector
     * @param {Object} mcpConnector - MCP connector instance
     */
    setMCPConnector(mcpConnector) {
        this.mcpConnector = mcpConnector;
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
            console.error('[CMCPHelper] No MCP connector available for KB fetch');
            return null;
        }

        try {
            console.log(`[CMCPHelper] Fetching KB content for '${uri}'`);
            const result = await this.mcpConnector.executeTool('kb_read', {
                uri: uri,
                include_content: true,
                include_index: includeIndex
            });

            if (result.success && result.content) {
                const content = result.content;
                console.log(`[CMCPHelper] Fetched and cached KB content: ${content.length} chars`);
                return content;
            } else {
                console.warn(`[CMCPHelper] Failed to fetch KB content for '${uri}':`, result.error);
                return null;
            }
        } catch (error) {
            console.error(`[CMCPHelper] Error fetching KB content for '${uri}':`, error);
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
            console.error('[CMCPHelper] No MCP connector available for FS fetch');
            return null;
        }

        const uri = `fs://${path}`;

        try {
            console.log(`[CMCPHelper] Fetching FS content for '${path}'`);
            const result = await this.mcpConnector.executeTool('fs_read', {
                path: path,
                encoding: encoding
            });

            if (result.success && result.content) {
                const content = result.content;
                console.log(`[CMCPHelper] Fetched and cached FS content: ${content.length} chars`);
                return content;
            } else {
                console.warn(`[CMCPHelper] Failed to fetch FS content for '${path}':`, result.error);
                return null;
            }
        } catch (error) {
            console.error(`[CMCPHelper] Error fetching FS content for '${path}':`, error);
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
}