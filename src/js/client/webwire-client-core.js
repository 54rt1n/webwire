import { initializeContext } from '../context/context-init.js';
import { MCPConnector } from '../mcp/mcp-connector.js';

/**
 * MCPControlPanelApp
 * The main controller for the MCP Control Panel. This class wires together the
 * MCPConnector (data/business logic) and the MCPControlPanel (UI/view logic).
 */
export class WebWireClientCore {
    constructor() {
        this.stateService = null;
        this.mcpConnector = null;
        this.aiClient = null;
        this.serverUrl = null;
        this.storage = null;
        this.chatState = null;
        this.sendToContent = null;
    }

    /**
     * Initializes the core state and services.
     */
    async initialize() {
        console.log('[WebWireClientCore] Initializing Context...');

        const { stateService,
            storage,
            aiClient,
            chatState,
            sendToContent
        } = await initializeContext();
        this.stateService = stateService;
        this.storage = storage;
        this.aiClient = aiClient;
        this.chatState = chatState;
        this.sendToContent = sendToContent;

        await this.stateService.settings.loadSettings();
        await this.stateService.disk.loadFromStorage();
    }

    /**
     * Connects to the MCP server and fetches initial data.
     * @returns {boolean} true if connection is successful, false otherwise
     */
    async connect() {
        this.serverUrl = this.stateService.state.settings?.mcp?.serverUrl || 'http://localhost:8000/sse';
        console.log(`[WebWireClientCore] Attempting to connect to: ${this.serverUrl}`);

        try {
            this.mcpConnector = new MCPConnector(this.serverUrl, this.stateService);
            await this.mcpConnector.initialize();

            console.log('[WebWireClientCore] Connection successful.');

            return true;
        } catch (error) {
            console.error('[WebWireClientCore] Connection failed:', error);
            return false;
        }
    }
}