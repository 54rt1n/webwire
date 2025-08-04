import './conversation-modal.scss';
import { EVENTS } from '../../js/core/events.js';
import { buildToolMessages } from '../../chat/message-utils.js';
import { EventBindableComponent } from '../../js/core/event-bindable-panel.js';
import { logger } from '../../js/core/logging.js';

/**
 * ConversationModal
 * A modal component for displaying conversation messages with tool calls and metadata.
 * Shows a chronological list of messages with user and assistant interactions.
 */
export class ConversationModal extends EventBindableComponent {
    constructor(stateService = null, eventBus = null) {
        // If eventBus is provided, pass it to parent
        if (eventBus) {
            super(eventBus);
        } else {
            // For backward compatibility when no eventBus is provided
            super({ on: () => {}, emit: () => {} }); // Dummy eventBus
        }
        
        this.modal = null;
        this.isOpen = false;
        this.onClose = null;
        this.currentConversation = null;
        this.stateService = stateService;
        this.onSetActive = null;
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
        // Update the eventBus if a new one is provided
        if (eventBus && eventBus !== this.eventBus) {
            // Clean up old listeners first
            this.cleanup();
            this.eventBus = eventBus;
            this.setupEventListeners();
        }
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
        this._attachMessageActionListeners();
        
        // Add to DOM and show
        document.body.appendChild(this.modal);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            this.modal.classList.add('show');
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
        this.modal.classList.remove('show');
        
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
        this.modal.className = 'ww-modal';
        
        const title = this._getConversationTitle(conversationData);
        const messageCount = this._getMessageCount(conversationData.threadId);
        const participantsText = `${conversationData.userName || 'User'} & ${conversationData.personaName || 'Assistant'}`;
        const urlDisplay = this._getUrlDisplay(conversationData.pageUrl);
        const status = this._getConversationStatus(conversationData.threadId);
        const isActive = status === 'active';
        
        this.modal.innerHTML = `
            <div class="ww-modal-content">
                <div class="ww-modal-header">
                    <div class="ww-modal-header-content">
                        <h2>${this._escapeHtml(title)}</h2>
                        <div class="ww-conversation-meta">
                            ${this._escapeHtml(participantsText)} • ${messageCount} messages
                            ${urlDisplay ? `<br><span class="ww-conversation-url">${urlDisplay}</span>` : ''}
                        </div>
                    </div>
                    <div class="ww-modal-header-actions">
                        <label class="ww-checkbox-label" style="margin-right: 12px;">
                            <input type="checkbox" id="filter-non-success" class="ww-checkbox" />
                            <span>Show All</span>
                        </label>
                        <button class="${isActive ? 'ww-btn-complete' : 'ww-btn-set-active'}" id="set-active-btn" title="${isActive ? 'Complete this active conversation' : 'Set as Active Conversation'}">
                            ${isActive ? '✅ Complete' : '➕ Set Active'}
                        </button>
                        <button class="ww-modal-close" id="close-modal-btn" title="Close">
                            <span class="ww-icon">×</span>
                        </button>
                    </div>
                </div>
                <div class="ww-modal-body">
                    <div class="ww-messages-container" id="messages-container">
                        ${this._renderMessages(conversationData.threadId)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renders all messages for the conversation
     * @param {string} threadId - The conversation thread ID
     * @param {boolean} showAll - Whether to show all messages (true) or filter to success only (false)
     * @returns {string} HTML for messages
     * @private
     */
    _renderMessages(threadId, showAll = false) {
        if (!this.stateService || !this.stateService.conversation) {
            return this._renderEmptyState('Unable to load messages - no state service available');
        }

        let messages = this.stateService.conversation.getConversationMessages(threadId);
        
        if (!messages || messages.length === 0) {
            return this._renderEmptyState('No messages in this conversation yet');
        }

        // Filter to success messages only if "Show All" is NOT checked
        if (!showAll) {
            messages = messages.filter(message => {
                // Check message-level status field first
                if (message.status !== undefined) {
                    return message.status === 'success';
                }
                
                // Keep user messages if no status is set
                if (message.role === 'user') {
                    return true;
                }
                
                // For assistant messages, check if they have successful tool operations
                // If no tools were used, consider it successful
                if (!message.toolResults || message.toolResults.length === 0) {
                    return true;
                }
                
                // Check if all tool calls were successful
                const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);
                return toolMessages.every(toolMessage => toolMessage.success !== false && !toolMessage.error);
            });
            
            if (messages.length === 0) {
                return this._renderEmptyState('No successful messages in this conversation');
            }
        }

        return messages.map(message => this._renderMessage(message, this.currentConversation)).join('');
    }

    /**
     * Renders a single message
     * @param {Object} message - Message object
     * @param {Object} conversationData - Conversation metadata with participant names
     * @returns {string} HTML for message
     * @private
     */
    _renderMessage(message, conversationData) {
        const timestamp = new Date(message.timestamp).toLocaleString();
        const toolMessages = buildToolMessages(message.toolCalls, message.toolResults);
        const hasToolCalls = toolMessages && toolMessages.length > 0;
        const hasThinking = message.think && message.think.trim();
        const messageId = message.messageId || message.id || `msg-${Date.now()}-${Math.random()}`;

        // Get participant names
        const participantName = message.role === 'user' 
            ? (conversationData?.userName || 'User')
            : (conversationData?.personaName || 'Assistant');

        // Add action buttons for all messages (both user and assistant)
        const actionButtons = `
            <div class="ww-message-actions">
                <button class="ww-play-button" data-message-id="${messageId}" data-content="${this._escapeAttribute(message.content)}" title="Play message">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                </button>
                <button class="ww-copy-button" data-message-id="${messageId}" data-content="${this._escapeAttribute(message.content)}" title="Copy to clipboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
            </div>
        `;

        return `
            <div class="ww-message message-${message.role}" data-message-id="${messageId}">
                <div class="ww-message-header">
                    <div class="ww-message-header-left">
                        <span class="ww-message-role">${this._escapeHtml(participantName)}</span>
                        <div class="ww-message-metadata-chips">
                            ${this._renderMessageMetadata(message)}
                        </div>
                    </div>
                    ${actionButtons}
                </div>
                <div class="ww-message-content">
                    ${this._formatMessageContent(message.content)}
                </div>
                ${hasThinking ? this._renderThinking(message.think) : ''}
                ${hasToolCalls ? this._renderToolMessages(toolMessages) : ''}
                <div class="ww-message-footer">
                    <span class="ww-message-timestamp">${timestamp}</span>
                    <span class="ww-message-id">${messageId}</span>
                </div>
            </div>
        `;
    }

    /**
     * Renders message metadata in the footer
     * @param {Object} message - Message object
     * @param {string} timestamp - Formatted timestamp
     * @param {string} messageId - Message ID
     * @returns {string} HTML for message metadata
     * @private
     */
    _renderMessageMetadata(message) {
        const metadataItems = [];

        const { model, pageUrl, title, parseErrors, saved, content, messageId, timestamp, role,
            toolCalls, toolResults, think, ...rest } = message;
        
        // Show model if available
        if (model) {
            metadataItems.push(`<span class="ww-meta-item"><strong>Model:</strong> ${this._escapeHtml(model)}</span>`);
        }
        
        // Show page URL if available
        if (pageUrl) {
            const truncatedUrl = pageUrl.length > 50 ? pageUrl.substring(0, 47) + '...' : pageUrl;
            metadataItems.push(`<span class="ww-meta-item"><strong>URL:</strong> <a href="${this._escapeHtml(pageUrl)}" target="_blank" rel="noopener noreferrer" title="${this._escapeHtml(pageUrl)}">${this._escapeHtml(truncatedUrl)}</a></span>`);
        }
        
        // Show page title if available
        if (title && title !== pageUrl) {
            const truncatedTitle = title.length > 50 ? title.substring(0, 47) + '...' : title;
            metadataItems.push(`<span class="ww-meta-item"><strong>Page:</strong> ${this._escapeHtml(truncatedTitle)}</span>`);
        }
        
        // Show parse errors if any
        if (parseErrors && parseErrors.length > 0) {
            metadataItems.push(`<span class="ww-meta-item ww-meta-error"><strong>Parse Errors:</strong> ${parseErrors.length}</span>`);
        }
        
        // Show saved status
        if (saved !== undefined) {
            const savedStatus = saved ? '✓ Saved' : '✗ Not saved';
            const savedClass = saved ? 'ww-meta-success' : 'ww-meta-warning';
            metadataItems.push(`<span class="ww-meta-item ${savedClass}"><strong>Status:</strong> ${savedStatus}</span>`);
        }

        // Show rest of the message metadata
        Object.entries(rest).forEach(([key, value]) => {
            metadataItems.push(`<span class="ww-meta-item"><strong>${key}:</strong> ${this._escapeHtml(value)}</span>`);
        });
        
        // Only return metadata panel if there are items to show
        if (metadataItems.length === 0) {
            return '';
        }
        
        return metadataItems.map(item => `<span class="ww-metadata-chip">${item}</span>`).join('');
    }
    
    /**
     * Renders the thinking section
     * @param {string} thinking - Thinking content
     * @returns {string} HTML for thinking section
     * @private
     */
    _renderThinking(thinking) {
        return `
            <div class="ww-thinking">
                <div class="ww-thinking-header">
                    🤔 AI Thinking
                </div>
                <div class="ww-thinking-content">
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
                <div class="ww-tool-call tool-${status}">
                    <div class="ww-tool-name">
                        🔧 ${this._escapeHtml(toolName)}
                        <span class="ww-tool-status status-${status}">${status}</span>
                    </div>
                    <div class="ww-tool-args">
                        ${this._escapeHtml(JSON.stringify(toolArgs, null, 2))}
                    </div>
                    ${toolMessage.success !== undefined ? this._renderToolResult(toolMessage) : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="ww-message-tools">
                <div class="ww-tool-header">
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
                <div class="ww-tool-result error">
                    <div class="ww-tool-result-header">Error:</div>
                    <div class="ww-tool-result-content">
                        ${this._escapeHtml(toolMessage.error)}
                    </div>
                </div>
            `;
        }

        // Extract result data (excluding metadata)
        const { callId, display, error, executionTime, name, parameters, success, function: func, ...resultData } = toolMessage;
        
        return `
            <div class="ww-tool-result success">
                <div class="ww-tool-result-header">
                    Result:
                    ${toolMessage.executionTime ? `<span class="execution-time">(${toolMessage.executionTime}ms)</span>` : ''}
                </div>
                <div class="ww-tool-result-content">
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
            <div class="ww-empty-state">
                <div class="ww-empty-icon">💬</div>
                <div class="ww-empty-text">No Messages</div>
                <div class="ww-empty-subtext">${this._escapeHtml(message)}</div>
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
        
        // Generate title from pageUrl or timestamp
        if (conversation.pageUrl) {
            try {
                const url = new URL(conversation.pageUrl);
                return `Conversation on ${url.hostname}`;
            } catch {
                return conversation.pageUrl;
            }
        }
        
        return `Conversation ${new Date(conversation.startTime).toLocaleDateString()}`;
    }

    /**
     * Gets a clickable URL display for the conversation
     * @param {string} pageUrl - The page URL
     * @returns {string} HTML for clickable URL or empty string
     * @private
     */
    _getUrlDisplay(pageUrl) {
        if (!pageUrl) return '';
        
        try {
            const url = new URL(pageUrl);
            const displayUrl = url.hostname + url.pathname;
            const truncatedUrl = displayUrl.length > 40 ? displayUrl.substring(0, 37) + '...' : displayUrl;
            
            return `🌐 <a href="${this._escapeHtml(pageUrl)}" target="_blank" rel="noopener noreferrer" class="ww-url-link" title="${this._escapeHtml(pageUrl)}">${this._escapeHtml(truncatedUrl)}</a>`;
        } catch {
            // If not a valid URL, return as plain text
            const truncatedUrl = pageUrl.length > 40 ? pageUrl.substring(0, 37) + '...' : pageUrl;
            return `🌐 ${this._escapeHtml(truncatedUrl)}`;
        }
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

        // Filter non-success checkbox
        const filterCheckbox = this.modal.querySelector('#filter-non-success');
        if (filterCheckbox) {
            filterCheckbox.addEventListener('change', () => {
                this._refreshMessages();
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
            
            this.on(EVENTS.CONVERSATION.ACTIVATED, conversationUpdateListener);
            this.on(EVENTS.CONVERSATION.UPDATED, conversationUpdateListener);
            
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
        // Clean up is now handled by parent class
        this.cleanup();
        this.eventListeners = [];
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
            setActiveBtn.className = 'ww-btn-complete';
            setActiveBtn.innerHTML = '✅ Complete';
            setActiveBtn.title = 'Complete this active conversation';
            setActiveBtn.disabled = false;
        } else {
            setActiveBtn.className = 'ww-btn-set-active';
            setActiveBtn.innerHTML = '➕ Set Active';
            setActiveBtn.title = 'Set as Active Conversation';
            setActiveBtn.disabled = false;
        }
    }

    /**
     * Refreshes the messages display based on current filter settings
     * @private
     */
    _refreshMessages() {
        if (!this.modal || !this.currentConversation) return;
        
        const messagesContainer = this.modal.querySelector('#messages-container');
        const filterCheckbox = this.modal.querySelector('#filter-non-success');
        
        if (!messagesContainer || !filterCheckbox) return;
        
        // Get current filter state (checked = show all, unchecked = filter to success only)
        const showAll = filterCheckbox.checked;
        
        // Re-render messages with current filter
        messagesContainer.innerHTML = this._renderMessages(this.currentConversation.threadId, showAll);
        
        // Re-attach message action listeners
        this._attachMessageActionListeners();
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

    /**
     * Escapes content for use in HTML attributes
     * @param {string} str - String to escape
     * @returns {string} Escaped string for attributes
     * @private
     */
    _escapeAttribute(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/&/g, '&amp;');
    }

    /**
     * Attaches event listeners for message action buttons (play/copy)
     * @private
     */
    _attachMessageActionListeners() {
        if (!this.modal) return;
        
        // Handle play button clicks
        const playButtons = this.modal.querySelectorAll('.ww-play-button');
        playButtons.forEach(button => {
            const handler = async (e) => {
                e.stopPropagation();
                await this._handlePlayMessage(button);
            };
            button.addEventListener('click', handler);
            this.eventListeners.push({ element: button, event: 'click', handler });
        });
        
        // Handle copy button clicks
        const copyButtons = this.modal.querySelectorAll('.ww-copy-button');
        copyButtons.forEach(button => {
            const handler = async (e) => {
                e.stopPropagation();
                await this._handleCopyMessage(button);
            };
            button.addEventListener('click', handler);
            this.eventListeners.push({ element: button, event: 'click', handler });
        });
    }

    /**
     * Handles play button click
     * @param {HTMLElement} button - The play button element
     * @private
     */
    async _handlePlayMessage(button) {
        const messageContent = button.dataset.content;
        const messageId = button.dataset.messageId;
        
        if (!messageContent) {
            logger.warn(this, 'No content found for play button');
            return;
        }
        
        // Visual feedback - start playing
        button.classList.add('playing');
        
        try {
            // Emit async event to browser event handlers
            if (this.eventBus) {
                const result = await this.eventBus.emitAsync(EVENTS.CHAT.PLAY_AUDIO, { 
                    messageId,
                    content: messageContent,
                    source: 'conversation-modal',
                    action: 'play'
                });
                
                // Success - result contains { success: true, message: ... }
                logger.log(this, 'Audio playback completed:', result.message);
            }
        } catch (error) {
            // Handler threw an error
            logger.error(this, 'Audio playback failed:', error.message);
            // Could show user error feedback here
        } finally {
            // Remove playing state
            button.classList.remove('playing');
        }
    }

    /**
     * Handles copy button click
     * @param {HTMLElement} button - The copy button element
     * @private
     */
    async _handleCopyMessage(button) {
        const messageContent = button.dataset.content;
        const messageId = button.dataset.messageId;
        
        if (!messageContent) {
            logger.warn(this, 'No content found for copy button');
            return;
        }
        
        // Store original HTML for restoration
        const originalHTML = button.innerHTML;
        
        try {
            // Emit async event to browser event handlers
            if (this.eventBus) {
                const result = await this.eventBus.emitAsync(EVENTS.CHAT.COPY_MESSAGE, { 
                    messageId,
                    content: messageContent,
                    source: 'conversation-modal' 
                });
                
                // Success visual feedback - change icon briefly
                button.innerHTML = '✓';
                button.classList.add('copied');
                
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.classList.remove('copied');
                }, 2000);
                
                logger.log(this, 'Message copied successfully:', result.message);
            }
        } catch (error) {
            // Handler threw an error - show error feedback
            button.innerHTML = '✗';
            button.classList.add('error');
            
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.classList.remove('error');
            }, 2000);
            
            logger.error(this, 'Failed to copy message:', error.message);
        }
    }
}