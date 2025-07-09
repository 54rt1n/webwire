import { MCPControlPanel } from './panel.js';
import { initializeContext } from '../js/context/context-init.js';
import MCPConnector from '../js/mcp/mcp-connector.js';
import { documentModal } from './document-modal.js';

/**
 * MCPControlPanelApp
 * The main controller for the MCP Control Panel. This class wires together the
 * MCPConnector (data/business logic) and the MCPControlPanel (UI/view logic).
 */
class MCPControlPanelApp {
    constructor() {
        this.panel = new MCPControlPanel();
        this.stateService = null;
        this.mcpConnector = null;
        this.serverUrl = null;
    }

    /**
     * Initializes the entire application.
     */
    async initialize() {
        console.log('[MCPApp] Initializing Control Panel...');

        // 1. Initialize core services (state, storage)
        const { stateService } = await initializeContext();
        this.stateService = stateService;
        await this.stateService.settings.loadSettings();

        // 2. Setup UI event handlers
        const handlers = {
            onReconnect: this.connect.bind(this),
            onRefreshHealth: this.fetchHealthCheck.bind(this),
            onRefreshFs: this.fetchFilesystem.bind(this),
            onOpenFile: this.openFile.bind(this),
            onRefreshKb: this.fetchKnowledgeBase.bind(this),
            onRefreshLists: this.fetchLists.bind(this),
            onSelectList: this.fetchListContent.bind(this),
            onOpenKbDocument: this.openKbDocument.bind(this), // Add this line
        };
        this.panel.initialize(handlers);

        // 3. Attempt to auto-connect
        await this.connect();
    }

    /**
     * Connects to the MCP server and fetches initial data.
     */
    async connect() {
        this.serverUrl = this.stateService.state.settings?.mcp?.serverUrl || 'http://localhost:8000/sse';
        console.log(`[MCPApp] Attempting to connect to: ${this.serverUrl}`);
        this.panel.renderConnectionStatus('connecting', this.serverUrl);

        try {
            this.mcpConnector = new MCPConnector(this.serverUrl, this.stateService);
            await this.mcpConnector.initialize();

            console.log('[MCPApp] Connection successful.');
            this.panel.renderConnectionStatus('connected', this.serverUrl);

            // Fetch initial data for all widgets upon successful connection
            this.fetchAllData();

        } catch (error) {
            console.error('[MCPApp] Connection failed:', error);
            this.panel.renderConnectionStatus('disconnected', `Failed: ${error.message}`);
        }
    }

    /**
     * Fetches and renders data for all widgets simultaneously.
     */
    fetchAllData() {
        this.fetchHealthCheck();
        this.fetchFilesystem();
        this.fetchKnowledgeBase();
        this.fetchLists();
    }

