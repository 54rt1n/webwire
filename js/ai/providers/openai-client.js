import { AbstractAIClient } from '../abstract-ai-client.js';

/**
 * OpenAI Client - Handles communication with OpenAI API
 * Implements streaming responses and robust error handling
 * @extends AbstractAIClient
 */

export class OpenAIClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('OpenAIClient', eventBus, config);

        // Only keep what's specific to OpenAIClient
        this.model = config.model || 'gpt-4-turbo';
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    }

    /**
     * Generate a turn using AI
     * @param {string} userTurn - What the user wants to do
     * @param {Array} history - Previous turns for context
     * @param {Object} options - Additional options including system prompt
     * @returns {Promise<string>} AI response
     */
    async generateTurn(userTurn, history = [], { systemPrompt, ...options } = {}) {
        if (!this.isConfigured()) {
            throw new Error('OpenAI API key not configured');
        }

        console.log('[OpenAIClient]', `Generating turn for input: "${userTurn}"`);
        
        try {
            const messages = this.buildMessages(userTurn, history, systemPrompt, options);
            const response = await this.streamChatCompletion(messages, options);
            
            // Reset error counters on success
            this.state.consecutiveErrors = 0;
            this.state.consecutiveTimeouts = 0;
            
            return response;
            
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    /**
     * Build messages array for OpenAI API
     * @param {string} currentMessage
     * @param {Array} gameHistory - role, content
     * @param {string} systemPrompt
     * @param {Object} options - Additional options including maxHistory
     * @returns {Array}
     */
    buildMessages(currentMessage, gameHistory, systemPrompt, { maxHistory = null } = {}) {
        const messages = [
            {
                role: "system",
                content: systemPrompt
            }
        ];

        // Add recent game history for context (last 6 turns)
        if (gameHistory.length > 0) {
            if (maxHistory) {
                messages.push(...gameHistory.slice(-maxHistory));
            } else {
                messages.push(...gameHistory);
            }
        }

        // Add current player input
        messages.push({
            role: "user",
            content: currentMessage
        });

        return messages;
    }
} 