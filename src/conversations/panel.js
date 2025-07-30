import '../shared/global.scss';
import './style.scss';
import { EVENTS } from '../js/core/events.js';

/**
 * ConversationsPanel
 * Manages all UI rendering and event handling for the Conversations Panel.
 * This class does not contain any business logic for fetching data; it only
 * receives data and renders it to the DOM.
 */
export class ConversationsPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.stateService = null;
        this.selectedConversations = new Set();
        this.currentSelectedConversation = null;
        
        this.elements = this._DOMElements();
        this.handlers = null; // Will be set during initialization
    }

    /**
     * Caches all necessary DOM elements for performance.
     * @private
     */
    _DOMElements() {
        return {
            // Main containers
            conversationsContainer: document.getElementById('conversations-list-container'),
            conversationsCountDisplay: document.getElementById('conversations-count-display'),
            activeConversationsDisplay: document.getElementById('active-conversations'),
            completedConversationsDisplay: document.getElementById('completed-conversations'),
            
            // Action buttons
            refreshConversationsBtn: document.getElementById('refresh-conversations-btn'),
            
            // Bulk actions
            selectAllCheckbox: document.getElementById('select-all-conversations'),
            bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
            bulkExportBtn: document.getElementById('bulk-export-btn'),
            selectionCount: document.getElementById('selection-count'),
            
            // Modals
            deleteModal: document.getElementById('delete-confirmation-modal'),
            deleteConversationTitle: document.getElementById('delete-conversation-title'),
            deleteConversationMeta: document.getElementById('delete-conversation-meta'),
            confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
            cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
            modalCloseBtn: document.getElementById('modal-close-btn'),
            
            // Bulk delete modal
            bulkDeleteModal: document.getElementById('bulk-delete-confirmation-modal'),
            bulkDeleteCount: document.getElementById('bulk-delete-count'),
            confirmBulkDeleteBtn: document.getElementById('confirm-bulk-delete-btn'),
            cancelBulkDeleteBtn: document.getElementById('cancel-bulk-delete-btn'),
            bulkModalCloseBtn: document.getElementById('bulk-modal-close-btn')
        };
    }

    /**
     * Sets the state service for data access
     * @param {object} stateService - The state service instance
     */
    setStateService(stateService) {
        this.stateService = stateService;
    }

    /**
     * Initializes the panel with event handlers
     * @param {object} handlers - Object containing handler functions
     */
    initialize(handlers) {
        this.handlers = handlers;
        this._setupEventListeners();
        console.log('[ConversationsPanel] Initialized');
    }

    /**
     * Sets up all DOM event listeners
     * @private
     */
    _setupEventListeners() {
        // Action buttons
        this.elements.refreshConversationsBtn.addEventListener('click', () => {
            if (this.handlers.onRefreshConversations) {
                this.handlers.onRefreshConversations();
            }
        });

        // Bulk actions
        this.elements.selectAllCheckbox.addEventListener('change', (e) => {
            this._handleSelectAll(e.target.checked);
        });

        this.elements.bulkDeleteBtn.addEventListener('click', () => {
            this._showBulkDeleteConfirmation();
        });

        this.elements.bulkExportBtn.addEventListener('click', () => {
            this._handleBulkExport();
        });

        // Delete confirmation modal
        this.elements.confirmDeleteBtn.addEventListener('click', () => {
            this._handleConfirmDelete();
        });

        this.elements.cancelDeleteBtn.addEventListener('click', () => {
            this._hideDeleteModal();
        });

        this.elements.modalCloseBtn.addEventListener('click', () => {
            this._hideDeleteModal();
        });

        // Bulk delete confirmation modal
        this.elements.confirmBulkDeleteBtn.addEventListener('click', () => {
            this._handleConfirmBulkDelete();
        });

        this.elements.cancelBulkDeleteBtn.addEventListener('click', () => {
            this._hideBulkDeleteModal();
        });

        this.elements.bulkModalCloseBtn.addEventListener('click', () => {
            this._hideBulkDeleteModal();
        });

        // Close modals on overlay click
        this.elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === this.elements.deleteModal) {
                this._hideDeleteModal();
            }
        });

        this.elements.bulkDeleteModal.addEventListener('click', (e) => {
            if (e.target === this.elements.bulkDeleteModal) {
                this._hideBulkDeleteModal();
            }
        });
    }

    /**
     * Renders the conversations list
     * @param {Array} conversations - Array of conversation objects
     */
    renderConversations(conversations) {
        console.log(`[ConversationsPanel] Rendering ${conversations.length} conversations`);
        
        // Calculate stats
        const activeCount = conversations.filter(c => c.status === 'active').length;
        const completedCount = conversations.filter(c => c.status === 'completed').length;
        
        // Update counts
        this.elements.conversationsCountDisplay.textContent = conversations.length;
        this.elements.activeConversationsDisplay.textContent = activeCount;
        this.elements.completedConversationsDisplay.textContent = completedCount;

        // Clear existing content
        this.elements.conversationsContainer.innerHTML = '';
        
        if (!conversations || conversations.length === 0) {
            this.elements.conversationsContainer.innerHTML = 
                '<div class="ww-empty-state"><div class="ww-empty-icon">💬</div><h3>No conversations yet</h3><p>Create a new conversation to get started.</p></div>';
            this._updateBulkActions();
            return;
        }

        // Create conversation items
        conversations.forEach(conversation => {
            const conversationEl = this._createConversationElement(conversation);
            this.elements.conversationsContainer.appendChild(conversationEl);
        });

        this._updateBulkActions();
    }

    /**
     * Creates a conversation list item element
     * @param {object} conversation - Conversation metadata object
     * @returns {HTMLElement} Conversation element
     * @private
     */
    _createConversationElement(conversation) {
        console.log('[ConversationsPanel] Creating conversation element:', conversation);
        const conversationEl = this._createEl('div', {
            className: 'ww-conversation-card',
            'data-thread-id': conversation.threadId
        });

        // Get conversation title and preview
        const title = this._getConversationTitle(conversation);
        const messageCount = this._getMessageCount(conversation.threadId);
        const lastUpdate = this._formatTimestamp(conversation.endTime || conversation.startTime);
        const status = conversation.status || 'active';

        conversationEl.innerHTML = `
            <div class="ww-conversation-header">
                <div class="ww-conversation-checkbox" data-thread-id="${conversation.threadId}">
                    <input type="checkbox" class="ww-checkbox" data-thread-id="${conversation.threadId}">
                </div>
                <div class="ww-conversation-info">
                    <div class="ww-conversation-title">${this._escapeHtml(title)}</div>
                    <div class="ww-conversation-meta">
                        <div class="ww-meta-item">
                            <span class="ww-meta-icon">👤</span>
                            <span>${this._escapeHtml(conversation.userName || 'User')} & ${this._escapeHtml(conversation.personaName || 'Assistant')}</span>
                        </div>
                        <div class="ww-meta-item">
                            <span class="ww-meta-icon">🕐</span>
                            <span>${lastUpdate}</span>
                        </div>
                    </div>
                </div>
                <div class="ww-conversation-actions">
                    <button class="ww-action-btn" title="View Conversation" data-thread-id="${conversation.threadId}">
                        <span class="ww-icon">👁️</span>
                    </button>
                    <button class="ww-action-btn delete-conversation" title="Delete Conversation" data-thread-id="${conversation.threadId}">
                        <span class="ww-icon">🗑️</span>
                    </button>
                </div>
            </div>
            <div class="ww-conversation-preview">
                ${this._getConversationPreview(conversation.threadId)}
            </div>
            <div class="ww-conversation-stats">
                <div class="ww-stat stat-messages">
                    <span class="ww-stat-icon">💬</span>
                    <span>${messageCount}</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-icon">⏱️</span>
                    <span>${this._formatDuration(conversation.duration)}</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-icon">📌</span>
                    <span>${status}</span>
                </div>
                <div class="ww-debug-info" title="threadId: ${conversation.threadId}, title: ${conversation.title || 'none'}, location: ${conversation.location || 'none'}">
                    <span class="ww-debug-icon">ℹ️</span>
                </div>
            </div>
        `;

        // Add event listeners
        this._setupConversationEventListeners(conversationEl, conversation);

        return conversationEl;
    }

    /**
     * Sets up event listeners for a conversation element
     * @param {HTMLElement} conversationEl - The conversation element
     * @param {object} conversation - The conversation data
     * @private
     */
    _setupConversationEventListeners(conversationEl, conversation) {
        // Checkbox area and checkbox selection
        const checkboxArea = conversationEl.querySelector('.ww-conversation-checkbox');
        const checkbox = conversationEl.querySelector('.ww-checkbox');
        
        checkboxArea.addEventListener('click', (e) => {
            e.stopPropagation();
            // Toggle checkbox if clicked on area but not on checkbox itself
            if (e.target === checkboxArea) {
                checkbox.checked = !checkbox.checked;
                this._handleConversationSelection(conversation.threadId, checkbox.checked);
            }
        });
        
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this._handleConversationSelection(conversation.threadId, e.target.checked);
        });

        // View conversation (opens modal)
        const viewBtn = conversationEl.querySelector('.ww-action-btn:not(.delete-conversation)');
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.handlers.onViewConversation) {
                this.handlers.onViewConversation(conversation);
            }
        });

        // Delete conversation
        const deleteBtn = conversationEl.querySelector('.delete-conversation');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._showDeleteConfirmation(conversation);
        });

        // Click to view conversation in modal
        conversationEl.addEventListener('click', (e) => {
            console.log('[ConversationsPanel] Conversation clicked:', conversation.threadId, e.target);
            if (this.handlers.onViewConversation) {
                this.handlers.onViewConversation(conversation);
            }
        });
    }

    /**
     * Gets a preview of the conversation
     * @param {string} threadId - Thread ID
     * @returns {string} HTML string of preview
     * @private
     */
    _getConversationPreview(threadId) {
        if (!this.stateService || !this.stateService.conversation) {
            return '';
        }
        
        const messages = this.stateService.conversation.getConversationMessages(threadId);
        if (!messages || messages.length === 0) {
            return '<span class="ww-text-muted">No messages yet</span>';
        }
        
        // Get the last user message or last message
        let lastMessage = messages[messages.length - 1];
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastMessage = messages[i];
                break;
            }
        }
        
        const content = lastMessage.content.length > 100 ? 
            lastMessage.content.substring(0, 100) + '...' : 
            lastMessage.content;
            
        return this._escapeHtml(content);
    }

    /**
     * Gets the conversation title from metadata or generates one
     * @param {object} conversation - Conversation metadata
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
     * Formats a timestamp for display
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Formatted time string
     * @private
     */
    _formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = diffMs / (1000 * 60 * 60);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffHours < 1) {
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${Math.floor(diffHours)}h ago`;
        } else if (diffDays < 7) {
            return `${Math.floor(diffDays)}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Formats duration in milliseconds to readable string
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Formatted duration
     * @private
     */
    _formatDuration(duration) {
        if (!duration) return 'Unknown';
        
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '<1m';
        }
    }

    /**
     * Selects a conversation and shows its details
     * @param {object} conversation - Conversation to select
     * @private
     */
    _selectConversation(conversation) {
        // Remove previous selection
        const previousSelected = this.elements.conversationsContainer.querySelector('.ww-conversation-card.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        // Add selection to current item
        const conversationEl = this.elements.conversationsContainer.querySelector(`[data-thread-id="${conversation.threadId}"]`);
        if (conversationEl) {
            conversationEl.classList.add('selected');
        }

        this.currentSelectedConversation = conversation;
    }

    /**
     * Renders conversation details in the side panel
     * @param {object} conversation - Conversation to show details for
     * @private
     */
    _renderConversationDetails(conversation) {
        const title = this._getConversationTitle(conversation);
        const messageCount = this._getMessageCount(conversation.threadId);
        const startTime = new Date(conversation.startTime).toLocaleString();
        const endTime = conversation.endTime ? new Date(conversation.endTime).toLocaleString() : 'Ongoing';
        const duration = this._formatDuration(conversation.duration);

        // Get recent messages for preview
        let messagesPreview = '';
        if (this.stateService && this.stateService.conversation) {
            const messages = this.stateService.conversation.getConversationMessages(conversation.threadId);
            const recentMessages = messages.slice(-3); // Last 3 messages
            
            messagesPreview = recentMessages.map(msg => {
                const content = msg.content.length > 100 ? 
                    msg.content.substring(0, 100) + '...' : 
                    msg.content;
                return `
                    <div class="conversation-preview-message ${msg.role}">
                        <strong>${msg.role === 'user' ? 'You' : 'Assistant'}:</strong> ${this._escapeHtml(content)}
                    </div>
                `;
            }).join('');
        }

        this.elements.conversationDetailsContent.innerHTML = `
            <div class="conversation-details">
                <h3>${this._escapeHtml(title)} <span class="thread-id">(${conversation.threadId})</span></h3>
                <div class="conversation-details-meta">
                    <div class="conversation-detail-row">
                        <span class="conversation-detail-label">Participants</span>
                        <span class="conversation-detail-value">${this._escapeHtml(conversation.userName || 'User')} & ${this._escapeHtml(conversation.personaName || 'Assistant')}</span>
                    </div>
                    <div class="conversation-detail-row">
                        <span class="conversation-detail-label">Messages</span>
                        <span class="conversation-detail-value">${messageCount}</span>
                    </div>
                    <div class="conversation-detail-row">
                        <span class="conversation-detail-label">Started</span>
                        <span class="conversation-detail-value">${startTime}</span>
                    </div>
                    <div class="conversation-detail-row">
                        <span class="conversation-detail-label">Last Activity</span>
                        <span class="conversation-detail-value">${endTime}</span>
                    </div>
                    <div class="conversation-detail-row">
                        <span class="conversation-detail-label">Duration</span>
                        <span class="conversation-detail-value">${duration}</span>
                    </div>
                    <div class="conversation-detail-row">
                        <span class="conversation-detail-label">Status</span>
                        <span class="conversation-detail-value conversation-status ${conversation.status || 'active'}">${conversation.status || 'active'}</span>
                    </div>
                </div>
                ${messagesPreview ? `
                    <div class="conversation-preview">
                        <h4>Recent Messages</h4>
                        <div class="conversation-preview-messages">
                            ${messagesPreview}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Handles conversation selection for bulk actions
     * @param {string} threadId - Thread ID
     * @param {boolean} selected - Whether selected
     * @private
     */
    _handleConversationSelection(threadId, selected) {
        if (selected) {
            this.selectedConversations.add(threadId);
        } else {
            this.selectedConversations.delete(threadId);
        }
        
        this._updateBulkActions();
        this._updateSelectAllState();
    }

    /**
     * Handles select all checkbox
     * @param {boolean} selectAll - Whether to select all
     * @private
     */
    _handleSelectAll(selectAll) {
        const checkboxes = this.elements.conversationsContainer.querySelectorAll('.ww-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAll;
            const threadId = checkbox.dataset.threadId;
            
            if (selectAll) {
                this.selectedConversations.add(threadId);
            } else {
                this.selectedConversations.delete(threadId);
            }
        });
        
        this._updateBulkActions();
    }

    /**
     * Updates the select all checkbox state
     * @private
     */
    _updateSelectAllState() {
        const checkboxes = this.elements.conversationsContainer.querySelectorAll('.ww-checkbox');
        const checkedCount = this.elements.conversationsContainer.querySelectorAll('.ww-checkbox:checked').length;
        
        if (checkedCount === 0) {
            this.elements.selectAllCheckbox.indeterminate = false;
            this.elements.selectAllCheckbox.checked = false;
        } else if (checkedCount === checkboxes.length) {
            this.elements.selectAllCheckbox.indeterminate = false;
            this.elements.selectAllCheckbox.checked = true;
        } else {
            this.elements.selectAllCheckbox.indeterminate = true;
        }
    }

    /**
     * Updates bulk action button states
     * @private
     */
    _updateBulkActions() {
        const selectedCount = this.selectedConversations.size;
        
        this.elements.bulkDeleteBtn.disabled = selectedCount === 0;
        this.elements.bulkExportBtn.disabled = selectedCount === 0;
        
        this.elements.selectionCount.textContent = 
            `${selectedCount} conversation${selectedCount !== 1 ? 's' : ''} selected`;
    }

    /**
     * Shows delete confirmation modal for a single conversation
     * @param {object} conversation - Conversation to delete
     * @private
     */
    _showDeleteConfirmation(conversation) {
        const title = this._getConversationTitle(conversation);
        const messageCount = this._getMessageCount(conversation.threadId);
        
        this.elements.deleteConversationTitle.textContent = title;
        this.elements.deleteConversationMeta.textContent = 
            `${messageCount} messages • ${conversation.userName || 'User'} & ${conversation.personaName || 'Assistant'}`;
        
        this.elements.deleteModal.classList.add('show');
        this.pendingDeleteThreadId = conversation.threadId;
    }

    /**
     * Hides the delete confirmation modal
     * @private
     */
    _hideDeleteModal() {
        this.elements.deleteModal.classList.remove('show');
        this.pendingDeleteThreadId = null;
    }

    /**
     * Handles confirmed single conversation deletion
     * @private
     */
    _handleConfirmDelete() {
        if (this.pendingDeleteThreadId && this.handlers.onDeleteConversation) {
            this.handlers.onDeleteConversation(this.pendingDeleteThreadId);
        }
        this._hideDeleteModal();
    }

    /**
     * Shows bulk delete confirmation modal
     * @private
     */
    _showBulkDeleteConfirmation() {
        const selectedCount = this.selectedConversations.size;
        this.elements.bulkDeleteCount.textContent = selectedCount;
        this.elements.bulkDeleteModal.classList.add('show');
    }

    /**
     * Hides the bulk delete confirmation modal
     * @private
     */
    _hideBulkDeleteModal() {
        this.elements.bulkDeleteModal.classList.remove('show');
    }

    /**
     * Handles confirmed bulk conversation deletion
     * @private
     */
    _handleConfirmBulkDelete() {
        if (this.handlers.onDeleteConversation) {
            for (const threadId of this.selectedConversations) {
                this.handlers.onDeleteConversation(threadId);
            }
        }
        
        this.selectedConversations.clear();
        this._hideBulkDeleteModal();
        this._updateBulkActions();
        this._updateSelectAllState();
    }

    /**
     * Handles bulk export of conversations
     * @private
     */
    _handleBulkExport() {
        if (!this.stateService || !this.stateService.conversation) {
            console.warn('[ConversationsPanel] No state service available for export');
            return;
        }

        try {
            const exportData = [];
            
            for (const threadId of this.selectedConversations) {
                const messages = this.stateService.conversation.getConversationMessages(threadId);
                const metadata = this.stateService.state.conversation.metadata[threadId];
                
                exportData.push({
                    threadId,
                    metadata,
                    messages
                });
            }

            // Create and download JSON file
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `webwire-conversations-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            console.log(`[ConversationsPanel] Exported ${exportData.length} conversations`);
            
        } catch (error) {
            console.error('[ConversationsPanel] Failed to export conversations:', error);
        }
    }

    /**
     * Shows delete all conversations confirmation dialog
     * @private
     */
    _showDeleteAllConfirmation() {
        const totalConversations = Object.keys(this.stateService.state.conversation.metadata).length;
        
        if (totalConversations === 0) {
            console.log('[ConversationsPanel] No conversations to delete');
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete ALL ${totalConversations} conversations?\n\n` +
            'This action cannot be undone and will permanently remove all conversation history.'
        );

        if (confirmed) {
            this._handleDeleteAllConversations();
        }
    }

    /**
     * Handles the deletion of all conversations
     * @private
     */
    _handleDeleteAllConversations() {
        try {
            if (this.stateService && this.stateService.conversation) {
                this.stateService.conversation.hardResetAllConversations();
                console.log('[ConversationsPanel] All conversations deleted successfully');
                
                // Refresh the conversations list
                if (this.handlers.onRefreshConversations) {
                    this.handlers.onRefreshConversations();
                }
            }
        } catch (error) {
            console.error('[ConversationsPanel] Failed to delete all conversations:', error);
            alert('Failed to delete conversations. Please try again.');
        }
    }

    /**
     * Creates a DOM element with optional properties
     * @param {string} tag - Element tag name
     * @param {object} props - Element properties
     * @returns {HTMLElement} Created element
     * @private
     */
    _createEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        return el;
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