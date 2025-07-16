import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { WebChatPanel } from './chat-panel.js';
import { PageUtils } from '../js/browser/page-utils.js';
import { DOMConnector } from '../js/browser/dom-connector.js';
import { generateMessageId } from '../js/utils/id-generator.js';
import { buildToolMessages } from './message-utils.js';

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
        
        // State
        this.streamingState = {
            isActive: false,
            currentContent: '',
            messageId: null,
            currentMessage: null,
            streamingText: '',
            messageCounter: 0
        };

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
        // Parse for tool calls if MCP is connected
        let toolCalls = [];
        let parseErrors = [];
        
        if (this.mcpConnector && tools.length > 0) {
            const parseResult = this.toolParser.parseResponse(response);
            if (parseResult.success && parseResult.toolCalls.length > 0) {
                toolCalls = parseResult.toolCalls;
            } else if (parseResult.errors && parseResult.errors.length > 0) {
                parseErrors = parseResult.errors;
            }
        }

        return { toolCalls, parseErrors };
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

            // Create system prompt with tools (MCP + DOM tools)
            let systemPrompts = ["You are a helpful assistant analyzing web pages and helping users."];
            let tools = [];
            
            // Get MCP tools (only if useMCP setting is enabled)
            if (this.mcpConnector && this.stateService && this.stateService.ui.getUseMCP()) {
                try {
                    const mcpTools = this.stateService.mcp.getMcpTools();
                    if (mcpTools && mcpTools.length > 0) {
                        tools.push(...mcpTools);
                        console.log(`[ChatService] Found ${mcpTools.length} MCP tools`);
                    }
                } catch (error) {
                    console.warn('[ChatService] Failed to get MCP tools:', error);
                }
            }
            
            // Get DOM tools and convert to OpenAI format
            if (this.domConnector && this.stateService.ui.getUseBrowserTools()) {
                try {
                    const domTools = this.domConnector.getAvailableTools();
                    if (domTools && domTools.length > 0) {
                        // Convert DOM tools to OpenAI format to match MCP tools
                        const formattedDomTools = domTools.map(tool => ({
                            type: 'function',
                            function: {
                                name: tool.name,
                                description: tool.description,
                                parameters: tool.parameters
                            }
                        }));
                        tools.push(...formattedDomTools);
                        console.log(`[ChatService] Found ${domTools.length} DOM tools`);
                    }
                } catch (error) {
                    console.warn('[ChatService] Failed to get DOM tools:', error);
                }
            }
            
            // Generate system prompt with all tools using existing ToolFormatter
            if (tools.length > 0) {
                systemPrompts.push(ToolFormatter.generateSystemPrompt(tools));
                console.log(`[ChatService] Using ${tools.length} total tools (MCP + DOM) for system prompt`);
            }

            // Add custom system prompt if provided
            if (customSystemPrompt) {
                systemPrompts.push(customSystemPrompt);
                console.log(`[ChatService] Added custom system prompt for specialized analysis`);
            }


            // Build messages array including conversation history
            let messagesForAPI = [];
            
            // Include conversation history if available
            const messages = this.stateService.conversation.getConversationMessages(threadId);
            if (messages) {
                // Add existing messages (excluding system messages)
                messagesForAPI = messages
                    .filter(msg => msg.role !== MESSAGE_ROLES.SYSTEM)
                    .map(msg => ({
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp
                    }));
                
                console.log(`[ChatService] Using ${messagesForAPI.length} messages from conversation history`);
            } else {
                console.log('[ChatService] No messages found for conversation history');
            }
            
            let syntheticMessages = [];
            let syntheticSources = [];
            let syntheticPlayerHeader = [];
            const stashContent = this.buildStashContext();
            if (stashContent) {
                syntheticMessages.push(stashContent);
                syntheticSources.push('stash');
            }

            // Include page content if forced or if setting is enabled
            if (forcePageContent || this.stateService.ui.getIncludePageContent() !== false) {
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
                for (const syntheticMessage of syntheticMessages) {
                    syntheticPlayerHeader.push(syntheticMessage);
                }
                console.log(`[ChatService] Enhanced current user message with ${syntheticSources.join(', ')} sources for API`);
            }

            // Add any tool calls and responses (a toolMessage) from the last assistant message and add them as a prefix to the user message
            if (this.currentConversation && this.currentConversation.messages && this.currentConversation.messages.length > 0) {
                const lastAssistantMessage = this.currentConversation.messages[this.currentConversation.messages.length - 1];
                if (lastAssistantMessage && lastAssistantMessage.toolCalls?.length > 0) {
                    const toolMessages = buildToolMessages(lastAssistantMessage.toolCalls, lastAssistantMessage.toolResults);
                    console.log('[ChatService] Tool messages:', toolMessages, lastAssistantMessage);
                    const toolMessagesString = toolMessages.map(toolMessage => {
                        const { callId, display, error, executionTime, name, parameters, success, ...results } = toolMessage;
                        if (error) {
                            return `|tool_error|\n\n${name}: ${error}\n\n|end_tool_error|`;
                        } else {
                            const resultString = JSON.stringify(results, null, 2);
                            return `|tool_response|\n\n${name}: ${resultString}\n\n|end_tool_response|`;
                        }
                    }).join('\n\n');
                    console.log('[ChatService] Tool messages string:', toolMessagesString);
                    syntheticPlayerHeader.push(toolMessagesString);
                } else {
                    console.log('[ChatService] No tool messages found');
                }
            }

            // Create thinking message with unique ID
            const thinkingMessage = this.addThinkingMessage('Thinking...');
            this.streamingState.currentMessage = thinkingMessage;
            let streamingText = '';

            // Set up exclusive stream handler for this request
            const unsubscribeStream = this.eventBus.onExclusive(EVENTS.AI.STREAM_CHUNK, (data) => {
                streamingText += data.chunk;
                this.handleStreamingChunk(data.chunk, thinkingMessage);
            });

            const enchancedUserMessage = syntheticPlayerHeader.join('\n\n') + '\n\n' + userMessage.content;

            let response = null;
            try {
                const totalMessagesLength = messagesForAPI.reduce((acc, msg) => acc + msg.content.length, 0);
                console.log('[ChatService] Generating AI response...', enchancedUserMessage.length, totalMessagesLength);
                response = await this.aiClient.generateTurn(enchancedUserMessage, messagesForAPI, { 
                    systemPrompt: systemPrompts.join('\n\n'),
                    maxHistory: 100, 
                });

                if (!response) {
                    throw new Error('No response received from AI client');
                }
                console.log('[ChatService] AI response received:', response);
            } finally {
                unsubscribeStream();
            }

            const { toolCalls, parseErrors } = await this.parseToolsFromResponse(response, tools);

            let toolResults = null;
            if (autoExecuteTools || this.stateService.ui.getAutoExecuteTools()) {
                toolResults = [];
                for (const toolCall of toolCalls) {
                    const result = await this.handleExecuteToolCall({ toolCall });
                    toolResults.push(result);
                }
            }
            
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
            this.finalizeStreamingMessage(thinkingMessage, assistantMsg);

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
            if (error.message.includes("Error: Empty response from AI provider")) {
                console.log('[ChatService] Empty response from AI provider, skipping');
                this.panel.displayError(error.message, this.streamingState.currentMessage?.messageId);
            } else {
                console.error('[ChatService] Error handling user message:', error);
                this.panel.displayError(error.message, this.streamingState.currentMessage?.messageId);
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
        //this.currentConversation = conversation;
        
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
        const result = null;
        try {
            // Check if it's a DOM tool first
            let toolResponse;
            if (this.domConnector.isTool(toolCall.name)) {
                console.log(`[ChatService] Executing DOM tool: ${toolCall.name}`);
                toolResponse = await this.domConnector.executeTool(
                    toolCall.name, 
                    toolCall.parameters
                );
            } else if (this.mcpConnector && this.mcpConnector.isTool(toolCall.name)) {
                // Fallback to MCP connector for external tools
                console.log(`[ChatService] Executing MCP tool: ${toolCall.name}`);
                toolResponse = await this.mcpConnector.executeTool(
                    toolCall.name, 
                    toolCall.parameters
                );
            }

            result = {
                callId: toolCall.callId,
                name: toolCall.name,
                parameters: toolCall.parameters,
                result: toolResponse,
                success: result.success,
                executionTime: result.executionTime
            };

            console.log(`[ChatService] Tool ${toolCall.name} executed successfully`);

        } catch (error) {
            console.error(`[ChatService] Tool ${toolCall.name} execution failed:`, error);
            result = {
                callId: toolCall.callId,
                name: toolCall.name,
                parameters: toolCall.parameters,
                success: false,
                error: error.message
            };
        }

        return result;
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
    addThinkingMessage(message, messageId) {
        if (!messageId) {
            messageId = generateMessageId();
        }
        
        // Display thinking message in panel
        this.panel.displayThinkingMessage({
            messageId: messageId,
            content: message,
            role: MESSAGE_ROLES.ASSISTANT
        });
        
        return { messageId: messageId };
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

        //console.log('[ChatService] Streaming chunk to panel:', chunk.length, messageHandle);
        
        // Update panel directly
        this.panel.updateStreamingMessage(messageHandle.messageId, this.streamingState.streamingText);
    }
        
    /**
     * Finalize streaming and clean up the thinking message
     */
    finalizeStreamingMessage(messageHandle, { content, toolCalls, toolResults, parseErrors, ...assistantMsg } = {}) {
        this.streamingState.isActive = false;
        this.streamingState.currentMessage = null;
        this.streamingState.streamingText = '';

        const toolMessages = buildToolMessages(toolCalls, toolResults);

        // Finalize in panel
        this.panel.finalizeThinkingMessage(messageHandle.messageId, content, toolMessages);
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
