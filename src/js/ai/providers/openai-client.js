import { AbstractAIClient } from '../abstract-ai-client.js';
import { logger } from '../../core/logging.js';

/**
 * OpenAI API client implementation for GPT models with streaming support.
 * Handles authentication, message formatting, and robust error handling
 * for OpenAI's chat completion endpoints.
 * 
 * @example
 * const client = new OpenAIClient(eventBus, {
 *   apiKey: 'sk-...',
 *   model: 'gpt-4-turbo',
 *   baseUrl: 'https://api.openai.com/v1'
 * });
 * 
 * const response = await client.generateTurn(
 *   "Explain quantum computing",
 *   [], // conversation history
 *   { systemPrompt: "You are a physics professor" }
 * );
 * 
 * @extends AbstractAIClient
 */

export class OpenAIClient extends AbstractAIClient {
    /**
     * Create an OpenAI Client instance
     * @param {Object} eventBus - Event bus instance for communication
     * @param {Object} [config={}] - Configuration options
     * @param {string} [config.model='gpt-4-turbo'] - OpenAI model to use
     * @param {string} [config.baseUrl='https://api.openai.com/v1'] - API base URL
     * @param {string} [config.apiKey] - OpenAI API key for authentication
     * @param {Object} [config.samplerConfig] - Sampling configuration
     */
    constructor(eventBus, config = {}) {
        super('OpenAIClient', eventBus, config);

        // Only keep what's specific to OpenAIClient
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        
        // Set default model if not provided
        if (!this.model) {
            this.model = 'gpt-4-turbo';
        }
    }

    /**
     * Generate a conversational turn using OpenAI's API
     * @param {string} userTurn - The user's input message
     * @param {Array} history - Array of previous conversation turns with role and content
     * @param {Object} [options={}] - Additional options for generation
     * @param {string} [options.systemPrompt] - System prompt to guide AI behavior
     * @param {number} [options.maxHistory] - Maximum number of history turns to include
     * @param {Function} [options.onChunk] - Callback for streaming chunks
     * @returns {Promise<string>} Promise resolving to the AI's response text
     * @throws {Error} If API key is not configured or request fails
     */
    async generateTurn(userTurn, history = [], { systemPrompt, ...options } = {}) {
        if (!this.isConfigured()) {
            throw new Error('OpenAI API key not configured');
        }

        logger.log('OpenAIClient', `Generating turn for input: "${userTurn}"`);
        
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
     * Valid keys for the sampler config
     */
    _validSamplerConfigKeys() {
        return ['temperature', 'maxTokens', 'frequencyPenalty', 'presencePenalty', 'model'];
    }

    /**
     * Build the messages array for OpenAI API format
     * @param {string} currentMessage - The current user message
     * @param {Array} conversationHistory - Array of previous conversation turns
     * @param {string} systemPrompt - System prompt to include at the beginning
     * @param {Object} [options={}] - Additional options
     * @param {number|null} [options.maxHistory=null] - Maximum number of history turns to include
     * @returns {Array<Object>} Array of message objects formatted for OpenAI API
     * @returns {string} returns[].role - The role of the message sender ('system', 'user', 'assistant')
     * @returns {string} returns[].content - The content of the message
     */
    buildMessages(currentMessage, conversationHistory, systemPrompt, { maxHistory = null } = {}) {
        const messages = [
            {
                role: "system",
                content: systemPrompt
            }
        ];

        // Add recent conversation history for context (last 6 turns)
        if (conversationHistory.length > 0) {
            if (maxHistory) {
                messages.push(...conversationHistory.slice(-maxHistory));
            } else {
                messages.push(...conversationHistory);
            }
        }

        // Add current user input
        messages.push({
            role: "user",
            content: currentMessage
        });

        // Remove all fields except role and content
        return messages.map(message => ({
            role: message.role,
            content: message.content
        }));
    }
} 