// js/ai/abstract-ai-client.js
import { EVENTS } from '../core/events.js';

/**
 * Abstract base class for AI client implementations providing common functionality
 * for connection management, error handling, and streaming capabilities.
 * 
 * @example
 * // Use a concrete implementation like OpenAIClient
 * const client = new OpenAIClient(eventBus, {
 *   apiKey: 'your-key',
 *   model: 'gpt-4-turbo'
 * });
 * 
 * const response = await client.generateTurn("Hello", [], {
 *   systemPrompt: "You are helpful"
 * });
 * 
 * @abstract
 */
export class AbstractAIClient {
    /**
     * Create an Abstract AI Client
     * @param {string} clientName - Name identifier for this client instance
     * @param {Object} eventBus - Event bus instance for communication
     * @param {Object} [config={}] - Configuration options
     * @param {string} [config.apiKey] - API key for authentication
     * @param {Object} [config.samplerConfig] - Sampling configuration for AI generation
     * @param {number} [config.samplerConfig.temperature=0.8] - Controls randomness in responses
     * @param {number} [config.samplerConfig.minP=0.05] - Minimum probability threshold
     * @param {number} [config.samplerConfig.maxTokens=2048] - Maximum tokens to generate
     */
    constructor(clientName, eventBus, config = {}) {
        this.clientName = clientName;
        this.eventBus = eventBus;
        this.apiKey = config.apiKey || null;
        this.provider = config.provider || null;
        this.model = config.model || null;
        this.samplerConfig = config.samplerConfig || {
            temperature: 0.8,
            minP: 0.05,
            maxTokens: 2048
        };

        this.state = {
            connected: !!this.apiKey,
            reconnecting: false,
            consecutiveErrors: 0,
            consecutiveTimeouts: 0,
            lastRequestTime: 0,
            reconnectAttempts: 0
        };
        
        this.config = {
            debug: true,
            reconnectDelay: 1000,
            maxReconnectAttempts: 5,
            recoveryInterval: 30000,
            requestTimeout: 30000
        };
    }

    /**
     * Check if the client is properly configured with required credentials
     * @returns {boolean} True if client has valid API key, false otherwise
     */
    isConfigured() {
        return !!(this.apiKey && this.apiKey.trim().length > 0);
    }

    /**
     * Set the API key for authentication
     * @param {string} apiKey - The API key to use for requests
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.state.connected = !!apiKey;
        console.log(`[AbstractAIClient] API key configured`);
    }

    /**
     * Set the AI model to use for requests
     * @param {string} model - The model identifier (e.g., 'gpt-4', 'claude-3')
     */
    setModel(model) {
        this.model = model;
        console.log(`[AbstractAIClient] Model set to: ${model}`);
    }

    /**
     * Set the temperature for AI generation, clamped to valid range
     * @param {number} temperature - Temperature value between 0 and 2
     */
    setTemperature(temperature) {
        this.temperature = Math.max(0, Math.min(2, temperature));
    }

    /**
     * Valid keys for the sampler config (for overriding)
     */
    _validSamplerConfigKeys() {
        return ['temperature', 'minP', 'maxTokens', 'frequencyPenalty', 'presencePenalty', 'model'];
    }

    /**
     * Get the current sampler configuration with snake_case keys for API compatibility
     * @returns {Object} Sampler configuration object with snake_case keys
     */
    getSamplerConfig(samplerConfig = null) {
        if (!samplerConfig) {
            samplerConfig = this.samplerConfig;
        }

        const validKeys = this._validSamplerConfigKeys();
        const config = {
            temperature: 0.8,
            minP: 0.05,
            maxTokens: 2048,
            frequencyPenalty: 0.1,
            presencePenalty: 0.1,
            model: this.model,
            ...samplerConfig
        };


        // snakcase the keys from the default config
        return Object.fromEntries(
            Object.entries(config).filter(([key]) => validKeys.includes(key)).map(([key, value]) => [key.replace(/([A-Z])/g, '_$1').toLowerCase(), value])
        );
    }

    /**
     * Generate a turn response from the AI (must be implemented by subclasses)
     * @abstract
     * @param {string} userTurn - The user's input text
     * @param {Array} history - Array of previous conversation turns
     * @param {Object} [options] - Additional options for generation
     * @returns {Promise<string>} Promise resolving to the AI's response
     * @throws {Error} Always throws since this is an abstract method
     */
    async generateTurn(userTurn, history, options) {
        throw new Error("generateTurn must be implemented by subclass");
    }

