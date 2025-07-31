import './chat-select.scss';

/**
 * ChatSelectModal
 * A modal interface for selecting conversations across all tabs.
 * Follows the EmojiBrowser pattern - standalone component that returns promises.
 * Usage: const threadId = await chatSelectModal.open(stateService);
 */
export class ChatSelectModal {
    constructor() {
        this.container = null;
        this.isOpen = false;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.stateService = null;
        this.currentTabId = null;
        this.expandedTabs = new Set(); // Track which tabs are expanded
        
        this._createModal();
        this._setupEventListeners();
    }

    /**
     * Opens the modal and returns a promise with the selected thread ID
     * @param {StateService} stateService - The state service for conversation access
     * @returns {Promise<string>} The selected thread ID
     */
    open(stateService) {
        if (this.isOpen) {
            return Promise.reject(new Error('Chat select modal is already open'));
        }
        
        if (!stateService) {
            return Promise.reject(new Error('State service is required'));
        }
        
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            this.stateService = stateService;
            
            // Get current tab ID and expand it by default
            this.currentTabId = this.stateService.ui.getTabId();
            this.expandedTabs.clear();
            this.expandedTabs.add(this.currentTabId);
            
            // Build and display conversation tree
            this._updateConversationTree();
            
            // Show modal
            this.container.style.display = 'flex';
            this.isOpen = true;
            
            // Add escape listener
            document.addEventListener('keydown', this._escapeHandler);
        });
    }

    /**
     * Closes the modal
     */
    close() {
        if (!this.isOpen) return;
        
        this.container.style.display = 'none';
        this.isOpen = false;
        
        // Remove escape listener
        document.removeEventListener('keydown', this._escapeHandler);
        
        // Clear state service reference
        this.stateService = null;
        
        // Reject promise if still pending
        if (this.rejectPromise) {
            this.rejectPromise(new Error('Chat select closed without selection'));
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
    }

    /**
     * Creates the modal DOM structure
     * @private
     */
    _createModal() {
        this.container = document.createElement('div');
        this.container.className = 'ww-modal ww-chat-select-modal';
        this.container.style.display = 'none';
        
        this.container.innerHTML = `
            <div class="ww-content">
                <div class="ww-header">
                    <h3 class="ww-title">Select Conversation</h3>
                    <button class="ww-close">
                        <span class="ww-icon">&times;</span>
                    </button>
                </div>
                <div class="ww-body">
                    <div class="ww-chat-select-tree">
                        <!-- Tree content will be populated by _updateConversationTree -->
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        
        // Bind the escape handler to this instance
        this._escapeHandler = this._handleEscapeKey.bind(this);
    }

    /**
     * Sets up event listeners
     * @private
     */
    _setupEventListeners() {
        // Close button
        this.container.querySelector('.ww-close').addEventListener('click', () => {
            this.close();
        });
        
        // Overlay click - click on the modal background (but not the content)
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                this.close();
            }
        });
        
        // Delegated event listeners for conversation selection and tab expansion
        this.container.addEventListener('click', (e) => {
            // Handle conversation selection - check if clicked element or parent is a conversation item
            const conversationItem = e.target.closest('.ww-chat-select-item');
            if (conversationItem) {
                const threadId = conversationItem.dataset.threadId;
                if (threadId) {
                    this._selectConversation(threadId);
                }
                return;
            }
            
            // Handle tab expansion toggle
            const toggleBtn = e.target.closest('.ww-chat-select-tab-toggle');
            if (toggleBtn) {
                const tabId = toggleBtn.dataset.tabId;
                if (tabId) {
                    this._toggleTabExpansion(tabId);
                }
                return;
            }
        });
    }

    /**
     * Handles escape key press
     * @private
     */
    _handleEscapeKey(e) {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Handles conversation selection
     * @param {string} threadId - The selected thread ID
     * @private
     */
    _selectConversation(threadId) {
        if (this.resolvePromise) {
            this.resolvePromise(threadId);
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
        
        this.close();
    }

    /**
     * Toggles tab expansion state
     * @param {string} tabId - The tab ID to toggle
     * @private
     */
    _toggleTabExpansion(tabId) {
        if (this.expandedTabs.has(tabId)) {
            this.expandedTabs.delete(tabId);
        } else {
            this.expandedTabs.add(tabId);
        }
        
        // Update the tree view
        this._updateConversationTree();
    }

    /**
     * Builds and updates the conversation tree
     * @private
     */
    _updateConversationTree() {
        const treeContainer = this.container.querySelector('.ww-chat-select-tree');
        if (!treeContainer || !this.stateService) return;

        // Get all conversations using the state service methods
        const allMetadata = this.stateService.state.conversation.metadata || {};
        const allHistory = this.stateService.state.conversation.history || {};
        
        // Group conversations by tab
        const conversationsByTab = this._groupConversationsByTab(allMetadata, allHistory);
        
        // Sort tabs by most recent activity
        const sortedTabs = this._sortTabsByActivity(conversationsByTab);
        
        // Generate HTML
        if (sortedTabs.length === 0) {
            treeContainer.innerHTML = '<div class="ww-chat-select-empty">No conversations found</div>';
            return;
        }
        
        const treeHTML = sortedTabs.map(({ tabId, conversations, isCurrentTab }) => {
            const isExpanded = this.expandedTabs.has(tabId);
            const tabDisplayId = tabId === 'undefined' || !tabId ? 'Unknown Tab' : `Tab: ${tabId}`;
            const currentIndicator = isCurrentTab ? ' (current)' : '';
            
            const conversationsHTML = isExpanded ? conversations.map(conv => {
                const statusBadge = this._getStatusBadge(conv.status);
                const timeDisplay = this._formatTimeDisplay(conv.lastMessageTime || conv.startTime);
                const titleDisplay = conv.title || conv.location || 'Untitled Conversation';
                const threadShortId = conv.threadId.split('-').slice(-1)[0];
                
                return `
                    <div class="ww-chat-select-item" data-thread-id="${conv.threadId}">
                        <div class="ww-chat-select-conversation">
                            <div class="ww-chat-select-conversation-header">
                                <span class="ww-chat-select-status-badge ww-chat-select-status-${conv.status}">${statusBadge}</span>
                                <span class="ww-chat-select-thread-id">${threadShortId}</span>
                            </div>
                            <div class="ww-chat-select-conversation-details">
                                <div class="ww-chat-select-timestamp">${timeDisplay}</div>
                                <div class="ww-chat-select-title" title="${this._escapeHtml(titleDisplay)}">${this._escapeHtml(this._truncateText(titleDisplay, 40))}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('') : '';
            
            return `
                <div class="ww-chat-select-tab-group">
                    <div class="ww-chat-select-tab-header">
                        <button class="ww-chat-select-tab-toggle" data-tab-id="${tabId}">
                            <span class="ww-chat-select-tab-arrow ${isExpanded ? 'expanded' : ''}">${isExpanded ? '▼' : '▶'}</span>
                            <span class="ww-chat-select-tab-title">${this._escapeHtml(tabDisplayId + currentIndicator)}</span>
                            <span class="ww-chat-select-tab-count">(${conversations.length})</span>
                        </button>
                    </div>
                    ${isExpanded ? `<div class="ww-chat-select-tab-content">${conversationsHTML}</div>` : ''}
                </div>
            `;
        }).join('');
        
        treeContainer.innerHTML = treeHTML;
    }

    /**
     * Groups conversations by tab ID
     * @param {Object} allMetadata - All conversation metadata
     * @param {Object} allHistory - All conversation history
     * @returns {Object} Conversations grouped by tab
     * @private
     */
    _groupConversationsByTab(allMetadata, allHistory) {
        const conversationsByTab = {};
        
        Object.keys(allMetadata).forEach(threadId => {
            const metadata = allMetadata[threadId];
            const history = allHistory[threadId] || [];
            
            // Skip empty conversations (no messages)
            if (history.length === 0) return;
            
            const tabId = metadata.tabId || 'undefined';
            
            if (!conversationsByTab[tabId]) {
                conversationsByTab[tabId] = [];
            }
            
            // Calculate last message time
            const lastMessageTime = history.length > 0 
                ? Math.max(...history.map(msg => msg.timestamp || 0))
                : metadata.startTime;
            
            conversationsByTab[tabId].push({
                ...metadata,
                lastMessageTime,
                messageCount: history.length
            });
        });
        
        // Sort conversations within each tab by recent activity
        Object.keys(conversationsByTab).forEach(tabId => {
            conversationsByTab[tabId].sort((a, b) => {
                // Active conversations first
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (b.status === 'active' && a.status !== 'active') return 1;
                
                // Then by last message time
                return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
            });
        });
        
        return conversationsByTab;
    }

    /**
     * Sorts tabs by most recent activity
     * @param {Object} conversationsByTab - Conversations grouped by tab
     * @returns {Array} Sorted tab data
     * @private
     */
    _sortTabsByActivity(conversationsByTab) {
        return Object.keys(conversationsByTab).map(tabId => {
            const conversations = conversationsByTab[tabId];
            const mostRecentTime = Math.max(...conversations.map(conv => conv.lastMessageTime || 0));
            
            return {
                tabId,
                conversations,
                mostRecentTime,
                isCurrentTab: tabId === this.currentTabId
            };
        }).sort((a, b) => {
            // Current tab first
            if (a.isCurrentTab && !b.isCurrentTab) return -1;
            if (b.isCurrentTab && !a.isCurrentTab) return 1;
            
            // Then by most recent activity
            return b.mostRecentTime - a.mostRecentTime;
        });
    }

    /**
     * Gets status badge text for a conversation status
     * @param {string} status - The conversation status
     * @returns {string} Badge text
     * @private
     */
    _getStatusBadge(status) {
        switch (status) {
            case 'active': return 'Active';
            case 'completed': return 'Completed';
            case 'saved': return 'Saved';
            case 'error': return 'Error';
            case 'deleted': return 'Deleted';
            default: return 'Unknown';
        }
    }

    /**
     * Formats timestamp for display
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Formatted time string
     * @private
     */
    _formatTimeDisplay(timestamp) {
        if (!timestamp) return 'Unknown time';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Truncates text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     * @private
     */
    _truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Escapes HTML in text
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     * @private
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export singleton instance (following EmojiBrowser pattern)
export const chatSelectModal = new ChatSelectModal();