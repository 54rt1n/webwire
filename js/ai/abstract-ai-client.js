// js/ai/abstract-ai-client.js
import { EVENTS } from '../constants/events.js';

export class AbstractAIClient {
    constructor(clientName, eventBus, config = {}) {
        this.clientName = clientName;
        this.eventBus = eventBus;
        this.apiKey = config.apiKey || null;
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

    isConfigured() {
        return !!(this.apiKey && this.apiKey.trim().length > 0);
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.state.connected = !!apiKey;
        console.log(`[AbstractAIClient] API key configured`);
    }

    setModel(model) {
        this.model = model;
        console.log(`[AbstractAIClient] Model set to: ${model}`);
    }

    setTemperature(temperature) {
        this.temperature = Math.max(0, Math.min(2, temperature));
    }

    getSamplerConfig() {
        const config = {
            temperature: 0.8,
            minP: 0.05,
            maxTokens: 2048,
            frequencyPenalty: 0.1,
            presencePenalty: 0.1,
            ...this.samplerConfig
        };

        // snakcase the keys from the default config
        return Object.fromEntries(
            Object.entries(config).map(([key, value]) => [key.replace(/([A-Z])/g, '_$1').toLowerCase(), value])
        );
    }

    async generateTurn(userTurn, history, options) {
        throw new Error("generateTurn must be implemented by subclass");
    }

    /**
     * Handle errors with reconnection logic
     * @param {Error} error 
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
     * Start reconnection process
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
     * Get client statistics
     * @returns {Object}
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
     * Reset client state
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
     * Emit streaming chunk for real-time updates
     * @param {string} chunk 
     */
    emitStreamingChunk(chunk) {
        this.eventBus.emit(EVENTS.AI.STREAM_CHUNK, { chunk });
    }

    /**
     * Stream chat completion from OpenAI API
     * @param {Array} messages 
     * @param {Object} apiArgs - Additional API arguments
     * @param {Object} options - Optional parameters, including onChunk callback
     * @returns {Promise<string>}
     */
    async streamChatCompletion(messages, { onChunk = null, apiArgs = {}, apiHeaders = {}, metadata = {}, tools = [], ...options } = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.config.requestTimeout);

        if (metadata) {
            apiArgs.metadata = metadata;
        }

        if (tools) {
            apiArgs.tools = tools;
        }

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
                    model: this.model,
                    messages: messages,
                    stream: true,
                    ...this.getSamplerConfig(),
                    ...apiArgs
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
                throw new Error('Request timed out');
            }
            
            throw error;
        }
    }

    /**
     * Process streaming response
     * @param {Response} response 
     * @param {Object} options - Optional parameters, including onChunk callback
     * @returns {Promise<string>}
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