    /**
     * Fetches and renders the health check data.
     */
    async fetchHealthCheck() {
        if (!this.mcpConnector) return;
        this.panel.showLoading('health');
        try {
            const result = await this.mcpConnector.executeTool('health_check');
            if (result.success) {
                this.panel.renderHealthCheck(result);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[MCPApp] Health check failed:', error);
            this.panel.renderHealthCheck(null); // Renders an error state
        }
    }

    /**
     * Fetches and renders the filesystem tree.
     */
    async fetchFilesystem() {
        if (!this.mcpConnector) return;
        this.panel.showLoading('fs');
        try {
            const result = await this.mcpConnector.executeTool('fs_list', { path: '/', recursive: true });
            if (result.success) {
                this.panel.renderFilesystem(result.entries);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[MCPApp] Filesystem fetch failed:', error);
            this.panel.renderFilesystem(null); // Renders an error state
        }
    }

    /**
     * Fetches and renders the knowledge base graph data.
     */
    async fetchKnowledgeBase() {
        if (!this.mcpConnector) return;
        this.panel.showLoading('kb');
        try {
            // Fetch with graph expansion to get relationships
            const result = await this.mcpConnector.executeTool('kb_search', { 
                root_uri: "kb://",
                include_index: true,
            });
            
            if (result.success) {
                this.panel.renderKbGraph(result);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[MCPApp] KB fetch failed:', error);
            this.panel.renderKbGraph(null);
        }
    }

    /**
     * Fetches and renders the list of all lists.
     */
    async fetchLists() {
        if (!this.mcpConnector) return;
        this.panel.showLoading('lists');
        this.panel.showLoading('listContent', 'Select a list from the left...');

        try {
            const result = await this.mcpConnector.executeTool('list_get', { summary_only: true });
            if (result.success) {
                this.panel.renderListsBrowser(result.lists);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[MCPApp] Fetching lists failed:', error);
            this.panel.renderListsBrowser(null);
        }
    }

    /**
     * Fetches and renders the content of a specific list.
     * @param {string} listName - The name of the list to fetch.
     */
    async fetchListContent(listName) {
        if (!this.mcpConnector) return;
        this.panel.showLoading('listContent');
        try {
            const result = await this.mcpConnector.executeTool('list_get', { name: listName, include_items: true });
            if (result.success) {
                this.panel.renderListContent(result);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error(`[MCPApp] Fetching content for list "${listName}" failed:`, error);
            this.panel.listContentView.innerHTML = `<div class="placeholder error">Failed to load list content.</div>`;
        }
    }

    /**
     * Opens a file by fetching its content and displaying it in the file viewer modal.
     * @param {string} filePath - The path of the file to open.
     */
    async openFile(filePath) {
        if (!this.mcpConnector) return;
        
        console.log(`[MCPApp] Opening file: ${filePath}`);
        
        try {
            // Show modal with loading state first
            this.panel.openFileViewer(filePath, '');
            this.panel.setFileViewerLoading();
            
            // Fetch file content
            const result = await this.mcpConnector.executeTool('fs_read', { path: filePath });
            
            if (result.success) {
                // Update modal with actual content
                this.panel.updateFileViewerContent(result.content || result.text || '');
            } else {
                // Show error in modal
                const errorMsg = `Error reading file: ${result.error || 'Unknown error'}`;
                this.panel.updateFileViewerContent(errorMsg);
            }
        } catch (error) {
            console.error(`[MCPApp] Failed to open file "${filePath}":`, error);
            // Show error in modal
            const errorMsg = `Failed to read file: ${error.message}`;
            this.panel.updateFileViewerContent(errorMsg);
        }
    }

    /**
     * Opens a KB document by fetching its full content and displaying it in the document modal.
     * @param {object} node - The KB node data to open.
     */
    async openKbDocument(node) {
        if (!this.mcpConnector) return;
        
        const uri = node.uri || node.urn;
        console.log(`[MCPApp] Opening KB document: ${uri}`);
        
        try {
            // Show modal with loading state first
            documentModal.open({
                uri: uri,
                content: '',
                index: {}
            });
            documentModal.setLoading();
            
            // Fetch full document content with index
            const result = await this.mcpConnector.executeTool('kb_read', { 
                uri: uri,
                include_content: true,
                include_index: true
            });
            
            if (result.success) {
                // Update modal with actual content
                documentModal.updateContent({
                    uri: result.uri || result.urn || uri,
                    content: result.content || '',
                    index: result.index || {},
                    score: node.score,
                    relations: node.relations
                });
            } else {
                // Show error in modal
                const errorMsg = `Error reading document: ${result.error || 'Unknown error'}`;
                documentModal.updateContent({
                    uri: uri,
                    content: errorMsg,
                    index: { error: result.error || 'Unknown error' }
                });
            }
        } catch (error) {
            console.error(`[MCPApp] Failed to open KB document "${uri}":`, error);
            // Show error in modal
            const errorMsg = `Failed to read document: ${error.message}`;
            documentModal.updateContent({
                uri: uri,
                content: errorMsg,
                index: { error: error.message }
            });
        }
    }
}

// Kick off the application.
document.addEventListener('DOMContentLoaded', () => {
    const app = new MCPControlPanelApp();
    app.initialize();
});