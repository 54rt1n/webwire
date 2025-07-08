import { AbstractAIClient } from '../abstract-ai-client.js';

/**
 * AIMind Client - Handles communication with AIMind API
 * Implements streaming responses and robust error handling
 * @extends AbstractAIClient
 */

export class AIMindClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('AIMindClient', eventBus, config);

        this.model = config.model || 'deepseek-ai/DeepSeek-V3-0324';
        this.baseUrl = config.apiEndpoint;
    }

    /**
     * Generate a turn using AI
     * @param {string} userTurn - What the user wants to do
     * @param {Array} history - Previous turns for context
     * @param {Object} options - Additional options including system prompt
     * @returns {Promise<string>} AI response
     */
    async generateTurn(userTurn, history = [], options = {}) {
        console.log('[AIMindClient]', `Generating turn for input: "${userTurn}"`);
        
        try {
            const messages = this.buildMessages(userTurn, history, options);
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
     * Build messages array for AIMind API
     * @param {string} userTurn - What the user wants to do
     * @param {Array} history - Previous turns for context
     * @param {Object} options - Additional options including maxHistory
     * @returns {Array}
     */
    buildMessages(userTurn, history, { maxHistory = null, addToolResults = true } = {}) {
        let messages = [];

        // Add recent game history for context (last 6 turns)
        if (history.length > 0) {
            if (maxHistory) {
                messages.push(...history.slice(-maxHistory));
            } else {
                messages.push(...history);
            }
        }

        // If a message has a tool call, we need to add it to the assistant content as a footer
        if (addToolResults) {
            messages = messages.map(message => {
                if (message.toolResults) {
                    message.content += `\n\nTool results: ${JSON.stringify(message.toolResults)}`;
                }
                return message;
            });
        }

        // Add current player input
        messages.push({
            role: "user",
            content: userTurn
        });

        return messages;
    }
} 