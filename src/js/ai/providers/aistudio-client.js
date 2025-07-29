import { AbstractAIClient } from '../abstract-ai-client.js';

/**
 * Google AI Studio/Gemini Client - Handles communication with Google Gemini API
 * Implements streaming responses and robust error handling
 * @extends AbstractAIClient
 */

export class AIStudioClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('AIStudioClient', eventBus, config);

        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        
        // Set default model if not provided
        if (!this.model) {
            this.model = 'gemini-2.0-flash';
        }
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
     * @param {string} userTurn 
     * @param {Array} conversationHistory 
     * @param {string} systemPrompt
     * @param {Object} options - Additional options including maxHistory
     * @returns {Array}
     */
    buildContents(userTurn, conversationHistory, systemPrompt, { maxHistory = null } = {}) {
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

        // Add recent conversation history - convert from standard format to Gemini format
        if (conversationHistory.length > 0) {
            const historyToAdd = maxHistory ? conversationHistory.slice(-maxHistory) : conversationHistory;
            
            for (const message of historyToAdd) {
                contents.push({
                    role: message.role === 'user' ? 'user' : 'model',
                    parts: [{ text: message.content }]
                });
            }
        }

        // Add current user input
        contents.push({
            role: "user",
            parts: [{ text: userTurn }]
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
                
                // Gemini returns an array of JSON objects, need to parse them properly
                while (buffer.length > 0) {
                    buffer = buffer.trim();
                    if (!buffer) break;
                    
                    // Check if we have a complete JSON structure (array or single object)
                    let braceCount = 0;
                    let bracketCount = 0;
                    let inString = false;
                    let escapeNext = false;
                    let jsonEnd = -1;
                    let isArray = buffer.startsWith('[');
                    
                    for (let i = 0; i < buffer.length; i++) {
                        const char = buffer[i];
                        
                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }
                        
                        if (char === '\\' && inString) {
                            escapeNext = true;
                            continue;
                        }
                        
                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }
                        
                        if (!inString) {
                            if (char === '{') {
                                braceCount++;
                            } else if (char === '}') {
                                braceCount--;
                            } else if (char === '[') {
                                bracketCount++;
                            } else if (char === ']') {
                                bracketCount--;
                                if (isArray && bracketCount === 0) {
                                    jsonEnd = i;
                                    break;
                                }
                            }
                            
                            if (!isArray && braceCount === 0 && bracketCount === 0 && char === '}') {
                                jsonEnd = i;
                                break;
                            }
                        }
                    }
                    
                    if (jsonEnd === -1) {
                        // Incomplete JSON structure, wait for more data
                        break;
                    }
                    
                    // Extract the complete JSON structure
                    const jsonStr = buffer.substring(0, jsonEnd + 1);
                    buffer = buffer.substring(jsonEnd + 1);
                    
                    // Skip comma and whitespace for next iteration
                    buffer = buffer.replace(/^\s*,?\s*/, '');
                    
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const chunks = Array.isArray(parsed) ? parsed : [parsed];
                        
                        for (const chunk of chunks) {
                            const content = this.extractContent(chunk);
                            if (content) {
                                fullResponse += content;
                                this.emitStreamingChunk(content);
                            }
                        }
                    } catch (parseError) {
                        console.log('[AIStudioClient]', `Gemini parse error: ${parseError.message}`, jsonStr.substring(0, 100));
                    }
                }
            }
            
            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer.trim());
                    const content = this.extractContent(parsed);
                    if (content) {
                        fullResponse += content;
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