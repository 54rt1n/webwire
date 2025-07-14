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
     * Stores a message pair in the state.
     * @param {string} threadId
     * @param {object} userMessage - { role, content, timestamp, title?, url?, model?, saved? }
     * @param {object} assistantMessage - { role, content, think?, timestamp, url?, title?, model?, saved? }
     * @param {object} options - { userName?, personaName?, mood?, location?, timestamp?, toolResults?, toolCalls?, parseErrors? }
     */
    storeMessage(threadId, userMessage, assistantMessage, { userName, personaName, mood, location, timestamp,
        toolResults = [], toolCalls = [], parseErrors = [], ...options } = {}) {
        const state = this.stateService.state.conversation;
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
        
        console.log(`Stored message in conversation ${threadId}.`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });
    }

    /**
     * Retrieves all conversations associated with a specific persona.
     * @param {string} personaName
     * @returns {Array} A sorted list of conversation metadata objects.
     */
    getConversationsFor(personaName) {
        const state = this.stateService.state.conversation;
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
        const state = this.stateService.state.conversation;
        
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
        const state = this.stateService.state.conversation;
        
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
     * Get the current active thread ID
     * @returns {string|null} Active thread ID or null
     */
    getActiveThreadId() {
        const state = this.stateService.state.conversation;
        
        // Get the newest conversation
        const activeConversations = Object.values(state.metadata)
            .filter(conv => conv.status === 'active')
            .sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));

        const conversation = activeConversations.length > 0 ? activeConversations[0] : null;
        console.log('[ConversationState] Found', activeConversations.length, 'active conversations', conversation);

        return conversation ? conversation.threadId : null;
    }

    /**
     * Set a conversation as active (and mark others as inactive)
     * @param {string} threadId - The thread ID to set as active
     */
    setActiveConversation(threadId) {
        const targetMetadata = this.stateService.state.conversation.metadata[threadId];
        if (!targetMetadata) {
            throw new Error(`Conversation ${threadId} not found`);
        }

        // Mark other conversations for this user/persona as inactive
        Object.values(this.stateService.state.conversation.metadata).forEach(metadata => {
            if (metadata.status === 'active' && metadata.threadId !== threadId) {
                this.updateConversationStatus(metadata.threadId, 'completed');
            }
        });

        // Mark target conversation as active
        this.updateConversationStatus(threadId, 'active');
        
        console.log(`Set active conversation to ${threadId}`);
        this.eventBus.emit(EVENTS.CONVERSATION.ACTIVATED, { threadId });
    }

    /**
     * Get the current conversation
     * @param {Object} [options={}] - Options for conversation creation
     * @param {string} [options.title] - Conversation title
     * @returns {string} The thread ID
     */
    getCurrentConversation(options = {}) {
        console.log('[ConversationState] getCurrentConversation called with options:', options);
        
        // Try to get existing active conversation
        let threadId = this.getActiveThreadId();
        console.log('[ConversationState] Active thread ID:', threadId);

        if (threadId) {
            return threadId;
        }
        
        // No active conversation found, look for newest conversation
        const allConversations = Object.values(this.stateService.state.conversation.metadata);
        console.log('[ConversationState] Total conversations in storage:', allConversations.length);
        
        if (allConversations.length > 0) {
            console.log('[ConversationState] All conversations:', allConversations.map(conv => ({
                threadId: conv.threadId,
                userName: conv.userName, 
                personaName: conv.personaName,
                status: conv.status,
                startTime: conv.startTime
            })));

            const activeConversations = allConversations.filter(conv => conv.status === 'active');
            if (activeConversations.length > 0) {
                threadId = activeConversations[0].threadId;
                this.setActiveConversation(threadId);
                console.log(`[ConversationState] Reactivated newest conversation: ${threadId}`);
                return threadId;
            }
            
            // Sort all conversations by newest first (endTime or startTime)
            const sortedConversations = allConversations.sort((a, b) => {
                const timeA = a.endTime || a.startTime || 0;
                const timeB = b.endTime || b.startTime || 0;
                return timeB - timeA;
            });
            
            // Reactivate the newest conversation
            threadId = sortedConversations[0].threadId;
            this.setActiveConversation(threadId);
            console.log(`[ConversationState] Reactivated newest conversation: ${threadId}`);
            return threadId;
        }
        
        return null;
    }

    /**
     * Create a new conversation
     * @param {Object} [options={}] - Options for conversation creation
     * @returns {string} The thread ID
     */
    createNewConversation(options = {}) {
        console.log('[ConversationState] createNewConversation called with options:', options);
        
        // No conversations exist, create new one
        const currentUser = this.stateService.state.settings?.aim?.userName || 'User';
        const currentPersona = this.stateService.state.settings?.aim?.personaName || 'WebWire Assistant';
        
        const threadId = this.createThreadId(currentUser, currentPersona);
        
        const timestamp = Date.now();
        // Initialize the conversation metadata as active in an empty conversation
        this.stateService.state.conversation.history[threadId] = [];
        this.stateService.state.conversation.metadata[threadId] = {
            threadId: threadId,
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

        console.log(`[ConversationState] Created new conversation: ${threadId}`);

        return threadId;
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
        let conversations = Object.values(this.stateService.state.conversation.metadata);

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
     * Update tool calls for a specific message
     * @param {string} messageId
     * @param {array} toolCalls
     */
    updateToolCalls(messageId, toolCalls) {
        const state = this.stateService.state.conversation;
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
        const state = this.stateService.state.conversation;
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
        const state = this.stateService.state.conversation;
        return Object.keys(state.history).find(threadId => state.history[threadId].some(m => m.messageId === messageId));
    }

    /**
     * Get the thread ID and message ID for a specific call ID
     * @param {string} callId
     * @returns {Object} The thread ID and message ID
     */
    getThreadAndMessageForCallId(callId) {
        const state = this.stateService.state.conversation;
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
}