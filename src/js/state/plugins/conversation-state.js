// webwire/js/state/plugins/conversation-state.js

import { EVENTS } from '../../core/events.js';

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
     * @param {string} conversationId
     * @returns {Array} Array of message objects
     */
    getConversationMessages(conversationId) {
        const state = this.stateService.state.conversation;

        if (state.history[conversationId]) {
            return state.history[conversationId];
        }

        return [];
    }

    /**
     * Stores a message pair in the state.
     * @param {string} conversationId
     * @param {object} userMessage - { role, content, timestamp, title?, url?, model?, saved? }
     * @param {object} assistantMessage - { role, content, think?, timestamp, url?, title?, model?, saved? }
     * @param {object} options - { userName?, personaName?, mood?, location?, timestamp?, toolResults?, toolCalls?, parseErrors? }
     */
    storeMessage(conversationId, userMessage, assistantMessage, { userName, personaName, mood, location, timestamp,
        toolResults = [], toolCalls = [], parseErrors = [], ...options } = {}) {
        const state = this.stateService.state.conversation;
        if (!timestamp) {
            timestamp = Date.now();
        }

        // Ensure history for this conversation exists
        if (!state.history[conversationId]) {
            state.history[conversationId] = [];
        }

        // Add user message
        state.history[conversationId].push({
            role: 'user',
            content: userMessage.content,
            timestamp,
            ...userMessage
        });

        // Add assistant message
        if (assistantMessage && assistantMessage.content) {
            state.history[conversationId].push({
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
        if (!state.metadata[conversationId]) {
            state.metadata[conversationId] = {
                id: conversationId,
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
            state.metadata[conversationId].endTime = timestamp;
            state.metadata[conversationId].duration = timestamp - state.metadata[conversationId].startTime;
        }
        
        console.log(`Stored message in conversation ${conversationId}.`);
        this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { conversationId });
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
     * @param {string} conversationId
     */
    clearConversationHistory(conversationId) {
        const state = this.stateService.state.conversation;
        
        if (state.history[conversationId]) {
            delete state.history[conversationId];
            delete state.metadata[conversationId];
            
            console.log(`Cleared history for conversation ${conversationId}`);
            this.eventBus.emit(EVENTS.CONVERSATION.DELETED, { conversationId });
            return true;
        }
        return false;
    }

    /**
     * Updates conversation status and optional error information.
     * @param {string} conversationId
     * @param {string} status - 'active', 'completed', 'saved', 'error'
     * @param {object} errorInfo - { error?, errorCode?, errorType? }
     */
    updateConversationStatus(conversationId, status, errorInfo = {}) {
        const state = this.stateService.state.conversation;
        
        if (state.metadata[conversationId]) {
            state.metadata[conversationId].status = status;
            state.metadata[conversationId].error = errorInfo.error;
            state.metadata[conversationId].errorCode = errorInfo.errorCode;
            state.metadata[conversationId].errorType = errorInfo.errorType;
            
            if (status === 'completed' || status === 'saved') {
                const endTime = Date.now();
                state.metadata[conversationId].endTime = endTime;
                state.metadata[conversationId].duration = endTime - state.metadata[conversationId].startTime;
            }
            
            console.log(`Updated conversation ${conversationId} status to ${status}`);
            this.eventBus.emit(EVENTS.CONVERSATION.STATUS_UPDATED, { conversationId, status });
        }
    }

    /**
     * Gets the last assistant message from a conversation.
     * @param {string} conversationId
     * @returns {Object|null} The last assistant message, or null if none found
     */
    getLastAssistantMessage(conversationId) {
        const messages = this.getConversationMessages(conversationId);
        
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                return messages[i];
            }
        }
        
        return null;
    }

    // ==== THREAD-LIKE CONVENIENCE METHODS ====

    /**
     * Creates a thread-style conversation ID
     * @param {string} [userName] - User name (defaults to current settings)
     * @param {string} [personaName] - Persona name (defaults to current settings)
     * @returns {string} Thread-style conversation ID
     */
    createThreadId(userName, personaName) {
        const user = userName || this.stateService.state.settings.aim.userName || 'user';
        const persona = personaName || this.stateService.state.settings.aim.personaName || 'assistant';
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        return `${user}-${persona}-${sessionId}`;
    }

    /**
     * Get the current active conversation ID for the current user/persona
     * @returns {string|null} Active conversation ID or null
     */
    getActiveConversationId() {
        const currentUser = this.stateService.state.settings.aim.userName;
        const currentPersona = this.stateService.state.settings.aim.personaName;
        
        if (!currentUser || !currentPersona) return null;

        // Get conversations for current persona, filter by user, and find active ones
        const conversations = this.getConversationsFor(currentPersona)
            .filter(conv => conv.userName === currentUser && conv.status === 'active')
            .sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));

        return conversations.length > 0 ? conversations[0].id : null;
    }

    /**
     * Set a conversation as active (and mark others as inactive)
     * @param {string} conversationId - The conversation ID to set as active
     */
    setActiveConversation(conversationId) {
        const targetMetadata = this.stateService.state.conversation.metadata[conversationId];
        if (!targetMetadata) return;

        const currentUser = targetMetadata.userName;
        const currentPersona = targetMetadata.personaName;

        // Mark other conversations for this user/persona as inactive
        Object.values(this.stateService.state.conversation.metadata).forEach(metadata => {
            if (metadata.userName === currentUser && 
                metadata.personaName === currentPersona && 
                metadata.id !== conversationId &&
                metadata.status === 'active') {
                metadata.status = 'inactive';
            }
        });

        // Mark target conversation as active
        this.updateConversationStatus(conversationId, 'active');
        
        console.log(`Set active conversation to ${conversationId}`);
        this.eventBus.emit(EVENTS.CONVERSATION.ACTIVATED, { conversationId });
    }

    /**
     * Get or create a conversation for the current user/persona
     * @param {Object} [options={}] - Options for conversation creation
     * @param {string} [options.title] - Conversation title
     * @returns {string} The conversation ID
     */
    getOrCreateCurrentConversation(options = {}) {
        // Try to get existing active conversation
        let conversationId = this.getActiveConversationId();
        
        if (!conversationId) {
            // Create new conversation for current user/persona
            const currentUser = this.stateService.state.settings.aim.userName;
            const currentPersona = this.stateService.state.settings.aim.personaName;
            
            conversationId = this.createThreadId(currentUser, currentPersona);
            
            // Initialize conversation with first (empty) message to set up metadata
            this.storeMessage(
                conversationId,
                { role: 'system', content: '' }, // Placeholder to initialize
                null,
                {
                    userName: currentUser,
                    personaName: currentPersona,
                    title: options.title || `${currentPersona} Conversation`,
                    ...options
                }
            );

            // Remove the placeholder system message
            this.stateService.state.conversation.history[conversationId] = [];
            
            // Set as active
            this.setActiveConversation(conversationId);
        }

        return conversationId;
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


}