import { initializeContext } from '../context/context-init.js';
import { MCPConnector } from '../mcp/mcp-connector.js';

/**
 * WebWireClientCore
 * The main controller for the WebWire Client. This class wires together the
 * MCPConnector (data/business logic) and the WebWireClient (UI/view logic).
 */
export class WebWireClientCore {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.stateService = null;
        this.mcpConnector = null;
        this.aiClient = null;
        this.storage = null;
        this.dispatcher = null;
    }

    /**
     * Initializes the core state and services.
     */
    async initialize(initialState = null) {
        console.log('[WebWireClientCore] Initializing Context...');

        const { stateService,
            storage,
            aiClient,
            mcpConnector,
            dispatcher,
            ...rest
        } = await initializeContext(this.eventBus, null, { initialState });
        
        this.stateService = stateService;
        this.storage = storage;
        this.aiClient = aiClient;
        this.mcpConnector = mcpConnector;
        this.dispatcher = dispatcher;

        console.log('[WebWireClientCore] StateService:', this.stateService, 'storage:', this.storage, 'aiClient:', this.aiClient, 'mcpConnector:', this.mcpConnector, 'dispatcher:', this.dispatcher, 'rest:', rest);
    }

    /**
     * Connects to the MCP server and fetches initial data.
     * @returns {boolean} true if connection is successful, false otherwise
     */
    async connect() {
        const serverUrl = this.stateService.mcp.getMcpServerUrl();
        if (!serverUrl) {
            console.error('[WebWireClientCore] No MCP server URL found');
            return false;
        }

        try {
            console.log(`[WebWireClientCore] Attempting to connect to: ${serverUrl}`);

            this.mcpConnector = new MCPConnector(serverUrl);
            await this.mcpConnector.initialize(this.stateService);

            console.log('[WebWireClientCore] Connection successful.');

            return true;
        } catch (error) {
            if (error.message.includes('MCP server security downgrade')) {
                console.warn('[WebWireClientCore] MCP Unavailable.');
                return false;
            }
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