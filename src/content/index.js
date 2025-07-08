import { initializeContext } from '../js/context/context-init.js';
import { EVENTS } from '../js/core/events.js';
import { AIClientFactory } from '../js/ai/ai-client-factory.js';
import MCPConnector from '../js/mcp/mcp-connector.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';

/**
 * Proxy for state management that communicates with background script
 */
class BackgroundStateProxy {
    constructor() {
        this.cache = {};
    }

    async getSettings() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'GET_WEBWIRE_SETTINGS'
            });
            if (!response) {
                console.error('[BackgroundStateProxy] No response from background');
                return {};
            }
            if (response.success) {
                return response.settings || {};
            } else {
                console.error('[BackgroundStateProxy] Background returned error:', response.error);
                return {};
            }
        } catch (error) {
            console.error('[BackgroundStateProxy] Failed to get settings from background:', error);
            return {};
        }
    }

    async saveSettings(settings) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'SAVE_WEBWIRE_SETTINGS',
                settings
            });
            return response.success;
        } catch (error) {
            console.error('[BackgroundStateProxy] Failed to save settings to background:', error);
            return false;
        }
    }

    async getState() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'GET_WEBWIRE_STATE'
            });
            if (!response) {
                console.error('[BackgroundStateProxy] No response from background');
                return {};
            }
            if (response.success) {
                return response.state || {};
            } else {
                console.error('[BackgroundStateProxy] Background returned error:', response.error);
                return {};
            }
        } catch (error) {
            console.error('[BackgroundStateProxy] Failed to get state from background:', error);
            return {};
        }
    }

    async saveState(state) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'SAVE_WEBWIRE_STATE',
                state
            });
            return response.success;
        } catch (error) {
            console.error('[BackgroundStateProxy] Failed to save state to background:', error);
            return false;
        }
    }
}

/**
 * WebWire Content Script - Integrated Version
 * 
 * Properly integrated with WebWire framework components:
 * - Uses background script for state management
 * - Leverages AI client factory and MCP connector
 * - Uses existing panel components
 * - Handles extension communication
 */
