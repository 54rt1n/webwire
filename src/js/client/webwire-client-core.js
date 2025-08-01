import { initializeContext } from '../context/context-init.js';
import { MCPConnector } from '../mcp/mcp-connector.js';

/**
 * WebWireClientCore
 * The main controller for the WebWire Client. This class wires together the
 * MCPConnector (data/business logic) and the WebWireClient (UI/view logic).
 */
export class WebWireClientCore {
    constructor(eventBus, config = null) {
        this.eventBus = eventBus;
        this.config = config;
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
        } = await initializeContext(this.eventBus, null, { initialState, config: this.config });
        
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
        // Check if MCP is enabled in config
        if (this.config && !this.config.get('features.mcp.enabled', false)) {
            console.log('[WebWireClientCore] MCP is disabled in configuration');
            return false;
        }

        // Check if we already have an MCP connector from initialization
        if (!this.mcpConnector) {
            console.log('[WebWireClientCore] No MCP connector available');
            return false;
        }

        const serverUrl = this.stateService.mcp.getMcpServerUrl();
        if (!serverUrl) {
            console.log('[WebWireClientCore] No MCP server URL configured');
            return false;
        }

        try {
            console.log(`[WebWireClientCore] Attempting to connect to: ${serverUrl}`);

            // If we don't already have a connector, create one
            if (!this.mcpConnector) {
                this.mcpConnector = new MCPConnector(serverUrl);
            }
            
            await this.mcpConnector.initialize(this.stateService);

            console.log('[WebWireClientCore] Connection successful.');

            return true;
        } catch (error) {
            if (error.message.includes('MCP server security downgrade')) {
                console.log('[WebWireClientCore] MCP connection not available due to security constraints');
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

    /**
     * Clean up resources and connections
     */
    disconnect() {
        if (this.mcpConnector) {
            try {
                this.mcpConnector.disconnect();
            } catch (error) {
                console.warn('[WebWireClientCore] Error disconnecting MCP connector:', error);
            }
        }
        
        // Clear references
        this.stateService = null;
        this.mcpConnector = null;
        this.aiClient = null;
        this.storage = null;
        this.dispatcher = null;
    }

}