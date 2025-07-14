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
            
            // Action buttons
            newConversationBtn: document.getElementById('new-conversation-btn'),
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
        this.elements.newConversationBtn.addEventListener('click', () => {
            if (this.handlers.onCreateNewConversation) {
                this.handlers.onCreateNewConversation();
            }
        });

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
        
        // Update count
        this.elements.conversationsCountDisplay.textContent = 
            `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`;

        // Clear existing content
        this.elements.conversationsContainer.innerHTML = '';
        
        if (!conversations || conversations.length === 0) {
            this.elements.conversationsContainer.innerHTML = 
                '<div class="placeholder">No conversations found. Create a new conversation to get started.</div>';
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
        const conversationEl = this._createEl('div', {
            className: 'conversation-item',
            'data-thread-id': conversation.threadId
        });

        // Get conversation title and preview
        const title = this._getConversationTitle(conversation);
        const messageCount = this._getMessageCount(conversation.threadId);
        const lastUpdate = this._formatTimestamp(conversation.endTime || conversation.startTime);
        const status = conversation.status || 'active';

        conversationEl.innerHTML = `
            <div class="conversation-item-header">
                <div class="conversation-checkbox-area" data-thread-id="${conversation.threadId}">
                    <input type="checkbox" class="conversation-checkbox" data-thread-id="${conversation.threadId}">
                </div>
                <div class="conversation-title">${this._escapeHtml(title)}</div>
                <div class="conversation-actions">
                    <button class="btn-icon view-conversation" title="View Conversation" data-thread-id="${conversation.threadId}">
                        👁️
                    </button>
                    <button class="btn-icon delete-conversation" title="Delete Conversation" data-thread-id="${conversation.threadId}">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="conversation-meta">
                <div class="conversation-meta-row">
                    <span class="conversation-participants">${this._escapeHtml(conversation.userName || 'User')} & ${this._escapeHtml(conversation.personaName || 'Assistant')}</span>
                    <span class="conversation-timestamp">${lastUpdate}</span>
                </div>
                <div class="conversation-stats">
                    <div class="conversation-stat">
                        <span>💬</span>
                        <span>${messageCount} messages</span>
                    </div>
                    <div class="conversation-stat">
                        <span>⏱️</span>
                        <span>${this._formatDuration(conversation.duration)}</span>
                    </div>
                    <div class="conversation-status ${status}">${status}</div>
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
        const checkboxArea = conversationEl.querySelector('.conversation-checkbox-area');
        const checkbox = conversationEl.querySelector('.conversation-checkbox');
        
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
        const viewBtn = conversationEl.querySelector('.view-conversation');
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
        const previousSelected = this.elements.conversationsContainer.querySelector('.conversation-item.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        // Add selection to current item
        const conversationEl = this.elements.conversationsContainer.querySelector(`[data-thread-id="${conversation.threadId}"]`);
        if (conversationEl) {
            conversationEl.classList.add('selected');
        }

        this.currentSelectedConversation = conversation;
        this._renderConversationDetails(conversation);
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
                <h3>${this._escapeHtml(title)}</h3>
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
        const checkboxes = this.elements.conversationsContainer.querySelectorAll('.conversation-checkbox');
        
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
        const checkboxes = this.elements.conversationsContainer.querySelectorAll('.conversation-checkbox');
        const checkedCount = this.elements.conversationsContainer.querySelectorAll('.conversation-checkbox:checked').length;
        
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
        
        this.elements.deleteModal.style.display = 'flex';
        this.pendingDeleteThreadId = conversation.threadId;
    }

    /**
     * Hides the delete confirmation modal
     * @private
     */
    _hideDeleteModal() {
        this.elements.deleteModal.style.display = 'none';
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
        this.elements.bulkDeleteModal.style.display = 'flex';
    }

    /**
     * Hides the bulk delete confirmation modal
     * @private
     */
    _hideBulkDeleteModal() {
        this.elements.bulkDeleteModal.style.display = 'none';
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