import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { EventBindableComponent } from '../js/core/event-bindable-panel.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { WebChatPanel } from './chat-panel.js';
import { PageUtils } from '../js/browser/page-utils.js';
import { DOMConnector } from '../js/browser/dom-connector.js';
import { generateMessageId } from '../js/utils/id-generator.js';
import { MessageBuilder } from './message-builder.js';
import { ToolExecutor } from './tool-executor.js';
import { AIResponseHandler } from './ai-response-handler.js';
import { AIClientFactory } from '../js/ai/ai-client-factory.js';
import { chatSelectModal } from './components/chat-select.js';
import { PromptVariables } from '../js/utils/prompt-variables.js';
import { logger } from '../js/core/logging.js';

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

export class ChatService extends EventBindableComponent {
    constructor(eventBus, config = null) {
        super(eventBus);
        
        // Store config
        this.config = config;
        
        // UI Components
        this.panel = new WebChatPanel(this.eventBus, this.config);
        this.pageUtils = new PageUtils();

        // AI/MCP Components  
        this.aiClient = null;
        this.mcpConnector = null;
        this.domConnector = new DOMConnector(this.eventBus);
        this.stateService = null;
        this.toolParser = new ToolParser();
        
        // Service Components
        this.messageBuilder = null; // Initialized after stateService is set
        this.toolExecutor = null; // Initialized after stateService is set
        this.responseHandler = null;

        this.isStreaming = false;

        this.initialized = false;
    }

    /**
     * Get encoding options based on model configuration
     * @param {Object} modelConfig - Model configuration from settings
     * @returns {Object} Options for tiktoken initialization
     */
    getEncodingOptions(modelConfig) {
        if (!modelConfig) {
            return {}; // Use defaults
        }
        
        // If tokenizer is explicitly set in config, use it
        if (modelConfig.tokenizer) {
            logger.log(this, `Using configured tokenizer: ${modelConfig.tokenizer}`);
            return { tokenizer: modelConfig.tokenizer };
        }
        
        // Otherwise, auto-detect based on model name
        const modelName = modelConfig.model?.toLowerCase() || '';
        
        // Map common models to their tokenizers
        const modelTokenizerMap = {
            'gpt-4': 'cl100k_base',
            'gpt-3.5-turbo': 'cl100k_base',
            'claude': 'cl100k_base',
            'gemini': 'cl100k_base',
            'mistral': 'cl100k_base',
            'mixtral': 'cl100k_base',
            'llama': 'cl100k_base',
            'deepseek': 'cl100k_base',
            'qwen': 'cl100k_base',
            'yi': 'cl100k_base',
            'kimi': 'kimi-k2',
            'moonshot': 'kimi-k2',
            'codex': 'r50k_base',
            'gpt-3': 'p50k_base',
            'davinci': 'p50k_base',
            'curie': 'p50k_base'
        };
        
        // Find the first matching tokenizer
        for (const [key, tokenizer] of Object.entries(modelTokenizerMap)) {
            if (modelName.includes(key)) {
                logger.log(this, `Auto-detected tokenizer for ${key}: ${tokenizer}`);
                return { tokenizer };
            }
        }
        
        // Default to cl100k_base for unknown models (most modern models use this)
        logger.log(this, 'Using default cl100k_base tokenizer for unknown model:', modelName);
        return { tokenizer: 'cl100k_base' };
    }

    /**
     * Set up event listeners for the service
     */
    setupEventListeners() {
        // Listen for chat events
        this.on(EVENTS.CHAT.SEND_MESSAGE, this.handleUserMessage);
        this.on(EVENTS.CHAT.ANALYZE_PAGE, this.handlePageAnalysisRequest);
        this.on(EVENTS.CHAT.UPDATE_SETTINGS, this.handleSettingsRefresh);
        this.on(EVENTS.MCP.CONNECTED, this.handleMCPStatusUpdate);
        this.on(EVENTS.MCP.DISCONNECTED, this.handleMCPStatusUpdate);
        this.on(EVENTS.MCP.INITIALIZED, this.handleMCPStatusUpdate);
        this.on(EVENTS.MCP.TOOLS_UPDATED, this.handleMCPStatusUpdate);
        this.on(EVENTS.MCP.CONNECTION_ERROR, this.handleMCPStatusUpdate);
        this.on(EVENTS.CHAT.CONVERSATION_LOADED, this.handleConversationLoaded);
        this.on(EVENTS.CHAT.CONVERSATION_UPDATED, this.handleConversationUpdated);
        this.on(EVENTS.CHAT.START_NEW_CONVERSATION, this.handleNewConversationRequest);
        this.on(EVENTS.CHAT.SWAP_CONVERSATION, this.handleSwapConversation);
        this.on(EVENTS.CHAT.REPLAY_LAST_TURN, this.handleReplayLastTurn);
        this.on(EVENTS.CHAT.BACK_BUTTON, this.handleBackButton);
        this.on(EVENTS.CHAT.REPARSE_MESSAGE, this.handleReparseMessage);
        this.on(EVENTS.CHAT.TOOL_RESULT, this.handleToolResult);
        this.on(EVENTS.CHAT.TOGGLE_UI_SETTING, this.handleUISettingsToggle);
        this.on(EVENTS.CHAT.CANCEL_STREAM, this.cancelStreamingResponse);
        
        // Listen for AI streaming events
        this.on(EVENTS.AI.STREAM_CHUNK, this.handleStreamingChunk);
        this.on(EVENTS.AI.STREAM_STARTED, this.handleStreamStarted);
        this.on(EVENTS.AI.STREAM_COMPLETED, this.handleStreamCompleted);
        
        // Listen for save status events
        this.on(EVENTS.UI.THREAD_SAVED, this.handleThreadSaved);
    }

