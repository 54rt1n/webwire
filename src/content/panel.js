/**
 * WebWire Panel - Manages the chat panel UI and interactions
 * Similar structure to MCP panel but focused on chat/conversation
 */
export class WebWirePanel {
    constructor() {
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
     * Initialize the panel - inject HTML and CSS
     */
    async initialize() {
        if (this.isInjected) return;
        
        console.log('[WebWirePanel] Initializing panel...');
        
        // Create container
        this.createContainer();
        
        // Create HTML structure
        this.createHTML();
        
        // Cache elements
        this.cacheElements();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Inject into page
        document.body.appendChild(this.container);
        this.isInjected = true;
        
        console.log('[WebWirePanel] Panel initialized successfully');
    }

    /**
     * Create the main container element
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'webwire-container';
    }



    /**
     * Create HTML structure
     */
    createHTML() {
        this.container.innerHTML = `
            <div class="webwire-panel hidden">
                <div class="panel-header">
                    <div class="header-top">
                        <div class="agent-info">
                            <span class="agent-name">WebWire Assistant</span>
                            <span class="conversation-id">Ready for conversation</span>
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
                    <div class="connection-status">
                        <span class="status-indicator"></span>
                        <span class="status-text">Ready</span>
                    </div>
                </div>

                <div class="chat-content">
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

                <div class="chat-input-container">
                    <div class="input-wrapper">
                        <textarea 
                            class="chat-input" 
                            placeholder="Ask me anything about this page or use tools..."
                            rows="1"
                        ></textarea>
                        <button class="send-button" disabled>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"/>
                                <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="webwire-fab">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            </div>
        `;
    }

    /**
     * Cache DOM elements for easier access
     */
    cacheElements() {
        this.elements = {
            panel: this.container.querySelector('.webwire-panel'),
            fab: this.container.querySelector('.webwire-fab'),
            closeBtn: this.container.querySelector('#close-panel'),
            analyzeBtn: this.container.querySelector('#analyze-page'),
            analyzePageBtn: this.container.querySelector('#analyze-page-btn'),
            mcpStatusBtn: this.container.querySelector('#mcp-status'),
            chatContent: this.container.querySelector('.chat-content'),
            chatInput: this.container.querySelector('.chat-input'),
            sendBtn: this.container.querySelector('.send-button'),
            statusIndicator: this.container.querySelector('.status-indicator'),
            statusText: this.container.querySelector('.status-text'),
            conversationId: this.container.querySelector('.conversation-id'),
            welcomeMessage: this.container.querySelector('.welcome-message')
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // FAB click to show panel
        this.elements.fab?.addEventListener('click', () => {
            // Use the content script's showPanel method to persist state to background
            if (window.webwire && window.webwire.showPanel) {
                window.webwire.showPanel();
            } else {
                // Fallback to local show if content script not available
                this.show();
            }
        });

        // Close button
        this.elements.closeBtn?.addEventListener('click', () => {
            // Use the content script's hidePanel method to persist state to background
            if (window.webwire && window.webwire.hidePanel) {
                window.webwire.hidePanel();
            } else {
                // Fallback to local hide if content script not available
                this.hide();
            }
        });

        // Send button and input handling
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

        // Quick action buttons
        this.elements.analyzePageBtn?.addEventListener('click', () => {
            this.handlePageAnalysisRequest();
        });

        this.elements.analyzeBtn?.addEventListener('click', () => {
            this.handlePageAnalysisRequest();
        });
    }

    /**
     * Show the panel
     */
    show() {
        if (!this.isInjected) return;
        
        this.elements.panel?.classList.remove('hidden');
        this.elements.fab?.classList.add('hidden');
        this.isVisible = true;
        
        // Focus input
        setTimeout(() => {
            this.elements.chatInput?.focus();
        }, 300);
    }

    /**
     * Hide the panel
     */
    hide() {
        this.elements.panel?.classList.add('hidden');
        this.elements.fab?.classList.remove('hidden');
        this.isVisible = false;
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Update send button state based on input
     */
    updateSendButton() {
        const hasText = this.elements.chatInput?.value.trim().length > 0;
        if (this.elements.sendBtn) {
            this.elements.sendBtn.disabled = !hasText;
        }
    }

    /**
     * Auto-resize input based on content
     */
    autoResizeInput() {
        if (this.elements.chatInput) {
            this.elements.chatInput.style.height = 'auto';
            this.elements.chatInput.style.height = this.elements.chatInput.scrollHeight + 'px';
        }
    }

    /**
     * Handle sending a message
     */
    handleSendMessage(predefinedMessage = null) {
        const message = predefinedMessage || this.elements.chatInput?.value.trim();
        if (!message) return;

        // Clear input if not predefined
        if (!predefinedMessage && this.elements.chatInput) {
            this.elements.chatInput.value = '';
            this.elements.chatInput.style.height = 'auto';
        }

        this.updateSendButton();

        // Emit event for parent to handle
        window.postMessage({
            type: 'WEBWIRE_PANEL_MESSAGE',
            action: 'SEND_CHAT_MESSAGE',
            data: { message }
        }, '*');
    }

    /**
     * Handle page analysis request using the enhanced chatpanel pattern
     */
    handlePageAnalysisRequest() {
        // Request page analysis using the page utils pattern
        window.postMessage({
            type: 'WEBWIRE_PANEL_MESSAGE',
            action: 'ANALYZE_PAGE_CONTENT',
            data: {}
        }, '*');
    }

    /**
     * Display a chat message
     */
    displayMessage(message) {
        console.log('[WebWirePanel] displayMessage called with:', message);
        
        if (!message || !this.elements.chatContent) {
            console.log('[WebWirePanel] displayMessage: missing message or chatContent element');
            return;
        }

        // Remove welcome message if it exists
        console.log('[WebWirePanel] displayMessage: removing welcome message');
        this.removeWelcomeMessage();

        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${message.role}`;
        
        if (message.id) {
            messageEl.id = `message-${message.id}`;
        }

        const content = this.formatMessageContent(message.content);
        const time = new Date(message.timestamp || Date.now()).toLocaleTimeString([], {
            hour: '2-digit', 
            minute: '2-digit'
        });

        messageEl.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-time">${time}</div>
        `;

        console.log('[WebWirePanel] displayMessage: appending message element to chat content');
        this.elements.chatContent.appendChild(messageEl);
        this.scrollToBottom();

        console.log('[WebWirePanel] displayMessage: message displayed successfully');
        return messageEl;
    }

    /**
     * Display a thinking message that can be updated
     */
    displayThinkingMessage(message) {
        // Remove welcome message if it exists
        this.removeWelcomeMessage();

        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message thinking';
        messageEl.id = `message-${message.id}`;

        const time = new Date().toLocaleTimeString([], {
            hour: '2-digit', 
            minute: '2-digit'
        });

        messageEl.innerHTML = `
            <div class="message-content">
                <span class="thinking-indicator">💭</span>
                <span class="streaming-content"></span>
                <span class="cursor">▊</span>
            </div>
            <div class="message-time">${time}</div>
        `;

        this.elements.chatContent.appendChild(messageEl);
        this.scrollToBottom();
        
        return messageEl;
    }

    /**
     * Update a streaming message with new content
     */
    updateStreamingMessage(messageId, content) {
        console.log('[WebWirePanel] updateStreamingMessage called:', messageId, content);
        
        const messageEl = this.container.querySelector(`#message-${messageId}`);
        if (!messageEl) {
            console.log('[WebWirePanel] Message element not found:', messageId);
            return;
        }

        const streamingContent = messageEl.querySelector('.streaming-content');
        if (streamingContent) {
            // Format the content and update
            const formattedContent = this.formatMessageContent(content);
            streamingContent.innerHTML = formattedContent;
        } else {
            console.log('[WebWirePanel] Streaming content element not found');
        }
        
        this.scrollToBottom();
    }

    /**
     * Convert thinking message to final assistant message
     */
    finalizeThinkingMessage(messageId, finalContent) {
        console.log('[WebWirePanel] finalizeThinkingMessage called:', messageId, finalContent);
        
        const messageEl = this.container.querySelector(`#message-${messageId}`);
        if (!messageEl) {
            console.log('[WebWirePanel] Message element not found for finalization:', messageId);
            return;
        }

        // Remove thinking class and cursor, update to assistant message
        messageEl.className = 'chat-message assistant';
        
        const messageContent = messageEl.querySelector('.message-content');
        if (messageContent) {
            const formattedContent = this.formatMessageContent(finalContent);
            messageContent.innerHTML = formattedContent;
        }
        
        this.scrollToBottom();
    }

    /**
     * Remove a thinking message
     */
    removeThinkingMessage(messageId) {
        console.log('[WebWirePanel] removeThinkingMessage called:', messageId);
        
        const messageEl = this.container.querySelector(`#message-${messageId}`);
        if (messageEl) {
            messageEl.remove();
            console.log('[WebWirePanel] Thinking message removed');
        } else {
            console.log('[WebWirePanel] Thinking message not found for removal:', messageId);
        }
    }

    /**
     * Display error message in chat
     */
    displayError(error) {
        this.displayMessage({
            role: 'error',
            content: `<span class="error-icon">❌</span><span class="error-text">${error}</span>`,
            timestamp: Date.now()
        });
    }

    /**
     * Show error notification (for system-level errors)
     */
    showErrorNotification(message) {
        console.error('WebWire Error:', message);
        
        const notification = document.createElement('div');
        notification.className = 'webwire-error-notification';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    /**
     * Display conversation from data
     */
    displayConversation(conversation) {
        if (!conversation || !conversation.messages) return;

        this.clearMessages();

        for (const message of conversation.messages) {
            if (message.role !== 'system') {
                this.displayMessage(message);
            }
        }

        // Update conversation ID display
        if (this.elements.conversationId && conversation.threadId) {
            this.elements.conversationId.textContent = `Thread: ${conversation.threadId.split('-').pop()}`;
        }
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
     * Show welcome message
     */
    showWelcomeMessage() {
        if (!this.elements.chatContent) return;

        const welcomeEl = document.createElement('div');
        welcomeEl.className = 'welcome-message';
        welcomeEl.innerHTML = `
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
        `;

        // Re-setup analyze button event
        const analyzeBtn = welcomeEl.querySelector('#analyze-page-btn');
        analyzeBtn?.addEventListener('click', () => {
            this.handlePageAnalysisRequest();
        });

        this.elements.chatContent.appendChild(welcomeEl);
    }

    /**
     * Remove welcome message
     */
    removeWelcomeMessage() {
        const welcome = this.elements.chatContent?.querySelector('.welcome-message');
        if (welcome) {
            welcome.remove();
        }
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(status, aiConnected = false, mcpConnected = false) {
        if (!this.elements.statusText || !this.elements.statusIndicator) return;

        let color, text;

        if (aiConnected && mcpConnected) {
            color = '#10b981'; // green
            text = 'AI + MCP Ready';
        } else if (aiConnected) {
            color = '#3b82f6'; // blue
            text = 'AI Ready';
        } else if (mcpConnected) {
            color = '#f59e0b'; // yellow
            text = 'MCP Connected';
        } else {
            color = '#6b7280'; // gray
            text = status || 'Configuring...';
        }

        this.elements.statusText.textContent = text;
        this.elements.statusIndicator.style.backgroundColor = color;
    }

    /**
     * Format message content (basic HTML escaping and line breaks)
     */
    formatMessageContent(content) {
        if (!content) return '';
        
        // Basic HTML escaping
        const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Convert line breaks to <br>
        return escaped.replace(/\n/g, '<br>');
    }

    /**
     * Scroll chat to bottom
     */
    scrollToBottom() {
        if (this.elements.chatContent) {
            this.elements.chatContent.scrollTop = this.elements.chatContent.scrollHeight;
        }
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg-${++this.messageCounter}-${Date.now()}`;
    }

    /**
     * Handle initial state from content script
     */
    handleInitialState(state) {
        console.log('[WebWirePanel] Handling initial state:', state);
        
        // Update connection status
        this.updateConnectionStatus(
            'Ready',
            state.aiClientConfigured,
            state.mcpConnected
        );
        
        // Display current conversation if available
        if (state.currentThread && state.currentThread.messages) {
            this.displayConversation(state.currentThread);
        }
    }

    /**
     * Check if panel is injected
     */
    isReady() {
        return this.isInjected;
    }

    /**
     * Destroy the panel
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        const style = document.getElementById('webwire-panel-styles');
        if (style) {
            style.remove();
        }
        
        this.isInjected = false;
        this.isVisible = false;
    }
} 