class WebWireContentScript {
    constructor() {
        this.panelInjected = false;
        this.panelContainer = null;
        this.webwireApp = null;
        this.streamingState = {
            isActive: false,
            currentContent: '',
            messageId: null
        };
        
        // Initialize WebWire framework components
        this.storage = null;
        this.stateService = null;
        this.aiClient = null;
        this.mcpConnector = null;
        this.toolParser = new ToolParser();
        this.conversationId = 'content-script-' + Date.now();
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
        
        // Initialize with background-based state management
        try {
            await this.initializeBackgroundState();
            console.log('Background state initialized successfully');
        } catch (error) {
            console.error('Background state initialization failed, but content script will continue:', error);
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

    async initializeBackgroundState() {
        // Create lightweight state proxy that communicates with background
        this.stateProxy = new BackgroundStateProxy();
        
        // Load initial state from background
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'GET_WEBWIRE_STATE'
            });

            console.log('[WebWireContent] Initial state from background:', response);
            
            if (!response) {
                console.error('[WebWireContent] Received undefined response from background script - likely async handling issue');
                this.currentState = {};
                return;
            }
            
            if (response.success) {
                this.currentState = response.state || {};
                console.log('[WebWireContent] Successfully loaded state:', this.currentState);
            } else {
                console.error('[WebWireContent] Background script returned error:', response.error);
                this.currentState = {};
            }
        } catch (error) {
            console.error('Failed to load initial state from background:', error);
            this.currentState = {};
        }
    }

    setupWebWireEventListeners() {
        // Listen for streaming AI responses
        this.dispatcher.on(EVENTS.AI.STREAM_CHUNK, ({ chunk }) => {
            this.handleStreamChunk({ content: chunk });
        });

        // Listen for MCP events
        this.dispatcher.on(EVENTS.MCP.CONNECTED, () => {
            this.sendToPanel({ type: 'MCP_CONNECTED' });
        });

        this.dispatcher.on(EVENTS.MCP.TOOLS_UPDATED, ({ tools }) => {
            this.sendToPanel({ type: 'MCP_TOOLS_UPDATED', tools });
        });
    }

    async connectToMCP(url) {
        try {
            this.mcpConnector = new MCPConnector(url, this.stateService);
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
        // Listen for messages from the injected panel
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'WEBWIRE_PANEL_MESSAGE') {
                this.handlePanelMessage(event.data);
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
                    const content = this.getPageContent();
                    this.sendToPanel({ 
                        type: 'PAGE_CONTENT_RESPONSE', 
                        content 
                    });
                    break;
                    
                case 'GET_STATE':
                    const state = await this.stateProxy.getState();
                    this.sendToPanel({
                        type: 'STATE_RESPONSE',
                        state
                    });
                    break;
                    
                case 'SAVE_SETTINGS':
                    const success = await this.stateProxy.saveSettings(data.settings);
                    this.sendToPanel({
                        type: 'SAVE_SETTINGS_RESPONSE',
                        success
                    });
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
        if (!this.aiClient) {
            this.sendToPanel({
                type: 'ERROR',
                error: 'AI client not configured'
            });
            return;
        }

        try {
            // Add user message
            this.sendToPanel({
                type: 'CHAT_MESSAGE',
                message: { role: 'user', content: userMessage }
            });

            // Get conversation history
            const history = this.stateService.conversation.getConversationMessages(this.conversationId);

            // Create system prompt with tools if MCP is connected
            let systemPrompt = "You are a helpful assistant analyzing web pages and helping users.";
            let tools = [];
            
            if (this.mcpConnector && this.stateService.mcp.isMcpConnected()) {
                tools = this.stateService.mcp.getMcpTools();
                systemPrompt = ToolFormatter.generateSystemPrompt(tools);
                
                // Add page context to user message
                const pageContent = this.getPageContent();
                userMessage = `Page Context:\nTitle: ${pageContent.title}\nURL: ${pageContent.url}\n\nUser Message: ${userMessage}`;
            }

            // Start streaming response
            this.streamingState.isActive = true;
            this.streamingState.currentContent = '';
            
            this.sendToPanel({
                type: 'CHAT_MESSAGE_START',
                message: { role: 'assistant', content: '' }
            });

            // Generate AI response
            const response = await this.aiClient.generateTurn(userMessage, history, { 
                systemPrompt,
                metadata: this.stateService.aim.getAimMetadata(),
                maxHistory: 10 
            });

            // Parse for tool calls if MCP is connected
            let toolResults = [];
            if (this.mcpConnector && tools.length > 0) {
                const parseResult = this.toolParser.parseResponse(response);
                if (parseResult.success && parseResult.toolCalls.length > 0) {
                    toolResults = await this.executeToolCalls(parseResult.toolCalls);
                }
            }

            // Store conversation
            const userMsg = { role: 'user', content: userMessage };
            const assistantMsg = { 
                role: 'assistant', 
                content: response,
                toolResults 
            };
            
            this.stateService.conversation.storeMessage(
                this.conversationId,
                userMsg,
                assistantMsg,
                this.stateService.aim.getAimMessageOptions()
            );

            // Save state
            await this.stateService.disk.saveState();

            // Complete streaming
            this.streamingState.isActive = false;
            this.sendToPanel({
                type: 'CHAT_MESSAGE_COMPLETE',
                message: assistantMsg
            });

        } catch (error) {
            console.error('Error handling chat message:', error);
            this.streamingState.isActive = false;
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
        window.postMessage({
            type: 'WEBWIRE_FROM_CONTENT',
            ...message
        }, '*');
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
            const settings = await this.stateProxy.getSettings();
            return settings?.ui?.autoInject || false;
        } catch (error) {
            console.warn('Could not check auto-inject setting:', error);
            return false;
        }
    }

    async injectPanel() {
        if (this.panelInjected) {
            this.showPanel();
            return;
        }

        try {
            console.log('[WebWireContent] Injecting WebWire panel...');
            
            // Create container for the panel
            this.panelContainer = document.createElement('div');
            this.panelContainer.id = 'webwire-container';
            this.panelContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            
            // Load and inject the panel HTML
            const panelHTML = await this.createPanelHTML();
            this.panelContainer.innerHTML = panelHTML;
            
            // Enable pointer events for the panel elements
            const panel = this.panelContainer.querySelector('.webwire-panel');
            const fab = this.panelContainer.querySelector('.webwire-fab');
            
            if (panel) panel.style.pointerEvents = 'auto';
            if (fab) fab.style.pointerEvents = 'auto';
            
            // Inject CSS
            await this.injectCSS();
            
            // Setup panel JavaScript
            this.setupPanelJS();
            
            // Add to page
            document.body.appendChild(this.panelContainer);
            this.panelInjected = true;
            
            // Send initial state to panel
            await this.sendInitialState();
            
            console.log('WebWire panel injected successfully');
            
        } catch (error) {
            console.error('Failed to inject WebWire panel:', error);
            this.showError('Failed to load WebWire panel');
        }
    }

    async createPanelHTML() {
        return `
            <div id="webwire-panel" class="webwire-panel hidden">
                <div class="panel-header">
                    <div class="header-top">
                        <div class="agent-info">
                            <span class="agent-name">WebWire Assistant</span>
                            <span class="conversation-id">Page Analysis Ready</span>
                        </div>
                        <div class="header-actions">
                            <button class="btn-icon" id="analyze-page" title="Analyze Page">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                                </svg>
                            </button>
                            <button class="btn-icon" id="mcp-status" title="MCP Status">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                            </button>
                            <button class="btn-icon" id="close-panel" title="Close">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="connection-status" id="connection-status">
                        <span class="status-indicator"></span>
                        <span class="status-text">Ready</span>
                    </div>
                </div>

                <div class="chat-content" id="chat-content">
                    <div class="welcome-message">
                        <div class="welcome-icon">🤖</div>
                        <h3>WebWire Assistant</h3>
                        <p>I can analyze this webpage and help you with questions. I also have access to various tools through MCP integration.</p>
                        <div class="quick-actions">
                            <button class="quick-action-btn" id="analyze-page-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                                </svg>
                                Analyze This Page
                            </button>
                        </div>
                    </div>
                </div>

                <div class="loading-indicator" id="loading-indicator" style="display: none;">
                    <div class="loading-content">
                        <div class="spinner"></div>
                        <span>Processing...</span>
                    </div>
                </div>

                <div class="chat-input-container">
                    <div class="input-wrapper">
                        <textarea 
                            id="chat-input" 
                            placeholder="Ask me anything about this page or use tools..."
                            rows="1"
                        ></textarea>
                        <button id="send-button" class="send-button" disabled>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"/>
                                <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div id="webwire-fab" class="webwire-fab">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            </div>
        `;
    }

    async injectCSS() {
        if (document.getElementById('webwire-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'webwire-styles';
        style.textContent = this.getCSS();
        document.head.appendChild(style);
    }

    getCSS() {
        return `
            .webwire-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                height: 600px;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .webwire-panel.hidden {
                opacity: 0;
                transform: translateX(100%) scale(0.95);
                pointer-events: none;
            }
            
            .webwire-fab {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 56px;
                height: 56px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
                z-index: 2147483646;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .webwire-fab:hover {
                background: #2563eb;
                transform: scale(1.1);
            }
            
            .webwire-fab.hidden {
                opacity: 0;
                transform: scale(0);
                pointer-events: none;
            }
            
            .panel-header {
                padding: 16px;
                border-bottom: 1px solid #e2e8f0;
                background: #f8fafc;
            }
            
            .header-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .agent-name {
                font-weight: 600;
                color: #1e293b;
            }
            
            .conversation-id {
                font-size: 12px;
                color: #64748b;
            }
            
            .header-actions {
                display: flex;
                gap: 8px;
            }
            
            .btn-icon {
                width: 32px;
                height: 32px;
                border: none;
                background: transparent;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: #64748b;
                transition: all 0.2s;
            }
            
            .btn-icon:hover {
                background: #e2e8f0;
                color: #1e293b;
            }
            
            .connection-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #64748b;
            }
            
            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
            }
            
            .chat-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            
            .welcome-message {
                text-align: center;
                padding: 32px 16px;
            }
            
            .welcome-icon {
                font-size: 48px;
                margin-bottom: 16px;
            }
            
            .welcome-message h3 {
                margin: 0 0 8px 0;
                color: #1e293b;
            }
            
            .welcome-message p {
                margin: 0 0 24px 0;
                color: #64748b;
                line-height: 1.5;
            }
            
            .quick-actions {
                display: flex;
                justify-content: center;
            }
            
            .quick-action-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                background: white;
                color: #1e293b;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 14px;
            }
            
            .quick-action-btn:hover {
                background: #f8fafc;
                border-color: #cbd5e1;
            }
            
            .chat-input-container {
                padding: 16px;
                border-top: 1px solid #e2e8f0;
                background: white;
            }
            
            .input-wrapper {
                display: flex;
                gap: 8px;
                align-items: flex-end;
            }
            
            #chat-input {
                flex: 1;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 12px;
                font-size: 14px;
                resize: none;
                outline: none;
                max-height: 120px;
                font-family: inherit;
            }
            
            #chat-input:focus {
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .send-button {
                width: 40px;
                height: 40px;
                border: none;
                border-radius: 8px;
                background: #3b82f6;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .send-button:hover:not(:disabled) {
                background: #2563eb;
            }
            
            .send-button:disabled {
                background: #cbd5e1;
                cursor: not-allowed;
            }
            
            .chat-message {
                margin-bottom: 16px;
                padding: 12px;
                border-radius: 8px;
                max-width: 85%;
            }
            
            .chat-message.user {
                background: #dbeafe;
                margin-left: auto;
                border-bottom-right-radius: 4px;
            }
            
            .chat-message.assistant {
                background: #f0f9ff;
                margin-right: auto;
                border-bottom-left-radius: 4px;
            }
            
            .loading-indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.95);
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            
            .loading-content {
                display: flex;
                align-items: center;
                gap: 12px;
                color: #64748b;
            }
            
            .spinner {
                width: 20px;
                height: 20px;
                border: 2px solid #e2e8f0;
                border-top: 2px solid #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
    }

    setupPanelJS() {
        // Setup event listeners for the injected panel
        const fab = this.panelContainer.querySelector('#webwire-fab');
        const panel = this.panelContainer.querySelector('#webwire-panel');
        const closeBtn = this.panelContainer.querySelector('#close-panel');
        const chatInput = this.panelContainer.querySelector('#chat-input');
        const sendBtn = this.panelContainer.querySelector('#send-button');
        const analyzeBtn = this.panelContainer.querySelector('#analyze-page-btn');

        if (fab) {
            fab.addEventListener('click', () => this.showPanel());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePanel());
        }

        if (chatInput) {
            chatInput.addEventListener('input', () => {
                const hasText = chatInput.value.trim().length > 0;
                sendBtn.disabled = !hasText;
                
                // Auto-resize
                chatInput.style.height = 'auto';
                chatInput.style.height = chatInput.scrollHeight + 'px';
            });

            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendChatMessage());
        }

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => {
                this.sendChatMessage('Please analyze this webpage and provide insights about its content, structure, and purpose.');
            });
        }
    }

    sendChatMessage(message = null) {
        const chatInput = this.panelContainer.querySelector('#chat-input');
        const userMessage = message || chatInput.value.trim();
        
        if (!userMessage) return;

        // Clear input
        if (!message) {
            chatInput.value = '';
            chatInput.style.height = 'auto';
            this.panelContainer.querySelector('#send-button').disabled = true;
        }

        // Send message to be processed
        this.handlePanelMessage({
            action: 'SEND_CHAT_MESSAGE',
            data: { message: userMessage }
        });
    }

    async sendInitialState() {
        // Send current state to panel
        try {
            const state = await this.stateProxy.getState();
            this.sendToPanel({
                type: 'INITIAL_STATE',
                state: {
                    conversation: state.conversation || {},
                    mcpConnected: state.mcpConnected || false,
                    tools: state.tools || [],
                    settings: state.settings || {}
                }
            });
        } catch (error) {
            console.error('Failed to send initial state:', error);
            this.sendToPanel({
                type: 'INITIAL_STATE',
                state: {
                    conversation: {},
                    mcpConnected: false,
                    tools: [],
                    settings: {}
                }
            });
        }
    }

    showPanel() {
        if (this.panelContainer) {
            const panel = this.panelContainer.querySelector('.webwire-panel');
            const fab = this.panelContainer.querySelector('.webwire-fab');
            if (panel) panel.classList.remove('hidden');
            if (fab) fab.classList.add('hidden');
        }
    }

    hidePanel() {
        if (this.panelContainer) {
            const panel = this.panelContainer.querySelector('.webwire-panel');
            const fab = this.panelContainer.querySelector('.webwire-fab');
            if (panel) panel.classList.add('hidden');
            if (fab) fab.classList.remove('hidden');
        }
    }

    togglePanel() {
        if (!this.panelInjected) {
            this.injectPanel();
        } else {
            const panel = this.panelContainer.querySelector('.webwire-panel');
            if (panel.classList.contains('hidden')) {
                this.showPanel();
            } else {
                this.hidePanel();
            }
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
                                panel: this,
                            }
                        });
                    } catch (error) {
                        console.error('Error getting WebWire state:', error);
                        sendResponse({
                            success: true,
                            state: {
                                panel: this
                            }
                        });
                    }
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

    handleStreamChunk(message) {
        if (!this.panelInjected) return;
        
        this.streamingState.isActive = true;
        this.streamingState.currentContent += message.content;
        
        this.sendToPanel({
            type: 'STREAM_CHUNK',
            content: message.content,
            fullContent: this.streamingState.currentContent
        });
    }

    getPageContent() {
        // Extract meaningful content from the page
        const content = {
            title: document.title,
            url: window.location.href,
            text: this.extractTextContent(),
            headings: this.extractHeadings(),
            links: this.extractLinks(),
            images: this.extractImages(),
            metadata: this.extractMetadata()
        };
        
        return content;
    }

    extractTextContent() {
        // Remove script and style elements
        const tempDoc = document.cloneNode(true);
        const elementsToRemove = tempDoc.querySelectorAll('script, style, nav, footer, aside');
        elementsToRemove.forEach(el => el.remove());
        
        const text = tempDoc.body ? tempDoc.body.innerText : '';
        return text.slice(0, 10000); // Limit to 10KB
    }

    extractHeadings() {
        const headings = [];
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
            headings.push({
                level: parseInt(heading.tagName.charAt(1)),
                text: heading.textContent.trim()
            });
        });
        return headings.slice(0, 20);
    }

    extractLinks() {
        const links = [];
        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            if (href && text && href !== '#') {
                links.push({ href, text });
            }
        });
        return links.slice(0, 50);
    }

    extractImages() {
        const images = [];
        document.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src');
            const alt = img.getAttribute('alt') || '';
            if (src) {
                images.push({ src, alt });
            }
        });
        return images.slice(0, 20);
    }

    extractMetadata() {
        const metadata = {};
        
        document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            if (name && content) {
                metadata[name] = content;
            }
        });
        
        return metadata;
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
    return webwireContentScript && webwireContentScript.stateService;
}

// Add debug methods to the WebWire class prototype for window access
if (typeof window !== 'undefined') {
    WebWireContentScript.prototype.debug = function() {
        return {
            panelInjected: this.panelInjected,
            mcpConnected: this.mcpConnector ? true : false,
            aiClientConfigured: this.aiClient ? true : false,
            conversationId: this.conversationId,
            frameworkReady: this.stateService ? true : false,
            streamingActive: this.streamingState.isActive,
            currentContent: this.streamingState.currentContent
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
        return this.getPageContent();
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