    /**
     * Initialize the chat service (async setup)
     */
    async initialize(mcpConnector, stateService) {
        logger.log(this, 'Starting initialization...');

        if (this.initialized) {
            throw new Error('[ChatService] Already initialized');
        }

        this.initialized = true;

        this.mcpConnector = mcpConnector;
        this.stateService = stateService;

        // Initialize message builder with model configuration TODO this should be provided by the model provider
        // instead of the chat service
        const currentModel = this.stateService.ui.getSelectedModel() || 'chat';
        const currentConfig = await this.stateService.settings.getModelConfig(currentModel);
        const encodingOptions = this.getEncodingOptions(currentConfig);
        this.messageBuilder = new MessageBuilder(this.pageUtils, encodingOptions);
        logger.log(this, 'Message builder initialized');
        
        // Initialize tool executor with dependencies
        this.toolExecutor = new ToolExecutor(
            this.toolParser,
            this.mcpConnector,
            this.domConnector,
            this.stateService
        );
        logger.log(this, 'Tool executor initialized');
        
        this.responseHandler = new AIResponseHandler(this.eventBus, this.stateService, this.panel);
        logger.log(this, 'Response handler initialized');

        this.setupEventListeners();
        logger.log(this, 'Event listeners set up');
        
        try {
            // DO NOT initialize panel here - it injects DOM
            logger.log(this, 'Skipping panel initialization');
            
            // Load current conversation on startup
            logger.log(this, 'Loading current conversation on startup...');

            // Initialize all UI settings
            this.panel.setPageContentCheckboxState(this.stateService.ui.getIncludePageContent() || false);
            this.panel.updateMcpSetting(this.stateService.ui.getUseMCP());
            this.panel.updateBrowserToolsSetting(this.stateService.ui.getUseBrowserTools());
            this.panel.updateAutoExecuteSetting(this.stateService.ui.getAutoExecuteTools());
            logger.log(this, 'UI settings initialized');
            
            // Initialize selected model
            this.panel.updateSelectedModelSetting(currentModel, currentConfig?.model, currentConfig);
            logger.log(this, 'Selected model initialized');

            logger.log(this, 'Active thread ID:', this.stateService.state);
            // Note: Conversation loading moved to ensurePanelInitialized() to avoid race condition

            logger.log(this, 'Initialization complete');
        } catch (error) {
            logger.error(this, 'Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Get AI client, creating or updating it if necessary based on current model selection
     * @returns {Object} AI client instance
     * @throws {Error} If no model configuration or client creation fails
     */
    async getAiClient() {
        const selectedModel = this.stateService.ui.getSelectedModel();
        if (!selectedModel) {
            throw new Error('[ChatService] No model selected');
        }
        logger.log(this, 'getAiClient() called for model type:', selectedModel);
        
        const currentConfig = await this.stateService.settings.getModelConfig(selectedModel);
        logger.log(this, 'Current config retrieved:', currentConfig);
        
        if (!currentConfig) {
            throw new Error(`No model configuration found for: ${selectedModel}`);
        }
        
        // Check if we need to create or update the AI client
        if (!this.aiClient || this.aiClient.needsUpdate?.(currentConfig)) {
            // If we have an existing client, we need to abort the current stream
            if (this.aiClient && this.aiClient.isStreaming()) {
                this.cancelStreamingResponse();
            }
            logger.log(this, 'Creating/updating AI client for model:', selectedModel, 'provider:', currentConfig.provider);
            logger.log(this, 'Full config being passed to factory:', JSON.stringify(currentConfig));
            this.aiClient = AIClientFactory.createClient(this.eventBus, currentConfig);
            logger.log(this, 'AI client created, type:', this.aiClient.constructor.name);
        } else {
            logger.log(this, 'Using existing AI client');
        }
        
        return this.aiClient;
    }

    /**
     * Parse the response for tool calls
     */
    async parseToolsFromResponse(response, tools) {
        return this.toolExecutor.parseToolsFromResponse(response, tools);
    }

    /**
     * Handle user message event
     *  This is one of the main entry points for the chat service.
     *  Be very careful with modifying this function.
     */
    async handleUserMessage(payload, { autoExecuteTools = false, silent = false,
        forcePageContent = false, customSystemPrompt = null, isRetry = false } = {}) {
        logger.log(this, 'Handling user message:', payload);
        
        const { message } = payload;
        
        let aiClient;
        try {
            aiClient = await this.getAiClient();
        } catch (error) {
            logger.error(this, 'Failed to get AI client:', error);
            this.panel.displayError(error.message);
            return;
        }

        this.panel.removeThinkingMessages();

        const threadId = this.stateService.conversation.getActiveThreadId();
        const pageUrl = typeof window !== 'undefined' ? window.location.href : undefined;
        const persona = this.stateService.aim.getAimMessageOptions();

        // Declare these outside try block so they're accessible in finally
        let userMsg = null;
        let assistantMsg = null;

        try {

            if (!threadId) {
                logger.log(this, 'No active thread found', this.stateService);
                this.panel.displayError('No active thread found. Please create a new conversation.');
                return;
            }

            // Prepare messages for API with conversation history
            // Get page data for variable processing  
            const conversationMessages = this.stateService.conversation.getConversationMessages(threadId);
            const wrapperTokens = 7;
            
            // Get page data directly for variable replacement
            const pageData = this.messageBuilder.pageUtils.getCurrentPageContent({ includePageNavigation: false });
            
            // Process variables in the original user message content
            const processedUserContent = PromptVariables.processPromptText(message, this.stateService, pageData);
            
            let userMessage = {
                messageId: generateMessageId(),
                role: MESSAGE_ROLES.USER,
                content: processedUserContent,
                timestamp: Date.now()
            };

            // Get available tools and build system prompt
            const tools = this.toolExecutor.getAvailableTools();
            const systemMessage = await this.stateService.aim.getSystemMessage();
            const rawSystemPrompts = this.buildSystemPrompts(tools, systemMessage, customSystemPrompt);

            // Calculate tokens with processed content
            const systemPromptTokens = await this.messageBuilder.countTokens(rawSystemPrompts) + wrapperTokens;
            const aiResponseTokens = this.aiClient.samplerConfig?.maxTokens ?? 2048;
            const conversationTokens = (await Promise.all(conversationMessages.map(async (msg) => {
                return await this.messageBuilder.countTokens(msg.content || '') + wrapperTokens;
            }))).reduce((total, msg) => total + msg, 0);
            const userMessageTokens = await this.messageBuilder.countTokens(userMessage.content) + wrapperTokens;
            const maxContentTokens = this.aiClient.samplerConfig?.maxContentTokens || 16384;
            const paddingTokens = 256;
            const maxTextTokens = maxContentTokens - aiResponseTokens - conversationTokens - systemPromptTokens - userMessageTokens - paddingTokens;
            logger.log(this, 'Max text tokens:', maxTextTokens, 'aiResponseTokens:', aiResponseTokens, 'conversationTokens:', conversationTokens, 'systemPromptTokens:', systemPromptTokens, 'userMessageTokens:', userMessageTokens);
            
            // Build final page context for API call (may be different from variable processing context)
            const finalPageContext = await this.messageBuilder.buildPageContext(this.stateService, { forcePageContent, include: { navigation: false, links: true }, maxTextTokens });
            let { messagesForAPI, enhancedUserMessage } = this.messageBuilder.prepareMessagesForAPI(
                userMessage.content,
                conversationMessages,
                finalPageContext,
            );

            const userHeader = this.stateService.aim.getUserHeader();
            const userFooter = this.stateService.aim.getUserFooter();
            if (userHeader) {
                enhancedUserMessage = userHeader + '\n\n' + enhancedUserMessage;
            }
            if (userFooter) {
                enhancedUserMessage = enhancedUserMessage + '\n\n' + userFooter;
            }

            // Apply variable replacement to system prompts and enhanced user message (for AI call)
            const systemPrompts = PromptVariables.processPromptText(rawSystemPrompts, this.stateService, pageData);
            enhancedUserMessage = PromptVariables.processPromptText(enhancedUserMessage, this.stateService, pageData);

            // Store user message immediately in conversation state (part 1 of 2-part creation)
            this.stateService.conversation.storePartialUserMessage(threadId, {
                ...userMessage,
                pageUrl: pageUrl,
                title: document.title
            }, {
                ...persona,
                pageUrl: pageUrl,
                title: document.title
            });

            // Prepare user message for storage (we have all info at this point)
            userMsg = { 
                role: MESSAGE_ROLES.USER, 
                content: message,
                timestamp: userMessage.timestamp,
                pageUrl: pageUrl,
                title: document.title
            };

            // Display user message in panel
            if (!silent) {
                this.panel.displayMessage(userMessage, { autoScroll: true, ...persona });
            }

            const apiArgs = await this.stateService.settings.getCurrentModelConfig();

            // Generate AI response with streaming
            const { response, thinkingMessage } = await this.responseHandler.generateAIResponse(
                aiClient,
                enhancedUserMessage,
                messagesForAPI,
                systemPrompts,
                { apiArgs: apiArgs }
            );

            // Parse and execute tools
            const { toolCalls, parseErrors } = await this.toolExecutor.parseToolsFromResponse(response, tools);
            const toolResults = await this.toolExecutor.executeTools(toolCalls, autoExecuteTools);
            
            // TODO separate out think xml tags
            assistantMsg = { 
                role: MESSAGE_ROLES.ASSISTANT, 
                content: response,
                timestamp: userMessage.timestamp + 1,
                toolCalls,
                toolResults,
                parseErrors,
                model: aiClient.model
            };

            // Finalize the thinking message with the complete response
            this.responseHandler.finalizeStreamingMessage(thinkingMessage, assistantMsg);

            this.stateService.conversation.storeAssistantMessage(threadId, assistantMsg, {
                ...persona,
                pageUrl: pageUrl,
                title: document.title,
            });

            logger.log(this, 'Message processing complete');

            this.panel.updateReparseButton(true);

        } catch (error) {
            const streamingState = this.responseHandler.getStreamingState();
            
            // Handle request cancellation
            if (error.message === 'Request cancelled') {
                logger.log(this, 'Request cancelled by user');
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
                    
                    // Store the cancelled message in conversation state
                    assistantMsg = { 
                        role: MESSAGE_ROLES.ASSISTANT, 
                        content: cancelledContent,
                        timestamp: Date.now(),
                        cancelled: true,  // Mark as cancelled
                        model: aiClient.model
                    };
                    
                    this.stateService.conversation.storeAssistantMessage(threadId, assistantMsg, {
                        ...persona,
                        pageUrl: pageUrl,
                        title: document.title,
                    });
                }
                // Re-enable retry button after cancellation
                this.panel.updateRetryButton(true);
                this.panel.updateBackButton(true);
                return; // Don't show error for cancelled requests
            }
            
            if (error.message.includes("Error: Empty response from AI provider")) {
                logger.log(this, 'Empty response from AI provider, skipping');
                this.panel.displayError(error.message, streamingState.currentMessage?.messageId);
            } else {
                logger.error(this, 'Error handling user message:', error);
                this.panel.displayError(error.message, streamingState.currentMessage?.messageId);
            }

            // Store the error message in conversation state
            assistantMsg = { 
                role: MESSAGE_ROLES.ASSISTANT, 
                content: error.message,
                timestamp: Date.now(),
                error: true,
                model: aiClient.model
            };
                    
            this.stateService.conversation.storeAssistantMessage(threadId, assistantMsg, {
                ...persona,
                pageUrl: pageUrl,
                title: document.title,
            });
            
            // Re-enable retry button after error
            this.panel.updateRetryButton(true);
        } finally {
            // Always save the conversation to persistent storage
            // This ensures error/cancelled messages are persisted
            if (userMsg && assistantMsg) {
                logger.log(this, 'Persisting conversation (including errors/cancellations)');
                
                this.eventBus.emit(EVENTS.CHAT.SAVE_MESSAGE, {
                    threadId: threadId,
                    userMessage: userMsg,
                    assistantMessage: assistantMsg,
                    options: {
                        ...persona,
                        pageUrl: pageUrl,
                        title: document.title,
                        isRetry: isRetry,
                        error: assistantMsg.error,
                        cancelled: assistantMsg.cancelled
                    }
                }, { target: EVENT_CONTEXT.BACKGROUND });
            }
        }
    }

    /**
     * Handle reparse message event
     */
    async handleReparseMessage(payload) {
        logger.log(this, 'Handling reparse message:', payload);
        const tools = this.stateService.mcp.getMcpTools();
        const threadId = this.stateService.conversation.getActiveThreadId();
        const messages = this.stateService.conversation.getConversationMessages(threadId);
        const lastAssistantMessage = messages[messages.length - 1];
        const { toolCalls, parseErrors } = await this.parseToolsFromResponse(lastAssistantMessage.content, tools);
        this.stateService.conversation.updateToolCalls(lastAssistantMessage.messageId, toolCalls);

        logger.log(this, 'Reparsed message:', toolCalls, parseErrors, lastAssistantMessage);
        const lastChatMessageElement = this.panel.getLastChatMessageElement();
        if (lastChatMessageElement) {
            this.panel.finalizeThinkingMessage(lastChatMessageElement.id, lastAssistantMessage.content, toolCalls);
        } else {
            logger.warn(this, 'No last chat message element to finalize');
        }
    }

    /**
     * Handle page analysis request event
     */
    async handlePageAnalysisRequest(payload) {
        logger.log(this, 'Handling page analysis request', payload);
        
        const { promptId } = payload;
        const prompt = this.stateService.prompts.getPrompt(promptId);
        
        if (!prompt) {
            logger.error(this, `Prompt not found: ${promptId}`);
            return;
        }
        
        // Build options from prompt features
        const options = { 
            customSystemPrompt: prompt.systemPrompt,
            forcePageContent: prompt.features.pageContent,
            enableMcp: prompt.features.mcp,
            autoThink: prompt.features.autoThink,
            noBaseSystemPrompt: prompt.features.noBaseSystemPrompt,
            enableBrowserTools: prompt.features.browserTools,
            autoExecuteTools: prompt.features.autoExecuteTools
        };
        
        await this.handleUserMessage({ message: prompt.userPrompt }, options);
    }

    /**
     * Handle settings update event
     */
    async handleSettingsRefresh(payload) {
        logger.log(this, 'Handling settings update:', payload);
        
        const { settings } = payload;
        this.stateService.settings.patchSettings(settings);
        logger.log(this, 'Settings update processed successfully');
    }

    /**
     * Handle UI settings toggle request
     */
    async handleUISettingsToggle(data) {
        logger.log(this, 'Handling UI settings toggle:', data);
        
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

        if ('selectedModel' in data) {
            this.stateService.ui.setSelectedModel(data.selectedModel);
            const currentConfig = await this.stateService.settings.getModelConfig(data.selectedModel);
            this.panel.updateSelectedModelSetting(data.selectedModel, currentConfig?.model, currentConfig);
            
            // Clear the AI client to force rebuild with new model on next message
            if (this.aiClient) {
                logger.log(this, 'Model changed, clearing AI client for rebuild');
                this.aiClient = null;
            }
        }

        if ('panelVisible' in data) {
            this.stateService.ui.setPanelVisible(data.panelVisible);
            // Show or hide the panel based on the setting
            if (data.panelVisible) {
                this.panel.show();
            } else {
                this.panel.hide();
            }
        }
        
        // Send UI settings update to background for persistence
        // Note: We send the specific UI settings that were toggled, not the entire settings object
        this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, data, { target: EVENT_CONTEXT.BACKGROUND });
        
        logger.log(this, 'UI settings toggle processed successfully');
    }

    /**
     * Handle MCP status update event
     */
    async handleMCPStatusUpdate(payload) {
        logger.log(this, 'Handling MCP status update:', payload);
        
        // Update local state and UI
        await this.updateConnectionStatus();
    }

    /**
     * Handle conversation updated event
     */
    async handleConversationUpdated(payload) {
        logger.log(this, 'Handling conversation updated:', payload);
        
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
        logger.log(this, 'Handling new conversation request');
        
        // Cancel any active streaming first to prevent orphaned streams
        if (this.responseHandler) {
            this.responseHandler.cancelStreaming();
            logger.log(this, 'Cancelled active streaming before new conversation');
        }
        
        try {
            // End the current conversation via backend (which will create a new empty one)
            const result = await this.eventBus.emitAsync(EVENTS.CHAT.END_CONVERSATION, {}, { target: EVENT_CONTEXT.BACKGROUND });
            
            if (result && result.newThreadId) {
                logger.log(this, 'New conversation created by END_CONVERSATION:', result.newThreadId);
                
                // Update local conversation state with the new thread ID
                if (this.stateService && this.stateService.conversation) {
                    this.stateService.conversation.setActiveConversation(result.newThreadId);
                }
                
                // Create a minimal conversation object for the panel
                const newConversation = {
                    threadId: result.newThreadId,
                    messages: [],
                    metadata: {
                        threadId: result.newThreadId,
                        status: 'active',
                        startTime: Date.now()
                    }
                };
                
                // Update the panel directly with the new conversation
                await this.handleConversationLoaded({ conversation: newConversation });
            } else {
                logger.log(this, 'END_CONVERSATION did not return new thread, creating one');
                // Fallback: create new conversation if END_CONVERSATION didn't
                await this.sendGetOrCreateThread({ createOnly: true });
            }
        } catch (error) {
            logger.error(this, 'Error creating new conversation:', error);
            this.panel.displayError(`Failed to create new conversation: ${error.message}`);
        }
    }

    /**
     * Handle swap conversation request event
     */
    async handleSwapConversation(payload) {
        logger.log(this, 'Handling swap conversation request');
        
        // Cancel any active streaming first to prevent orphaned streams
        if (this.responseHandler) {
            this.responseHandler.cancelStreaming();
            logger.log(this, 'Cancelled active streaming before conversation swap');
        }
        
        try {
            // Open the modal and wait for user selection
            const selectedThreadId = await chatSelectModal.open(this.stateService);
            
            logger.log(this, 'User selected conversation:', selectedThreadId);
            
            // Check if user selected a different conversation
            const currentActiveThreadId = this.stateService.conversation.getActiveThreadId();
            if (selectedThreadId === currentActiveThreadId) {
                logger.log(this, 'Same conversation selected, no swap needed');
                return;
            }
            
            // Mark current conversation as completed (if it exists)
            if (currentActiveThreadId) {
                this.stateService.conversation.updateConversationStatus(currentActiveThreadId, 'completed');
                logger.log(this, 'Marked current conversation as completed:', currentActiveThreadId);
            }
            
            // Set the selected conversation as active
            this.stateService.conversation.setActiveConversation(selectedThreadId);
            logger.log(this, 'Set conversation as active:', selectedThreadId);
            
            // Load the selected conversation
            const selectedConversation = this.stateService.conversation.getConversation(selectedThreadId);
            if (selectedConversation) {
                // Update conversation status to active
                this.stateService.conversation.updateConversationStatus(selectedThreadId, 'active');
                
                // Load the conversation in the panel
                await this.handleConversationLoaded({ conversation: selectedConversation });
                logger.log(this, 'Successfully swapped to conversation:', selectedThreadId);
            } else {
                logger.error(this, 'Selected conversation not found:', selectedThreadId);
                this.panel.displayError('Selected conversation could not be loaded');
            }
            
        } catch (error) {
            // User might have cancelled the modal or there was an error
            if (error.message.includes('closed without selection')) {
                logger.log(this, 'User cancelled conversation swap');
            } else {
                logger.error(this, 'Error swapping conversation:', error);
                this.panel.displayError(`Failed to swap conversation: ${error.message}`);
            }
        }
    }

    /**
     * Handle replay last turn request event
     */
    async handleReplayLastTurn() {
        logger.log(this, 'Handling replay last turn request');

        const threadId = this.stateService.conversation.getActiveThreadId();
        if (!threadId) {
            logger.log(this, 'No active thread found');
            this.panel.displayError('No active thread found to replay');
            return;
        }

        // Get the last user message from the conversation state
        const lastUserMessage = this.stateService.conversation.getLastUserMessage(threadId);
        if (!lastUserMessage) {
            logger.log(this, 'No last user message found');
            this.panel.displayError('No last message found to replay');
            return;
        }

        const metadata = this.stateService.conversation.getConversationMetadata(threadId);
        if (!metadata) {
            logger.log(this, 'No conversation metadata found');
            this.panel.displayError('No conversation metadata found to replay');
            return;
        }

        this.stateService.conversation.markMessage(threadId, lastUserMessage.messageId, 'retried');

        // Check if the last message in the panel is an AI message before removing
        const messages = this.stateService.conversation.getConversationMessages(threadId);
        const lastMessage = messages[messages.length - 1];
        
        // Only remove the last message from the panel if it's an AI message
        // This prevents removing the user message when retry is clicked after using the back button
        if (lastMessage && lastMessage.role === 'assistant') {
            this.panel.removeLastMessage();
        }
        
        // Re-send the message through the normal flow
        await this.handleUserMessage({ message: lastUserMessage.content.trim() }, { silent: true, isRetry: true });
    }

    /**
     * Handle back button request event - marks last message as dropped
     */
    async handleBackButton() {
        logger.log(this, 'Handling back button request');

        const threadId = this.stateService.conversation.getActiveThreadId();
        if (!threadId) {
            logger.log(this, 'No active thread found');
            this.panel.displayError('No active thread found');
            return;
        }

        const metadata = this.stateService.conversation.getConversationMetadata(threadId);
        if (!metadata) {
            logger.log(this, 'No conversation metadata found');
            this.panel.displayError('No conversation metadata found to mark as dropped');
            return;
        }

        // Get the last message from the conversation (could be user or assistant)
        const lastMessage = this.stateService.conversation.popMessage(threadId);
        
        // Mark the last message as dropped using the UPDATE_MESSAGE background action
        try {
            const response = await this.emitAsync(EVENTS.CHAT.UPDATE_MESSAGE, {
                threadId: threadId,
                messageId: lastMessage?.messageId,
                status: 'dropped'
            }, { target: 'background' });

            if (response && response.success) {
                logger.log(this, 'Message marked as dropped successfully');
                // Refresh the conversation display to hide the dropped message
                const threadId = this.stateService.conversation.getActiveThreadId();
                const conversation = this.stateService.conversation.getConversation(threadId);
                if (conversation) {
                    this.panel.displayConversation(conversation, this.stateService.aim.getAimMessageOptions());
                }
            } else {
                logger.error(this, 'Failed to mark message as dropped:', response);
                this.panel.displayError('Failed to mark message as dropped');
            }
        } catch (error) {
            logger.error(this, 'Error marking message as dropped:', error);
            this.panel.displayError('Error marking message as dropped');
        }
    }

    /**
     * Handle conversation loaded event
     */
    async handleConversationLoaded(payload) {
        logger.log(this, 'Handling conversation loaded:', payload);
        
        let { conversation } = payload;
        
        // Check for error response first
        if (conversation && conversation.success === false) {
            logger.error(this, 'Failed to load conversation:', conversation.error);
            
            // Handle specific errors
            if (conversation.error && conversation.error.includes('Extension context invalidated')) {
                logger.log(this, 'Extension context invalidated, showing reload message');
                if (this.panel.isReady()) {
                    this.panel.displayError(
                        'WebWire extension was updated. Please refresh this page to continue using the chat.',
                        null,
                        {
                            persistent: true,
                            actionButton: {
                                text: 'Refresh Page',
                                action: () => window.location.reload()
                            }
                        }
                    );
                }
                return;
            }
            
            // For other errors, show to user
            if (this.panel.isReady()) {
                this.panel.displayError(`Failed to load conversation: ${conversation.error}`);
            }
            return;
        }
        
        // Handle wrapped result
        if (conversation && conversation.result) {
            conversation = conversation.result;
        }
        
        // Update the panel with the new conversation
        if (conversation && this.panel.isReady()) {
            logger.log(this, `Displaying conversation with ID: ${conversation.threadId}`);
            
            this.panel.displayConversation(conversation, this.stateService.aim.getAimMessageOptions());
            logger.log(this, `Loaded conversation with ${conversation.messages?.length || 0} messages`);
        } else {
            logger.warn(this, 'Cannot display conversation - panel not ready or no conversation data');
        }
    }

    /**
     * Handle tool execution request from ChatService
     */
    async handleExecuteTool(data) {
        logger.log(this, 'Handling execute tool request:', data);
        
        const { toolName, parameters } = data;
        
        // List of DOM tools that should be handled locally
        const domTools = ['navigate_to_url', 'click_element', 'form_fill', 'extract_elements', 'scroll_to', 'wait_for_element'];
        
        try {
            if (domTools.includes(toolName)) {
                // Handle DOM tools locally using the DOM agent
                logger.log(this, 'Executing DOM tool locally:', toolName);
                const result = await this.domAgent.executeTool(toolName, parameters);
                logger.log(this, 'DOM tool execution result:', result);
                return result;
            } else {
                // Handle MCP tools using the MCP connector
                if (!this.core.mcpConnector) {
                    logger.error(this, 'No MCP connector available for tool execution');
                    throw new Error('MCP connector not available');
                }
                
                logger.log(this, 'Executing MCP tool:', toolName);
                const result = await this.core.mcpConnector.executeTool(toolName, parameters);
                logger.log(this, 'MCP tool execution result:', result);
                return result;
            }
        } catch (error) {
            logger.error(this, 'Failed to execute tool:', error);
            throw error;
        }
    }

    /**
     * Handle execute tool call event
     */
    async handleExecuteToolCall(payload) {
        logger.log(this, 'Handling execute tool call:', payload);
        const { toolCall } = payload;
        return this.toolExecutor.executeTool(toolCall);
    }

    /**
     * Handle tool result event
     */
    async handleToolResult(payload) {
        logger.log(this, 'Handling tool result:', payload);
        const { callId, toolResult } = payload;
        // We need to update the tool result for our panel
        this.panel.updateToolResult(callId, toolResult);
    }

    /**
     * Update connection status and notify panel
     */
    async updateConnectionStatus() {
        // Check AI configuration status
        const modelConfig = await this.stateService.settings.getModelConfig(this.stateService.ui.getSelectedModel() || 'chat');
        const hasAiConfig = modelConfig && modelConfig.provider && modelConfig.model;

        // Build AI status object
        const aiStatus = {};
        if (this.isStreaming) {
            aiStatus.connected = true;
            aiStatus.message = 'AI: Connected';
        } else if (hasAiConfig) {
            aiStatus.connecting = true;
            aiStatus.message = 'AI: Ready';
        } else {
            aiStatus.unavailable = true;
            aiStatus.message = 'AI: Not configured';
        }
        
        // Build MCP status object - only if MCP service exists
        const mcpStatus = {};
        if (this.stateService.mcp) {
            const mcpError = this.stateService.mcp.getMcpError();
            const isHTTPSDowngrade = this.stateService.mcp.isHTTPSDowngrade();
            
            if (this.stateService.mcp.isMcpConnected() && this.stateService.mcp.isMcpInitialized()) {
                mcpStatus.connected = true;
                mcpStatus.message = 'MCP: Connected';
            } else if (this.stateService.mcp.isMcpConnected() && !this.stateService.mcp.isMcpInitialized()) {
                mcpStatus.connecting = true;
                mcpStatus.message = 'MCP: Initializing...';
            } else if (isHTTPSDowngrade) {
                mcpStatus.unavailable = true;
                mcpStatus.message = 'MCP: Security downgrade (HTTPS to HTTP)';
            } else if (mcpError) {
                mcpStatus.disconnected = true;
                mcpStatus.message = `MCP: ${mcpError}`;
            } else if (this.stateService.mcp.getMcpServerUrl()) {
                mcpStatus.unavailable = true;
                mcpStatus.message = 'MCP: Disconnected';
            } else {
                mcpStatus.unavailable = true;
                mcpStatus.message = 'MCP: Not configured';
            }
        } else {
            mcpStatus.hidden = true;
        }
        
        // Build overall status message
        let message;
        if ((aiStatus.connected || aiStatus.connecting) && (mcpStatus.connected || mcpStatus.connecting)) {
            message = 'AI + MCP Ready';
        } else if (aiStatus.connected || aiStatus.connecting) {
            message = 'AI Ready';
        } else {
            message = 'AI Not configured';
        }
        
        // Update panel with new status format
        this.panel.updateConnectionStatus(message, aiStatus, mcpStatus);
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
    buildSystemPrompts(tools, ...prompts) {
        const systemPrompts = ["You are a helpful assistant analyzing web pages and helping users."];
        
        if (tools.length > 0) {
            systemPrompts.push(ToolFormatter.generateSystemPrompt(tools));
        }

        if (prompts.length > 0) {
            // Filter and add only non-empty prompts
            systemPrompts.push(...prompts.filter(prompt => prompt && prompt.trim() !== ''));
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
     * Handle stream started event
     */
    handleStreamStarted() {
        // Update FAB to show streaming indicator
        this.panel.updateFabStreamingState(true);
        this.isStreaming = true;
        this.updateConnectionStatus();
    }
    
    /**
     * Handle stream completed event
     */
    handleStreamCompleted() {
        // Reset FAB to normal state when streaming ends
        this.panel.updateFabStreamingState(false);
        this.isStreaming = false;
        this.updateConnectionStatus();
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
            this.panel.updateBrowserToolsSetting(this.stateService.ui.getUseBrowserTools());
            this.panel.updateAutoExecuteSetting(this.stateService.ui.getAutoExecuteTools());
            const selectedModel = this.stateService.ui.getSelectedModel() || 'chat';
            const currentConfig = this.stateService.settings.getModelConfig(selectedModel);
            this.panel.updateSelectedModelSetting(selectedModel, currentConfig?.model, currentConfig);
        }
    }

    /**
     * Ensure panel is initialized without showing it
     */
    async ensurePanelInitialized() {
        if (!this.panel.isReady()) {
            await this.panel.initialize();
            await this.updateConnectionStatus();
            if (this.stateService.prompts) {
                const activePrompts = this.stateService.prompts.getActivePrompts();
                // Sort by display order in the client
                const sortedPromptEntries = Object.entries(activePrompts)
                    .sort(([, a], [, b]) => (a.displayOrder || 0) - (b.displayOrder || 0));
                this.panel.setActivePrompts(sortedPromptEntries);
            }
            await this.loadCurrentConversation();
        }
    }

    /**
     * Show the panel
     */
    async showPanel() {
        await this.ensurePanelInitialized();
        
        this.panel.show();
        
        // Request host to persist visibility state
        this.eventBus.emit(EVENTS.CHAT.SAVE_PANEL_VISIBILITY, { visible: true }, { target: EVENT_CONTEXT.BACKGROUND });
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
     * Load the current conversation when the panel is shown
     */
    async loadCurrentConversation() {
        logger.log(this, 'Loading current conversation...');
        
        try {
            // Check if we already have an active thread
            const activeThreadId = this.stateService.conversation.getActiveThreadId();
            
            if (activeThreadId) {
                // Load the existing conversation into the panel
                const conversation = this.stateService.conversation.getConversation(activeThreadId);
                if (conversation && conversation.messages && conversation.messages.length > 0) {
                    logger.log(this, 'Loading existing conversation:', activeThreadId);
                    await this.handleConversationLoaded({ conversation });
                    return;
                }
            }
            
            // No active thread or empty conversation, get or create one
            logger.log(this, 'No active conversation found, requesting from background...');
            await this.sendGetOrCreateThread();
            
        } catch (error) {
            logger.error(this, 'Error loading current conversation:', error);
            // Don't show error to user, just create a new conversation silently
            await this.sendGetOrCreateThread({ createOnly: true });
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
     * @param {Object} options - Options for thread creation
     * @param {boolean} options.createOnly - Force creation of new thread, skip recovery
     */
    async sendGetOrCreateThread(options = {}) {
        logger.log(this, 'Requesting current conversation from host...', options);
        
        try {
            // Request the current conversation from the host
            const conversationData = await this.eventBus.emitAsync(EVENTS.CHAT.GET_OR_CREATE_THREAD, {
                ...this.pageUtils.getPageLocation(),
                ...options
            }, { target: EVENT_CONTEXT.BACKGROUND });

            logger.log(this, 'Current conversation loaded:', conversationData);

            // Handle the conversation result
            if (conversationData) {
                // Trigger the conversation loaded handler to update the panel
                await this.handleConversationLoaded({ conversation: conversationData });
            } else {
                logger.warn(this, 'Failed to load conversation or no conversation returned:', conversationData);
                this.panel.displayError('Failed to load conversation: No data returned');
            }
        } catch (error) {
            logger.error(this, 'Error loading conversation:', error);
            this.panel.displayError(`Failed to load conversation: ${error.message}`);
        }
    }

    /**
     * Handle thread saved event
     * @param {Object} data - { threadId, status, error }
     */
    handleThreadSaved(data) {
        logger.log(this, 'Thread saved event:', data);
        
        if (!this.panel) return;
        
        if (data.status === 'success') {
            this.panel.updateSaveIndicator('success');
        } else if (data.status === 'error') {
            this.panel.updateSaveIndicator('error', data.error || 'Failed to save thread');
        }
    }

    /**
     * Clean up the chat service
     */
    destroy() {
        // Cancel any ongoing streaming first
        if (this.responseHandler) {
            this.responseHandler.cancelStreaming();
        }

        if (this.panel) {
            this.panel.destroy();
        }
        
        if (this.messageBuilder) {
            this.messageBuilder.destroy();
        }
        
        if (this.mcpConnector) {
            this.mcpConnector.disconnect();
        }
        
        logger.log(this, 'Destroyed');
    }
}
