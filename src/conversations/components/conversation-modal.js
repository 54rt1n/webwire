import './conversation-modal.scss';
import { EVENTS } from '../../js/core/events.js';
import { buildToolMessages } from '../../chat/message-utils.js';

/**
 * ConversationModal
 * A modal component for displaying conversation messages with tool calls and metadata.
 * Shows a chronological list of messages with user and assistant interactions.
 */
export class ConversationModal {
    constructor(stateService = null, eventBus = null) {
        this.modal = null;
        this.isOpen = false;
        this.onClose = null;
        this.currentConversation = null;
        this.stateService = stateService;
        this.onSetActive = null;
        this.eventBus = eventBus;
        this.eventListeners = [];
    }

    /**
     * Sets the state service for data access
     * @param {object} stateService - The state service instance
     */
    setStateService(stateService) {
        this.stateService = stateService;
    }

    /**
     * Sets the event bus for listening to state changes
     * @param {object} eventBus - The event bus instance
     */
    setEventBus(eventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Opens the modal with the specified conversation data.
     * @param {Object} conversationData - The conversation metadata
     * @param {Function} onClose - Optional callback when modal is closed
     * @param {Function} onSetActive - Optional callback when set as active is clicked
     */
    open(conversationData, onClose = null, onSetActive = null) {
        if (this.isOpen) {
            this.close();
        }

        this.currentConversation = conversationData;
        this.onClose = onClose;
        this.onSetActive = onSetActive;
        this.isOpen = true;
        this._createModal(conversationData);
        this._attachEventListeners();
        
        // Add to DOM and show
        document.body.appendChild(this.modal);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            this.modal.classList.add('modal-visible');
        });

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Closes the modal and cleans up.
     */
    close() {
        if (!this.isOpen || !this.modal) return;

        this.isOpen = false;
        
        // Trigger exit animation
        this.modal.classList.remove('modal-visible');
        
        // Remove from DOM after animation
        setTimeout(() => {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            this.modal = null;
            this.currentConversation = null;
            
            // Restore body scroll
            document.body.style.overflow = '';
            
            // Clean up event listeners
            this._cleanupEventListeners();
            
            // Call onClose callback if provided
            if (this.onClose) {
                this.onClose();
                this.onClose = null;
            }
        }, 200); // Match CSS transition duration
    }

