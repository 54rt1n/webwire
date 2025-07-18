import { AbstractAIClient } from '../abstract-ai-client.js';

/**
 * Featherless AI API client implementation with OpenAI-compatible interface.
 * Provides access to open-source models through Featherless.ai with streaming
 * support and optimized headers for referrer tracking.
 * 
 * @example
 * const client = new FeatherlessClient(eventBus, {
 *   apiKey: 'fl-...',
 *   model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
 *   baseUrl: 'https://api.featherless.ai/v1'
 * });
 * 
 * const response = await client.generateTurn(
 *   "Explain machine learning",
 *   previousMessages,
 *   { systemPrompt: "You are an AI expert" }
 * );
 * 
 * @extends AbstractAIClient
 */
export class FeatherlessClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('FeatherlessClient', eventBus, config);

        // Only keep what's specific to FeatherlessClient
        this.model = config.model || 'meta-llama/Meta-Llama-3.1-8B-Instruct';
        this.baseUrl = config.baseUrl || 'https://api.featherless.ai/v1';
    }

    /**
     * Generate a turn using AI
     * @param {string} userTurn - What the user wants to do
     * @param {Array} history - role, content
     * @param {Object} options - Additional options including system prompt
     * @returns {Promise<string>} AI response
     */
    async generateTurn(userTurn, history = [], { systemPrompt, apiHeaders = {}, ...options } = {}) {
        if (!this.isConfigured()) {
            throw new Error('Featherless API key not configured');
        }

        console.log('[FeatherlessClient]', 'Generating turn for input', userTurn.substring(0, 100));
        
        try {
            const messages = this.buildMessages(userTurn, history, systemPrompt, options);
            console.log('[FeatherlessClient]', 'Sending messages to AI:', messages);
            apiHeaders['HTTP-Referer'] = 'https://webwire.ai/';
            apiHeaders['X-Title'] = 'Webwire';
            const response = await this.streamChatCompletion(messages, { ...options, apiHeaders });
            
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
     * Build messages array for API request
     * @param {string} currentMessage 
     * @param {Array} gameHistory 
     * @param {string} systemPrompt
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
