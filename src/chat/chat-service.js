import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { WebChatPanel } from './chat-panel.js';
import { PageUtils } from '../js/browser/page-utils.js';
import { DOMConnector } from '../js/browser/dom-connector.js';
import { generateMessageId } from '../js/utils/id-generator.js';
import { buildToolMessages } from './message-utils.js';
import { MessageBuilder } from './message-builder.js';
import { ToolExecutor } from './tool-executor.js';
import { AIResponseHandler } from './ai-response-handler.js';

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
        this.panel = new WebChatPanel(this.eventBus);
        this.pageUtils = new PageUtils();

        // AI/MCP Components  
        this.aiClient = null;
        this.mcpConnector = null;
        this.domConnector = new DOMConnector(this.eventBus);
        this.stateService = null;
        this.toolParser = new ToolParser();

        this.maxRequestTokens = 16384;
        
        // Service Components
        this.messageBuilder = new MessageBuilder(this.pageUtils);
        this.toolExecutor = null; // Initialized after stateService is set
        this.responseHandler = new AIResponseHandler(this.eventBus, this.panel);

        this.initialized = false;
    }

    /**
     * Set up event listeners for the service
     */
    setupEventListeners() {
        // Listen for chat events
        this.eventBus.on(EVENTS.CHAT.SEND_MESSAGE, this.handleUserMessage.bind(this));
        this.eventBus.on(EVENTS.CHAT.ANALYZE_PAGE, this.handlePageAnalysisRequest.bind(this));
        this.eventBus.on(EVENTS.CHAT.UPDATE_SETTINGS, this.handleSettingsRefresh.bind(this));
        this.eventBus.on(EVENTS.CHAT.UPDATE_MCP_STATUS, this.handleMCPStatusUpdate.bind(this));
        this.eventBus.on(EVENTS.CHAT.CONVERSATION_LOADED, this.handleConversationLoaded.bind(this));
        this.eventBus.on(EVENTS.CHAT.CONVERSATION_UPDATED, this.handleConversationUpdated.bind(this));
        this.eventBus.on(EVENTS.CHAT.START_NEW_CONVERSATION, this.handleNewConversationRequest.bind(this));
        this.eventBus.on(EVENTS.CHAT.REPLAY_LAST_TURN, this.handleReplayLastTurn.bind(this));
        this.eventBus.on(EVENTS.CHAT.REPARSE_MESSAGE, this.handleReparseMessage.bind(this));
        this.eventBus.on(EVENTS.CHAT.TOOL_RESULT, this.handleToolResult.bind(this));
        this.eventBus.on(EVENTS.CHAT.TOGGLE_UI_SETTING, this.handleUISettingsToggle.bind(this));
        this.eventBus.on(EVENTS.CHAT.CANCEL_STREAM, this.cancelStreamingResponse.bind(this));
        
        // Listen for AI streaming events
        this.eventBus.on(EVENTS.AI.STREAM_CHUNK, this.handleStreamingChunk.bind(this));
    }

    /**
     * Initialize the chat service (async setup)
     */
    async initialize(aiClient, mcpConnector, stateService) {
        console.log('[ChatService] Starting initialization...');

        if (this.initialized) {
            throw new Error('[ChatService] Already initialized');
        }

        this.initialized = true;

        this.aiClient = aiClient;
        this.mcpConnector = mcpConnector;
        this.stateService = stateService;
        
        // Initialize tool executor with dependencies
        this.toolExecutor = new ToolExecutor(
            this.toolParser,
            this.mcpConnector,
            this.domConnector,
            this.stateService
        );

        this.setupEventListeners();
        console.log('[ChatService] Event listeners set up');
        
        try {
            // Initialize the panel
            await this.panel.initialize();
            console.log('[ChatService] Panel initialized');
            
            // Update initial connection status
            this.updateConnectionStatus();
            
            // Load current conversation on startup
            console.log('[ChatService] Loading current conversation on startup...');

            this.panel.setPageContentCheckboxState(this.stateService.ui.getIncludePageContent() || false);

            if (!this.stateService.conversation.getActiveThreadId()) {
                await this.sendGetOrCreateThread();
            }

            console.log('[ChatService] Initialization complete');
        } catch (error) {
            console.error('[ChatService] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Parse the response for tool calls
     */
    async parseToolsFromResponse(response, tools) {
        return this.toolExecutor.parseToolsFromResponse(response, tools);
    }

    /**
     * Handle user message event
     */
    async handleUserMessage(payload, { autoExecuteTools = false, forcePageContent = false, customSystemPrompt = null } = {}) {
        console.log('[ChatService] Handling user message:', payload);
        
        const { message, silent = false } = payload;
        
        if (!this.aiClient) {
            console.log('[ChatService] No AI client configured');
            this.panel.displayError('AI client not configured. Please check settings.');
            return;
        }

        this.panel.removeErrorMessages();

        try {
            const threadId = this.stateService.conversation.getActiveThreadId();

            if (!threadId) {
                console.log('[ChatService] No active thread found', this.stateService);
                this.panel.displayError('No active thread found. Please create a new conversation.');
                return;
            }

            // Prepare messages for API with conversation history
            let userMessage = {
                messageId: generateMessageId(),
                role: MESSAGE_ROLES.USER,
                content: message,
                timestamp: Date.now()
            };

            // Get available tools and build system prompt
            const tools = this.toolExecutor.getAvailableTools();
            const systemPrompts = this.buildSystemPrompts(tools, customSystemPrompt);

            // Build page context and prepare m
            const conversationMessages = this.stateService.conversation.getConversationMessages(threadId);

            // Calculate tokens: subtract AI response tokens and existing conversation tokens
            const systemPromptTokens = this.messageBuilder.countTokens(systemPrompts);
            const aiResponseTokens = this.aiClient.samplerConfig?.maxTokens ?? 2048;
            const conversationTokens = conversationMessages.reduce((total, msg) => {
                return total + this.messageBuilder.countTokens(msg.content || '');
            }, 0);
            const userMessageTokens = this.messageBuilder.countTokens(userMessage.content);
            const maxTextTokens = this.maxRequestTokens - aiResponseTokens - conversationTokens - systemPromptTokens - userMessageTokens;
            console.log('[ChatService] Max text tokens:', maxTextTokens, 'aiResponseTokens:', aiResponseTokens, 'conversationTokens:', conversationTokens, 'systemPromptTokens:', systemPromptTokens, 'userMessageTokens:', userMessageTokens);
            const includePageNavigation = false;
            const pageContext = this.messageBuilder.buildPageContext(this.stateService, { forcePageContent, includePageNavigation, maxTextTokens });
            const { messagesForAPI, enhancedUserMessage } = this.messageBuilder.prepareMessagesForAPI(
                userMessage.content,
                conversationMessages,
                pageContext,
            );

            // Store user message immediately in conversation state (part 1 of 2-part creation)
            const location = typeof window !== 'undefined' ? window.location.href : undefined;
            this.stateService.conversation.storePartialUserMessage(threadId, {
                ...userMessage,
                url: location,
                title: document.title
            }, {
                ...this.stateService.aim.getAimMessageOptions()
            });

            // Display user message in panel
            if (!silent) {
                this.panel.displayMessage(userMessage, { autoScroll: true });
            }

            // Generate AI response with streaming
            const { response, thinkingMessage } = await this.responseHandler.generateAIResponse(
                this.aiClient,
                enhancedUserMessage,
                messagesForAPI,
                systemPrompts
            );

            // Parse and execute tools
            const { toolCalls, parseErrors } = await this.toolExecutor.parseToolsFromResponse(response, tools);
            const toolResults = await this.toolExecutor.executeTools(toolCalls, autoExecuteTools);
            
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
                toolCalls,
                toolResults,
                parseErrors
            };

            // Finalize the thinking message with the complete response
            this.responseHandler.finalizeStreamingMessage(thinkingMessage, assistantMsg);

            console.log('[ChatService] Saving message:', userMsg, assistantMsg);

            // Request host to save conversation
            this.eventBus.emit(EVENTS.CHAT.SAVE_MESSAGE, {
                threadId: threadId,
                userMessage: userMsg,
                assistantMessage: assistantMsg,
                options: {
                    ...this.stateService.aim.getAimMessageOptions(),
                    url: location,
                    title: document.title,
                }}, { target: EVENT_CONTEXT.BACKGROUND }
            );

            console.log('[ChatService] Message saved');

            this.panel.updateReparseButton(true);

        } catch (error) {
            const streamingState = this.responseHandler.getStreamingState();
            
            // Handle request cancellation
            if (error.message === 'Request cancelled') {
                console.log('[ChatService] Request cancelled by user');
                if (streamingState.currentMessage) {
                    // Append cancellation message to existing content
                    const cancelledContent = streamingState.streamingText + '\n\n[Request Cancelled By User]';
                    this.panel.updateStreamingMessage(
                        streamingState.currentMessage.messageId,
                        cancelledContent
                    );
                    // Finalize the message with the cancelled content
                    this.panel.finalizeThinkingMessage(
                        streamingState.currentMessage.messageId,
                        cancelledContent,
                        []
                    );
                }
                return; // Don't show error for cancelled requests
            }
            
            if (error.message.includes("Error: Empty response from AI provider")) {
                console.log('[ChatService] Empty response from AI provider, skipping');
                this.panel.displayError(error.message, streamingState.currentMessage?.messageId);
            } else {
                console.error('[ChatService] Error handling user message:', error);
                this.panel.displayError(error.message, streamingState.currentMessage?.messageId);
            }
        }
    }

    /**
     * Handle reparse message event
     */
    async handleReparseMessage(payload) {
        console.log('[ChatService] Handling reparse message:', payload);
        const tools = this.stateService.mcp.getMcpTools();
        const threadId = this.stateService.conversation.getActiveThreadId();
        const messages = this.stateService.conversation.getConversationMessages(threadId);
        const lastAssistantMessage = messages[messages.length - 1];
        const { toolCalls, parseErrors } = await this.parseToolsFromResponse(lastAssistantMessage.content, tools);
        this.stateService.conversation.updateToolCalls(lastAssistantMessage.messageId, toolCalls);

        await this.stateService.disk.saveToStorage();

        console.log('[ChatService] Reparsed message:', toolCalls, parseErrors, lastAssistantMessage);
        const lastChatMessageElement = this.panel.getLastChatMessageElement();
        if (lastChatMessageElement) {
            this.panel.finalizeThinkingMessage(lastChatMessageElement.id, lastAssistantMessage.content, toolCalls);
        } else {
            console.warn('[ChatService] No last chat message element to finalize');
        }
    }

    /**
     * Handle page analysis request event
     */
    async handlePageAnalysisRequest(payload) {
        console.log('[ChatService] Handling page analysis request');
        
        // Import analysis prompt functions
        const { buildMarkdownReportPrompt, buildMarkdownReportSystem } = await import('../js/prompts/analysis-prompt.js');
        
        const userMessage = buildMarkdownReportPrompt();
        const systemPrompt = buildMarkdownReportSystem();
        
        // Force page content inclusion and add custom system prompt for analysis requests
        await this.handleUserMessage({ message: userMessage }, { 
            forcePageContent: true, 
            customSystemPrompt: systemPrompt 
        });
    }

    /**
     * Handle settings update event
     */
    async handleSettingsRefresh(payload) {
        console.log('[ChatService] Handling settings update:', payload);
        
        const { settings } = payload;
        this.stateService.settings.patchSettings(settings);
        console.log('[ChatService] Settings update processed successfully');
    }

    /**
     * Handle UI settings toggle request
     */
    async handleUISettingsToggle(data) {
        console.log('[ChatService] Handling UI settings toggle:', data);
        
        // Update local state for each setting provided
        if ('includePageContent' in data) {
            this.stateService.ui.setIncludePageContent(data.includePageContent);
            this.panel.updatePageContentSetting(data.includePageContent);
        }
        
        if ('useMCP' in data) {
            this.stateService.ui.setUseMCP(data.useMCP);
            this.panel.updateMcpSetting(data.useMCP);
        }

        if ('useBrowserTools' in data) {
            this.stateService.ui.setUseBrowserTools(data.useBrowserTools);
            this.panel.updateBrowserToolsSetting(data.useBrowserTools);
        }

        if ('autoExecuteTools' in data) {
            this.stateService.ui.setAutoExecuteTools(data.autoExecuteTools);
            this.panel.updateAutoExecuteSetting(data.autoExecuteTools);
        }
        
        // Send unified settings update to background for persistence
        this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, {
            settings: this.stateService.state.settings
        }, { target: EVENT_CONTEXT.BACKGROUND });
        
        console.log('[ChatService] UI settings toggle processed successfully');
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
        
        const { threadId } = payload;
        
        // Update the thread ID display in the panel
        if (this.panel.isReady()) {
            this.panel.updateConversationIdDisplay(threadId);
        }
    }

    /**
     * Handle new conversation request event
     */
    async handleNewConversationRequest(payload) {
        console.log('[ChatService] Handling new conversation request');
        
        // Step 1: End the current conversation via backend
        await this.eventBus.emitAsync(EVENTS.CHAT.END_CONVERSATION, {}, { target: EVENT_CONTEXT.BACKGROUND });
        
        // Step 2: Request host to get or create new conversation
        await this.sendGetOrCreateThread();
    }

    /**
     * Handle replay last turn request event
     */
    async handleReplayLastTurn() {
        console.log('[ChatService] Handling replay last turn request');

        const threadId = this.stateService.conversation.getActiveThreadId();
        if (!threadId) {
            console.log('[ChatService] No active thread found');
            this.panel.displayError('No active thread found to replay');
            return;
        }

        // Get the last user message from the conversation state
        const lastUserMessage = this.stateService.conversation.getLastUserMessage(threadId);
        if (!lastUserMessage) {
            console.log('[ChatService] No last user message found');
            this.panel.displayError('No last message found to replay');
            return;
        }

        // Remove the last assistant message from the conversation ONLY if the assistant
        // was actually the last message in the conversation (not if last message was user message with error)
        const conversation = this.stateService.conversation.getConversation(threadId);
        if (conversation && conversation.messages && conversation.messages.length > 0) {
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            if (lastMessage.role === MESSAGE_ROLES.ASSISTANT) {
                conversation.messages.pop();
                // Update the panel
                if (this.panel.isReady()) {
                    this.panel.updateConversation(conversation);
                }
            }
        }

        // Re-send the message through the normal flow
        await this.handleUserMessage({ message: lastUserMessage.content.trim(), silent: true });
    }

    /**
     * Handle conversation loaded event
     */
    async handleConversationLoaded(payload) {
        console.log('[ChatService] Handling conversation loaded:', payload);
        
        let { conversation } = payload;
        if (conversation && conversation.result) {
            conversation = conversation.result;
        }
        
        // Store the current conversation for context in AI requests
        if (conversation && this.panel.isReady()) {
            console.log(`[ChatService] Displaying conversation with ID: ${conversation.threadId}`);
            this.panel.displayConversation(conversation);
            console.log(`[ChatService] Loaded conversation with ${conversation.messages?.length || 0} messages`);
        } else {
            console.warn('[ChatService] Cannot display conversation - panel not ready or no conversation data');
        }
    }

    /**
     * Handle tool execution request from ChatService
     */
    async handleExecuteTool(data) {
        console.log('[WebWireContentHost] Handling execute tool request:', data);
        
        const { toolName, parameters } = data;
        
        // List of DOM tools that should be handled locally
        const domTools = ['navigate_to_url', 'click_element', 'form_fill', 'extract_elements', 'scroll_to', 'wait_for_element'];
        
        try {
            if (domTools.includes(toolName)) {
                // Handle DOM tools locally using the DOM agent
                console.log('[WebWireContentHost] Executing DOM tool locally:', toolName);
                const result = await this.domAgent.executeTool(toolName, parameters);
                console.log('[WebWireContentHost] DOM tool execution result:', result);
                return result;
            } else {
                // Handle MCP tools using the MCP connector
                if (!this.core.mcpConnector) {
                    console.error('[WebWireContentHost] No MCP connector available for tool execution');
                    throw new Error('MCP connector not available');
                }
                
                console.log('[WebWireContentHost] Executing MCP tool:', toolName);
                const result = await this.core.mcpConnector.executeTool(toolName, parameters);
                console.log('[WebWireContentHost] MCP tool execution result:', result);
                return result;
            }
        } catch (error) {
            console.error('[WebWireContentHost] Failed to execute tool:', error);
            throw error;
        }
    }

    /**
     * Handle execute tool call event
     */
    async handleExecuteToolCall(payload) {
        console.log('[ChatService] Handling execute tool call:', payload);
        const { toolCall } = payload;
        return this.toolExecutor.executeTool(toolCall);
    }

    /**
     * Handle tool result event
     */
    async handleToolResult(payload) {
        console.log('[ChatService] Handling tool result:', payload);
        const { callId, toolResult } = payload;
        // We need to update the tool result for our panel
        this.panel.updateToolResult(callId, toolResult);
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
     * Set MCP connector
     */
    setMCPConnector(connector) {
        this.mcpConnector = connector;
        this.updateConnectionStatus();
    }

    /**
     * Build system prompts
     */
    buildSystemPrompts(tools, customSystemPrompt) {
        const systemPrompts = ["You are a helpful assistant analyzing web pages and helping users."];
        
        if (tools.length > 0) {
            systemPrompts.push(ToolFormatter.generateSystemPrompt(tools));
        }

        if (customSystemPrompt) {
            systemPrompts.push(customSystemPrompt);
        }

        return systemPrompts.join('\n\n');
    }

    /**
     * Handle streaming chunks (delegate to response handler)
     */
    handleStreamingChunk(chunk, messageHandle) {
        this.responseHandler.handleStreamingChunk(chunk, messageHandle);
    }

    /**
     * Set current settings
     */
    setCurrentSettings(settings) {
        this.stateService.settings.patchSettings(settings);
        
        // Update panel checkbox state
        if (this.panel.isReady()) {
            this.panel.updatePageContentSetting(this.stateService.ui.getIncludePageContent());
            this.panel.updateMcpSetting(this.stateService.ui.getUseMCP());
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
            this.panel.handleInitialState(state);
        }
    }

    /**
     * Check if chat service is ready
     */
    isReady() {
        return this.panel.isReady();
    }
    
    /**
     * Cancel the current streaming response
     */
    cancelStreamingResponse() {
        this.responseHandler.cancelStreaming();
    }

    /**
     * Load current conversation on startup
     */
    async sendGetOrCreateThread() {
        console.log('[ChatService] Requesting current conversation from host...');
        
        // Request the current conversation from the host
        const conversationData = await this.eventBus.emitAsync(EVENTS.CHAT.GET_OR_CREATE_THREAD, {
            ...this.pageUtils.getPageLocation()
        }, { target: EVENT_CONTEXT.BACKGROUND });

        console.log('[ChatService] Current conversation loaded:', conversationData);

        // Handle the conversation result
        if (conversationData) {
            // Trigger the conversation loaded handler to update the panel
            await this.handleConversationLoaded({ conversation: conversationData });
        } else {
            console.warn('[ChatService] Failed to load conversation or no conversation returned:', conversationData);
        }
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
