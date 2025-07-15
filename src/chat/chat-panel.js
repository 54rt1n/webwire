import { EVENTS } from '../js/core/events.js';
import { generateMessageId } from '../js/utils/id-generator.js';
import { ChatUIRenderer } from './chat-renderer.js';
import { buildToolMessages } from './message-utils.js';

/**
 * WebWire Panel - Manages the chat panel UI and interactions
 * All HTML generation is delegated to the WebWireUIRenderer
 */
export class WebChatPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.renderer = new ChatUIRenderer();
        this.currentSettings = null;
        this.container = null;
        this.isInjected = false;
        this.isVisible = false;
        
        // UI Elements
        this.elements = {};
        
        // State
        this.conversations = new Map();
        this.currentThreadId = null;
        this.isThinking = false;
        
        // Message counter for unique IDs
        this.messageCounter = 0;
    }

    /**
     * Initialize the panel
     */
    async initialize() {
        if (this.isInjected) return;

        console.log('[WebChatPanel] Initializing panel...');
        
        // Create and inject panel
        this.createContainer();
        this.injectHTML();
        this.cacheElements();
        this.setupEventListeners();
        
        // Add to DOM
        document.body.appendChild(this.container);
        this.isInjected = true;
        
        console.log('[WebChatPanel] Panel initialized successfully');
    }

    /**
     * Create the main container
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'webwire-container';
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
            replayTurnBtn: this.container.querySelector('#replay-turn'),
            analyzePageBtn: this.container.querySelector('#analyze-page-btn'),
            newConversationBtn: this.container.querySelector('#new-conversation'),
            chatContent: this.container.querySelector('.content'),
            chatInput: this.container.querySelector('.input'),
            reparseBtn: this.container.querySelector('.reparse-button'),
            sendBtn: this.container.querySelector('.send-button'),
            statusIndicator: this.container.querySelector('.status-indicator'),
            statusText: this.container.querySelector('.status-text'),
            conversationId: this.container.querySelector('.conversation-id'),
            pageContentCheckbox: this.container.querySelector('.checkbox')
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
    }

    /**
     * Setup visibility-related listeners
     */
    setupVisibilityListeners() {
        this.elements.fab?.addEventListener('click', () => {
            if (window.webwire?.showPanel) {
                window.webwire.showPanel();
            } else {
                this.show();
            }
        });

        this.elements.closeBtn?.addEventListener('click', () => {
            if (window.webwire?.hidePanel) {
                window.webwire.hidePanel();
            } else {
                this.hide();
            }
        });
    }

    /**
     * Setup input-related listeners
     */
    setupInputListeners() {
        this.elements.sendBtn?.addEventListener('click', () => this.handleSendMessage());
        
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

        this.elements.replayTurnBtn?.addEventListener('click', () => {
            this.handleReplayLastTurn();
        });

        this.elements.pageContentCheckbox?.addEventListener('change', (e) => {
            this.handlePageContentToggle(e.target.checked);
        });

        this.elements.reparseBtn?.addEventListener('click', () => {
            this.handleReparseRequest();
        });
    }

    /**
     * Setup delegated event listeners
     */
    setupDelegatedListeners() {
        this.elements.chatContent?.addEventListener('click', (e) => {
            // Tool button handling
            const toolButton = e.target.closest('.tool-execute-btn, .tool-cancel-btn');
            if (toolButton) {
                this.handleToolButtonClick(toolButton);
                return;
            }

            // Analyze page button (in welcome message)
            if (e.target.closest('#analyze-page-btn')) {
                this.handlePageAnalysisRequest();
            }
        });
    }

    /**
     * Handle tool button clicks
     */
    handleToolButtonClick(button) {
        const toolMessage = button.closest('.tool-message');
        if (!toolMessage) return;

        const action = button.dataset.action;
        const toolName = toolMessage.dataset.toolName;
        const parentMessageId = toolMessage.dataset.parentMessageId;
        const callId = toolMessage.id;

        const eventName = action === 'execute' 
            ? EVENTS.CHAT.EXECUTE_TOOL 
            : EVENTS.CHAT.CANCEL_TOOL;

        console.log('[WebChatPanel] handleToolButtonClick:', eventName, {
            messageId: parentMessageId,
            callId,
            name: toolName
        });

        this.eventBus.emit(eventName, {
            messageId: parentMessageId,
            callId,
            name: toolName
        });
    }

    /**
     * Display a message
     */
    displayMessage(message, {autoScroll = false, renderTools = false, toolMessages = [], ...options} = {}) {
        console.log('[WebChatPanel] displayMessage:', message, options);

        this.prepareForMessage();
        
        if (!message || !this.elements.chatContent) {
            console.log('[WebChatPanel] Missing message or chatContent');
            return;
        }

        // Ensure message has ID
        if (!message.messageId && !message.id) {
            message.messageId = generateMessageId();
        }

        // Create and append message element
        const messageEl = this.renderer.createMessageElement(message, {
            renderTools,
            toolMessages
        });

        this.elements.chatContent.appendChild(messageEl);
        
        if (autoScroll) {
            this.scrollToBottom();
        }

        return messageEl;
    }

    /**
     * Display a thinking message
     */
    displayThinkingMessage(message) {
        console.log('[WebChatPanel] displayThinkingMessage:', message);
        
        this.prepareForMessage();

        const messageEl = this.renderer.createMessageElement(message, {
            isThinking: true
        });

        this.elements.chatContent.appendChild(messageEl);
        this.scrollToBottom();
        
        return messageEl;
    }

    /**
     * Update streaming message content
     */
    updateStreamingMessage(messageId, content) {
        const messageEl = this.container.querySelector(`#${messageId}`);
        if (!messageEl) {
            console.log('[WebChatPanel] Message not found:', messageId);
            return;
        }

        const streamingContent = messageEl.querySelector('.streaming-content');
        this.renderer.updateStreamingContent(streamingContent, content);
        this.scrollToBottom();
    }

    /**
     * Finalize a thinking message
     */
    finalizeThinkingMessage(messageId, finalContent, toolMessages = []) {
        console.log('[WebChatPanel] finalizeThinkingMessage:', messageId);
        
        const messageEl = this.container.querySelector(`#${messageId}`);
        if (!messageEl) {
            console.log('[WebChatPanel] Message not found for finalization:', messageId);
            return;
        }

        // Update classes
        messageEl.classList.remove('thinking');
        messageEl.classList.add('assistant');
        
        // Update content
        const messageContent = messageEl.querySelector('.content');
        if (messageContent) {
            console.log('[WebChatPanel] Updating message content:', finalContent, toolMessages);
            messageContent.innerHTML = this.renderer.createFinalizedMessageHTML(
                finalContent, 
                toolMessages
            );
        }
        
        this.scrollToBottom();
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
    displayError(error, thinkingMessageId = null) {
        if (thinkingMessageId) {
            this.removeMessage(thinkingMessageId);
        }
        
        this.displayMessage({
            role: 'error',
            content: error,
            timestamp: Date.now()
        });
    }

    /**
     * Update tool result
     */
    updateToolResult(msgCallId, {name, result, success, error, callId, executionTime, ...results} = {}) {
        const toolEl = this.container.querySelector(`#${callId}`);
        if (!toolEl) {
            console.warn('[WebChatPanel] Tool element not found:', callId);
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
    displayConversation(conversation) {
        if (!conversation?.messages) return;

        this.clearMessages();

        conversation.messages.forEach(message => {
            if (message.role === 'system') return;

            const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);
            
            this.displayMessage(message, {
                renderTools: toolMessages.length > 0,
                toolMessages
            });
        });

        this.updateConversationIdDisplay(conversation.threadId);
        this.updateReparseButton(conversation.messages.length > 0);
    }

    /**
     * Load conversation with options
     */
    loadConversation(conversation, options = {}) {
        const { renderTools = true } = options;
        
        if (!conversation?.messages) return;

        this.clearMessages();
        this.currentThreadId = conversation.threadId;

        conversation.messages.forEach(message => {
            if (message.role === 'system') return;
            const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);

            this.displayMessage(message, {
                renderTools: renderTools && toolMessages.length > 0,
                toolMessages
            });
        });

        this.updateConversationIdDisplay(conversation.threadId);
        this.updateReparseButton(conversation.messages.length > 0);
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
     */
    showWelcomeMessage() {
        if (!this.elements.chatContent) return;
        
        const welcomeEl = this.renderer.createWelcomeElement();
        this.elements.chatContent.appendChild(welcomeEl);
    }

    /**
     * Remove welcome message
     */
    removeWelcomeMessage() {
        const welcome = this.elements.chatContent?.querySelector('.welcome-message');
        welcome?.remove();
    }

    /**
     * Remove error messages
     */
    removeErrorMessages() {
        const errors = this.elements.chatContent?.querySelectorAll('.message.error');
        errors?.forEach(error => error.remove());
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        if (this.elements.chatContent) {
            this.elements.chatContent.innerHTML = '';
            this.showWelcomeMessage();
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
     * UI state updates
     */
    updateSendButton() {
        const hasText = this.elements.chatInput?.value.trim().length > 0;
        if (this.elements.sendBtn) {
            this.elements.sendBtn.disabled = !hasText;
        }
    }

    updateReparseButton(visible) {
        if (this.elements.reparseBtn) {
            this.elements.reparseBtn.style.display = visible ? 'block' : 'none';
            this.elements.reparseBtn.disabled = !visible;
        }
    }

    updatePageContentSetting(includeContent) {
        if (this.elements.pageContentCheckbox) {
            this.elements.pageContentCheckbox.checked = includeContent;
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

    updateConnectionStatus(status, aiConnected = false, mcpConnected = false) {
        if (!this.elements.statusText || !this.elements.statusIndicator) return;

        let color, text;

        if (aiConnected && mcpConnected) {
            color = '#10b981';
            text = 'AI + MCP Ready';
        } else if (aiConnected) {
            color = '#3b82f6';
            text = 'AI Ready';
        } else if (mcpConnected) {
            color = '#f59e0b';
            text = 'MCP Connected';
        } else {
            color = '#6b7280';
            text = status || 'Configuring...';
        }

        this.elements.statusText.textContent = text;
        this.elements.statusIndicator.style.backgroundColor = color;
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
        if (this.elements.chatContent) {
            this.elements.chatContent.scrollTop = this.elements.chatContent.scrollHeight;
        }
    }

    /**
     * Event handlers
     */
    handleSendMessage(predefinedMessage = null) {
        const message = predefinedMessage || this.elements.chatInput?.value.trim();
        if (!message) return;

        if (!predefinedMessage && this.elements.chatInput) {
            this.elements.chatInput.value = '';
            this.elements.chatInput.style.height = 'auto';
        }

        this.updateSendButton();
        this.eventBus.emit(EVENTS.CHAT.SEND_MESSAGE, { message });
    }

    handlePageAnalysisRequest() {
        this.eventBus.emit(EVENTS.CHAT.ANALYZE_PAGE, {});
    }

    handleNewConversationRequest() {
        console.log('[WebChatPanel] New conversation requested');
        this.clearMessages();
        this.updateConversationIdDisplay(null);
        this.eventBus.emit(EVENTS.CHAT.START_NEW_CONVERSATION, {});
    }

    handleReplayLastTurn() {
        console.log('[WebChatPanel] Replay last turn requested');
        this.eventBus.emit(EVENTS.CHAT.REPLAY_LAST_TURN, {});
    }

    handleReparseRequest() {
        console.log('[WebChatPanel] Reparse requested');
        this.eventBus.emit(EVENTS.CHAT.REPARSE_MESSAGE, {});
    }

    handlePageContentToggle(includeContent) {
        console.log('[WebChatPanel] Page content toggle:', includeContent);
        this.eventBus.emit(EVENTS.CHAT.TOGGLE_PAGE_CONTENT, { includePageContent: includeContent });
    }

    handleInitialState(state) {
        console.log('[WebChatPanel] Handling initial state:', state);
        
        this.updateConnectionStatus(
            'Ready',
            state.aiClientConfigured,
            state.mcpConnected
        );

        if (state.includePageContent !== undefined) {
            this.updatePageContentSetting(state.includePageContent);
        }
        
        if (state.currentThread?.messages) {
            this.displayConversation(state.currentThread);
        }
    }

    /**
     * Show error notification
     */
    showErrorNotification(message) {
        console.error('WebWire Error:', message);
        
        const notification = document.createElement('div');
        notification.innerHTML = this.renderer.createErrorNotificationHTML(message);
        document.body.appendChild(notification.firstChild);
        
        setTimeout(() => {
            const notif = document.querySelector('.ww-error-notification');
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
        const chatMessages = this.container.querySelectorAll('.message');
        if (chatMessages.length > 0) {
            return chatMessages[chatMessages.length - 1];
        }
        return null;
    }

    /**
     * Update the conversation
     */
    updateConversation(conversation) {
        this.clearMessages();
        this.displayConversation(conversation);
    }
}