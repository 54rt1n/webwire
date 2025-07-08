import { EVENTS } from '../js/core/events.js';
import { AIClientFactory } from '../js/ai/ai-client-factory.js';
import MCPConnector from '../js/mcp/mcp-connector.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { EventBus } from '../js/core/event-bus.js';
import { WebWirePanel } from './panel.js';
import { pageUtils } from './page-utils.js';

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
        
        // Auto-inject if configured
        try {
            if (await this.shouldAutoInject()) {
                console.log('Auto-inject enabled, injecting panel...');
                await this.injectPanel();
            }
        } catch (error) {
            console.error('Auto-inject failed:', error);
        }
        
        console.log('WebWire content script initialization complete - ready for messages');
    }

    async loadSettingsFromBackground() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'GET_WEBWIRE_SETTINGS'
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
            
            if (event.data.type === 'WEBWIRE_PANEL_MESSAGE') {
                this.handlePanelMessage(event.data);
            } else if (event.data.type === 'WEBWIRE_PANEL_READY') {
                // Panel has loaded, send current state
                this.sendInitialState();
            }
        });
    }

    async handlePanelMessage(message) {
        const { action, data } = message;

        try {
            switch (action) {
                case 'SEND_CHAT_MESSAGE':
                    await this.handleChatMessage(data.message);
                    break;
                    
                case 'ANALYZE_PAGE_CONTENT':
                    const analysisRequest = pageUtils.buildAnalysisRequest();
                    await this.handleChatMessage(analysisRequest);
                    break;
                    
                case 'CONNECT_MCP':
                    await this.connectToMCP(data.url);
                    break;
                    
                case 'DISCONNECT_MCP':
                    if (this.mcpConnector) {
                        this.mcpConnector.disconnect();
                        this.mcpConnector = null;
                    }
                    break;
                    
                case 'GET_PAGE_CONTENT':
                    const content = pageUtils.getCurrentPageContent();
                    this.sendToPanel({ 
                        type: 'PAGE_CONTENT_RESPONSE', 
                        content 
                    });
                    break;
                    
                case 'GET_STATE':
                    // Get current thread and settings from background
                    try {
                        const threadResponse = await chrome.runtime.sendMessage({
                            action: 'GET_ACTIVE_THREAD'
                        });
                        const currentThread = threadResponse.success ? threadResponse.thread : null;
                        
                        this.sendToPanel({
                            type: 'STATE_RESPONSE',
                            state: {
                                currentThread: currentThread,
                                settings: this.currentSettings,
                                mcpConnected: this.mcpConnector ? true : false,
                                aiClientConfigured: this.aiClient ? true : false
                            }
                        });
                    } catch (error) {
                        this.sendToPanel({
                            type: 'STATE_RESPONSE',
                            state: {
                                currentThread: null,
                                settings: {},
                                mcpConnected: false,
                                aiClientConfigured: false
                            }
                        });
                    }
                    break;
                    
                case 'SAVE_SETTINGS':
                    try {
                        const response = await chrome.runtime.sendMessage({
                            action: 'SAVE_WEBWIRE_SETTINGS',
                            settings: data.settings
                        });
                        this.sendToPanel({
                            type: 'SAVE_SETTINGS_RESPONSE',
                            success: response.success
                        });
                    } catch (error) {
                        this.sendToPanel({
                            type: 'SAVE_SETTINGS_RESPONSE',
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
                type: 'ERROR',
                error: error.message
            });
        }
    }

    async handleChatMessage(userMessage) {
        console.log('[WebWireContent] Starting to handle chat message:', userMessage);
        
        if (!this.aiClient) {
            console.log('[WebWireContent] No AI client configured, sending error to panel');
            this.sendToPanel({
                type: 'ERROR',
                error: 'AI client not configured'
            });
            return;
        }

        try {
            // Add user message to panel
            console.log('[WebWireContent] Sending user message to panel');
            this.sendToPanel({
                type: 'CHAT_MESSAGE',
                message: { role: 'user', content: userMessage }
            });

            // Get or create current thread from background
            const threadResponse = await chrome.runtime.sendMessage({
                action: 'GET_OR_CREATE_CURRENT_THREAD',
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
                role: 'user',
                content: userMessage,
                timestamp: Date.now()
            };
            const allMessages = [...messages, newUserMessage];
            
            // Create enhanced version for API - enhance the first user message with page context
            const messagesForAPI = [...allMessages];
            const firstUserIndex = messagesForAPI.findIndex(msg => msg.role === 'user');
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
                role: 'user', 
                content: userMessage, // Original user message without page context
                timestamp,
                url: window.location.href,
                title: document.title
            };
            
            const assistantMsg = { 
                role: 'assistant', 
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
                action: 'SAVE_THREAD_MESSAGE',
                threadId: threadId,
                userMessage: userMsg,
                assistantMessage: assistantMsg,
                options: {
                    userName: this.currentSettings?.aim?.userName || 'user',
                    personaName: this.currentSettings?.aim?.personaName || 'assistant',
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
                type: 'ERROR',
                error: error.message
            });
        }
    }

    async executeToolCalls(toolCalls) {
        const results = [];
        
        for (const toolCall of toolCalls) {
            try {
                this.sendToPanel({
                    type: 'TOOL_EXECUTION_START',
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
                    type: 'TOOL_EXECUTION_COMPLETE',
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
                    type: 'TOOL_EXECUTION_ERROR',
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
            case 'CHAT_MESSAGE':
                this.panel.displayMessage(message.message);
                break;
                
            case 'CHAT_THINKING_START':
                this.panel.displayThinkingMessage(message.message);
                break;
                
            case 'CHAT_STREAMING_CHUNK':
                this.panel.updateStreamingMessage(message.messageId, message.fullContent);
                break;
                
            case 'CHAT_THINKING_COMPLETE':
                if (message.finalContent) {
                    // Finalize the thinking message with final content
                    this.panel.finalizeThinkingMessage(message.messageId, message.finalContent);
                } else {
                    // Just remove the thinking message
                    this.panel.removeThinkingMessage(message.messageId);
                }
                break;
                
            case 'CONVERSATION_UPDATED':
                this.panel.displayConversation(message.conversation);
                break;
                
            case 'CONNECTION_STATUS_UPDATE':
                this.panel.updateConnectionStatus(message.status, message.aiConnected, message.mcpConnected);
                break;
                
            case 'INITIAL_STATE':
                this.panel.handleInitialState(message.state);
                break;
                
            case 'ERROR':
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
            type: 'CONNECTION_STATUS_UPDATE',
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
            if (event.ctrlKey && event.shiftKey && event.key === 'W') {
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
                    action: 'GET_ACTIVE_THREAD'
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

    showPanel() {
        this.panel.show();
    }

    hidePanel() {
        this.panel.hide();
    }

    togglePanel() {
        if (!this.panel.isReady()) {
            this.injectPanel();
        } else {
            this.panel.toggle();
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
                case 'INJECT_WEBWIRE_PANEL':
                    this.injectPanel()
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'TOGGLE_WEBWIRE_PANEL':
                    this.togglePanel();
                    sendResponse({ success: true });
                    return false;
                    
                case 'CAPTURE_PAGE_CONTENT':
                    sendResponse({
                        success: true,
                        data: this.getPageContent()
                    });
                    return false;
                    
                case 'GET_WEBWIRE_STATE':
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
                    
                case 'SETTINGS_CHANGED':
                    // Settings have been updated - notify panel and update local cache
                    this.handleSettingsChanged(message.data);
                    sendResponse({ success: true });
                    return false;
                    
                case 'CONVERSATION_UPDATED':
                    // Conversation has been updated - notify panel
                    this.handleConversationUpdate(message.data);
                    sendResponse({ success: true });
                    return false;
                    
                case 'PING':
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
            type: 'CHAT_THINKING_START',
            message: {
                id: messageId,
                content: message,
                role: 'assistant'
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
            type: 'CHAT_STREAMING_CHUNK',
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
            type: 'CHAT_THINKING_COMPLETE',
            messageId: messageHandle.id,
            finalContent: finalContent // Pass the final content
        });
    }



    showError(message) {
        console.error('WebWire Error:', message);
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

/**
 * Export functions for testing and debugging
 */
export function getWebWireInstance() {
    return webwireContentScript;
}

export function isWebWireReady() {
    return webwireContentScript && (webwireContentScript.aiClient || webwireContentScript.mcpConnector);
}

// Add debug methods to the WebWire class prototype for window access
if (typeof window !== 'undefined') {
    WebWireContentScript.prototype.debug = function() {
        return {
            panelInjected: this.panel.isReady(),
            mcpConnected: this.mcpConnector ? true : false,
            aiClientConfigured: this.aiClient ? true : false,
            currentThreadId: this.currentThreadId,
            frameworkReady: true,
            streamingActive: this.streamingState.isActive,
            currentContent: this.streamingState.currentContent,
            currentSettings: this.currentSettings
        };
    };

    WebWireContentScript.prototype.forceInject = function() {
        console.log('Force injecting WebWire panel...');
        return this.injectPanel();
    };

    WebWireContentScript.prototype.forceToggle = function() {
        console.log('Force toggling WebWire panel...');
        this.togglePanel();
    };

    WebWireContentScript.prototype.getPageInfo = function() {
        console.log('Getting page content...');
        return pageUtils.getCurrentPageContent();
    };

    WebWireContentScript.prototype.debugMessageEnhancement = function(testMessage = 'Test message') {
        console.log('=== WebWire Message Enhancement Debug ===');
        const original = testMessage;
        const enhanced = pageUtils.enhanceMessageWithContext(testMessage);
        
        console.log('Original Message:', original);
        console.log('Enhanced Message (sent to API):', enhanced);
        console.log('Difference in length:', enhanced.length - original.length, 'characters');
        
        return {
            original,
            enhanced,
            lengthDiff: enhanced.length - original.length
        };
    };
}

// Global instance
let webwireContentScript = null;

// Wait for the DOM to be fully loaded
if (document.readyState === 'loading') {
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
        // Create instance
        webwireContentScript = new WebWireContentScript();
        
        // Initialize properly with async support
        await webwireContentScript.initialize();
        
        console.log('WebWire content script initialized successfully');
        
        // Hook to window for global access and debugging
        if (typeof window !== 'undefined') {
            window.webwireContentScript = webwireContentScript;
            window.webwire = webwireContentScript; // Shorter alias
            console.log('WebWire hooked to window.webwireContentScript and window.webwire');
        }
        
    } catch (error) {
        console.error('Failed to initialize WebWire content script:', error);
        
        // Still hook to window for debugging failed states
        if (typeof window !== 'undefined') {
            window.webwireContentScript = webwireContentScript;
            window.webwire = webwireContentScript;
            console.log('WebWire hooked to window despite initialization failure (for debugging)');
        }
    }
}