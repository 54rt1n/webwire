import { EVENTS } from '../js/core/events.js';
import { AIClientFactory } from '../js/ai/ai-client-factory.js';
import { MCPConnector } from '../js/mcp/mcp-connector.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { EventBus } from '../js/core/event-bus.js';
import { WebWirePanel } from './panel.js';
import { pageUtils } from './page-utils.js';
import { setupDebugMethods, setupGlobalDebugAccess } from './debug.js';
import {
    BACKGROUND_ACTIONS,
    BACKGROUND_HANDLERS,
    PANEL_ACTIONS,
    PANEL_MESSAGE_TYPES,
    MESSAGE_ROLES,
    KEYBOARD_SHORTCUTS,
    DOM_READY_STATES
} from './constants.js';
import '../shared/global.scss';
import './style.css';

/**
 * WebWire Content Script - Lightweight Version
 * 
 * Page-local AI and MCP processing with background thread storage:
 * - Manages AI client and MCP connector locally on the page
 * - Uses background script for conversation thread persistence
 * - Provides panel UI for user interaction
 */
class WebWireContentScript {
    constructor() {
        this.panel = new WebWirePanel();
        this.streamingState = {
            isActive: false,
            currentContent: '',
            messageId: null,
            currentMessage: null,
            streamingText: '',
            messageCounter: 0
        };
        
        // Page-local AI/MCP components only
        this.eventBus = new EventBus();
        this.aiClient = null;
        this.mcpConnector = null;
        this.toolParser = new ToolParser();
        
        // Thread management via background script
        this.currentThreadId = null;
        this.currentSettings = {};
    }

    async initialize() {
        console.log('WebWire content script starting initialization...');
        
        // Set up extension communication FIRST (critical for background script communication)
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            this.setupExtensionCommunication();
            console.log('Extension communication set up');
        } else {
            console.warn('Chrome runtime not available - running in non-extension context');
        }
        
        // Set up panel communication
        this.setupPanelCommunication();
        console.log('Panel communication set up');
        
        // Listen for injection requests
        this.listenForInjectionRequests();
        console.log('Injection listeners set up');
        
        // Load settings from background and initialize AI/MCP
        try {
            await this.loadSettingsFromBackground();
            console.log('Settings loaded from background successfully');
            
            // Initialize AI client and MCP connector with loaded settings
            await this.initializeWithSettings(this.currentSettings);
            
        } catch (error) {
            console.error('Settings loading failed, but content script will continue:', error);
        }
        