    /**
     * Handle errors with intelligent reconnection logic and state management
     * @param {Error} error - The error that occurred during a request
     */
    handleError(error) {
        console.log(`[${this.clientName}]`, `Request error: ${error.message}`);
        
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
            this.state.consecutiveTimeouts++;
            console.log(`[${this.clientName}]`, `Timeout detected! Consecutive timeouts: ${this.state.consecutiveTimeouts}`);
            
            if (this.state.consecutiveTimeouts >= 3) {
                console.log(`[${this.clientName}]`, 'Multiple consecutive timeouts detected, triggering reconnection logic');
                this.startReconnection();
            }
        } else {
            this.state.consecutiveErrors++;
        }
    }

    /**
     * Start the reconnection process with exponential backoff
     * Prevents multiple simultaneous reconnection attempts
     */
    startReconnection() {
        if (this.state.reconnecting) return;
        
        this.state.reconnecting = true;
        this.state.reconnectAttempts++;
        
        const delay = Math.min(
            this.config.reconnectDelay * Math.pow(1.5, this.state.reconnectAttempts - 1),
            10000
        );
        
        console.log(`[${this.clientName}]`, `Scheduling reconnection attempt ${this.state.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            this.state.reconnecting = false;
            console.log(`[${this.clientName}]`, 'Reconnection attempt completed, ready for new requests');
        }, delay);
    }

    /**
     * Get comprehensive statistics about the client's current state and performance
     * @returns {Object} Statistics object containing configuration and state information
     * @returns {boolean} returns.configured - Whether the client is properly configured
     * @returns {string} returns.model - Current model identifier
     * @returns {number} returns.temperature - Current temperature setting
     * @returns {Object} returns.state - Current client state (errors, timeouts, etc.)
     * @returns {number} returns.lastRequestTime - Timestamp of last request
     * @returns {number} returns.timeSinceLastRequest - Milliseconds since last request
     */
    getStats() {
        return {
            configured: this.isConfigured(),
            model: this.model,
            temperature: this.temperature,
            state: { ...this.state },
            lastRequestTime: this.state.lastRequestTime,
            timeSinceLastRequest: Date.now() - this.state.lastRequestTime
        };
    }

    /**
     * Reset the client state to initial values, clearing error counters and flags
     */
    reset() {
        this.state = {
            connected: !!this.apiKey,
            reconnecting: false,
            consecutiveErrors: 0,
            consecutiveTimeouts: 0,
            lastRequestTime: 0,
            reconnectAttempts: 0
        };
        console.log(`[${this.clientName}]`, 'Client state reset');
    }

    /**
     * Emit a streaming chunk for real-time updates via the event bus
     * @param {string} chunk - The text chunk to emit for streaming display
     */
    emitStreamingChunk(chunk) {
        this.eventBus.emit(EVENTS.AI.STREAM_CHUNK, { chunk });
    }

    /**
     * Stream chat completion from AI API with robust error handling and timeout management
     * @param {Array} messages - Array of message objects for the conversation
     * @param {Object} [options={}] - Configuration options for the request
     * @param {Function} [options.onChunk] - Callback function for streaming chunks
     * @param {Object} [options.apiArgs={}] - Additional API arguments
     * @param {Object} [options.apiHeaders={}] - Additional HTTP headers
     * @param {Object} [options.metadata={}] - Metadata to include with request
     * @param {Array} [options.tools=[]] - Available tools for the AI to use
     * @param {AbortController} [options.abortController] - Optional abort controller for cancellation
     * @returns {Promise<string>} Promise resolving to the complete AI response
     * @throws {Error} If the request fails or times out
     */
    async streamChatCompletion(messages, { onChunk = null, apiArgs = {}, apiHeaders = {}, metadata = {}, tools = [], abortController = null, ...options } = {}) {
        const controller = abortController || new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.config.requestTimeout);

        if (metadata) {
            apiArgs.metadata = metadata;
        }

        if (tools) {
            apiArgs.tools = tools;
        }

        const samplerConfig = this.getSamplerConfig(apiArgs);
        console.log('[AbstractAIClient]', 'Sampler config:', samplerConfig);

        try {
            this.state.lastRequestTime = Date.now();
            
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'text/plain; charset=utf-8',
                    ...apiHeaders
                },
                body: JSON.stringify({
                    messages: messages,
                    stream: true,
                    ...samplerConfig,
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            return await this.processStreamResponse(response, { onChunk });

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request cancelled');
            }
            
            throw error;
        }
    }

    /**
     * Process a streaming response from the AI API, handling chunked data
     * @param {Response} response - The fetch Response object with streaming data
     * @param {Object} [options={}] - Processing options
     * @param {Function} [options.onChunk] - Callback function for each chunk
     * @returns {Promise<string>} Promise resolving to the complete response text
     * @throws {Error} If stream processing fails
     */
    async processStreamResponse(response, { onChunk = null } = {}) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const decoded = decoder.decode(value, { stream: true });
                buffer += decoded;
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                fullResponse += content;
                                if (onChunk) {
                                    onChunk(content);
                                } else {
                                    this.emitStreamingChunk(content);
                                }
                            }
                        } catch (parseError) {
                            console.log(`[${this.clientName}]`, `Parse error: ${parseError.message}`);
                        }
                    }
                }
            }
            
            // Process any remaining buffer
            const finalBuffer = decoder.decode();
            if (finalBuffer) {
                buffer += finalBuffer;
                const finalLines = buffer.split('\n');
                for (const line of finalLines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    fullResponse += content;
                                }
                            } catch (parseError) {
                                console.log(`[${this.clientName}]`, `Final parse error: ${parseError.message}`);
                            }
                        }
                    }
                }
            }
            
            if (!fullResponse.trim()) {
                throw new Error('Empty response from AI provider');
            }
            
            console.log(`[${this.clientName}]`, `Response received: ${fullResponse.length} characters`);
            return fullResponse;
            
        } finally {
            reader.releaseLock();
        }
    }
}