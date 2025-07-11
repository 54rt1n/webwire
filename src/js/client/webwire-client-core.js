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
     * Fetch content for any URI (auto-detects type)
     * @param {string} uri - URI to fetch (kb://, fs://, or file path)
     * @param {Object} options - Options for fetching
     * @returns {Promise<string|null>} The fetched content, or null on error
     */
    async fetch(uri, options = {}) {
        if (uri.startsWith('kb://')) {
            return this.cmcpHelperfetchKbContent(uri, options);
        } else if (uri.startsWith('fs://')) {
            const path = uri.substring(5); // Remove 'fs://' prefix
            return this.cmcpHelper.fetchFsContent(path, options);
        } else {
            // Assume it's a file path
            return this.cmcpHelper.fetchFsContent(uri, options);
        }
    }

}