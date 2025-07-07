// webwire/js/state/plugins/conversation-state.js

import { EVENTS } from '../../constants/events.js';

const MAX_CACHE_SIZE = 20; // Default cache size

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


}