        // Auto-inject if configured OR if panel was previously visible (from background state)
        try {
            const shouldInject = await this.shouldAutoInject();
            
            // Get panel visibility state from background worker
            const backgroundState = await this.getBackgroundState();
            const shouldShowPanel = backgroundState?.ui?.panelVisible || false;
            
            console.log('[WebWireContent] Panel state from background:', {
                shouldInject,
                shouldShowPanel,
                backgroundState: backgroundState?.ui
            });
            
            if (shouldInject || shouldShowPanel) {
                console.log(shouldInject ? 'Auto-inject enabled, injecting panel...' : 'Panel was previously visible, restoring...');
                await this.injectPanel();
                
                // If panel should be visible (not just auto-inject), show it
                if (shouldShowPanel) {
                    console.log('Showing panel based on background state');
                    // Small delay to ensure panel is fully initialized
                    setTimeout(() => {
                        this.panel.show(); // Use direct show() to avoid recursive state saving
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Auto-inject/restore failed:', error);
        }
        
        console.log('WebWire content script initialization complete - ready for messages');
    }

    async loadSettingsFromBackground() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.GET_WEBWIRE_SETTINGS
            });

            console.log('[WebWireContent] Settings from background:', response);
            
            if (!response) {
                console.error('[WebWireContent] No response from background script');
                this.currentSettings = {};
                return;
            }
            
            if (response.success) {
                this.currentSettings = response.settings || {};
                console.log('[WebWireContent] Successfully loaded settings:', this.currentSettings);
            } else {
                console.error('[WebWireContent] Background script returned error:', response.error);
                this.currentSettings = {};
            }
        } catch (error) {
            console.error('Failed to load settings from background:', error);
            this.currentSettings = {};
        }
    }

    async initializeWithSettings(settings) {
        console.log('[WebWireContent] Initializing AI client and MCP connector with settings:', settings);
        
        try {
            // Initialize AI client if we have valid settings
            if (settings.ai?.models?.chat?.model && settings.ai?.models?.chat?.provider) {
                await this.reinitializeAIClient(settings);
            }
            
            // Initialize MCP connector if we have a server URL
            if (settings.mcp?.serverUrl) {
                await this.reinitializeMCPConnector(settings);
            }
            
            console.log('[WebWireContent] Initialization with settings complete');
            
            // Update connection status after initialization
            this.updateConnectionStatus();
        } catch (error) {
            console.error('[WebWireContent] Error during initialization with settings:', error);
            this.updateConnectionStatus();
        }
    }

    async connectToMCP(url) {
        try {
            this.mcpConnector = new MCPConnector(url);
            await this.mcpConnector.initialize();
            console.log('[WebWireContentScript] Connected to MCP server');
        } catch (error) {
            console.error('[WebWireContentScript] Failed to connect to MCP:', error);
        }
    }

    setupExtensionCommunication() {
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            return this.handleBackgroundMessage(message, sender, sendResponse);
        });
    }

    setupPanelCommunication() {
        // Listen for messages from the panel
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === PANEL_MESSAGE_TYPES.WEBWIRE_PANEL_MESSAGE) {
                this.handlePanelMessage(event.data);
            } else if (event.data.type === PANEL_MESSAGE_TYPES.WEBWIRE_PANEL_READY) {
                // Panel has loaded, send current state
                this.sendInitialState();
            }
        });
    }

    async handlePanelMessage(message) {
        const { action, data } = message;

        try {
            switch (action) {
                case PANEL_ACTIONS.SEND_CHAT_MESSAGE:
                    await this.handleChatMessage(data.message);
                    break;
                    
                case PANEL_ACTIONS.ANALYZE_PAGE_CONTENT:
                    const analysisRequest = pageUtils.buildAnalysisRequest();
                    await this.handleChatMessage(analysisRequest);
                    break;
                    
                case PANEL_ACTIONS.CONNECT_MCP:
                    await this.connectToMCP(data.url);
                    break;
                    
                case PANEL_ACTIONS.DISCONNECT_MCP:
                    if (this.mcpConnector) {
                        this.mcpConnector.disconnect();
                        this.mcpConnector = null;
                    }
                    break;
                    
                case PANEL_ACTIONS.GET_PAGE_CONTENT:
                    const content = pageUtils.getCurrentPageContent();
                    this.sendToPanel({ 
                        type: PANEL_MESSAGE_TYPES.PAGE_CONTENT_RESPONSE, 
                        content 
                    });
                    break;
                    
                case PANEL_ACTIONS.GET_STATE:
                    // Get current thread and settings from background
                    try {
                        const threadResponse = await chrome.runtime.sendMessage({
                            action: BACKGROUND_ACTIONS.GET_ACTIVE_THREAD
                        });
                        const currentThread = threadResponse.success ? threadResponse.thread : null;
                        
                        this.sendToPanel({
                            type: PANEL_MESSAGE_TYPES.STATE_RESPONSE,
                            state: {
                                currentThread: currentThread,
                                settings: this.currentSettings,
                                mcpConnected: this.mcpConnector ? true : false,
                                aiClientConfigured: this.aiClient ? true : false
                            }
                        });
                    } catch (error) {
                        this.sendToPanel({
                            type: PANEL_MESSAGE_TYPES.STATE_RESPONSE,
                            state: {
                                currentThread: null,
                                settings: {},
                                mcpConnected: false,
                                aiClientConfigured: false
                            }
                        });
                    }
                    break;
                    
                case PANEL_ACTIONS.SAVE_SETTINGS:
                    try {
                        const response = await chrome.runtime.sendMessage({
                            action: BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
                            settings: data.settings
                        });
                        this.sendToPanel({
                            type: PANEL_MESSAGE_TYPES.SAVE_SETTINGS_RESPONSE,
                            success: response.success
                        });
                    } catch (error) {
                        this.sendToPanel({
                            type: PANEL_MESSAGE_TYPES.SAVE_SETTINGS_RESPONSE,
                            success: false
                        });
                    }
                    break;
                    
                default:
                    console.warn('Unknown panel message action:', action);
            }
        } catch (error) {
            console.error('Error handling panel message:', error);
            this.sendToPanel({
                type: PANEL_MESSAGE_TYPES.ERROR,
                error: error.message
            });
        }
    }

    async handleChatMessage(userMessage) {
        console.log('[WebWireContent] Starting to handle chat message:', userMessage);
        
        if (!this.aiClient) {
            console.log('[WebWireContent] No AI client configured, sending error to panel');
            this.sendToPanel({
                type: PANEL_MESSAGE_TYPES.ERROR,
                error: 'AI client not configured'
            });
            return;
        }

        try {
            // Add user message to panel
            console.log('[WebWireContent] Sending user message to panel');
            this.sendToPanel({
                type: PANEL_MESSAGE_TYPES.CHAT_MESSAGE,
                message: { role: MESSAGE_ROLES.USER, content: userMessage }
            });

            // Get or create current thread from background
            const threadResponse = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD,
                options: {
                    title: `Page: ${document.title}`,
                    url: window.location.href
                }
            });

            if (!threadResponse.success) {
                throw new Error('Failed to get conversation thread: ' + threadResponse.error);
            }

            const { threadId, metadata, messages } = threadResponse.thread;
            this.currentThreadId = threadId;

            // Create system prompt with tools if MCP is connected
            let systemPrompt = "You are a helpful assistant analyzing web pages and helping users.";
            let tools = [];
            
            if (this.mcpConnector) {
                // Get MCP tools from local connector
                try {
                    tools = await this.mcpConnector.getTools();
                    if (tools && tools.length > 0) {
                        systemPrompt = ToolFormatter.generateSystemPrompt(tools);
                    }
                } catch (error) {
                    console.warn('Failed to get MCP tools:', error);
                }
            }

            // Prepare messages for API (with page context) vs storage (without context)
            // Always enhance the first user message in the conversation with page context for API
            
            // Add current user message to conversation history
            const newUserMessage = {
                role: MESSAGE_ROLES.USER,
                content: userMessage,
                timestamp: Date.now()
            };
            const allMessages = [...messages, newUserMessage];
            
            // Create enhanced version for API - enhance the first user message with page context
            const messagesForAPI = [...allMessages];
            const firstUserIndex = messagesForAPI.findIndex(msg => msg.role === MESSAGE_ROLES.USER);
            if (firstUserIndex !== -1) {
                const firstUserMessage = messagesForAPI[firstUserIndex];
                
                // Only enhance if it's not already a page analysis request
                const isAnalysisRequest = firstUserMessage.content.startsWith('Please analyze this webpage:');
                
                if (!isAnalysisRequest) {
                    messagesForAPI[firstUserIndex] = {
                        ...firstUserMessage,
                        content: pageUtils.enhanceMessageWithContext(firstUserMessage.content)
                    };
                    console.log('[WebWireContent] Enhanced first user message with page context for API');
                } else {
                    console.log('[WebWireContent] Skipped enhancement for page analysis request (already includes context)');
                }
            }

            // Create thinking message and get handle
            console.log('[WebWireContent] Creating thinking message');
            const thinkingMessage = this.addThinkingMessage('Thinking...');
            let streamingText = '';

            // Set up exclusive stream handler for this request
            const unsubscribeStream = this.eventBus.onExclusive(EVENTS.AI.STREAM_CHUNK, (data) => {
                streamingText += data.chunk;
                this.handleStreamingChunk(data.chunk, thinkingMessage);
            });

            let response = null;
            try {
                console.log('[WebWireContent] Generating AI response...');
                // Generate AI response using enhanced messages (with page context) for API
                // Note: We pass empty userMessage since it's already in messagesForAPI
                response = await this.aiClient.generateTurn('', messagesForAPI, { 
                    systemPrompt,
                    maxHistory: 10 
                });

                if (!response) {
                    throw new Error('No response received from AI client');
                }
                console.log('[WebWireContent] AI response received:', response);
            } finally {
                // Clean up stream handler
                unsubscribeStream();
            }

            // Parse for tool calls if MCP is connected
            let toolResults = [];
            let toolCalls = [];
            let parseErrors = [];
            
            if (this.mcpConnector && tools.length > 0) {
                const parseResult = this.toolParser.parseResponse(response);
                if (parseResult.success && parseResult.toolCalls.length > 0) {
                    toolCalls = parseResult.toolCalls;
                    toolResults = await this.executeToolCalls(parseResult.toolCalls);
                } else if (parseResult.errors && parseResult.errors.length > 0) {
                    parseErrors = parseResult.errors;
                }
            }

            // Get current timestamp for consistent storage
            const timestamp = Date.now();

            // Prepare messages for storage (using original unenhanced content)
            const userMsg = { 
                role: MESSAGE_ROLES.USER, 
                content: userMessage, // Original user message without page context
                timestamp,
                url: window.location.href,
                title: document.title
            };
            
            const assistantMsg = { 
                role: MESSAGE_ROLES.ASSISTANT, 
                content: response,
                timestamp: timestamp + 1,
                toolResults,
                toolCalls,
                parseErrors,
                url: window.location.href,
                title: document.title
            };

            // Store conversation in background with complete storeMessage parameters
            const saveResponse = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE,
                threadId: threadId,
                userMessage: userMsg,
                assistantMessage: assistantMsg,
                options: {
                    userName: this.currentSettings?.aim?.userName || MESSAGE_ROLES.USER,
                    personaName: this.currentSettings?.aim?.personaName || MESSAGE_ROLES.ASSISTANT,
                    mood: this.currentSettings?.aim?.mood || null,
                    location: window.location.href,
                    timestamp,
                    toolResults,
                    toolCalls,
                    parseErrors,
                    url: window.location.href,
                    title: document.title
                }
            });

            if (!saveResponse.success) {
                console.warn('Failed to save conversation to background:', saveResponse.error);
            }

            // Finalize the thinking message with the complete response
            console.log('[WebWireContent] Finalizing thinking message with complete response');
            this.finalizeStreamingMessage(thinkingMessage, response);

        } catch (error) {
            console.error('Error handling chat message:', error);
            this.sendToPanel({
                type: PANEL_MESSAGE_TYPES.ERROR,
                error: error.message
            });
        }
    }

    async executeToolCalls(toolCalls) {
        const results = [];
        
        for (const toolCall of toolCalls) {
            try {
                this.sendToPanel({
                    type: PANEL_MESSAGE_TYPES.TOOL_EXECUTION_START,
                    toolName: toolCall.name
                });

                const result = await this.mcpConnector.executeTool(
                    toolCall.name, 
                    toolCall.parameters
                );

                results.push({
                    toolName: toolCall.name,
                    parameters: toolCall.parameters,
                    result,
                    success: result.success,
                    executionTime: result.executionTime
                });

                this.sendToPanel({
                    type: PANEL_MESSAGE_TYPES.TOOL_EXECUTION_COMPLETE,
                    toolName: toolCall.name,
                    result
                });

            } catch (error) {
                console.error(`Tool ${toolCall.name} execution failed:`, error);
                results.push({
                    toolName: toolCall.name,
                    parameters: toolCall.parameters,
                    success: false,
                    error: error.message
                });

                this.sendToPanel({
                    type: PANEL_MESSAGE_TYPES.TOOL_EXECUTION_ERROR,
                    toolName: toolCall.name,
                    error: error.message
                });
            }
        }

        return results;
    }

    sendToPanel(message) {
        // Direct method calls instead of window messaging since panel is in same context
        console.log('[WebWireContent] Calling panel method directly:', message);
        
        switch (message.type) {
            case PANEL_MESSAGE_TYPES.CHAT_MESSAGE:
                this.panel.displayMessage(message.message);
                break;
                
            case PANEL_MESSAGE_TYPES.CHAT_THINKING_START:
                this.panel.displayThinkingMessage(message.message);
                break;
                
            case PANEL_MESSAGE_TYPES.CHAT_STREAMING_CHUNK:
                this.panel.updateStreamingMessage(message.messageId, message.fullContent);
                break;
                
            case PANEL_MESSAGE_TYPES.CHAT_THINKING_COMPLETE:
                if (message.finalContent) {
                    // Finalize the thinking message with final content
                    this.panel.finalizeThinkingMessage(message.messageId, message.finalContent);
                } else {
                    // Just remove the thinking message
                    this.panel.removeThinkingMessage(message.messageId);
                }
                break;
                
            case PANEL_MESSAGE_TYPES.CONVERSATION_UPDATED:
                this.panel.displayConversation(message.conversation);
                break;
                
            case PANEL_MESSAGE_TYPES.CONNECTION_STATUS_UPDATE:
                this.panel.updateConnectionStatus(message.status, message.aiConnected, message.mcpConnected);
                break;
                
            case PANEL_MESSAGE_TYPES.INITIAL_STATE:
                this.panel.handleInitialState(message.state);
                break;
                
            case PANEL_MESSAGE_TYPES.ERROR:
                this.panel.displayError(message.error);
                break;
                
            default:
                console.warn('[WebWireContent] Unknown panel message type:', message.type);
        }
    }

    updateConnectionStatus() {
        const aiConnected = this.aiClient ? true : false;
        const mcpConnected = this.mcpConnector ? true : false;
        
        let status;
        
        if (aiConnected && mcpConnected) {
            status = 'AI + MCP Ready';
        } else if (aiConnected) {
            status = 'AI Ready';
        } else if (mcpConnected) {
            status = 'MCP Connected';
        } else {
            status = 'Configuring...';
        }
        
        // Send status update to panel
        this.sendToPanel({
            type: PANEL_MESSAGE_TYPES.CONNECTION_STATUS_UPDATE,
            aiConnected,
            mcpConnected,
            status
        });
    }

    listenForInjectionRequests() {
        // Listen for extension icon clicks or other injection triggers
        document.addEventListener('webwire-inject', () => {
            this.injectPanel();
        });
        
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // Ctrl+Shift+W to toggle panel
            if (event.ctrlKey === KEYBOARD_SHORTCUTS.TOGGLE_PANEL.ctrlKey && 
                event.shiftKey === KEYBOARD_SHORTCUTS.TOGGLE_PANEL.shiftKey && 
                event.key === KEYBOARD_SHORTCUTS.TOGGLE_PANEL.key) {
                event.preventDefault();
                this.togglePanel();
            }
        });
    }

    async shouldAutoInject() {
        try {
            // Check if auto-inject is enabled in settings
            return this.currentSettings?.ui?.autoInject || false;
        } catch (error) {
            console.warn('Could not check auto-inject setting:', error);
            return false;
        }
    }

    async injectPanel() {
        if (this.panel.isReady()) {
            this.panel.show();
            return;
        }

        try {
            console.log('[WebWireContent] Injecting WebWire panel...');
            
            // Initialize the panel
            await this.panel.initialize();
            
            // Send initial state directly to panel methods
            await this.sendInitialStateDirectly();
            
            console.log('WebWire panel injected successfully');
            
        } catch (error) {
            console.error('Failed to inject WebWire panel:', error);
            this.showError('Failed to load WebWire panel');
        }
    }

    async sendInitialStateDirectly() {
        try {
            // Get current thread from background if available
            let currentThread = null;
            try {
                const threadResponse = await chrome.runtime.sendMessage({
                    action: BACKGROUND_ACTIONS.GET_ACTIVE_THREAD
                });
                if (threadResponse.success) {
                    currentThread = threadResponse.thread;
                }
            } catch (error) {
                console.warn('Could not get active thread:', error);
            }
            
            const state = {
                currentThread: currentThread,
                mcpConnected: this.mcpConnector ? true : false,
                aiClientConfigured: this.aiClient ? true : false,
                settings: this.currentSettings,
                panelInjected: this.panel.isReady(),
                frameworkReady: true
            };
            
            // Call panel methods directly
            this.panel.handleInitialState(state);
            
            console.log('[WebWireContent] Initial state sent directly to panel');
        } catch (error) {
            console.error('Failed to send initial state directly:', error);
            const fallbackState = {
                currentThread: null,
                mcpConnected: false,
                aiClientConfigured: false,
                settings: {},
                panelInjected: this.panel.isReady(),
                frameworkReady: false
            };
            this.panel.handleInitialState(fallbackState);
        }
    }

    async showPanel() {
        this.panel.show();
        // Persist panel visibility state in background
        await this.savePanelVisibilityState(true);
    }

    async hidePanel() {
        this.panel.hide();
        // Persist panel visibility state in background
        await this.savePanelVisibilityState(false);
    }

    /**
     * Save panel visibility state to background worker
     * @param {boolean} visible - Whether the panel is visible
     */
    async savePanelVisibilityState(visible) {
        try {
            console.log(`[WebWireContent] Saving panel visibility state to background: ${visible}`);
            
            const response = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY,
                visible: visible
            });

            if (response && response.success) {
                console.log(`[WebWireContent] Panel visibility state saved to background: ${visible}`);
            } else {
                console.warn('[WebWireContent] Failed to save panel visibility state:', response?.error);
            }
        } catch (error) {
            console.error('[WebWireContent] Error saving panel visibility state:', error);
        }
    }

    /**
     * Get current state from background worker
     */
    async getBackgroundState() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.GET_WEBWIRE_STATE
            });

            if (response && response.success) {
                return response.state;
            } else {
                console.warn('[WebWireContent] Failed to get background state:', response?.error);
                return null;
            }
        } catch (error) {
            console.error('[WebWireContent] Error getting background state:', error);
            return null;
        }
    }

    async togglePanel() {
        if (!this.panel.isReady()) {
            await this.injectPanel();
        } else {
            // Use our persistent show/hide methods instead of panel.toggle()
            if (this.panel.isVisible) {
                await this.hidePanel();
            } else {
                await this.showPanel();
            }
        }
    }

    async handleSettingsChanged(data) {
        console.log('[WebWireContent] Settings changed notification received:', data);
        
        try {
            const newSettings = data.settings || {};
            
            // Update local settings cache
            this.currentSettings = newSettings;
            
            // Reinitialize AI client if AI settings changed
            if (newSettings.ai && (newSettings.ai.models || newSettings.ai.providers)) {
                await this.reinitializeAIClient(newSettings);
            }
            
            // Reinitialize MCP connector if MCP settings changed
            if (newSettings.mcp && newSettings.mcp.serverUrl) {
                await this.reinitializeMCPConnector(newSettings);
            }
            
            // Update connection status (this calls panel directly)
            this.updateConnectionStatus();
            
            console.log('[WebWireContent] Settings change processed successfully');
            
        } catch (error) {
            console.error('[WebWireContent] Error handling settings change:', error);
        }
    }

    handleConversationUpdate(data) {
        console.log('[WebWireContent] Conversation update notification received:', data);
        
        try {
            const { conversation } = data;
            
            if (conversation) {
                // Update our local thread state
                if (conversation.isActive) {
                    this.currentThreadId = conversation.threadId;
                    console.log('[WebWireContent] Updated active thread ID:', this.currentThreadId);
                }
                
                // Update panel UI directly
                if (this.panel && this.panel.isReady()) {
                    this.panel.displayConversation({
                        ...conversation,
                        isCurrentThread: conversation.threadId === this.currentThreadId
                    });
                }
                
                console.log('[WebWireContent] Updated local state and panel UI');
            }
            
        } catch (error) {
            console.error('[WebWireContent] Error handling conversation update:', error);
        }
    }

    async reinitializeAIClient(settings) {
        try {
            const model = settings.ai?.models?.chat?.model;
            const provider = settings.ai?.models?.chat?.provider;
            const providerSettings = settings.ai?.providers[provider] || {};

            // Only reinitialize if we have valid AI settings
            if (model && provider) {
                console.log('[WebWireContent] Reinitializing AI client with new settings', {
                    model,
                    provider,
                    ...providerSettings
                });
                
                // Create new AI client with updated settings
                this.aiClient = AIClientFactory.createClient(
                    this.eventBus,
                    {
                        provider,
                        model,
                        ...providerSettings
                    }
                );
                
                console.log('[WebWireContent] AI client reinitialized successfully');
            } else {
                console.log('[WebWireContent] AI settings incomplete, clearing AI client');
                this.aiClient = null;
            }
            
            // Update connection status after AI client change
            this.updateConnectionStatus();
        } catch (error) {
            console.error('[WebWireContent] Failed to reinitialize AI client:', error);
            this.aiClient = null;
            this.updateConnectionStatus();
        }
    }

    async reinitializeMCPConnector(settings) {
        try {
            const newMcpUrl = settings.mcp?.serverUrl;
            const currentMcpUrl = this.mcpConnector?.url;
            
            // Only reconnect if URL changed
            if (newMcpUrl && newMcpUrl !== currentMcpUrl) {
                console.log('[WebWireContent] MCP server URL changed, reconnecting...');
                
                // Disconnect existing connector
                if (this.mcpConnector) {
                    this.mcpConnector.disconnect();
                    this.mcpConnector = null;
                }
                
                // Connect to new server
                await this.connectToMCP(newMcpUrl);
                
                console.log('[WebWireContent] MCP connector reinitialized successfully');
            } else if (!newMcpUrl && this.mcpConnector) {
                console.log('[WebWireContent] MCP server URL cleared, disconnecting...');
                this.mcpConnector.disconnect();
                this.mcpConnector = null;
            }
            
            // Update connection status after MCP connector change
            this.updateConnectionStatus();
        } catch (error) {
            console.error('[WebWireContent] Failed to reinitialize MCP connector:', error);
            this.updateConnectionStatus();
        }
    }

    handleBackgroundMessage(message, sender, sendResponse) {
        console.log('Content script received message:', message.action);
        
        try {
            switch (message.action) {
                case BACKGROUND_HANDLERS.INJECT_WEBWIRE_PANEL:
                    this.injectPanel()
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case BACKGROUND_HANDLERS.TOGGLE_WEBWIRE_PANEL:
                    this.togglePanel();
                    sendResponse({ success: true });
                    return false;
                    
                case BACKGROUND_HANDLERS.CAPTURE_PAGE_CONTENT:
                    sendResponse({
                        success: true,
                        data: this.getPageContent()
                    });
                    return false;
                    
                case BACKGROUND_HANDLERS.GET_WEBWIRE_STATE:
                    try {
                        sendResponse({
                            success: true,
                            state: {
                                panelInjected: this.panel.isReady(),
                                mcpConnected: this.mcpConnector ? true : false,
                                aiClientConfigured: this.aiClient ? true : false
                            }
                        });
                    } catch (error) {
                        console.error('Error getting WebWire state:', error);
                        sendResponse({
                            success: true,
                            state: {
                                panelInjected: false,
                                mcpConnected: false,
                                aiClientConfigured: false
                            }
                        });
                    }
                    return false;
                    
                case BACKGROUND_HANDLERS.SETTINGS_CHANGED:
                    // Settings have been updated - notify panel and update local cache
                    this.handleSettingsChanged(message.data);
                    sendResponse({ success: true });
                    return false;
                    
                case BACKGROUND_HANDLERS.CONVERSATION_UPDATED:
                    // Conversation has been updated - notify panel
                    this.handleConversationUpdate(message.data);
                    sendResponse({ success: true });
                    return false;
                    
                case BACKGROUND_HANDLERS.PING:
                    // Health check endpoint
                    sendResponse({ success: true, status: 'ready' });
                    return false;
                    
                default:
                    console.warn('Unknown WebWire message action:', message.action);
                    sendResponse({ success: false, error: 'Unknown action' });
                    return false;
            }
        } catch (error) {
            console.error('Error handling background message:', error);
            sendResponse({ success: false, error: error.message });
            return false;
        }
    }

    /**
     * Add a thinking message and return a handle for streaming updates
     * @param {string} message - Initial message content
     * @returns {Object} Message handle with ID for updates
     */
    addThinkingMessage(message) {
        const messageId = `thinking-${++this.streamingState.messageCounter}`;
        
        // Send thinking message start to panel
        this.sendToPanel({
            type: PANEL_MESSAGE_TYPES.CHAT_THINKING_START,
            message: {
                id: messageId,
                content: message,
                role: MESSAGE_ROLES.ASSISTANT
            }
        });
        
        return { id: messageId };
    }
    
    /**
     * Handle streaming chunks for a specific message
     * @param {string} chunk - Text chunk to append
     * @param {Object} messageHandle - Message handle from addThinkingMessage
     */
    handleStreamingChunk(chunk, messageHandle) {
        if (!this.streamingState.isActive) {
            // Start new streaming
            this.streamingState.isActive = true;
            this.streamingState.streamingText = '';
            this.streamingState.currentMessage = messageHandle;
        }
        
        // Append chunk to streaming text
        this.streamingState.streamingText += chunk;
        
        // Send chunk update to panel
        this.sendToPanel({
            type: PANEL_MESSAGE_TYPES.CHAT_STREAMING_CHUNK,
            messageId: messageHandle.id,
            chunk: chunk,
            fullContent: this.streamingState.streamingText
        });
    }
    
    /**
     * Finalize streaming and clean up the thinking message
     * @param {Object} messageHandle - Message handle to finalize
     */
    finalizeStreamingMessage(messageHandle, finalContent) {
        this.streamingState.isActive = false;
        this.streamingState.currentMessage = null;
        this.streamingState.streamingText = '';
        
        // Send finalization to panel
        this.sendToPanel({
            type: PANEL_MESSAGE_TYPES.CHAT_THINKING_COMPLETE,
            messageId: messageHandle.id,
            finalContent: finalContent // Pass the final content
        });
    }

    /**
     * Show error notification in the panel
     * @param {string} message - Error message to display
     */
    showError(message) {
        console.error('WebWire Error:', message);
        
        // Delegate to panel for DOM manipulation
        if (this.panel && this.panel.isReady()) {
            this.panel.showErrorNotification(message);
        } else {
            // Fallback for when panel is not ready
            console.error('WebWire panel not ready, cannot show error notification:', message);
        }
    }
}

// Global instance
let webwireContentScript = null;

// Wait for the DOM to be fully loaded
if (document.readyState === DOM_READY_STATES.LOADING) {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

/**
 * Initialize the WebWire content script
 */
async function initialize() {
    console.log('WebWire content script initializing...');
    
    try {
        // Setup debug methods on the class prototype
        setupDebugMethods(WebWireContentScript);
        
        // Create instance
        webwireContentScript = new WebWireContentScript();
        
        // Initialize properly with async support
        await webwireContentScript.initialize();
        
        console.log('WebWire content script initialized successfully');
    } catch (error) {
        console.error('Failed to initialize WebWire content script:', error);
    } finally {
        setupGlobalDebugAccess(webwireContentScript);
    }
}