import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { MCPControlPanel } from './panel.js';
import { WebWireClientCore } from '../js/client/webwire-client-core.js';
import { PanelEventHandlers } from '../js/client/panel-event-handlers.js';
import { CMCPHelper } from '../js/client/cmcp-helper.js';
import { documentModal } from './components/document-modal.js';
import { ChatService } from '../chat/chat-service.js';
import { EventBus } from '../js/core/event-bus.js';
import { StashPanel } from './components/stash-panel.js';
import '../chat/chat.scss';

/**
 * MCPControlPanelApp
 * The main controller for the MCP Control Panel. This class wires together the
 * MCPConnector (data/business logic) and the MCPControlPanel (UI/view logic).
 * Now also includes WebWire ChatService integration.
 */
class MCPControlPanelApp {
    constructor() {
        // Add ChatService integration
        this.eventBus = new EventBus({domain: 'mcp', debug: true});
        this.core = new WebWireClientCore(this.eventBus);
        this.panelEventHandlers = null;
        this.panel = new MCPControlPanel(this.eventBus);
        this.chatService = new ChatService(this.eventBus);
        this.cmcpHelper = null;
        this.stashPanel = null;
        
        // Setup chat service event handling
        this.setupChatServiceEvents();
        this.setupMCPListeners();
        this.setupStashEventHandlers();
    }

    /**
     * Initializes the entire application.
     */
    async initialize() {
        console.log('[MCPApp] Initializing Control Panel...');

        await this.core.initialize();
        this.panelEventHandlers = new PanelEventHandlers(this.core);
        this.panelEventHandlers.setupEventListeners();
        this.setupStashEventHandlers();
        this.cmcpHelper = new CMCPHelper(this.core.mcpConnector);
        this.chatService.mcpConnector = this.core.mcpConnector;

        // 2. Set up state service for modals
        if (this.core.stateService) {
            documentModal.setStateService(this.core.stateService);
            this.panel.setStateService(this.core.stateService);
            this.stashPanel = new StashPanel(this.eventBus, this.core.stateService);
            
            // 3. Initialize ChatService
            console.log('[MCPApp] Initializing ChatService...');
            await this.chatService.initialize(this.core.aiClient, this.core.mcpConnector, this.core.stateService);

            // 4. Update ChatService with current settings if available
            this.chatService.handleSettingsRefresh({ settings: this.core.stateService.settings.getSettings() });

            // 5. Initialize StashPanel
            this.stashPanel.initialize();
        }

        // 5. Show the chat panel by default (for debugging)
        console.log('[MCPApp] Showing chat panel...');
        setTimeout(() => {
            if (this.chatService.isReady()) {
                this.chatService.showPanel();
                console.log('[MCPApp] Chat panel should now be visible');
            } else {
                console.warn('[MCPApp] ChatService not ready when trying to show panel');
            }
        }, 1000); // Give it a moment to fully initialize
        
        // 6. Setup UI event handlers
        const handlers = {
            onReconnect: this.connect.bind(this),
            onRefreshHealth: this.fetchHealthCheck.bind(this),
            onRefreshFs: this.fetchFilesystem.bind(this),
            onOpenFile: this.openFile.bind(this),
            onRefreshKb: this.fetchKnowledgeBase.bind(this),
            onRefreshLists: this.fetchLists.bind(this),
            onSelectList: this.fetchListContent.bind(this),
            onOpenKbDocument: this.openKbDocument.bind(this),
            onToggleChat: this.toggleChat.bind(this),
        };
        this.panel.initialize(handlers);

        // 6. Attempt to auto-connect
        await this.connect();
        
        console.log('[MCPApp] Initialization complete');
    }

    /**
     * Setup event listeners for MCP events
     */
    setupMCPListeners() {
        this.eventBus.on(EVENTS.MCP.CONNECTED, (payload) => {
            console.log('[MCPApp] Handling MCP connected event:', this.core.mcpConnector);
            this.chatService.setMCPConnector(this.core.mcpConnector);
        });
        this.eventBus.on(EVENTS.MCP.DISCONNECTED, (payload) => {
            console.log('[MCPApp] Handling MCP disconnected event:', this.core.mcpConnector);
            this.chatService.setMCPConnector(null);
        });
    }

