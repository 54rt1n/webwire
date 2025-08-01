import { EVENTS } from '../js/core/events.js';
import { BasePanelApp } from '../core/base-panel-app.js';
import { ConversationsPanel } from './panel.js';
import { ConversationModal } from './components/conversation-modal.js';
import { AppConfig } from '../js/core/app-config.js';
import { logger } from '../js/core/logging.js';

/**
 * ConversationsPanelApp
 * The main controller for the Conversations Panel. This class wires together the
 * state management (data/business logic) and the ConversationsPanel (UI/view logic).
 */
class ConversationsPanelApp extends BasePanelApp {
    constructor(config) {
        super(config, 'conversations');
        this.conversationModal = null;
    }

    // --- HOOK METHODS: Implementation for BasePanelApp ---

    _getPanelComponent() {
        return ConversationsPanel;
    }

    _initializeDependencies() {
        // Create conversation modal after core is initialized
        this.conversationModal = new ConversationModal(this.core.stateService, this.eventBus);
    }

    _wireUpDependencies() {
        // Wire up the conversation modal with state service and event bus
        if (this.core.stateService) {
            this.conversationModal.setStateService(this.core.stateService);
            this.conversationModal.setEventBus(this.eventBus);
        }
    }

    _getUIHandlers() {
        return {
            onDeleteConversation: this.deleteConversation.bind(this),
            onViewConversation: this.viewConversation.bind(this),
            onSetActiveConversation: this.setActiveConversation.bind(this),
            onRefreshConversations: this.refreshConversations.bind(this),
            onCreateNewConversation: this.createNewConversation.bind(this),
            onSearchConversations: this.searchConversations.bind(this),
        };
    }

    async _loadData() {
        // Load initial conversations
        await this.loadConversations();
    }

    /**
     * Setup event listeners for conversation events
     */
    setupEventListeners() {
        // Listen for conversation updates
        this.on(EVENTS.CONVERSATION.UPDATED, (payload) => {
            logger.log(this, 'Conversation updated:', payload);
            this.refreshConversations();
        });

        // Listen for conversation activation (when one is set as active)
        this.on(EVENTS.CONVERSATION.ACTIVATED, (payload) => {
            logger.log(this, 'Conversation activated:', payload);
            this.refreshConversations();
        });
    }

    /**
     * Load all conversations and render them
     */
    async loadConversations() {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            logger.error(this, 'No conversation state service available');
            this.panel.renderConversations([]);
            return;
        }

        try {
            logger.log(this, 'Loading conversations...');
            
            // Get all conversations from state
            const conversations = this.core.stateService.conversation.listConversations();
            
            // Sort by most recent first
            conversations.sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));
            
            logger.log(this, `Loaded ${conversations.length} conversations`);
            this.panel.renderConversations(conversations);
            
        } catch (error) {
            logger.error(this, 'Failed to load conversations:', error);
            this.panel.renderConversations([]);
        }
    }

    /**
     * Refresh conversations list
     */
    async refreshConversations() {
        logger.log(this, 'Refreshing conversations...');
        await this.loadConversations();
    }

    /**
     * Delete a conversation
     * @param {string} threadId - The conversation thread ID to delete
     */
    async deleteConversation(threadId) {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            logger.error(this, 'No conversation state service available');
            return;
        }

        try {
            logger.log(this, `Deleting conversation ${threadId}...`);
            
            // Clear conversation history
            this.core.stateService.conversation.clearConversationHistory(threadId);
            
            // Save state
            await this.core.stateService.disk.saveToStorage();
            
            logger.log(this, `Conversation ${threadId} deleted`);
            
            // Refresh the list
            await this.refreshConversations();
            
            // Emit event for other components
            this.eventBus.emit(EVENTS.CONVERSATION.DELETED, { threadId });
            
        } catch (error) {
            logger.error(this, `Failed to delete conversation ${threadId}:`, error);
        }
    }

    /**
     * View a specific conversation in a modal
     * @param {Object} conversation - The conversation metadata to view
     */
    async viewConversation(conversation) {
        logger.log(this, `Viewing conversation ${conversation.threadId}...`, this);
        
        // Open the conversation modal
        this.conversationModal.open(
            conversation,
            null, // onClose callback
            (threadId) => this.setActiveConversation(threadId) // onSetActive callback
        );
    }

    /**
     * Set a conversation as the active conversation or complete it if already active
     * @param {string} threadId - The conversation thread ID to set as active
     */
    async setActiveConversation(threadId) {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            logger.error(this, 'No conversation state service available');
            return;
        }

        if (!threadId) {
            logger.error(this, 'Cannot set active conversation: threadId is null or undefined');
            return;
        }

        try {
            // Check if this conversation is already active
            const currentActiveThreadId = this.core.stateService.conversation.getActiveThreadId();
            const isAlreadyActive = currentActiveThreadId === threadId;
            
            if (isAlreadyActive) {
                logger.log(this, `Conversation ${threadId} is already active, marking as completed...`);
                // Use the existing method to mark as completed
                this.core.stateService.conversation.updateConversationStatus(threadId, 'completed');
            } else {
                logger.log(this, `Setting conversation ${threadId} as active...`);
                // Use the existing method (this will automatically complete other active conversations)
                this.core.stateService.conversation.setActiveConversation(threadId);
                
                // Emit event for chat service to pick up the new active conversation
                this.eventBus.emit(EVENTS.CONVERSATION.LOADED, { threadId });
            }
            
            // Save state using the disk state plugin
            await this.core.stateService.disk.saveToStorage();
            
            logger.log(this, `Conversation ${threadId} ${isAlreadyActive ? 'completed' : 'set as active'}`);
            
            // Close modal
            this.conversationModal.close();
            
            // Refresh the list to update status display
            await this.refreshConversations();
            
        } catch (error) {
            logger.error(this, `Failed to set conversation ${threadId} as active:`, error);
        }
    }

    /**
     * Create a new conversation
     */
    async createNewConversation() {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            logger.error(this, 'No conversation state service available');
            return;
        }

        try {
            logger.log(this, 'Creating new conversation...');
            
            // Create new conversation
            const threadId = this.core.stateService.conversation.createNewConversation({
                title: `New Conversation - ${new Date().toLocaleString()}`,
                pageUrl: window.location.href
            });
            
            // Set as active
            this.core.stateService.conversation.setActiveConversation(threadId);
            
            // Save state
            await this.core.stateService.disk.saveToStorage();
            
            logger.log(this, `New conversation ${threadId} created`);
            
            // Refresh the list
            await this.refreshConversations();
            
        } catch (error) {
            logger.error(this, 'Failed to create new conversation:', error);
        }
    }

    /**
     * Search conversations by query
     * @param {string} query - Search query string
     * @returns {Array} Matching conversations
     */
    async searchConversations(query) {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            logger.error(this, 'No conversation state service available');
            return [];
        }

        try {
            logger.log(this, `Searching conversations with query: "${query}"`);
            
            const results = this.core.stateService.conversation.searchConversations(query);
            
            logger.log(this, `Found ${results.length} matching conversations`);
            return results;
            
        } catch (error) {
            logger.error(this, 'Failed to search conversations:', error);
            return [];
        }
    }
}

// Kick off the application.
document.addEventListener('DOMContentLoaded', () => {
    const config = AppConfig.pageFactory('lite');
    
    const app = new ConversationsPanelApp(config);
    app.initialize();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});