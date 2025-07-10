import { initializeContext } from '../context/context-init.js';
import { MCPConnector } from '../mcp/mcp-connector.js';

/**
 * MCPControlPanelApp
 * The main controller for the MCP Control Panel. This class wires together the
 * MCPConnector (data/business logic) and the MCPControlPanel (UI/view logic).
 */
export class WebWireClientCore {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.stateService = null;
        this.mcpConnector = null;
        this.aiClient = null;
        this.serverUrl = null;
        this.storage = null;
    }

    /**
     * Initializes the core state and services.
     */
    async initialize() {
        console.log('[WebWireClientCore] Initializing Context...');

        const { stateService,
            storage,
            aiClient,
            ...rest
        } = await initializeContext(this.eventBus);
        this.stateService = stateService;
        this.storage = storage;
        this.aiClient = aiClient;

        console.log('[WebWireClientCore] StateService:', this.stateService, 'storage:', this.storage, 'aiClient:', this.aiClient, 'rest:', rest);
    }

    /**
     * Connects to the MCP server and fetches initial data.
     * @returns {boolean} true if connection is successful, false otherwise
     */
    async connect() {
        this.serverUrl = this.stateService.state.settings?.mcp?.serverUrl || 'http://localhost:8000/sse';
        console.log(`[WebWireClientCore] Attempting to connect to: ${this.serverUrl}`);

        try {
            this.mcpConnector = new MCPConnector(this.serverUrl);
            await this.mcpConnector.initialize(this.stateService);

            console.log('[WebWireClientCore] Connection successful.');

            return true;
        } catch (error) {
            console.error('[WebWireClientCore] Connection failed:', error);
            return false;
        }
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

}