    /**
     * Creates the modal DOM structure.
     * @param {Object} conversationData - The conversation metadata
     * @private
     */
    _createModal(conversationData) {
        this.modal = document.createElement('div');
        this.modal.className = 'ww-modal conversation-modal-overlay';
        
        const title = this._getConversationTitle(conversationData);
        const messageCount = this._getMessageCount(conversationData.threadId);
        const participantsText = `${conversationData.userName || 'User'} & ${conversationData.personaName || 'Assistant'}`;
        const status = this._getConversationStatus(conversationData.threadId);
        const isActive = status === 'active';
        
        this.modal.innerHTML = `
            <div class="conversation-modal">
                <div class="conversation-modal-header">
                    <div>
                        <h2 class="conversation-modal-title">${this._escapeHtml(title)}</h2>
                        <div class="conversation-modal-meta">
                            ${this._escapeHtml(participantsText)} • ${messageCount} messages
                        </div>
                    </div>
                    <div class="conversation-modal-actions">
                        <button class="btn ${isActive ? 'btn-complete' : 'btn-set-active'}" id="set-active-btn" title="${isActive ? 'Complete this active conversation' : 'Set as Active Conversation'}">
                            ${isActive ? '✅ Complete' : '➕ Set Active'}
                        </button>
                        <button class="conversation-modal-close" id="close-modal-btn" title="Close">
                            ×
                        </button>
                    </div>
                </div>
                <div class="conversation-modal-content">
                    <div class="conversation-messages-container" id="messages-container">
                        ${this._renderMessages(conversationData.threadId)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renders all messages for the conversation
     * @param {string} threadId - The conversation thread ID
     * @returns {string} HTML for messages
     * @private
     */
    _renderMessages(threadId) {
        if (!this.stateService || !this.stateService.conversation) {
            return this._renderEmptyState('Unable to load messages - no state service available');
        }

        const messages = this.stateService.conversation.getConversationMessages(threadId);
        
        if (!messages || messages.length === 0) {
            return this._renderEmptyState('No messages in this conversation yet');
        }

        return messages.map(message => this._renderMessage(message)).join('');
    }

    /**
     * Renders a single message
     * @param {Object} message - Message object
     * @returns {string} HTML for message
     * @private
     */
    _renderMessage(message) {
        const timestamp = new Date(message.timestamp).toLocaleString();
        const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);
        const hasToolCalls = toolMessages && toolMessages.length > 0;
        const hasThinking = message.think && message.think.trim();

        return `
            <div class="conversation-message ${message.role}">
                <div class="conversation-message-header">
                    <span class="conversation-message-role">${message.role}</span>
                    <span class="conversation-message-timestamp">${timestamp}</span>
                </div>
                <div class="conversation-message-content">
                    ${this._formatMessageContent(message.content)}
                </div>
                ${hasThinking ? this._renderThinking(message.think) : ''}
                ${hasToolCalls ? this._renderToolMessages(toolMessages) : ''}
            </div>
        `;
    }

    /**
     * Renders the thinking section
     * @param {string} thinking - Thinking content
     * @returns {string} HTML for thinking section
     * @private
     */
    _renderThinking(thinking) {
        return `
            <div class="conversation-thinking">
                <div class="conversation-thinking-header">
                    🤔 AI Thinking
                </div>
                <div class="conversation-thinking-content">
                    ${this._escapeHtml(thinking)}
                </div>
            </div>
        `;
    }

    /**
     * Renders tool messages (calls and results combined)
     * @param {Array} toolMessages - Tool messages from buildToolMessages
     * @returns {string} HTML for tool messages
     * @private
     */
    _renderToolMessages(toolMessages) {
        if (!toolMessages || toolMessages.length === 0) return '';

        const toolMessagesHtml = toolMessages.map((toolMessage) => {
            const status = toolMessage.display || 'pending';
            const toolName = toolMessage.function?.name || toolMessage.name || 'Unknown Tool';
            const toolArgs = toolMessage.function?.arguments || toolMessage.arguments || {};
            
            return `
                <div class="conversation-tool-call tool-${status}">
                    <div class="conversation-tool-call-name">
                        🔧 ${this._escapeHtml(toolName)}
                        <span class="tool-status tool-status-${status}">${status}</span>
                    </div>
                    <div class="conversation-tool-call-args">
                        ${this._escapeHtml(JSON.stringify(toolArgs, null, 2))}
                    </div>
                    ${toolMessage.success !== undefined ? this._renderToolResult(toolMessage) : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="conversation-tool-calls">
                <div class="conversation-tool-calls-header">
                    🛠️ Tool Calls
                </div>
                ${toolMessagesHtml}
            </div>
        `;
    }

    /**
     * Renders a tool result
     * @param {Object} toolMessage - Tool message object with result data
     * @returns {string} HTML for tool result
     * @private
     */
    _renderToolResult(toolMessage) {
        if (toolMessage.error) {
            return `
                <div class="conversation-tool-result tool-error">
                    <div class="conversation-tool-result-header">Error:</div>
                    <div class="conversation-tool-result-content">
                        ${this._escapeHtml(toolMessage.error)}
                    </div>
                </div>
            `;
        }

        // Extract result data (excluding metadata)
        const { callId, display, error, executionTime, name, parameters, success, function: func, ...resultData } = toolMessage;
        
        return `
            <div class="conversation-tool-result tool-success">
                <div class="conversation-tool-result-header">
                    Result:
                    ${toolMessage.executionTime ? `<span class="execution-time">(${toolMessage.executionTime}ms)</span>` : ''}
                </div>
                <div class="conversation-tool-result-content">
                    ${this._escapeHtml(JSON.stringify(resultData, null, 2))}
                </div>
            </div>
        `;
    }

    /**
     * Renders empty state when no messages
     * @param {string} message - Empty state message
     * @returns {string} HTML for empty state
     * @private
     */
    _renderEmptyState(message) {
        return `
            <div class="conversation-empty">
                <div class="conversation-empty-icon">💬</div>
                <div class="conversation-empty-text">No Messages</div>
                <div class="conversation-empty-subtext">${this._escapeHtml(message)}</div>
            </div>
        `;
    }

    /**
     * Formats message content with basic markdown-like formatting
     * @param {string} content - Raw message content
     * @returns {string} Formatted HTML content
     * @private
     */
    _formatMessageContent(content) {
        if (!content) return '';
        
        // Simple formatting - escape HTML first, then apply basic formatting
        let formatted = this._escapeHtml(content);
        
        // Convert newlines to paragraphs
        const paragraphs = formatted.split('\n\n').filter(p => p.trim());
        if (paragraphs.length > 1) {
            formatted = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
        } else {
            formatted = formatted.replace(/\n/g, '<br>');
        }
        
        return formatted;
    }

    /**
     * Gets the conversation title
     * @param {Object} conversation - Conversation metadata
     * @returns {string} Conversation title
     * @private
     */
    _getConversationTitle(conversation) {
        if (conversation.title) {
            return conversation.title;
        }
        
        // Generate title from location or timestamp
        if (conversation.location) {
            try {
                const url = new URL(conversation.location);
                return `Conversation on ${url.hostname}`;
            } catch {
                return conversation.location;
            }
        }
        
        return `Conversation ${new Date(conversation.startTime).toLocaleDateString()}`;
    }

    /**
     * Gets the message count for a conversation
     * @param {string} threadId - Thread ID
     * @returns {number} Message count
     * @private
     */
    _getMessageCount(threadId) {
        if (!this.stateService || !this.stateService.conversation) {
            return 0;
        }
        
        const messages = this.stateService.conversation.getConversationMessages(threadId);
        return messages.length;
    }

    /**
     * Checks if this conversation is currently active
     * @param {string} threadId - Thread ID
     * @returns {boolean} Whether this conversation is active
     * @private
     */
    _isActiveConversation(threadId) {
        if (!this.stateService || !this.stateService.conversation) {
            return false;
        }
        
        const activeThreadId = this.stateService.conversation.getActiveThreadId();
        return activeThreadId === threadId;
    }

    /**
     * Gets the conversation status
     * @param {string} threadId - Thread ID
     * @returns {string} The conversation status ('active', 'completed', 'saved', 'error', 'deleted')
     * @private
     */
    _getConversationStatus(threadId) {
        if (!this.stateService || !this.stateService.conversation) {
            return 'active'; // default
        }
        
        const metadata = this.stateService.state.conversation.metadata[threadId];
        return metadata ? metadata.status || 'active' : 'active';
    }

    /**
     * Attaches event listeners to modal elements
     * @private
     */
    _attachEventListeners() {
        // Close button
        const closeBtn = this.modal.querySelector('#close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Set active/complete button
        const setActiveBtn = this.modal.querySelector('#set-active-btn');
        if (setActiveBtn) {
            setActiveBtn.addEventListener('click', () => {
                if (setActiveBtn.disabled) return;
                
                if (this.onSetActive && this.currentConversation) {
                    // Always call onSetActive - the handler will determine the appropriate action
                    this.onSetActive(this.currentConversation.threadId);
                    // Update button state after action
                    setTimeout(() => this._updateButtonState(), 100);
                }
            });
        }

        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Escape key to close
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        // Listen for conversation state changes
        if (this.eventBus) {
            const conversationUpdateListener = () => {
                this._updateButtonState();
            };
            
            this.eventBus.on(EVENTS.CONVERSATION.ACTIVATED, conversationUpdateListener);
            this.eventBus.on(EVENTS.CONVERSATION.UPDATED, conversationUpdateListener);
            
            // Store listeners for cleanup
            this.eventListeners.push({
                event: EVENTS.CONVERSATION.ACTIVATED,
                listener: conversationUpdateListener
            });
            this.eventListeners.push({
                event: EVENTS.CONVERSATION.UPDATED,
                listener: conversationUpdateListener
            });
        }
    }

    /**
     * Cleans up event listeners
     * @private
     */
    _cleanupEventListeners() {
        if (this.eventBus && this.eventListeners.length > 0) {
            this.eventListeners.forEach(({ event, listener }) => {
                this.eventBus.off(event, listener);
            });
            this.eventListeners = [];
        }
    }

    /**
     * Updates the button state based on current conversation status
     * @private
     */
    _updateButtonState() {
        if (!this.modal || !this.currentConversation) return;
        
        const setActiveBtn = this.modal.querySelector('#set-active-btn');
        if (!setActiveBtn) return;
        
        const status = this._getConversationStatus(this.currentConversation.threadId);
        
        if (status === 'active') {
            setActiveBtn.className = 'btn btn-complete';
            setActiveBtn.innerHTML = '✅ Complete';
            setActiveBtn.title = 'Complete this active conversation';
            setActiveBtn.disabled = false;
        } else {
            setActiveBtn.className = 'btn btn-set-active';
            setActiveBtn.innerHTML = '➕ Set Active';
            setActiveBtn.title = 'Set as Active Conversation';
            setActiveBtn.disabled = false;
        }
    }

    /**
     * Escapes HTML in text content
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}