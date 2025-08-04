import { EVENTS } from '../js/core/events.js';
import { generateMessageId } from '../js/utils/id-generator.js';
import { ChatUIRenderer } from './chat-renderer.js';
import { buildToolMessages } from './message-utils.js';
import { logger } from '../js/core/logging.js';

/**
 * WebWire Panel - Manages the chat panel UI and interactions
 * All HTML generation is delegated to the WebWireUIRenderer
 */
export class WebChatPanel {
    constructor(eventBus, config = null) {
        this.eventBus = eventBus;
        this.config = config;
        this.renderer = new ChatUIRenderer(this.config);
        this.container = null;
        this.isInjected = false;
        this.isVisible = false;
        this.toolStash = {};
        
        // UI Elements
        this.elements = {};
        
        // State
        this.conversations = new Map();
        this.currentThreadId = null;
        this.isThinking = false;
        this.isScrollSticky = true; // Default to true for auto-scroll
        
        // Message counter for unique IDs
        this.messageCounter = 0;
        
    }

    /**
     * Initialize the panel
     */
    async initialize() {
        if (this.isInjected) return;

        logger.log(this, 'Initializing panel...');
        
        // Create and inject panel
        this.createContainer();
        this.injectHTML();
        this.cacheElements();
        this.setupEventListeners();
        
        // Initialize drawer state
        this.initializeDrawerState();
        
        // Add to DOM
        document.body.appendChild(this.container);
        this.isInjected = true;
        
        logger.log(this, 'Panel initialized successfully');
    }

