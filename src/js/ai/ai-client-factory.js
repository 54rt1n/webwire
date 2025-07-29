import { FeatherlessClient } from './providers/featherless-client.js';
import { OpenAIClient } from './providers/openai-client.js';
import { AIStudioClient } from './providers/aistudio-client.js';
import { AIMindClient } from './providers/aimind-client.js';

/**
 * Factory for creating AI clients from configuration with unified interface support.
 * Supports multiple providers (OpenAI, Google, Featherless, etc.) and handles
 * automatic configuration and API compatibility layers.
 * 
 * @example
 * const client = AIClientFactory.createClient(eventBus, {
 *   provider: 'openai',
 *   model: 'gpt-4-turbo',
 *   api_key: 'sk-...',
 *   sampler_config: { temperature: 0.7 }
 * });
 * 
 * // Check provider support
 * if (AIClientFactory.isProviderSupported('anthropic')) {
 *   // Create Anthropic client
 * }
 */

export class AIClientFactory {
    /**
     * Create AI client based on model configuration
     * @param {Object} eventBus - Event bus for communication
     * @param {Object} modelConfig - Model configuration from server
     * @returns {Object} Configured AI client
     */
    static createClient(eventBus, modelConfig) {
        if (!modelConfig || !modelConfig.provider) {
            throw new Error('Invalid model configuration - missing provider');
        }
        if (!eventBus) {
            throw new Error('Event bus is required');
        }

        let client;

        switch (modelConfig.provider) {
            case 'aimind':
                client = new AIMindClient(eventBus, modelConfig);
                break;
            case 'featherless':
                client = new FeatherlessClient(eventBus, modelConfig);
                break;
            case 'openai':
                client = new OpenAIClient(eventBus, modelConfig);
                break;
            case 'google':
                client = new AIStudioClient(eventBus, modelConfig);
                break;
            case 'openrouter':
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = "https://openrouter.ai/api/v1";
                break;
            case 'groq':
                // Groq uses OpenAI-compatible API
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = 'https://api.groq.com/openai/v1';
                break;
            case 'anthropic':
                // For now, use OpenAI client (would need dedicated Anthropic client for optimal experience)
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = 'https://api.anthropic.com/v1';
                break;
            case 'meta':
                // Meta uses OpenAI-compatible API
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = 'https://api.llama.com/compat/v1';
                break;
            case 'huggingface':
                // Hugging Face uses OpenAI-compatible API
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = 'https://api-inference.huggingface.co/v1';
                break;
            case 'hyperbolic':
                // Hyperbolic uses OpenAI-compatible API
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = 'https://api.hyperbolic.xyz/v1';
                break;
            case 'local':
                // Local OpenAI-compatible API
                client = new OpenAIClient(eventBus, modelConfig);
                client.baseUrl = modelConfig.apiEndpoint;
                break;
            default:
                console.warn(`[AIClientFactory] Unknown provider "${modelConfig.provider}", falling back to legacy client.`);
                throw new Error(`Unknown provider "${modelConfig.provider}"`);
        }

        // Configure the client
        if (modelConfig.api_key) {
            client.setApiKey(modelConfig.api_key);
        }
        if (modelConfig.model) {
            client.setModel(modelConfig.model);
        }
        if (modelConfig.sampler_config?.temperature !== undefined) {
            client.setTemperature(modelConfig.sampler_config.temperature);
        }
        if (modelConfig.sampler_config?.max_tokens !== undefined) {
            client.maxTokens = modelConfig.sampler_config.max_tokens;
        }

        console.log(`[AIClientFactory] Created ${modelConfig.provider} client for model: ${modelConfig.model}`);
        return client;
    }

    /**
     * Get list of supported providers
     * @returns {Array} List of provider names
     */
    static getSupportedProviders() {
        return ['featherless', 'openai', 'google', 'openrouter', 'groq', 'anthropic', 'meta', 'huggingface', 'hyperbolic', 'local'];
    }

    /**
     * Check if a provider is supported
     * @param {string} provider 
     * @returns {boolean}
     */
    static isProviderSupported(provider) {
        return this.getSupportedProviders().includes(provider);
    }
} 