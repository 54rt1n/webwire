import { AbstractAIClient } from '../abstract-ai-client.js';

/**
 * Google AI Studio/Gemini Client - Handles communication with Google Gemini API
 * Implements streaming responses and robust error handling
 * @extends AbstractAIClient
 */

export class AIStudioClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('AIStudioClient', eventBus, config);

        this.model = config.model || 'gemini-2.0-flash';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
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
            throw new Error('Google AI Studio API key not configured');
        }

        console.log('[AIStudioClient]', `Generating turn for input: "${userTurn}"`);
        
        try {
            const contents = this.buildContents(userTurn, history, systemPrompt, options);
            const response = await this.streamGenerateContent(contents, options);
            
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
     * Build contents array for Gemini API
     * @param {string} playerTurn 
     * @param {Array} gameHistory 
     * @param {string} systemPrompt
     * @param {Object} options - Additional options including maxHistory
     * @returns {Array}
     */
    buildContents(playerTurn, gameHistory, systemPrompt, { maxHistory = null } = {}) {
        const contents = [];

        // Add system prompt as first user message (Gemini doesn't have system role)
        contents.push({
            role: "user",
            parts: [{ text: systemPrompt }]
        });

        // Add a brief acknowledgment as assistant
        contents.push({
            role: "model",
            parts: [{ text: "I understand. I'll respond according to the specified format and guidelines." }]
        });

        // Add recent game history - we have to rewrite this to be user model instead of role, content
        if (gameHistory.length > 0) {
            // iterate reverse until we hit our maxHistory
            const itMin = maxHistory ? gameHistory.length - maxHistory : 0;
            for (let i = gameHistory.length - 1; i >= itMin; i--) {
                const { role, content } = gameHistory[i];
                contents.push({
                    role: role === 'user' ? 'user' : 'model',
                    parts: [{ text: content }]
                });
            }
        }

        // Add current player input
        contents.push({
            role: "user",
            parts: [{ text: playerTurn }]
        });

        return contents;
    }

    /**
     * Get sampler config
     * @returns {Object}
     */
    getSamplerConfig() {
        return {
            temperature: this.samplerConfig.temperature,
            maxOutputTokens: this.samplerConfig.maxTokens,
            topP: this.samplerConfig.topP || 0.95,
            topK: this.samplerConfig.topK || 40
        };
    }

    /**
     * Stream generate content from Gemini API
     * @param {Array} contents 
     * @returns {Promise<string>}
     */
    async streamGenerateContent(contents) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.config.requestTimeout);

        try {
            this.state.lastRequestTime = Date.now();
            
            const requestBody = {
                contents: contents,
                generationConfig: this.getSamplerConfig(),
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH", 
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            };

            console.log('[AIStudioClient]', 'Sending Gemini request:', requestBody);

            const modelName = this.model.startsWith('models/') ? this.model : `models/${this.model}`;

            const response = await fetch(`${this.baseUrl}/${modelName}:streamGenerateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            return await this.processStreamResponse(response);

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            
            throw error;
        }
    }

    /**
     * Process Gemini streaming response
     * @param {Response} response 
     * @returns {Promise<string>}
     */
    async processStreamResponse(response) {
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
                
                // Gemini uses simple JSON objects separated by newlines
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            // The response can be a single object or an array of them
                            const chunks = Array.isArray(parsed) ? parsed : [parsed];

                            for (const chunk of chunks) {
                                const content = this.extractContent(chunk);
                                if (content) {
                                    fullResponse += content;
                                    this.emitStreamingChunk(content);
                                }
                            }
                        } catch (parseError) {
                            console.log('[AIStudioClient]', `Gemini parse error: ${parseError.message}`);
                        }
                    }
                }
            }
            
            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer);
                    // The response can be a single object or an array of them
                    const chunks = Array.isArray(parsed) ? parsed : [parsed];

                    for (const chunk of chunks) {
                        const content = this.extractContent(chunk);
                        if (content) {
                            fullResponse += content;
                            // No streaming event for the final part, it's part of the returned promise
                        }
                    }
                } catch (parseError) {
                    console.log('[AIStudioClient]', `Final parse error: ${parseError.message}`);
                }
            }
            
            if (!fullResponse.trim()) {
                // Check for safety blocks or other reasons for empty response
                try {
                    const parsedBuffer = JSON.parse(buffer.trim() || '{}');
                    const finalChunk = Array.isArray(parsedBuffer) ? parsedBuffer[parsedBuffer.length - 1] : parsedBuffer;
                    if (finalChunk?.candidates?.[0]?.finishReason === 'SAFETY') {
                        throw new Error('Response blocked due to safety settings. Adjust safety thresholds if needed.');
                    }
                } catch(e) {
                    // Ignore parsing error here, just throw original empty response error
                }
                throw new Error('Empty response from Gemini');
            }
            
            console.log('[AIStudioClient]', `Gemini response received: ${fullResponse.length} characters`);
            return fullResponse;
            
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Extract content from Gemini response chunk
     * @param {Object} chunk 
     * @returns {string|null}
     */
    extractContent(chunk) {
        try {
            if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content) {
                const parts = chunk.candidates[0].content.parts;
                if (parts && parts[0] && parts[0].text) {
                    return parts[0].text;
                }
            }
        } catch (error) {
            console.log('[AIStudioClient]', `Error extracting Gemini content: ${error.message}`);
        }
        return null;
    }


} 