    /**
     * Create the main container
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'ww-container';
    }

    /**
     * Inject HTML using renderer
     */
    injectHTML() {
        this.container.innerHTML = this.renderer.createContainerHTML();
    }

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            panel: this.container.querySelector('.ww-panel'),
            fab: this.container.querySelector('.ww-fab'),
            closeBtn: this.container.querySelector('#close-panel'),
            resyncBtn: this.container.querySelector('#resync'),
            swapConversationBtn: this.container.querySelector('#swap-conversation'),
            newConversationBtn: this.container.querySelector('#new-conversation'),
            chatContent: this.container.querySelector('.ww-content'),
            chatInput: this.container.querySelector('.ww-input'),
            reparseBtn: this.container.querySelector('.ww-reparse-button'),
            sendBtn: this.container.querySelector('.ww-send-button'),
            cancelBtn: this.container.querySelector('.ww-cancel-button'),
            statusIndicatorAi: this.container.querySelector('.ww-status-indicator-ai'),
            statusIndicatorMcp: this.container.querySelector('.ww-status-indicator-mcp') || null,
            statusText: this.container.querySelector('.ww-status-text'),
            saveIndicator: this.container.querySelector('.ww-save-indicator'),
            conversationId: this.container.querySelector('.ww-conversation-id'),
            pageContentCheckbox: this.container.querySelector('.ww-page-content-checkbox'),
            mcpCheckbox: this.container.querySelector('.ww-mcp-checkbox'),
            browserToolsCheckbox: this.container.querySelector('.ww-browser-tools-checkbox'),
            autoExecuteCheckbox: this.container.querySelector('.ww-auto-execute-checkbox'),
            backBtn: this.container.querySelector('.ww-back-button'),
            retryBtn: this.container.querySelector('.ww-retry-button'),
            drawerToggle: this.container.querySelector('.ww-drawer-toggle'),
            drawerContent: this.container.querySelector('.ww-drawer-content'),
            drawerSummary: this.container.querySelector('.ww-drawer-summary-text'),
            chevronIcon: this.container.querySelector('.ww-chevron-icon'),
            modelChatRadio: this.container.querySelector('.ww-model-chat'),
            modelThoughtRadio: this.container.querySelector('.ww-model-thought'),
            modelCodeRadio: this.container.querySelector('.ww-model-code'),
            modelCreativeRadio: this.container.querySelector('.ww-model-creative'),
            modelNameDisplay: this.container.querySelector('.ww-model-name'),
            modelTempDisplay: this.container.querySelector('.ww-model-temp'),
            modelMaxDisplay: this.container.querySelector('.ww-model-max'),
            modelConfigDisplay: this.container.querySelector('.ww-model-config'),
            tabIdDisplay: this.container.querySelector('.ww-tab-id')
        };
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Panel visibility
        this.setupVisibilityListeners();
        
        // Input handling
        this.setupInputListeners();
        
        // Action buttons
        this.setupActionListeners();
        
        // Delegated listeners
        this.setupDelegatedListeners();
        
        // Scroll listeners
        this.setupScrollListeners();
    }

    /**
     * Setup visibility-related listeners
     */
    setupVisibilityListeners() {
        this.elements.fab?.addEventListener('click', () => {
            // Request ChatService to show panel (which will handle both UI and persistence)
            this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, {
                panelVisible: true
            });
        });

        this.elements.closeBtn?.addEventListener('click', () => {
            // Request ChatService to hide panel (which will handle both UI and persistence)
            this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, {
                panelVisible: false
            });
        });
    }

    /**
     * Setup input-related listeners
     */
    setupInputListeners() {
        this.elements.sendBtn?.addEventListener('click', () => this.handleSendMessage());
        
        this.elements.cancelBtn?.addEventListener('click', () => this.handleCancelRequest());
        
        this.elements.chatInput?.addEventListener('input', () => {
            this.updateSendButton();
            this.autoResizeInput();
        });

        this.elements.chatInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    /**
     * Setup action button listeners
     */
    setupActionListeners() {
        this.elements.newConversationBtn?.addEventListener('click', () => {
            this.handleNewConversationRequest();
        });

        this.elements.resyncBtn?.addEventListener('click', () => {
            this.handleResync();
        });

        this.elements.swapConversationBtn?.addEventListener('click', () => {
            this.handleSwapConversation();
        });
        
        this.elements.saveIndicator?.addEventListener('click', () => {
            this.handleSaveConversation();
        });

        this.elements.drawerToggle?.addEventListener('click', () => {
            this.toggleDrawer();
        });

        this.elements.pageContentCheckbox?.addEventListener('change', (e) => {
            this.handlePageContentToggle(e.target.checked);
            this.updateDrawerSummary();
        });

        this.elements.mcpCheckbox?.addEventListener('change', (e) => {
            this.handleMcpToggle(e.target.checked);
            this.updateDrawerSummary();
        });

        this.elements.browserToolsCheckbox?.addEventListener('change', (e) => {
            this.handleBrowserToolsToggle(e.target.checked);
            this.updateDrawerSummary();
        });

        this.elements.autoExecuteCheckbox?.addEventListener('change', (e) => {
            this.handleAutoExecuteToggle(e.target.checked);
            this.updateDrawerSummary();
        });

        // Model selection radio buttons
        this.elements.modelChatRadio?.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.handleSelectedModelChange('chat');
                this.updateDrawerSummary();
            }
        });

        this.elements.modelThoughtRadio?.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.handleSelectedModelChange('thought');
                this.updateDrawerSummary();
            }
        });

        this.elements.modelCodeRadio?.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.handleSelectedModelChange('code');
                this.updateDrawerSummary();
            }
        });

        this.elements.modelCreativeRadio?.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.handleSelectedModelChange('creative');
                this.updateDrawerSummary();
            }
        });

        this.elements.reparseBtn?.addEventListener('click', () => {
            this.handleReparseRequest();
        });

        this.elements.retryBtn?.addEventListener('click', () => {
            this.handleReplayLastTurn();
        });

        this.elements.backBtn?.addEventListener('click', () => {
            this.handleBackButton();
        });
    }

    /**
     * Setup delegated event listeners
     */
    setupDelegatedListeners() {
        this.elements.chatContent?.addEventListener('click', (e) => {
            // Copy button handling
            const copyButton = e.target.closest('.ww-copy-button');
            if (copyButton) {
                this.handleCopyMessage(copyButton);
                return;
            }
            
            // Play button handling
            const playButton = e.target.closest('.ww-play-button');
            if (playButton) {
                this.handlePlayMessage(playButton);
                return;
            }

            // Tool button handling
            const toolButton = e.target.closest('.ww-tool-btn');
            if (toolButton) {
                this.handleToolButtonClick(toolButton);
                return;
            }

            // Dynamic prompt buttons (in welcome message)
            const promptButton = e.target.closest('[data-prompt-id]');
            if (promptButton) {
                const promptId = promptButton.dataset.promptId;
                this.handlePromptRequest(promptId);
            }
        });
    }

    /**
     * Setup scroll event listeners for sticky behavior
     */
    setupScrollListeners() {
        if (!this.elements.chatContent) return;

        this.elements.chatContent.addEventListener('scroll', () => {
            const element = this.elements.chatContent;
            const threshold = 5; // Allow small tolerance for precision issues
            
            // Check if user is at the bottom
            const isAtBottom = element.scrollTop >= element.scrollHeight - element.clientHeight - threshold;
            
            // Update sticky state based on scroll position
            if (isAtBottom) {
                // Re-enable sticky when user scrolls to bottom
                this.isScrollSticky = true;
            } else if (this.isScrollSticky) {
                // Disable sticky when user scrolls away from bottom
                this.isScrollSticky = false;
            }
        });
    }

    /**
     * Handle tool button clicks
     */
    handleToolButtonClick(button) {
        const toolMessage = button.closest('.ww-tool-message');
        if (!toolMessage) return;

        const action = button.dataset.action;
        const name = toolMessage.dataset.toolName;
        const messageId = toolMessage.dataset.messageId;
        const callId = toolMessage.dataset.callId;
        const parameters = this.toolStash?.[callId]?.parameters;

        const eventName = action === 'execute' 
            ? EVENTS.CHAT.EXECUTE_TOOL 
            : EVENTS.CHAT.CANCEL_TOOL;

        logger.log(this, 'handleToolButtonClick:', eventName, { messageId, callId, name, parameters });

        this.eventBus.emit(eventName, { messageId, callId, name, parameters });
    }

    /**
     * Display a message
     */
    displayMessage(message, {autoScroll = false, ...options} = {}) {
        logger.log(this, 'displayMessage:', message, options);

        this.prepareForMessage();
        
        if (!message || !this.elements.chatContent) {
            logger.log(this, 'Missing message or chatContent');
            return;
        }

        // Ensure message has ID
        if (!message.messageId && !message.id) {
            message.messageId = generateMessageId();
        }

        // Create and append message element
        const messageEl = this.renderer.createMessageElement(message, options);

        this.elements.chatContent.appendChild(messageEl);
        
        if (autoScroll) {
            this.scrollToBottom();
        }

        return messageEl;
    }

    /**
     * Display a thinking message
     */
    displayThinkingMessage(message, options) {
        logger.log(this, 'displayThinkingMessage:', message);
        
        this.prepareForMessage();

        options.isThinking = true;
        const messageEl = this.renderer.createMessageElement(message, options);

        this.elements.chatContent.appendChild(messageEl);
        this.scrollToBottom();
        
        // Show cancel button during streaming
        this.showCancelButton();
        
        return messageEl;
    }

    /**
     * Update streaming message content
     */
    updateStreamingMessage(messageId, content) {
        const messageEl = this.container.querySelector(`#${messageId}`);
        if (!messageEl) {
            logger.log(this, 'Message not found:', messageId);
            return;
        }

        const streamingContent = messageEl.querySelector('.ww-streaming-content');
        this.renderer.updateStreamingContent(streamingContent, content);
        this.scrollToBottom();
    }

    /**
     * Finalize a thinking message
     */
    finalizeThinkingMessage(messageId, finalContent, toolMessages = []) {
        logger.log(this, 'finalizeThinkingMessage:', messageId);
        
        const messageEl = this.container.querySelector(`#${messageId}`);
        if (!messageEl) {
            logger.log(this, 'Message not found for finalization:', messageId);
            return;
        }

        // Update classes
        messageEl.classList.remove('ww-thinking');
        messageEl.classList.add('ww-assistant');
        
        // Update content
        const messageContent = messageEl.querySelector('.ww-content');
        if (messageContent) {
            logger.log(this, 'Updating message content:', finalContent, toolMessages);
            messageContent.innerHTML = this.renderer.createFinalizedMessageHTML(
                finalContent, 
                toolMessages,
                messageId
            );
        }
        
        // Add play and copy buttons to message actions
        const messageActions = messageEl.querySelector('.ww-message-actions');
        if (messageActions) {
            const timeEl = messageActions.querySelector('.ww-time');
            if (timeEl) {
                timeEl.insertAdjacentHTML('beforebegin', this.renderer.createPlayButtonHTML(messageId));
                timeEl.insertAdjacentHTML('beforebegin', this.renderer.createCopyButtonHTML(messageId));
            }
        }
        
        this.scrollToBottom();
        
        // Hide cancel button when streaming is complete
        this.hideCancelButton();
    }

    /**
     * Remove the last message from the panel
     */
    removeLastMessage() {
        const lastMessage = this.elements.chatContent?.lastElementChild;
        lastMessage?.remove();
    }

    /**
     * Remove a message
     */
    removeMessage(messageId) {
        const messageEl = this.container.querySelector(`#${messageId}`);
        if (messageEl) {
            messageEl.remove();
        }
    }

    /**
     * Display error message
     */
    displayError(error, thinkingMessageId = null, options = {}) {
        if (thinkingMessageId) {
            this.removeMessage(thinkingMessageId);
        }
        
        // Handle special error display options for extension invalidation
        if (options.persistent || options.actionButton) {
            const messageId = `error-${Date.now()}`;
            
            // Create error message with action button
            const errorContent = `
                <div class="ww-error-content">
                    <div class="ww-error-icon">⚠️</div>
                    <div class="ww-error-text">${this.renderer.escapeHTML(error)}</div>
                    ${options.actionButton ? `
                        <button class="ww-error-action-btn ww-button">
                            ${this.renderer.escapeHTML(options.actionButton.text)}
                        </button>
                    ` : ''}
                </div>
            `;
            
            const messageElement = document.createElement('div');
            messageElement.className = 'ww-message ww-error-message ww-persistent-error';
            messageElement.id = messageId;
            messageElement.innerHTML = errorContent;
            
            this.elements.messages.appendChild(messageElement);
            
            // Bind action button if provided
            if (options.actionButton) {
                const actionBtn = messageElement.querySelector('.ww-error-action-btn');
                if (actionBtn) {
                    actionBtn.addEventListener('click', options.actionButton.action);
                }
            }
            
            this.scrollToBottom();
        } else {
            // Standard error display
            this.displayMessage({
                role: 'error',
                content: error,
                timestamp: Date.now()
            });
        }
        
        // Hide cancel button on error
        this.hideCancelButton();
    }

    /**
     * Update tool result
     */
    updateToolResult(msgCallId, {name, result, success, error, callId, executionTime, ...results} = {}) {
        const toolEl = this.container.querySelector(`#${callId}`);
        if (!toolEl) {
            logger.warn(this, 'Tool element not found:', callId);
            return;
        }

        const updatedTool = {
            callId,
            name,
            display: success ? 'success' : 'error',
            result: result,
            error: success ? undefined : error,
            executionTime: executionTime,
            ...results
        };

        // Replace with updated HTML
        const newHTML = this.renderer.createToolMessageHTML(updatedTool);
        toolEl.outerHTML = newHTML;
    }

    /**
     * Display a conversation
     */
    displayConversation(conversation, options = {}) {
        if (!conversation) return;

        this.clearMessages();

        // If no messages, just update the thread ID and return (welcome message already shown by clearMessages)
        if (!conversation.messages || conversation.messages.length === 0) {
            this.updateConversationIdDisplay(conversation.threadId);
            this.updateReparseButton(false);
            this.updateRetryButton(false);
        this.updateBackButton(false);
            this.updateBackButton(false);
            return;
        }

        let userMessage = false;

        conversation.messages.forEach((message, index) => {
            if (message.role === 'system') return;

            if (message.role === 'user') {
                userMessage = true;
            }
            
            // Skip messages marked as retried or dropped
            if (message.status === 'retried' || message.status === 'dropped') return;
            
            // Filter out non-success messages, except the last message
            const isLastMessage = index === conversation.messages.length - 1;
            if (!isLastMessage && message.status && message.status !== 'success') return;

            const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);
            logger.log(this, 'displayConversation toolMessages:', message.role, toolMessages);

            this.toolStash = {
                ...this.toolStash,
                ...toolMessages.reduce((acc, msg) => {
                    acc[msg.callId] = msg;
                    return acc;
                }, {})
            }
            this.displayMessage(message, {
                renderTools: toolMessages.length > 0,
                toolMessages,
                ...options
            });
        });

        this.updateConversationIdDisplay(conversation.threadId);
        this.updateReparseButton(conversation.messages.length > 0);
        this.updateRetryButton(userMessage);
        this.updateBackButton(userMessage);
        this.scrollToBottom();
    }

    /**
     * Load conversation with options
     * @deprecated
     */
    loadConversation(conversation, options = {}) {
        const { renderTools = true } = options;
        
        if (!conversation?.messages) return;

        this.clearMessages();
        this.currentThreadId = conversation.threadId;

        let userMessage = false;

        conversation.messages.forEach((message, index) => {
            if (message.role === 'system') return;
            
            if (message.role === 'user') {
                userMessage = true;
            }
            
            // Skip messages marked as retried or dropped
            if (message.status === 'retried' || message.status === 'dropped') return;
            
            // Filter out non-success messages, except the last message
            const isLastMessage = index === conversation.messages.length - 1;
            if (!isLastMessage && message.status && message.status !== 'success') return;
            
            const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);
            logger.log(this, 'loadConversation:', toolMessages);

            this.toolStash = {
                ...this.toolStash,
                ...toolMessages.reduce((acc, msg) => {
                    acc[msg.callId] = msg;
                    return acc;
                }, {})
            }

            this.displayMessage(message, {
                renderTools: renderTools && toolMessages.length > 0,
                toolMessages,
                ...options
            });
        });

        this.updateConversationIdDisplay(conversation.threadId);
        this.updateReparseButton(conversation.messages.length > 0);
        this.updateRetryButton(userMessage);
        this.updateBackButton(userMessage);
        this.scrollToBottom();
    }

    /**
     * Prepare chat area for new message
     */
    prepareForMessage() {
        this.removeWelcomeMessage();
        this.removeErrorMessages();
    }

    /**
     * Show welcome message
     * @param {Object} activePrompts - Active prompts to display as buttons
     */
    showWelcomeMessage(activePrompts = {}) {
        if (!this.elements.chatContent) return;
        
        const welcomeEl = this.renderer.createWelcomeElement(activePrompts);
        this.elements.chatContent.appendChild(welcomeEl);
    }

    /**
     * Remove welcome message
     */
    removeWelcomeMessage() {
        const welcome = this.elements.chatContent?.querySelector('.ww-welcome-message');
        welcome?.remove();
    }

    /**
     * Clear thinking messages from the panel
     */
    removeThinkingMessages() {
        // Also check for any "thinking" messages that might be stuck in the UI
        const thinkingMessages = this.container?.querySelectorAll('.ww-thinking');
        if (thinkingMessages && thinkingMessages.length > 0) {
            logger.log(this, 'Found thinking messages during retry, removing them');
            thinkingMessages.forEach(msg => msg.remove());
        }
    }

    /**
     * Remove error messages
     */
    removeErrorMessages() {
        const errors = this.elements.chatContent?.querySelectorAll('.ww-message.ww-error');
        errors?.forEach(error => error.remove());
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        if (this.elements.chatContent) {
            this.elements.chatContent.innerHTML = '';
            this.showWelcomeMessage(this.activePrompts);
        }
    }
    
    /**
     * Set active prompts and refresh welcome message if visible
     * @param {Object} activePrompts - Active prompts from state service
     */
    setActivePrompts(activePrompts) {
        this.activePrompts = activePrompts;
        
        // If welcome message is currently visible, refresh it
        const existingWelcome = this.elements.chatContent?.querySelector('.ww-welcome-message');
        if (existingWelcome) {
            existingWelcome.remove();
            this.showWelcomeMessage(activePrompts);
        }
    }

    /**
     * Panel visibility methods
     */
    show() {
        if (!this.isInjected) return;
        
        this.elements.panel?.classList.remove('hidden');
        this.elements.fab?.classList.add('hidden');
        this.isVisible = true;
        
        setTimeout(() => {
            this.elements.chatInput?.focus();
        }, 300);
    }

    hide() {
        this.elements.panel?.classList.add('hidden');
        this.elements.fab?.classList.remove('hidden');
        this.isVisible = false;
    }

    toggle() {
        this.isVisible ? this.hide() : this.show();
    }
    
    /**
     * Update FAB for streaming state
     */
    updateFabStreamingState(isStreaming) {
        if (!this.elements.fab) return;
        
        if (isStreaming) {
            this.elements.fab.classList.add('ww-streaming');
            this.elements.fab.innerHTML = this.renderer.createStreamingFabContent();
        } else {
            this.elements.fab.classList.remove('ww-streaming');
            this.elements.fab.innerHTML = this.renderer.createNormalFabContent();
        }
    }

    /**
     * UI state updates
     */
    updateSendButton() {
        const hasText = this.elements.chatInput?.value.trim().length > 0;
        if (this.elements.sendBtn) {
            this.elements.sendBtn.disabled = !hasText;
        }
    }
    
    showCancelButton() {
        if (this.elements.cancelBtn) {
            this.elements.cancelBtn.style.display = 'flex';
            this.elements.sendBtn.style.display = 'none';
        }
        // Disable retry button during streaming
        this.updateRetryButton(false);
        this.updateBackButton(false);
    }
    
    hideCancelButton() {
        if (this.elements.cancelBtn) {
            this.elements.cancelBtn.style.display = 'none';
            this.elements.sendBtn.style.display = 'flex';
        }
        // Re-enable retry button if there's a user message to retry
        this.updateRetryButton(true);
        this.updateBackButton(true);
    }

    updateReparseButton(visible) {
        if (this.elements.reparseBtn) {
            this.elements.reparseBtn.style.display = 'none';
            this.elements.reparseBtn.disabled = true;
        }
    }

    updateRetryButton(visible) {
        if (this.elements.retryBtn) {
            this.elements.retryBtn.disabled = !visible;
        }
    }

    updateBackButton(visible) {
        if (this.elements.backBtn) {
            this.elements.backBtn.disabled = !visible;
        }
    }

    updatePageContentSetting(includeContent) {
        if (this.elements.pageContentCheckbox) {
            this.elements.pageContentCheckbox.checked = includeContent;
        }
    }

    updateMcpSetting(useMcp) {
        if (this.elements.mcpCheckbox) {
            this.elements.mcpCheckbox.checked = useMcp;
        }
    }

    updateBrowserToolsSetting(useBrowserTools) {
        if (this.elements.browserToolsCheckbox) {
            this.elements.browserToolsCheckbox.checked = useBrowserTools;
        }
    }

    updateAutoExecuteSetting(autoExecuteTools) {
        if (this.elements.autoExecuteCheckbox) {
            this.elements.autoExecuteCheckbox.checked = autoExecuteTools;
        }
    }

    updateSelectedModelSetting(selectedModel, actualModelName, modelConfig) {
        if (selectedModel === 'chat' && this.elements.modelChatRadio) {
            this.elements.modelChatRadio.checked = true;
        } else if (selectedModel === 'thought' && this.elements.modelThoughtRadio) {
            this.elements.modelThoughtRadio.checked = true;
        } else if (selectedModel === 'tool' && this.elements.modelToolRadio) {
            this.elements.modelToolRadio.checked = true;
        } else if (selectedModel === 'creative' && this.elements.modelCreativeRadio) {
            this.elements.modelCreativeRadio.checked = true;
        }
        
        // Update the model name display
        if (this.elements.modelNameDisplay) {
            this.elements.modelNameDisplay.textContent = actualModelName || '-';
        }
        
        // Update temperature and max tokens displays
        if (this.elements.modelTempDisplay && modelConfig?.samplerConfig) {
            const temp = modelConfig.samplerConfig.temperature;
            this.elements.modelTempDisplay.textContent = `Temp: ${temp !== undefined ? temp : '-'}`;
        }
        
        if (this.elements.modelMaxDisplay && modelConfig?.samplerConfig) {
            const maxContentTokens = modelConfig.samplerConfig.maxContentTokens;
            this.elements.modelMaxDisplay.textContent = `Max: ${maxContentTokens !== undefined ? maxContentTokens : '-'}`;
        }
        
        // Update model config indicators
        if (this.elements.modelConfigDisplay) {
            const minimalEmoji = modelConfig?.minimalMode ? '🗜️' : '';
            this.elements.modelConfigDisplay.textContent = minimalEmoji;
        }
    }

    updateConversationIdDisplay(threadId) {
        if (!this.elements.conversationId) return;

        if (threadId) {
            const shortId = threadId.split('-').slice(-1).join('-');
            this.elements.conversationId.textContent = `Thread: ${shortId}`;
            this.elements.conversationId.title = `Full ID: ${threadId}`;
        } else {
            this.elements.conversationId.textContent = 'Ready for conversation';
            this.elements.conversationId.title = '';
        }
    }

    updateConnectionStatus(message, ai = {connected: undefined, connecting: undefined, unavailable: undefined, disconnected: undefined, message: undefined}, mcp = {connected: undefined, connecting: undefined, unavailable: undefined, disconnected: undefined, message: undefined, hidden: undefined}) {
        if (!this.elements.statusText || !this.elements.statusIndicatorAi) return;

        const colors = {
            'connected': '#10b981',     // Keep original green
            'connecting': '#059669',    // Darker green for "ready"
            'unavailable': '#6b7280',   // Gray
            'disconnected': '#ef4444'
        }

        // Clear all classes first
        this.elements.statusIndicatorAi.classList.remove('connecting', 'streaming');
        this.elements.statusIndicatorMcp?.classList.remove('connecting');

        // Handle AI indicator
        this.elements.statusIndicatorAi.style.color = ai.connected ? colors.connected : ai.connecting ? colors.connecting : ai.unavailable ? colors.unavailable : colors.disconnected;
        this.elements.statusIndicatorAi.title = ai.message || 'AI: Disconnected';
        
        // Add streaming class for AI when connected
        if (ai.connected) {
            this.elements.statusIndicatorAi.classList.add('streaming');
        }
        
        // Handle MCP indicator - only if it exists
        if (this.elements.statusIndicatorMcp) {
            if (mcp.hidden) {
                this.elements.statusIndicatorMcp.style.display = 'none';
            } else {
                this.elements.statusIndicatorMcp.style.display = 'inline-block';
                this.elements.statusIndicatorMcp.style.color = mcp.connected ? colors.connected : mcp.connecting ? colors.connecting : mcp.unavailable ? colors.unavailable : colors.disconnected;
                this.elements.statusIndicatorMcp.title = mcp.message || 'MCP: Disconnected';
            }
        }
        
        this.elements.statusText.textContent = message || 'Configuring...';
    }

    updateTabIdDisplay(tabId) {
        if (!this.elements.tabIdDisplay) return;
        
        if (tabId) {
            this.elements.tabIdDisplay.textContent = `Tab ${tabId}`;
            this.elements.tabIdDisplay.style.display = 'block';
        } else {
            this.elements.tabIdDisplay.style.display = 'none';
        }
    }

    /**
     * Input handling
     */
    autoResizeInput() {
        if (this.elements.chatInput) {
            this.elements.chatInput.style.height = 'auto';
            this.elements.chatInput.style.height = this.elements.chatInput.scrollHeight + 'px';
        }
    }

    scrollToBottom() {
        if (this.elements.chatContent && this.isScrollSticky) {
            this.elements.chatContent.scrollTop = this.elements.chatContent.scrollHeight;
        }
    }

    /**
     * Event handlers
     */
    handleSendMessage(predefinedMessage = null) {
        const message = predefinedMessage || this.elements.chatInput?.value.trim();
        if (!message) return;

        // Re-enable sticky scroll when user sends a new message
        this.isScrollSticky = true;

        if (!predefinedMessage && this.elements.chatInput) {
            this.elements.chatInput.value = '';
            this.elements.chatInput.style.height = 'auto';
        }

        this.updateSendButton();
        this.eventBus.emit(EVENTS.CHAT.SEND_MESSAGE, { message });
    }
    
    handleCancelRequest() {
        logger.log(this, 'Cancel request');
        this.eventBus.emit(EVENTS.CHAT.CANCEL_STREAM, {});
        this.hideCancelButton();
    }

    /**
     * Handle copy message button click
     */
    async handleCopyMessage(button) {
        const messageId = button.dataset.messageId;
        
        if (!messageId) {
            logger.warn(this, 'Copy button clicked but no messageId found');
            return;
        }

        logger.log(this, 'Copy message request for ID:', messageId);
        
        // Extract content directly from the message element
        const messageEl = button.closest('.ww-message');
        let content = '';
        
        if (messageEl) {
            const contentEl = messageEl.querySelector('.ww-content');
            if (contentEl) {
                // Get text content, removing any HTML tags but preserving line breaks
                content = contentEl.innerText || contentEl.textContent || '';
            }
        }
        
        // Emit event with both messageId and content as fallback
        await this.eventBus.emitAsync(EVENTS.CHAT.COPY_MESSAGE, { 
            messageId,
            content 
        });
        
        // Show visual feedback on button
        this.showCopyFeedback(button);
    }
    
    /**
     * Handle play message button click
     */
    async handlePlayMessage(button) {
        const messageId = button.dataset.messageId;
        
        if (!messageId) {
            logger.warn(this, 'Play button clicked but no messageId found');
            return;
        }
        
        // Determine action based on button state
        let action = 'play';
        
        if (button.classList.contains('ww-speaking')) {
            if (button.classList.contains('ww-paused')) {
                action = 'resume';
            } else {
                action = 'pause';
            }
        }
        
        logger.log(this, 'Play audio request for message:', messageId, 'action:', action);
        
        try {
            const onComplete = () => {
                logger.log(this, 'Speech completed successfully');
                this.updatePlayButton(messageId, 'play');
            }

            const onError = (error) => {
                logger.error(this, 'Failed to play audio:', error);
                this.updatePlayButton(messageId, 'play');
            }
            // Emit event to browser event handlers
            await this.eventBus.emitAsync(EVENTS.CHAT.PLAY_AUDIO, { 
                messageId, 
                action 
            }, {
                onComplete,
                onError
            });
            
            // Update button state based on successful action
            let newState;
            switch (action) {
                case 'play':
                    newState = 'playing';
                    break;
                case 'pause':
                    newState = 'paused';
                    break;
                case 'resume':
                    newState = 'playing';
                    break;
                case 'stop':
                    newState = 'stopped';
                    break;
                default:
                    newState = 'stopped';
            }
            
            this.updatePlayButton(messageId, newState);
            
        } catch (error) {
            logger.error(this, 'Play audio failed:', error);
            // Reset button to stopped state on error
            this.updatePlayButton(messageId, 'stopped');
        }
    }
    
    /**
     * Update play button state based on audio status
     * @param {string} messageId - The message ID
     * @param {string} state - The button state: 'playing', 'paused', 'stopped'
     */
    updatePlayButton(messageId, state) {
        const button = this.container.querySelector(`.ww-play-button[data-message-id="${messageId}"]`);
        if (!button) {
            logger.warn(this, 'Play button not found for message:', messageId);
            return;
        }
        
        switch (state) {
            case 'playing':
                button.classList.add('ww-speaking');
                button.classList.remove('ww-paused');
                button.innerHTML = this.renderer.templates.icons.pause;
                button.setAttribute('title', 'Pause message');
                break;
                
            case 'paused':
                button.classList.add('ww-speaking', 'ww-paused');
                button.innerHTML = this.renderer.templates.icons.play;
                button.setAttribute('title', 'Resume message');
                break;
                
            case 'stopped':
            default:
                button.classList.remove('ww-speaking', 'ww-paused');
                button.innerHTML = this.renderer.templates.icons.play;
                button.setAttribute('title', 'Play message');
                break;
        }
    }

    /**
     * Show visual feedback for copy operation
     */
    showCopyFeedback(button) {
        const originalHTML = button.innerHTML;
        const originalTitle = button.title;
        
        // Show success feedback
        button.innerHTML = '✓';
        button.title = 'Copied!';
        button.classList.add('ww-copy-success');
        
        // Reset after delay
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.title = originalTitle;
            button.classList.remove('ww-copy-success');
        }, 1500);
    }

    /**
     * Handle prompt request with prompt ID
     */
    handlePromptRequest(promptId) {
        this.eventBus.emit(EVENTS.CHAT.ANALYZE_PAGE, { promptId });
    }

    handleNewConversationRequest() {
        logger.log(this, 'New conversation requested');
        this.clearMessages();
        this.updateConversationIdDisplay(null);
        this.updateRetryButton(false);
        this.updateBackButton(false);
        this.eventBus.emit(EVENTS.CHAT.START_NEW_CONVERSATION, {});
    }

    handleReplayLastTurn() {
        logger.log(this, 'Replay last turn requested');
        this.eventBus.emit(EVENTS.CHAT.REPLAY_LAST_TURN, {});
    }

    handleBackButton() {
        logger.log(this, 'Back button clicked');
        this.eventBus.emit(EVENTS.CHAT.BACK_BUTTON, {});
    }

    handleResync() {
        logger.log(this, 'Resync requested');
        this.eventBus.emit(EVENTS.CHAT.RESYNC, {});
    }

    handleSwapConversation() {
        logger.log(this, 'Swap conversation requested');
        this.eventBus.emit(EVENTS.CHAT.SWAP_CONVERSATION, {});
    }
    
    /**
     * Handle save conversation request
     */
    async handleSaveConversation() {
        logger.log(this, 'Save conversation requested');
        
        // Show saving state
        this.updateSaveIndicator('saving');
        
        try {
            // Emit async event to save conversation
            const result = await this.eventBus.emitAsync(EVENTS.CHAT.UPDATE_CONVERSATION);
            
            // Result will be handled by THREAD_SAVED event
            logger.log(this, 'Save conversation result:', result);
        } catch (error) {
            logger.error(this, 'Failed to save conversation:', error);
            this.updateSaveIndicator('error', error.message || 'Failed to save conversation');
        }
    }

    handleReparseRequest() {
        logger.log(this, 'Reparse requested');
        this.eventBus.emit(EVENTS.CHAT.REPARSE_MESSAGE, {});
    }

    handlePageContentToggle(includeContent) {
        logger.log(this, 'Page content toggle:', includeContent);
        this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, { 
            includePageContent: includeContent 
        });
    }

    handleMcpToggle(useMcp) {
        logger.log(this, 'MCP tools toggle:', useMcp);
        this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, { 
            useMCP: useMcp 
        });
    }

    handleBrowserToolsToggle(useBrowserTools) {
        logger.log(this, 'Browser tools toggle:', useBrowserTools);
        this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, { 
            useBrowserTools: useBrowserTools 
        });
    }

    handleAutoExecuteToggle(autoExecuteTools) {
        logger.log(this, 'Auto-execute tools toggle:', autoExecuteTools);
        this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, { 
            autoExecuteTools: autoExecuteTools 
        });
    }

    handleSelectedModelChange(selectedModel) {
        logger.log(this, 'Selected model change:', selectedModel);
        this.eventBus.emit(EVENTS.CHAT.TOGGLE_UI_SETTING, { 
            selectedModel: selectedModel 
        });
    }

    handleInitialState(state) {
        logger.log(this, 'Handling initial state:', state);
        
        if (state.includePageContent !== undefined) {
            this.updatePageContentSetting(state.includePageContent);
        }
        
        if (state.useMCP !== undefined) {
            this.updateMcpSetting(state.useMCP);
        }

        if (state.useBrowserTools !== undefined) {
            this.updateBrowserToolsSetting(state.useBrowserTools);
        }

        if (state.autoExecuteTools !== undefined) {
            this.updateAutoExecuteSetting(state.autoExecuteTools);
        }

        if (state.selectedModel !== undefined) {
            this.updateSelectedModelSetting(state.selectedModel, state.modelConfig?.model, state.modelConfig);
        }
        
        // Update tab ID display if available
        if (state.tabId !== undefined) {
            this.updateTabIdDisplay(state.tabId);
        }
        
        // Update drawer summary after setting initial state
        this.updateDrawerSummary();
        
        if (state.currentThread?.messages) {
            this.displayConversation(state.currentThread, state.messageOptions);
        }
    }

    /**
     * Show error notification
     */
    showErrorNotification(message) {
        logger.error(this, 'WebWire Error:', message);
        
        const notification = document.createElement('div');
        notification.innerHTML = this.renderer.createErrorNotificationHTML(message);
        document.body.appendChild(notification.firstChild);
        
        setTimeout(() => {
            const notif = document.querySelector('.ww-notification');
            notif?.remove();
        }, 5000);
    }

    /**
     * Lifecycle methods
     */
    isReady() {
        return this.isInjected;
    }

    destroy() {
        if (this.container?.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        const style = document.getElementById('webwire-panel-styles');
        style?.remove();
        
        this.isInjected = false;
        this.isVisible = false;
    }

    /**
     * Set page content checkbox state
     */
    setPageContentCheckboxState(isChecked) {
        if (this.elements.pageContentCheckbox) {
            this.elements.pageContentCheckbox.checked = isChecked;
        }
    }

    /**
     * Get last chat message element
     */
    getLastChatMessageElement() {
        const chatMessages = this.container.querySelectorAll('.ww-message');
        if (chatMessages.length > 0) {
            return chatMessages[chatMessages.length - 1];
        }
        return null;
    }

    /**
     * Update the conversation
     */
    updateConversation(conversation, options = {}) {
        this.clearMessages();
        this.displayConversation(conversation, options);
    }

    /**
     * Initialize drawer in collapsed state
     */
    initializeDrawerState() {
        if (this.elements.drawerContent) {
            this.elements.drawerContent.classList.add('collapsed');
        }
        this.updateDrawerSummary();
    }

    /**
     * Toggle the settings drawer
     */
    toggleDrawer() {
        if (!this.elements.drawerContent || !this.elements.chevronIcon) return;
        
        const isOpen = !this.elements.drawerContent.classList.contains('collapsed');
        
        if (isOpen) {
            this.elements.drawerContent.classList.add('collapsed');
            this.elements.chevronIcon.style.transform = 'rotate(0deg)';
        } else {
            this.elements.drawerContent.classList.remove('collapsed');
            this.elements.chevronIcon.style.transform = 'rotate(180deg)';
        }
    }

    /**
     * Update the drawer summary text based on checked items
     */
    updateDrawerSummary() {
        if (!this.elements.drawerSummary) return;
        
        const enabledFeatures = [];
        
        if (this.elements.pageContentCheckbox?.checked) {
            enabledFeatures.push('Page Content');
        }
        if (this.elements.mcpCheckbox?.checked) {
            enabledFeatures.push('MCP');
        }
        if (this.elements.browserToolsCheckbox?.checked) {
            enabledFeatures.push('Browser Tools');
        }
        if (this.elements.autoExecuteCheckbox?.checked) {
            enabledFeatures.push('Auto-Execute');
        }
        
        if (enabledFeatures.length === 0) {
            this.elements.drawerSummary.textContent = 'All features disabled';
        } else if (enabledFeatures.length === 4) {
            this.elements.drawerSummary.textContent = 'All features enabled';
        } else {
            this.elements.drawerSummary.textContent = `Enabled: ${enabledFeatures.join(', ')}`;
        }
    }
    
    /**
     * Update save indicator status
     * @param {string} status - 'success' or 'error'
     * @param {string} errorMessage - Error message for tooltip (optional)
     */
    updateSaveIndicator(status, errorMessage = null, options = {}) {
        if (!this.elements.saveIndicator) return;

        const { expireTime = 5000 } = options;
        
        // Clear any existing timeout
        if (this.saveIndicatorTimeout) {
            clearTimeout(this.saveIndicatorTimeout);
            this.saveIndicatorTimeout = null;
        }
        
        // Remove existing classes
        this.elements.saveIndicator.classList.remove('ww-saving', 'ww-saved', 'ww-error');
        
        if (status === 'saving') {
            // Turn green while saving
            this.elements.saveIndicator.classList.add('ww-saving');
            this.elements.saveIndicator.setAttribute('title', 'Saving...');
        } else if (status === 'success') {
            // Turn gold for success
            this.elements.saveIndicator.classList.add('ww-saved');
            
            // Set last saved time tooltip
            const now = new Date();
            const timeStr = now.toLocaleTimeString();
            this.elements.saveIndicator.setAttribute('title', `Last saved: ${timeStr}`);
            
            // Reset to default after 5 seconds
            this.saveIndicatorTimeout = setTimeout(() => {
                this.elements.saveIndicator.classList.remove('ww-saved');
                // Keep the tooltip showing last saved time
            }, expireTime);
        } else if (status === 'error') {
            // Turn red for error
            this.elements.saveIndicator.classList.add('ww-error');
            
            // Set error tooltip if provided
            if (errorMessage) {
                this.elements.saveIndicator.setAttribute('title', errorMessage);
            }
            // Error state persists until cleared
        }
    }
    
    /**
     * Clear save indicator error state
     */
    clearSaveIndicator() {
        if (!this.elements.saveIndicator) return;
        
        this.elements.saveIndicator.classList.remove('ww-error', 'ww-saved');
        this.elements.saveIndicator.removeAttribute('title');
        
        if (this.saveIndicatorTimeout) {
            clearTimeout(this.saveIndicatorTimeout);
            this.saveIndicatorTimeout = null;
        }
    }
}