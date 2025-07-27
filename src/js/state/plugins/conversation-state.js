import { EVENTS } from '../../core/events.js';
import { generateMessageId } from '../../utils/id-generator.js';

/**
 * Plugin for handling conversation history and management.
 */
export class ConversationStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
    }

    /**
     * Safe conversation state access
     */
    _safeConversationState({force = false} = {}) {
        if (force) {
            this.stateService.state.conversation = {};
            this.stateService.state.conversation.history = {};
            this.stateService.state.conversation.metadata = {};
            return this.stateService.state.conversation;
        }
        if (!this.stateService.state.conversation) {
            this.stateService.state.conversation = {};
        }
        if (!this.stateService.state.conversation.history) {
            this.stateService.state.conversation.history = {};
        }
        if (!this.stateService.state.conversation.metadata) {
            this.stateService.state.conversation.metadata = {};
        }
        return this.stateService.state.conversation;
    }

    /**
     * Gets all messages for a specific conversation.
     * @param {string} threadId
     * @returns {Array} Array of message objects
     */
    getConversationMessages(threadId) {
        const state = this.stateService.state.conversation;

        if (state.history[threadId]) {
            return state.history[threadId];
        }

        return [];
    }

    /**
     * Get conversation metadata by thread ID
     * @param {string} threadId
     * @returns {object} Conversation metadata
     */
    getConversationMetadata(threadId) {
        return this._safeConversationState().metadata[threadId];
    }

    /**
     * Get a conversation by thread ID
     * @param {string} threadId
     * @returns {object} Conversation object
     */
    getConversation(threadId) {
        const state = this._safeConversationState();
        return {
            threadId: threadId,
            messages: state.history[threadId],
            metadata: state.metadata[threadId]
        };
    }

    /**
     * Update a conversation by thread ID
     * @param {string} threadId
     * @param {array} messages - Array of messages
     * @param {object} metadata - Conversation metadata
     * @returns {boolean} True if successful, false otherwise
     */
    updateConversation(threadId, messages, metadata) {
        const state = this._safeConversationState();

        // TODO we should probably merge unique values or something here
        state.metadata[threadId] = metadata;
        state.history[threadId] = messages;
        return true;
    }

    /**
     * Get active thread
     * @returns {object} Conversation object
     */
    getActiveThread(tabId) {
        const threadId = this.getActiveThreadId(tabId);
        if (threadId) {
            return this.getConversation(threadId);
        }
        return null;
    }

    /**
     * Stores a partial user message in the state (first part of two-part message creation).
     * @param {string} threadId
     * @param {object} userMessage - { role, content, timestamp, title?, url?, model?, saved? }
     * @param {object} options - { userName?, personaName?, mood?, location?, timestamp? }
     */
    storePartialUserMessage(threadId, userMessage, { userName, personaName, mood, location, timestamp, ...options } = {}) {
        const state = this._safeConversationState();

        if (!timestamp) {
            timestamp = Date.now();
        }

        // Ensure history for this conversation exists
        if (!state.history[threadId]) {
            state.history[threadId] = [];
        }

        // Add user message immediately
        state.history[threadId].push({
            messageId: generateMessageId(),
            role: 'user',
            content: userMessage.content,
            timestamp,
            ...userMessage
        });

        // Update metadata if it doesn't exist
        if (!state.metadata[threadId]) {
            state.metadata[threadId] = {
                threadId: threadId,
                tabId: this.stateService.ui.getTabId(),  // Associate with current tab
                userName: userName || 'User',
                personaName: personaName || 'Default',
                mood: mood,
                location: location,
                startTime: timestamp,
                endTime: undefined,
                duration: undefined,
                status: 'active',
                error: undefined,
                errorCode: undefined,
                errorType: undefined,
            };
        }

        console.log(`Stored partial user message in conversation ${threadId}.`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
    }

    /**
     * Stores an assistant message to complete the two-part message creation.
     * @param {string} threadId
     * @param {object} assistantMessage - { role, content, think?, timestamp, url?, title?, model?, saved? }
     * @param {object} options - { userName?, personaName?, mood?, location?, timestamp?, toolResults?, toolCalls?, parseErrors? }
     */
    storeAssistantMessage(threadId, assistantMessage, { userName, personaName, mood, location, timestamp,
        toolResults = [], toolCalls = [], parseErrors = [], ...options } = {}) {
        const state = this._safeConversationState();

        if (!timestamp) {
            timestamp = Date.now();
        }

        // Ensure history for this conversation exists
        if (!state.history[threadId]) {
            state.history[threadId] = [];
        }

        // Add assistant message
        if (assistantMessage && assistantMessage.content) {
            state.history[threadId].push({
                messageId: generateMessageId(),
                role: 'assistant',
                content: assistantMessage.content,
                timestamp: timestamp,
                think: assistantMessage.think, // optional extracted thought content
                toolResults: toolResults,
                toolCalls: toolCalls,
                parseErrors: parseErrors,
                ...assistantMessage
            });
        }

        // Update metadata
        if (state.metadata[threadId]) {
            state.metadata[threadId].endTime = timestamp;
            state.metadata[threadId].duration = timestamp - state.metadata[threadId].startTime;
        }

        console.log(`Stored assistant message in conversation ${threadId}.`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
    }

    /**
     * Stores a message pair in the state.
     * @param {string} threadId
     * @param {object} userMessage - { role, content, timestamp, title?, url?, model?, saved? }
     * @param {object} assistantMessage - { role, content, think?, timestamp, url?, title?, model?, saved? }
     * @param {object} options - { userName?, personaName?, mood?, location?, timestamp?, toolResults?, toolCalls?, parseErrors? }
     */
    storeMessage(threadId, userMessage, assistantMessage, { userName, personaName, mood, location, timestamp,
        toolResults = [], toolCalls = [], parseErrors = [], ...options } = {}) {
        const state = this._safeConversationState();

        if (!timestamp) {
            timestamp = Date.now();
        }

        // Ensure history for this conversation exists
        if (!state.history[threadId]) {
            state.history[threadId] = [];
        }

        // Add user message
        state.history[threadId].push({
            messageId: generateMessageId(),
            role: 'user',
            content: userMessage.content,
            timestamp,
            ...userMessage
        });

        // Add assistant message
        if (assistantMessage && assistantMessage.content) {
            state.history[threadId].push({
                messageId: generateMessageId(),
                role: 'assistant',
                content: assistantMessage.content,
                timestamp: timestamp + 1, // Ensure it's ordered after user message
                think: assistantMessage.think, // optional extracted thought content
                toolResults: toolResults,
                toolCalls: toolCalls,
                parseErrors: parseErrors,
                ...assistantMessage
            });
        }
        
        // Update metadata if it doesn't exist
        if (!state.metadata[threadId]) {
            state.metadata[threadId] = {
                threadId: threadId,
                tabId: this.stateService.ui.getTabId(),  // Associate with current tab
                userName: userName || 'User',
                personaName: personaName || 'Default',
                mood: mood,
                location: location,
                startTime: timestamp,
                endTime: undefined,
                duration: undefined,
                status: 'active',
                error: undefined,
                errorCode: undefined,
                errorType: undefined,
            };
        } else {
            // Update existing metadata
            state.metadata[threadId].endTime = timestamp;
            state.metadata[threadId].duration = timestamp - state.metadata[threadId].startTime;
        }
        
        console.log(`[ConversationState] Stored message in conversation ${threadId}.`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
    }

    /**
     * Retrieves all conversations associated with a specific persona.
     * @param {string} personaName
     * @returns {Array} A sorted list of conversation metadata objects.
     */
    getConversationsFor(personaName) {
        const state = this._safeConversationState();
        const personaConvos = Object.values(state.metadata)
            .filter(meta => meta.personaName === personaName)
            .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
        return personaConvos;
    }

    /**
     * Clears all messages for a specific conversation.
     * @param {string} threadId
     */
    clearConversationHistory(threadId) {
        const state = this._safeConversationState();
        
        if (state.history[threadId]) {
            delete state.history[threadId];
            delete state.metadata[threadId];
            
            console.log(`Cleared history for conversation ${threadId}`);
            this.eventBus.emit(EVENTS.CONVERSATION.DELETED, { threadId });
            return true;
        }
        return false;
    }

    /**
     * Updates conversation status and optional error information.
     * @param {string} threadId
     * @param {string} status - 'active', 'completed', 'saved', 'error', 'deleted'
     * @param {object} errorInfo - { error?, errorCode?, errorType? }
     */
    updateConversationStatus(threadId, status, errorInfo = {}) {
        const state = this._safeConversationState();
        
        if (state.metadata[threadId]) {
            state.metadata[threadId].status = status;
            state.metadata[threadId].error = errorInfo.error;
            state.metadata[threadId].errorCode = errorInfo.errorCode;
            state.metadata[threadId].errorType = errorInfo.errorType;
            
            if (status === 'completed' || status === 'saved' || status === 'deleted') {
                const endTime = Date.now();
                state.metadata[threadId].endTime = endTime;
                state.metadata[threadId].duration = endTime - state.metadata[threadId].startTime;
            }
            
            console.log(`Updated conversation ${threadId} status to ${status}`);
            this.eventBus.emit(EVENTS.CONVERSATION.STATUS_UPDATED, { threadId, status });
        }
    }

    /**
     * Gets the last assistant message from a conversation.
     * @param {string} threadId
     * @returns {Object|null} The last assistant message, or null if none found
     */
    getLastAssistantMessage(threadId) {
        const messages = this.getConversationMessages(threadId);
        
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                return messages[i];
            }
        }
        
        return null;
    }

    /**
     * Gets the last user message from a conversation.
     * @param {string} threadId
     * @returns {Object|null} The last user message, or null if none found
     */
    getLastUserMessage(threadId) {
        const messages = this.getConversationMessages(threadId);
        
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return messages[i];
            }
        }
        
        return null;
    }

    // ==== THREAD-LIKE CONVENIENCE METHODS ====

    /**
     * Creates a thread-style ID
     * @param {string} [userName] - User name (defaults to current settings)
     * @param {string} [personaName] - Persona name (defaults to current settings)
     * @returns {string} Thread-style ID
     */
    createThreadId(userName, personaName) {
        const user = userName || this.stateService.state.settings.aim.userName || 'user';
        const persona = personaName || this.stateService.state.settings.aim.personaName || 'assistant';
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        return `${user}-${persona}-${sessionId}`;
    }

    /**
     * Get the current active thread ID for this tab
     * @returns {string|null} Active thread ID or null
     */
    getActiveThreadId(tabId = undefined) {
        // Only use the per-tab tracked thread
        return this.stateService.ui.getTrackedThreadId();
    }

    /**
     * Set a conversation as active for this tab
     * @param {string} threadId - The thread ID to set as active
     * @param {string} [tabId] - The tab ID (for event emission)
     */
    setActiveConversation(threadId, {tabId} = {}) {
        if (threadId !== null) {
            const targetMetadata = this.stateService.state.conversation?.metadata?.[threadId];
            if (!targetMetadata) {
                throw new Error(`Conversation ${threadId} not found`);
            }
        }

        // Just update the UI state for this tab
        this.stateService.ui.setTrackedThreadId(threadId);
        
        console.log(`[StateService::ConversationState] Set active conversation to ${threadId} (tab: ${tabId || this.stateService.ui.getTabId()})`);
        this.eventBus.emit(EVENTS.CONVERSATION.ACTIVATED, { threadId, tabId: tabId || this.stateService.ui.getTabId() });
    }

    /**
     * Get the current conversation for this tab
     * @param {Object} [options={}] - Options for conversation creation
     * @param {string} [options.tabId] - Tab ID
     * @returns {string} The thread ID
     */
    getCurrentConversation({tabId, ...options} = {}) {
        if (!tabId) {
            tabId = this.stateService.ui.getTabId();
        }
        console.log('[ConversationState] getCurrentConversation called for tab:', tabId);
        
        // Try to get existing active conversation for this tab
        let threadId = this.getActiveThreadId(tabId);
        console.log('[ConversationState] Active thread ID:', threadId);

        if (threadId) {
            return threadId;
        }
        
        // No active conversation found, try to recover one for this tab
        threadId = this.recoverActiveForTab(tabId);
        if (threadId) {
            console.log(`[ConversationState] Recovered conversation for tab ${tabId}: ${threadId}`);
            return threadId;
        }
        
        return null;
    }

    /**
     * Get message by messageId
     * @param {string} messageId
     * @returns {Object|null} The message, or null if not found
     */
    getMessageById(messageId) {
        const state = this._safeConversationState();
        const threadId = this.getThreadForMessage(messageId);
        if (!state.history[threadId]) {
            console.error('[ConversationState] Conversation not found:', threadId, state);
            throw new Error(`Conversation ${threadId} not found`);
        }
        return state.history[threadId].find(m => m.messageId === messageId);
    }

    /**
     * Create a new conversation
     * @param {Object} [options={}] - Options for conversation creation
     * @returns {string} The thread ID
     */
    createNewConversation(options = {setActive: true}) {
        console.log('[ConversationState] createNewConversation called with options:', options);
        
        const tabId = options.tabId || this.stateService.ui.getTabId();
        const currentUser = this.stateService.state.settings?.aim?.userName || 'User';
        const currentPersona = this.stateService.state.settings?.aim?.personaName || 'WebWire Assistant';
        
        const threadId = this.createThreadId(currentUser, currentPersona);
        const timestamp = Date.now();

        // Initialize conversation state just in case
        this._safeConversationState();

        // Initialize the conversation metadata as active in an empty conversation
        this.stateService.state.conversation.history[threadId] = [];
        this.stateService.state.conversation.metadata[threadId] = {
            threadId: threadId,
            tabId: tabId,  // Associate with creating tab
            userName: currentUser,
            personaName: currentPersona,
            startTime: timestamp,
            endTime: undefined,
            duration: undefined,
            status: 'active',
            error: undefined,
            errorCode: undefined,
            errorType: undefined,
        };

        console.log(`[ConversationState] Created new conversation: ${threadId} for tab: ${tabId}`);
        
        if (options.setActive) {
            // Set this as the active conversation for this tab
            this.setActiveConversation(threadId, {tabId});
        }

        return threadId;
    }

    /**
     * Recover the active conversation for a specific tab
     * @param {string} tabId - The tab ID to recover conversation for
     * @returns {string|null} The recovered thread ID or null if no conversations exist
     */
    recoverActiveForTab(tabId) {
        if (!tabId) {
            tabId = this.stateService.ui.getTabId();
        }
        console.log('[ConversationState] Recovering active conversation for tab:', tabId);

        // Find conversations for this tab only
        const tabConversations = Object.values(this.stateService.state.conversation.metadata)
            .filter(meta => meta.tabId === tabId && this.stateService.state.conversation.history[meta.threadId]?.length > 0)
            .sort((a, b) => {
                // Sort by most recent activity
                const timeA = a.endTime || a.startTime || 0;
                const timeB = b.endTime || b.startTime || 0;
                return timeB - timeA;
            });
        
        if (tabConversations.length > 0) {
            const mostRecent = tabConversations[0];
            console.log(`[ConversationState] Found most recent conversation for tab ${tabId}: ${mostRecent.threadId}`);
            this.stateService.ui.setTrackedThreadId(mostRecent.threadId);
            return mostRecent.threadId;
        }
        
        console.log('[ConversationState] No conversations found to recover for tab:', tabId);
        return null;
    }

    /**
     * List conversations with thread-like filtering and sorting
     * @param {Object} [filters={}] - Filter options
     * @param {string} [filters.userName] - Filter by user name
     * @param {string} [filters.personaName] - Filter by persona name
     * @param {string} [filters.status] - Filter by status
     * @returns {Array} Array of conversation metadata objects
     */
    listConversations({ userName, personaName, status } = {}) {
        const state = this._safeConversationState();
        let conversations = Object.values(state.metadata);

        if (userName) {
            conversations = conversations.filter(conv => conv.userName === userName);
        }
        if (personaName) {
            conversations = conversations.filter(conv => conv.personaName === personaName);
        }
        if (status) {
            conversations = conversations.filter(conv => conv.status === status);
        }

        // Sort by last update (endTime or startTime), newest first
        return conversations.sort((a, b) => {
            const timeA = a.endTime || a.startTime || 0;
            const timeB = b.endTime || b.startTime || 0;
            return timeB - timeA;
        });
    }

    /**
     * Pop a message from a conversation
     * @param {string} threadId
     * @returns {Object|null} The popped message, or null if none found
     */
    popMessage(threadId) {
        const state = this._safeConversationState();

        if (!state.history[threadId]) {
            console.error('[ConversationState] Conversation not found:', threadId, state);
            throw new Error(`Conversation ${threadId} not found`);
        }
        
        return state.history[threadId].pop();
    }

    /**
     * Update tool calls for a specific message
     * @param {string} messageId
     * @param {array} toolCalls
     */
    updateToolCalls(messageId, toolCalls) {
        const state = this._safeConversationState();
        const threadId = this.getThreadForMessage(messageId);
        if (!state.history[threadId]) {
            console.error('[ConversationState] Conversation not found:', threadId, state);
            throw new Error(`Conversation ${threadId} not found`);
        }
        const message = state.history[threadId].find(m => m.messageId === messageId);
        if (message) {
            message.toolCalls = toolCalls;
        }
        console.log(`[ConversationState] Updated tool calls for message ${messageId} in conversation ${threadId}`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
    }

    /**
     * Update tool result for a specific message
     * @param {string} threadId
     * @param {string} messageId
     * @param {string} callId
     * @param {object} toolResult
     */
    updateToolResult(threadId, messageId, callId, toolResult) {
        const state = this._safeConversationState();
        if (!state.history[threadId]) {
            throw new Error(`Conversation ${threadId} not found`, state);
        }
        const message = state.history[threadId].find(m => m.messageId === messageId);
        if (message) {
            if (!message.toolResults) {
                message.toolResults = [];
            }
            message.toolResults.push({ callId, ...toolResult });
        }
        console.log(`[ConversationState] Updated tool result for message ${messageId} in conversation ${threadId}`);
        //this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId, save: true });
    }

    /**
     * Get the thread ID for a specific message
     * @param {string} messageId
     * @returns {string|null} The thread ID or null if not found
     */
    getThreadForMessage(messageId) {
        const state = this._safeConversationState();
        return Object.keys(state.history).find(threadId => state.history[threadId].some(m => m.messageId === messageId));
    }

    /**
     * Get the thread ID and message ID for a specific call ID
     * @param {string} callId
     * @returns {Object} The thread ID and message ID
     */
    getThreadAndMessageForCallId(callId) {
        const state = this._safeConversationState();
        const threadId = Object.keys(state.history).find(
            threadId => state.history[threadId].some(
                m => m.toolCalls?.some(
                    r => r.callId === callId)));
        if (!threadId) {
            console.error('[ConversationState] Call ID not found in any conversation:', callId, this.stateService.state.conversation.history);
            throw new Error(`Call ID ${callId} not found in any conversation`);
        }
        const messageId = state.history[threadId].find(m => m.toolCalls?.some(r => r.callId === callId))?.messageId;
        return { threadId, messageId };
    }

    /**
     * Hard resets all conversation data - clears all conversations and metadata
     * This is a destructive operation that cannot be undone
     */
    hardResetAllConversations() {
        console.log('[ConversationState] Performing hard reset of all conversations');
        
        // Clear all conversation history and metadata
        this._safeConversationState({force: true});
        
        console.log('[ConversationState] Hard reset completed - all conversations cleared');
        this.eventBus.emit(EVENTS.CONVERSATION.HARD_RESET, {});
    }

    /**
     * Patch conversation state from over-the-wire data (e.g., from background script)
     * This allows syncing local conversation state with the authoritative state
     * @param {object} conversationData - Conversation data from background
     * @param {string} conversationData.threadId - Thread ID
     * @param {object} conversationData.metadata - Conversation metadata
     * @param {array} conversationData.messages - Array of messages
     * @param {boolean} [conversationData.isActive] - Whether this is the active conversation
     */
    patchConversation(conversationData) {
        const { threadId, metadata, messages, isActive } = conversationData;
        
        if (!threadId) {
            console.error('[ConversationState] patchConversation: threadId is required');
            return;
        }

        const state = this._safeConversationState();
        
        console.log(`[ConversationState] Patching conversation ${threadId} with ${messages?.length || 0} messages`);
        
        // Update conversation metadata
        if (metadata) {
            state.metadata[threadId] = {
                ...metadata,
                threadId: threadId  // Ensure threadId is set
            };
        }
        
        // Update conversation messages if provided
        if (messages && Array.isArray(messages)) {
            state.history[threadId] = messages;
        }
        
        // If this is marked as active, ensure it's the only active conversation
        if (isActive) {
            // Mark other conversations as inactive
            Object.values(state.metadata).forEach(meta => {
                if (meta.threadId !== threadId && meta.status === 'active') {
                    meta.status = 'completed';
                }
            });
            
            // Ensure this conversation is marked as active
            if (state.metadata[threadId]) {
                state.metadata[threadId].status = 'active';
            }
            
            // Set this as the active thread for this tab
            this.setActiveConversation(threadId, {tabId: this.stateService.ui.getTabId()});
        }
        
        console.log(`[ConversationState] Successfully patched conversation ${threadId}`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
    }

    /**
     * Marks a message as a specific status
     * @param {string} threadId - The thread ID
     * @param {string} messageId - The message ID to mark as retried
     * @param {string} status - The status to mark the message as
     */
    markMessage(threadId, messageId, status) {
        const state = this._safeConversationState();
        
        if (!state.history[threadId]) {
            console.warn(`[ConversationState] Thread ${threadId} not found`);
            return;
        }
        
        const messages = state.history[threadId];
        const message = messages.find(m => m.messageId === messageId);
        
        if (message) {
            message.status = status;
            console.log(`[ConversationState] Marked message ${messageId} as ${status}`);
            this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
        } else {
            console.warn(`[ConversationState] Message ${messageId} not found in thread ${threadId}`);
        }
    }
}