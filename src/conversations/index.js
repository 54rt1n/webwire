import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { ConversationsPanel } from './panel.js';
import { WebWireClientCore } from '../js/client/webwire-client-core.js';
import { PanelEventHandlers } from '../js/client/panel-event-handlers.js';
import { EventBus } from '../js/core/event-bus.js';
import { conversationModal } from './components/conversation-modal.js';

/**
 * ConversationsPanelApp
 * The main controller for the Conversations Panel. This class wires together the
 * state management (data/business logic) and the ConversationsPanel (UI/view logic).
 */
class ConversationsPanelApp {
    constructor() {
        this.eventBus = new EventBus({domain: 'conversations', debug: true});
        this.core = new WebWireClientCore(this.eventBus);
        this.panelEventHandlers = null;
        this.panel = new ConversationsPanel(this.eventBus);
        
        this.setupEventListeners();
    }

    /**
     * Initializes the entire application.
     */
    async initialize() {
        console.log('[ConversationsApp] Initializing Conversations Panel...');

        await this.core.initialize();
        this.panelEventHandlers = new PanelEventHandlers(this.core);
        this.panelEventHandlers.setupEventListeners();

        // Set up state service for conversations management
        if (this.core.stateService) {
            this.panel.setStateService(this.core.stateService);
            conversationModal.setStateService(this.core.stateService);
        }

        // Setup UI event handlers
        const handlers = {
            onDeleteConversation: this.deleteConversation.bind(this),
            onViewConversation: this.viewConversation.bind(this),
            onSetActiveConversation: this.setActiveConversation.bind(this),
            onRefreshConversations: this.refreshConversations.bind(this),
            onCreateNewConversation: this.createNewConversation.bind(this),
        };
        this.panel.initialize(handlers);

        // Load initial conversations
        await this.loadConversations();
        
        console.log('[ConversationsApp] Initialization complete');
    }

    /**
     * Setup event listeners for conversation events
     */
    setupEventListeners() {
        // Listen for conversation updates
        this.eventBus.on(EVENTS.CONVERSATION.UPDATED, (payload) => {
            console.log('[ConversationsApp] Conversation updated:', payload);
            this.refreshConversations();
        });

        // Listen for conversation activation (when one is set as active)
        this.eventBus.on(EVENTS.CONVERSATION.ACTIVATED, (payload) => {
            console.log('[ConversationsApp] Conversation activated:', payload);
            this.refreshConversations();
        });
    }

    /**
     * Load all conversations and render them
     */
    async loadConversations() {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            console.error('[ConversationsApp] No conversation state service available');
            this.panel.renderConversations([]);
            return;
        }

        try {
            console.log('[ConversationsApp] Loading conversations...');
            
            // Get all conversations from state
            const conversations = this.core.stateService.conversation.listConversations();
            
            // Sort by most recent first
            conversations.sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));
            
            console.log(`[ConversationsApp] Loaded ${conversations.length} conversations`);
            this.panel.renderConversations(conversations);
            
        } catch (error) {
            console.error('[ConversationsApp] Failed to load conversations:', error);
            this.panel.renderConversations([]);
        }
    }

    /**
     * Refresh conversations list
     */
    async refreshConversations() {
        console.log('[ConversationsApp] Refreshing conversations...');
        await this.loadConversations();
    }

    /**
     * Delete a conversation
     * @param {string} threadId - The conversation thread ID to delete
     */
    async deleteConversation(threadId) {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            console.error('[ConversationsApp] No conversation state service available');
            return;
        }

        try {
            console.log(`[ConversationsApp] Deleting conversation ${threadId}...`);
            
            // Clear conversation history
            this.core.stateService.conversation.clearConversationHistory(threadId);
            
            // Save state
            await this.core.stateService.disk.saveToStorage();
            
            console.log(`[ConversationsApp] Conversation ${threadId} deleted`);
            
            // Refresh the list
            await this.refreshConversations();
            
            // Emit event for other components
            this.eventBus.emit(EVENTS.CONVERSATION.DELETED, { threadId });
            
        } catch (error) {
            console.error(`[ConversationsApp] Failed to delete conversation ${threadId}:`, error);
        }
    }

    /**
     * View a specific conversation in a modal
     * @param {Object} conversation - The conversation metadata to view
     */
    async viewConversation(conversation) {
        console.log(`[ConversationsApp] Viewing conversation ${conversation.threadId}...`);
        
        // Open the conversation modal
        conversationModal.open(
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
            console.error('[ConversationsApp] No conversation state service available');
            return;
        }

        try {
            // Check if this conversation is already active
            const currentActiveThreadId = this.core.stateService.conversation.getActiveThreadId();
            const isAlreadyActive = currentActiveThreadId === threadId;
            
            if (isAlreadyActive) {
                console.log(`[ConversationsApp] Conversation ${threadId} is already active, marking as completed...`);
                // Use the existing method to mark as completed
                this.core.stateService.conversation.updateConversationStatus(threadId, 'completed');
            } else {
                console.log(`[ConversationsApp] Setting conversation ${threadId} as active...`);
                // Use the existing method (this will automatically complete other active conversations)
                this.core.stateService.conversation.setActiveConversation(threadId);
                
                // Emit event for chat service to pick up the new active conversation
                this.eventBus.emit(EVENTS.CONVERSATION.LOADED, { threadId });
            }
            
            // Save state using the disk state plugin
            await this.core.stateService.disk.saveToStorage();
            
            console.log(`[ConversationsApp] Conversation ${threadId} ${isAlreadyActive ? 'completed' : 'set as active'}`);
            
            // Close modal
            conversationModal.close();
            
            // Refresh the list to update status display
            await this.refreshConversations();
            
        } catch (error) {
            console.error(`[ConversationsApp] Failed to set conversation ${threadId} as active:`, error);
        }
    }

    /**
     * Create a new conversation
     */
    async createNewConversation() {
        if (!this.core.stateService || !this.core.stateService.conversation) {
            console.error('[ConversationsApp] No conversation state service available');
            return;
        }

        try {
            console.log('[ConversationsApp] Creating new conversation...');
            
            // Create new conversation
            const threadId = this.core.stateService.conversation.createNewConversation({
                title: `New Conversation - ${new Date().toLocaleString()}`,
                url: window.location.href,
                location: window.location.href
            });
            
            // Set as active
            this.core.stateService.conversation.setActiveConversation(threadId);
            
            // Save state
            await this.core.stateService.disk.saveToStorage();
            
            console.log(`[ConversationsApp] New conversation ${threadId} created`);
            
            // Refresh the list
            await this.refreshConversations();
            
        } catch (error) {
            console.error('[ConversationsApp] Failed to create new conversation:', error);
        }
    }
}

// Kick off the application.
document.addEventListener('DOMContentLoaded', () => {
    const app = new ConversationsPanelApp();
    app.initialize();
});