    /**
     * Setup stash event handlers for MCP integration
     */
    setupStashEventHandlers() {
        // Handle stash add requests
        this.eventBus.onExclusive(EVENTS.STASH.ADD, this.handleStashAdd.bind(this));
    }

    /**
     * Connects to the MCP server and fetches initial data.
     */
    async connect() {
        this.panel.renderConnectionStatus('connecting', this.serverUrl);
        const success = await this.core.connect();
        if (success) {
            this.panel.renderConnectionStatus('connected', this.core.serverUrl);

            this.cmcpHelper.setMCPConnector(this.core.mcpConnector);
            
            // Share MCP connector with ChatService and StashService
            if (this.core.mcpConnector) {
                console.log('[MCPApp] Shared MCP connector with ChatService after connection');
                
                try {
                    const tools = await this.core.stateService.mcp.getMcpTools();
                    this.eventBus.emit('mcp:connection-changed', {
                        connected: true,
                        tools: tools || []
                    });
                } catch (error) {
                    console.warn('[MCPApp] Failed to get MCP tools:', error);
                    this.eventBus.emit('mcp:connection-changed', {
                        connected: true,
                        tools: []
                    });
                }
            }
            
            this.fetchAllData();
        } else {
            this.panel.renderConnectionStatus('disconnected', `Failed to connect to MCP server`);
            
            // Notify ChatService about MCP disconnection
            this.eventBus.emit('mcp:connection-changed', {
                connected: false,
                tools: []
            });
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
        if (!this.core.mcpConnector) return;
        this.panel.showLoading('health');
        try {
            const result = await this.core.mcpConnector.executeTool('health_check');
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
        if (!this.core.mcpConnector) return;
        this.panel.showLoading('fs');
        try {
            const result = await this.core.mcpConnector.executeTool('fs_list', { path: '/', recursive: true });
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
        if (!this.core.mcpConnector) return;
        this.panel.showLoading('kb');
        try {
            // Fetch with graph expansion to get relationships
            const result = await this.core.mcpConnector.executeTool('kb_search', { 
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
        if (!this.core.mcpConnector) return;
        this.panel.showLoading('lists');
        this.panel.showLoading('listContent', 'Select a list from the left...');

        try {
            const result = await this.core.mcpConnector.executeTool('list_get', { summary_only: true });
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
        if (!this.core.mcpConnector) return;
        this.panel.showLoading('listContent');
        try {
            const result = await this.core.mcpConnector.executeTool('list_get', { name: listName, include_items: true });
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
        if (!this.core.mcpConnector) return;
        
        console.log(`[MCPApp] Opening file: ${filePath}`);
        
        try {
            // Show modal with loading state first
            this.panel.openFileViewer(filePath, '');
            this.panel.setFileViewerLoading();
            
            // Fetch file content
            const result = await this.core.mcpConnector.executeTool('fs_read', { path: filePath });
            
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
        if (!this.core.mcpConnector) return;
        
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
            const result = await this.core.mcpConnector.executeTool('kb_read', { 
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

    /**
     * Toggle the chat panel visibility
     */
    toggleChat() {
        console.log('[MCPApp] Toggling chat panel...');
        if (this.chatService && this.chatService.isReady()) {
            this.chatService.togglePanel();
        } else {
            console.warn('[MCPApp] ChatService not ready for toggle');
        }
    }

    /**
     * Start a new conversation
     */
    async startNewConversation() {
        console.log('[MCPApp] Starting new conversation...');
        
        if (!this.core.stateService || !this.core.stateService.conversation) {
            console.error('[MCPApp] No conversation state service available');
            return;
        }

        try {
            // Create a new conversation (force new, don't reuse existing)
            const currentUser = this.core.stateService.state.settings?.aim?.userName || 'User';
            const currentPersona = this.core.stateService.state.settings?.aim?.personaName || 'WebWire Assistant';
            
            const newConversationId = this.core.stateService.conversation.createThreadId(currentUser, currentPersona);
            
            // Initialize the new conversation
            this.core.stateService.conversation.storeMessage(
                newConversationId,
                { role: 'system', content: '' }, // Placeholder to initialize
                null,
                {
                    userName: currentUser,
                    personaName: currentPersona,
                    title: `Page: ${document.title}`,
                    url: window.location.href,
                    location: window.location.href
                }
            );

            // Remove the placeholder system message
            this.core.stateService.state.conversation.history[newConversationId] = [];
            
            // Set as active (deactivates previous conversations)
            this.core.stateService.conversation.setActiveConversation(newConversationId);
            
            console.log('[MCPApp] Created new conversation:', newConversationId);
            
            // Notify ChatService about the new conversation
            this.eventBus.emit('chat:conversation-loaded', {
                conversation: {
                    threadId: newConversationId,
                    messages: []
                }
            });

        } catch (error) {
            console.error('[MCPApp] Failed to start new conversation:', error);
        }
    }

    /**
     * Setup event handling between ChatService and MCP components
     */
    setupChatServiceEvents() {
        // Handle outbound requests from ChatService
        this.eventBus.onAsync(EVENTS.CHAT.SAVE_MESSAGE, this.handleSaveMessage.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.GET_OR_CREATE_THREAD, this.handleGetOrCreateThread.bind(this));

        this.eventBus.on(EVENTS.CHAT.TOGGLE_UI_SETTING, this.handleUISettingsToggle.bind(this));
    }


    /**
     * Handle get or create thread request from ChatService
     */
    async handleGetOrCreateThread(data) {
        console.log('[MCPApp] Getting or creating thread:', data);
        
        if (!this.core.stateService || !this.core.stateService.conversation) {
            console.error('[MCPApp] No conversation state service available');
            return;
        }

        try {
            let threadId = this.core.stateService.conversation.getActiveThreadId();
            if (!threadId) {
                threadId = this.core.stateService.conversation.createNewConversation();
            }

            console.log('[MCPApp] Thread ID:', threadId);

            // Get existing conversation messages
            const messages = this.core.stateService.conversation.getConversationMessages(threadId);
            
            // Send conversation to ChatService
            console.log('[MCPApp] Emitting chat:conversation-loaded event with threadId:', threadId);
            this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
                conversation: {
                    threadId: threadId,
                    messages: messages
                }
            });

        } catch (error) {
            console.error('[MCPApp] Failed to get or create thread:', error);
        }
    }

    /**
     * Handle save message request from ChatService
     */
    async handleSaveMessage(data) {
        console.log('[MCPApp] Saving message:', data);
        
        if (!this.core.stateService || !this.core.stateService.conversation) {
            console.error('[MCPApp] No conversation state service available');
            return;
        }

        try {
            const { userMessage, assistantMessage, options } = data;
            
            // Get current active conversation ID
            let threadId = this.core.stateService.conversation.getActiveThreadId();
            
            // If no active conversation, create one
            if (!threadId) {
                threadId = this.core.stateService.conversation.createNewConversation({
                    title: options.title || `Page: ${options.url || 'Unknown'}`,
                    url: options.url,
                    location: options.location
                });
            }

            // Store the message pair
            this.core.stateService.conversation.storeMessage(
                threadId,
                userMessage,
                assistantMessage,
                {
                    userName: options.userName || 'User',
                    personaName: options.personaName || 'WebWire Assistant',
                    mood: options.mood,
                    location: options.location,
                    timestamp: options.timestamp || Date.now(),
                    toolResults: options.toolResults || [],
                    toolCalls: options.toolCalls || [],
                    parseErrors: options.parseErrors || []
                }
            );

            console.log(`[MCPApp] Message saved to conversation ${threadId}`);

            await this.core.stateService.disk.saveToStorage();

            // Update ChatService with the conversation ID
            this.eventBus.emit(EVENTS.CHAT.CONVERSATION_UPDATED, {
                threadId: threadId
            });

        } catch (error) {
            console.error('[MCPApp] Failed to save message:', error);
        }
    }

    /**
     * Handle UI settings toggle request from ChatService
     */
    async handleUISettingsToggle(data) {
        console.log('[MCPApp] Handling UI settings toggle:', data);
        
        // Update settings for each setting provided
        if ('includePageContent' in data) {
            this.core.stateService.ui.setIncludePageContent(data.includePageContent);
        }
        
        if ('useMCP' in data) {
            this.core.stateService.ui.setUseMCP(data.useMCP);
        }
        
        // Persist to storage via background
        await this.core.stateService.settings.saveToStorage();

        // Update the chat service with the current state
        this.chatService.setCurrentSettings(this.core.stateService.state.settings);
    }

    /**
     * Load stash data from storage
     */
    async loadStash() {
        await this.panelEventHandlers.handleLoadStash();
    }

    /**
     * Handle stash add request by fetching content and storing it
     * @param {Object} data - { uri, source }
     */
    async handleStashAdd(data, { autoSave = true, ...options } = {}) {
        if (!this.core.stateService || !this.core.stateService.stash) {
            console.error('[MCPApp] No stash service available');
            return;
        }

        const { uri, source, ...rest } = data;

        try {
            let content = null;

            switch (source) {
                case 'kb':
                    content = await this.cmcpHelper.fetchKbContent(uri);
                    this.panelEventHandlers.handleStashAdd({ uri, content }, { autoSave, ...options });
                    break;
                case 'fs':
                    // Extract path from fs://path format
                    const path = uri.startsWith('fs://') ? uri.substring(5) : uri;
                    content = await this.cmcpHelper.fetchFsContent(path);
                    this.panelEventHandlers.handleStashAdd({ uri, content }, { autoSave, ...options });
                    break;
                case 'list':
                    // For lists, extract content from the already-displayed panel data
                    const listPath = uri.startsWith('list://') ? uri.substring(7) : uri;
                    const [listName, itemIndex] = listPath.includes('/') ? 
                        listPath.split('/') : 
                        listPath.split(':');
                    
                    if (itemIndex !== undefined) {
                        // Extract from DOM - panel already has the data displayed
                        const listItemElement = this.panel.listContentView.querySelector(`[data-item-uri="${listName}:${itemIndex}"]`);
                        if (listItemElement) {
                            const statusElement = listItemElement.querySelector('.item-status');
                            const textElement = listItemElement.querySelector('.item-text');
                            
                            if (statusElement && textElement) {
                                const status = statusElement.textContent.trim();
                                const text = textElement.textContent.trim();
                                content = `[${status}] ${text}`;
                                this.panelEventHandlers.handleStashAdd({ uri, content }, { autoSave, ...options });
                            }
                        }
                    } else {
                        // For entire list, use list title from panel
                        const listTitle = this.panel.listContentTitle.textContent;
                        const itemCount = this.panel.listContentView.querySelectorAll('.list-item').length;
                        content = `List: ${listTitle} (${itemCount} items)`;
                        this.panelEventHandlers.handleStashAdd({ uri, content }, { autoSave, ...options });
                    }
                    break;
                default:
                    console.warn('[MCPApp] Unknown stash source:', source);
                    return;
            }

            if (content !== null) {
                console.log(`[MCPApp] Successfully stashed ${uri} (${content.length} chars)`);
            } else {
                console.warn(`[MCPApp] Failed to fetch content for ${uri}`);
            }

        } catch (error) {
            console.error(`[MCPApp] Error stashing ${uri}:`, error);
        }
    }
}

// Kick off the application.
document.addEventListener('DOMContentLoaded', () => {
    const app = new MCPControlPanelApp();
    app.initialize();
});