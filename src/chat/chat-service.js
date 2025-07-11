import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { AIClientFactory } from '../js/ai/ai-client-factory.js';
import { MCPConnector } from '../js/mcp/mcp-connector.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { WebWirePanel } from './chat-panel.js';
import { PageUtils } from './page-utils.js';

/**
 * WebWire Chat Service - Platform-Agnostic Core
 * 
 * This is the pure "Chat App" logic that is completely agnostic of the hosting environment.
 * It communicates only through events and knows nothing about Chrome APIs. It operates in the CHAT event namespace.
 */

/**
 * Message roles constants
 */
const MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    ERROR: 'error'
};

export class ChatService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        
        // UI Components
        this.panel = new WebWirePanel(this.eventBus);
        this.pageUtils = new PageUtils();

        // AI/MCP Components  
        this.aiClient = null;
        this.mcpConnector = null;
        this.stateService = null;
        this.toolParser = new ToolParser();
        
        // State
        this.currentSettings = {};
        this.currentConversation = null; // Store current conversation for context
        this.streamingState = {
            isActive: false,
            currentContent: '',
            messageId: null,
            currentMessage: null,
            streamingText: '',
            messageCounter: 0
        };

        this.lastMessage = null;
        
        this.setupEventListeners();
        console.log('[ChatService] Initialized with event-driven architecture');
    }

    /**
     * Set up event listeners for the service
     */
    setupEventListeners() {
        // Listen for chat events
        this.eventBus.on(EVENTS.CHAT.SEND_MESSAGE, this.handleUserMessage.bind(this));
        this.eventBus.on(EVENTS.CHAT.ANALYZE_PAGE, this.handlePageAnalysisRequest.bind(this));
        this.eventBus.on(EVENTS.CHAT.UPDATE_SETTINGS, this.handleSettingsUpdate.bind(this));
        this.eventBus.on(EVENTS.CHAT.UPDATE_MCP_STATUS, this.handleMCPStatusUpdate.bind(this));
        this.eventBus.on(EVENTS.CHAT.CONVERSATION_LOADED, this.handleConversationLoaded.bind(this));
        this.eventBus.on(EVENTS.CHAT.CONVERSATION_UPDATED, this.handleConversationUpdated.bind(this));
        this.eventBus.on(EVENTS.CHAT.START_NEW_CONVERSATION, this.handleNewConversationRequest.bind(this));
        this.eventBus.on(EVENTS.CHAT.REPLAY_LAST_TURN, this.handleReplayLastTurn.bind(this));
        
        // Listen for AI streaming events
        this.eventBus.on(EVENTS.AI.STREAM_CHUNK, this.handleStreamingChunk.bind(this));
        this.eventBus.on(EVENTS.CHAT.TOGGLE_PAGE_CONTENT, this.handlePageContentToggle.bind(this));
        
        console.log('[ChatService] Event listeners set up');
    }

    /**
     * Initialize the chat service (async setup)
     */
    async initialize(aiClient, mcpConnector, stateService) {
        console.log('[ChatService] Starting initialization...');
        
        this.aiClient = aiClient;
        this.mcpConnector = mcpConnector;
        this.stateService = stateService;
        
        try {
            // Initialize the panel
            await this.panel.initialize();
            console.log('[ChatService] Panel initialized');
            
            // Update initial connection status
            this.updateConnectionStatus();
            
            // Load current conversation on startup
            console.log('[ChatService] Loading current conversation on startup...');
            this.loadCurrentConversation();

            this.panel.setPageContentCheckboxState(this.stateService.ui.getIncludePageContent() || false);

            // Request thread from host
            await this.eventBus.emit(EVENTS.CHAT.GET_OR_CREATE_THREAD, {
                ...this.pageUtils.getPageLocation()
            }, { target: EVENT_CONTEXT.BACKGROUND });
            
            console.log('[ChatService] Initialization complete');
        } catch (error) {
            console.error('[ChatService] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Handle user message event
     */
    async handleUserMessage(payload) {
        console.log('[ChatService] Handling user message:', payload);
        
        const { message, silent = false } = payload;
        
        if (!this.aiClient) {
            console.log('[ChatService] No AI client configured');
            this.panel.displayError('AI client not configured. Please check settings.');
            return;
        }

        this.panel.removeErrorMessages();

        try {
            // Prepare messages for API with conversation history
            let userMessage = {
                role: MESSAGE_ROLES.USER,
                content: message,
                timestamp: Date.now()
            };

            // Display user message in panel
            if (!silent) {
                this.panel.displayMessage(userMessage, { autoScroll: true });
            }

            // Create system prompt with tools if MCP is connected
            let systemPrompts = ["You are a helpful assistant analyzing web pages and helping users."];
            let tools = [];
            
            if (this.mcpConnector && this.stateService) {
                try {
                    tools = this.stateService.mcp.getMcpTools();
                    if (tools && tools.length > 0) {
                        systemPrompts.push(ToolFormatter.generateSystemPrompt(tools));
                        console.log(`[ChatService] Using ${tools.length} MCP tools for system prompt`);
                    }
                } catch (error) {
                    console.warn('[ChatService] Failed to get MCP tools:', error);
                }
            }


            // Build messages array including conversation history
            let messagesForAPI = [];
            
            // Include conversation history if available
            if (this.currentConversation && this.currentConversation.messages) {
                // Add existing messages (excluding system messages)
                messagesForAPI = this.currentConversation.messages
                    .filter(msg => msg.role !== MESSAGE_ROLES.SYSTEM)
                    .map(msg => ({
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp
                    }));
                
                console.log(`[ChatService] Using ${messagesForAPI.length} messages from conversation history`);
            }
            
            let syntheticMessages = [];
            let syntheticSources = [];
            const stashContent = this.buildStashContext();
            if (stashContent) {
                syntheticMessages.push(stashContent);
                syntheticSources.push('stash');
            }

            // TODO this should be passed in. Getting it like this is unreliable.
            if (this.currentSettings?.ui?.includePageContent !== false) {
                syntheticMessages.push(this.pageUtils.buildPageContext());
                syntheticSources.push('page');
            }

            // Enhance first user message with page context
            const firstUserIndex = messagesForAPI.findIndex(msg => msg.role === MESSAGE_ROLES.USER);
            if (firstUserIndex !== -1) {
                const firstUserMessage = messagesForAPI[firstUserIndex];
                messagesForAPI[firstUserIndex] = {
                    ...firstUserMessage,
                    content: syntheticMessages.join('\n\n') + '\n\n' + firstUserMessage.content
                };
                console.log(`[ChatService] Enhanced first user message with ${syntheticSources.join(', ')} sources for API`);
            } else {
                userMessage = {
                    ...userMessage,
                    content: syntheticMessages.join('\n\n') + '\n\n' + userMessage.content
                };
                console.log(`[ChatService] Enhanced current user message with ${syntheticSources.join(', ')} sources for API`);
            }

            // Create thinking message
            const thinkingMessage = this.addThinkingMessage('Thinking...');
            this.streamingState.currentMessage = thinkingMessage;
            let streamingText = '';

            // Set up exclusive stream handler for this request
            const unsubscribeStream = this.eventBus.onExclusive(EVENTS.AI.STREAM_CHUNK, (data) => {
                streamingText += data.chunk;
                this.handleStreamingChunk(data.chunk, thinkingMessage);
            });

            let response = null;
            try {
                console.log('[ChatService] Generating AI response...');
                response = await this.aiClient.generateTurn(userMessage.content, messagesForAPI, { 
                    systemPrompt: systemPrompts.join('\n\n'),
                    maxHistory: 100, 
                    samplerConfig: {
                        maxTokens: 100
                    }
                });

                if (!response) {
                    throw new Error('No response received from AI client');
                }
                console.log('[ChatService] AI response received:', response);
            } finally {
                unsubscribeStream();
            }

            // Finalize the thinking message with the complete response
            this.finalizeStreamingMessage(thinkingMessage, response);
            
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

            const location = typeof window !== 'undefined' ? window.location.href : undefined;

            // Prepare messages for storage (original unenhanced content)
            const userMsg = { 
                role: MESSAGE_ROLES.USER, 
                content: message,
                timestamp: userMessage.timestamp,
                url: location,
                title: document.title
            };
            
            // TODO separate out think xml tags
            const assistantMsg = { 
                role: MESSAGE_ROLES.ASSISTANT, 
                content: response,
                timestamp: userMessage.timestamp + 1,
                toolResults,
                toolCalls,
                parseErrors
            };

            this.lastMessage = message;

            console.log('[ChatService] Saving message:', userMsg, assistantMsg);

            // Request host to save conversation
            this.eventBus.emit(EVENTS.CHAT.SAVE_MESSAGE, {
                userMessage: userMsg,
                assistantMessage: assistantMsg,
                options: {
                    userName: this.currentSettings?.aim?.userName || MESSAGE_ROLES.USER,
                    personaName: this.currentSettings?.aim?.personaName || MESSAGE_ROLES.ASSISTANT,
                    mood: this.currentSettings?.aim?.mood || null,
                    location: location,
                    url: location,
                    title: document.title,
                    toolResults,
                    toolCalls,
                    parseErrors,
                }}, { target: EVENT_CONTEXT.BACKGROUND }
            );

            console.log('[ChatService] Message saved');

        } catch (error) {
            if (error.message.includes("Error: Empty response from AI provider")) {
                console.log('[ChatService] Empty response from AI provider, skipping');
                this.panel.displayError(error.message, this.streamingState.currentMessage?.id);
            } else {
                console.error('[ChatService] Error handling user message:', error);
                this.panel.displayError(error.message, this.streamingState.currentMessage?.id);
            }
        }
    }

    /**
     * Handle page analysis request event
     */
    async handlePageAnalysisRequest(payload) {
        console.log('[ChatService] Handling page analysis request');
        
        const analysisRequest = this.pageUtils.buildAnalysisRequest();
        await this.handleUserMessage({ message: analysisRequest });
    }

    /**
     * Handle settings update event
     */
    async handleSettingsUpdate(payload) {
        console.log('[ChatService] Handling settings update:', payload);
        
        const { settings } = payload;
        this.currentSettings = settings;

        let changed = false;
        try {
            // Reinitialize AI client if AI settings changed
            if (settings.ai && (settings.ai.models || settings.ai.providers)) {
                //await this.reinitializeAIClient(settings);
                changed = true;
            }
            
            // Reinitialize MCP connector if MCP settings changed  
            if (settings.mcp && settings.mcp.serverUrl) {
                //await this.reinitializeMCPConnector(settings);
                changed = true;
            }
            
            // Update connection status
            this.updateConnectionStatus();
            
            console.log('[ChatService] Settings update processed successfully');
        } catch (error) {
            console.error('[ChatService] Error handling settings update:', error);
        }
    }

    /**
     * Handle MCP status update event
     */
    async handleMCPStatusUpdate(payload) {
        console.log('[ChatService] Handling MCP status update:', payload);
        
        const { isConnected, tools } = payload;
        
        // Update local state and UI
        this.updateConnectionStatus();
    }

    /**
     * Handle conversation updated event
     */
    async handleConversationUpdated(payload) {
        console.log('[ChatService] Handling conversation updated:', payload);
        
        const { conversationId } = payload;
        
        // Update the conversation ID display in the panel
        if (this.panel.isReady()) {
            this.panel.updateConversationIdDisplay(conversationId);
        }
    }

    /**
     * Handle new conversation request event
     */
    async handleNewConversationRequest(payload) {
        console.log('[ChatService] Handling new conversation request');
        
        // Clear current conversation
        this.currentConversation = null;
        
        // Request host to create new conversation
        await this.eventBus.emit(EVENTS.CHAT.CREATE_NEW_THREAD, {
            ...this.pageUtils.getPageLocation()
        }, { target: EVENT_CONTEXT.BACKGROUND });
    }

    /**
     * Handle replay last turn request event
     */
    async handleReplayLastTurn() {
        console.log('[ChatService] Handling replay last turn request');

        if (!this.lastMessage) {
            console.log('[ChatService] No last message found');
            this.panel.displayError('No last message found to replay');
            return;
        }

        // Re-send the message through the normal flow
        await this.handleUserMessage({ message: this.lastMessage.trim(), silent: true });
    }

    /**
     * Handle conversation loaded event
     */
    async handleConversationLoaded(payload) {
        console.log('[ChatService] Handling conversation loaded:', payload);
        
        const { conversation } = payload;
        
        // Store the current conversation for context in AI requests
        this.currentConversation = conversation;
        
        if (conversation && this.panel.isReady()) {
            console.log(`[ChatService] Displaying conversation with ID: ${conversation.threadId}`);
            this.panel.displayConversation(conversation);
            console.log(`[ChatService] Loaded conversation with ${conversation.messages?.length || 0} messages`);
        } else {
            console.warn('[ChatService] Cannot display conversation - panel not ready or no conversation data');
        }
    }

    /**
     * Execute tool calls using MCP connector
     */
    async executeToolCalls(toolCalls) {
        const results = [];
        
        for (const toolCall of toolCalls) {
            try {
                // Tool execution notification would be sent to panel
                // But since panel is in same context, we can call directly
                console.log(`[ChatService] Executing tool: ${toolCall.name}`);

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

                console.log(`[ChatService] Tool ${toolCall.name} executed successfully`);

            } catch (error) {
                console.error(`[ChatService] Tool ${toolCall.name} execution failed:`, error);
                results.push({
                    toolName: toolCall.name,
                    parameters: toolCall.parameters,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Update connection status and notify panel
     */
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
        
        // Update panel directly since it's in same context
        if (this.panel.isReady()) {
            this.panel.updateConnectionStatus(status, aiConnected, mcpConnected);
        }
    }

    /**
     * Reinitialize AI client with new settings
     */
    async reinitializeAIClient(settings) {
        try {
            const model = settings.ai?.models?.chat?.model;
            const provider = settings.ai?.models?.chat?.provider;
            const providerSettings = settings.ai?.providers[provider] || {};

            if (model && provider) {
                console.log('[ChatService] Reinitializing AI client with new settings', {
                    model,
                    provider,
                    ...providerSettings
                });
                
                this.aiClient = AIClientFactory.createClient(
                    this.eventBus,
                    {
                        provider,
                        model,
                        ...providerSettings
                    }
                );
                
                console.log('[ChatService] AI client reinitialized successfully');
            } else {
                console.log('[ChatService] AI settings incomplete, clearing AI client');
                this.aiClient = null;
            }
        } catch (error) {
            console.error('[ChatService] Failed to reinitialize AI client:', error);
            this.aiClient = null;
        }
    }

    /**
     * Reinitialize MCP connector with new settings
     */
    async reinitializeMCPConnector(settings) {
        try {
            const newMcpUrl = settings.mcp?.serverUrl;
            const currentMcpUrl = this.mcpConnector?.url;
            
            if (newMcpUrl && newMcpUrl !== currentMcpUrl) {
                console.log('[ChatService] MCP server URL changed, reconnecting...');
                
                if (this.mcpConnector) {
                    this.mcpConnector.disconnect();
                    this.mcpConnector = null;
                }
                
                await this.connectToMCP(newMcpUrl);
                
                console.log('[ChatService] MCP connector reinitialized successfully');
            } else if (!newMcpUrl && this.mcpConnector) {
                console.log('[ChatService] MCP server URL cleared, disconnecting...');
                this.mcpConnector.disconnect();
                this.mcpConnector = null;
            }
        } catch (error) {
            console.error('[ChatService] Failed to reinitialize MCP connector:', error);
        }
    }

    /**
     * Connect to MCP server
     */
    async connectToMCP(url) {
        try {
            this.mcpConnector = new MCPConnector(url);
            await this.mcpConnector.initialize(this.stateService);
            console.log('[ChatService] Connected to MCP server');
        } catch (error) {
            console.error('[ChatService] Failed to connect to MCP:', error);
            throw error;
        }
    }

    /**
     * Build stash context
     */
    buildStashContext() {
        const stashContent = this.stateService.stash.getAllEntries();
        if (stashContent.length === 0) {
            return null;
        }

        const stashContentString = stashContent.map(entry => `${entry.key}: ${entry.value}`).join('\n');
        return `Stash content:\n${stashContentString}`;
    }

    /**
     * Add a thinking message and return handle for streaming updates
     */
    addThinkingMessage(message) {
        const messageId = `thinking-${++this.streamingState.messageCounter}`;
        
        // Display thinking message in panel
        this.panel.displayThinkingMessage({
            id: messageId,
            content: message,
            role: MESSAGE_ROLES.ASSISTANT
        });
        
        return { id: messageId };
    }
    
    /**
     * Handle streaming chunks for a specific message
     */
    handleStreamingChunk(chunk, messageHandle) {
        if (!this.streamingState.isActive) {
            this.streamingState.isActive = true;
            this.streamingState.streamingText = '';
            this.streamingState.currentMessage = messageHandle;
        }
        
        this.streamingState.streamingText += chunk;
        
        // Update panel directly
        this.panel.updateStreamingMessage(messageHandle.id, this.streamingState.streamingText);
    }
    
    /**
     * Finalize streaming and clean up the thinking message
     */
    finalizeStreamingMessage(messageHandle, finalContent) {
        this.streamingState.isActive = false;
        this.streamingState.currentMessage = null;
        this.streamingState.streamingText = '';
        
        // Finalize in panel
        this.panel.finalizeThinkingMessage(messageHandle.id, finalContent);
    }

    /**
     * Handle page content toggle event
     */
    async handlePageContentToggle(payload) {
        console.log('[ChatService] Handling page content toggle:', payload);
        
        const { includePageContent } = payload;
        
        // Update settings
        this.currentSettings.ui = this.currentSettings.ui || {};
        this.currentSettings.ui.includePageContent = includePageContent;
        
        // Persist to storage via background
        await this.eventBus.emit(EVENTS.SETTINGS.CHANGE, { 
            settings: this.currentSettings 
        }, { target: EVENT_CONTEXT.BACKGROUND });
        
        // Update panel checkbox state
        if (this.panel.isReady()) {
            this.panel.updatePageContentSetting(includePageContent);
        }
    }

    /**
     * Show the panel
     */
    showPanel() {
        if (this.panel.isReady()) {
            this.panel.show();
            
            // Request host to persist visibility state
            this.eventBus.emit(EVENTS.CHAT.SAVE_PANEL_VISIBILITY, { visible: true }, { target: EVENT_CONTEXT.BACKGROUND });
        }
    }

    /**
     * Hide the panel
     */
    hidePanel() {
        if (this.panel.isReady()) {
            this.panel.hide();
            
            // Request host to persist visibility state
            this.eventBus.emit(EVENTS.CHAT.SAVE_PANEL_VISIBILITY, { visible: false }, { target: EVENT_CONTEXT.BACKGROUND });
        }
    }

    /**
     * Toggle panel visibility
     */
    togglePanel() {
        if (!this.panel.isReady()) {
            // Request host to inject panel
            this.eventBus.emit(EVENTS.CHAT.INJECT_PANEL, {}, { target: EVENT_CONTEXT.HOST });
        } else {
            if (this.panel.isVisible) {
                this.hidePanel();
            } else {
                this.showPanel();
            }
        }
    }

    /**
     * Send initial state to panel
     */
    async sendInitialState(state) {
        if (this.panel.isReady()) {
            const enhancedState = {
                ...state,
                includePageContent: this.currentSettings?.ui?.includePageContent !== false
            };
            this.panel.handleInitialState(enhancedState);
        }
    }

    /**
     * Check if chat service is ready
     */
    isReady() {
        return this.panel.isReady();
    }

    /**
     * Load current conversation on startup
     */
    loadCurrentConversation() {
        console.log('[ChatService] Requesting current conversation from host...');
        
        // Request the current conversation from the host
        this.eventBus.emit(EVENTS.CHAT.GET_OR_CREATE_THREAD, {
            ...this.pageUtils.getPageLocation()
        }, { target: EVENT_CONTEXT.BACKGROUND });
    }

    /**
     * Clean up the chat service
     */
    destroy() {
        if (this.panel) {
            this.panel.destroy();
        }
        
        if (this.mcpConnector) {
            this.mcpConnector.disconnect();
        }
        
        console.log('[ChatService] Destroyed');
    }
}
