/**
 * ToolParser - Extracts JSON tool calls from AI responses
 * Provides robust parsing for MCP tool-calling responses
 */
export class ToolParser {
    constructor() {
        // Regex patterns for extraction
        this.patterns = {
            jsonBlock: /```json\s*([\s\S]*?)\s*```/i,
            codeBlock: /```(\w+)?\s*([\s\S]*?)\s*```/g,
            partialJson: /```json/i,
            // Pattern for thinking blocks to exclude
            thinkBlock: /<think>[\s\S]*?<\/think>/gi
        };
    }

    /**
     * Check if content contains JSON blocks (stateless)
     * @param {string} content - Content to check
     * @returns {boolean} True if JSON block detected
     */
    hasJsonBlocks(content) {
        return this.patterns.partialJson.test(content);
    }

    /**
     * Remove thinking blocks from response content
     * @param {string} response - The AI response text
     * @returns {string} Response with thinking blocks removed
     */
    filterThinkingBlocks(response) {
        let filtered = response;
        
        // First, remove all properly closed <think>...</think> blocks
        filtered = filtered.replace(this.patterns.thinkBlock, '');
        
        // Then, check if there's any remaining unclosed <think> tag and remove everything from there to end
        const unclosedThinkMatch = filtered.match(/<think>/i);
        if (unclosedThinkMatch) {
            const startIndex = unclosedThinkMatch.index;
            filtered = filtered.substring(0, startIndex);
            console.log('[ToolParser] Removed unclosed thinking block from position', startIndex);
        }
        
        console.log('[ToolParser] Filtered thinking blocks from response');
        return filtered;
    }

    /**
     * Parse an AI response for MCP tool calls
     * @param {string} response - The AI response text
     * @returns {Object} Parsed result with tool calls and metadata
     */
    parseResponse(response) {
        const result = {
            success: false,
            toolCalls: [],
            errors: [],
            raw: response
        };

        try {
            // Filter out thinking blocks before processing
            const filteredResponse = this.filterThinkingBlocks(response);
            
            // Extract and parse all tool calls
            const toolCallsResult = this.extractAllToolCalls(filteredResponse);
            
            if (toolCallsResult.toolCalls.length > 0) {
                result.toolCalls = toolCallsResult.toolCalls;
                result.success = true;
            }
            
            if (toolCallsResult.errors.length > 0) {
                result.errors.push(...toolCallsResult.errors);
            }

        } catch (error) {
            result.errors.push(`Parsing error: ${error.message}`);
        }

        return result;
    }

    /**
     * Extract and validate all tool calls from response
     * @param {string} response - The AI response
     * @returns {Object} Tool calls extraction result
     */
    extractAllToolCalls(response) {
        const result = {
            toolCalls: [],
            errors: []
        };

        // Find all JSON code blocks
        const codeBlocks = this.extractCodeBlocks(response);
        const jsonBlocks = codeBlocks.filter(block => block.language === 'json');

        console.log('[ToolParser] Found', jsonBlocks.length, 'JSON code blocks');
        
        if (jsonBlocks.length === 0) {
            console.log('[ToolParser] No JSON code blocks found in response');
            result.errors.push('No JSON code blocks found in response');
            return result;
        }

        // Parse each JSON block as a potential tool call
        for (let i = 0; i < jsonBlocks.length; i++) {
            const block = jsonBlocks[i];
            const jsonString = block.content.trim();
            
            if (!jsonString) {
                console.log('[ToolParser] Empty JSON code block', i + 1);
                result.errors.push(`Empty JSON code block ${i + 1}`);
                continue;
            }

            try {
                console.log('[ToolParser] Parsing JSON code block:', jsonString);
                const preprocessed = this.preprocessJsonString(jsonString);
                console.log('[ToolParser] Preprocessed JSON:', preprocessed);
                const parsed = JSON.parse(preprocessed);
                console.log('[ToolParser] Parsed tool call:', parsed);
                const validation = this.validateToolCall(parsed);
                
                if (validation.valid) {
                    result.toolCalls.push(parsed);
                } else {
                    result.errors.push(`Tool call ${i + 1} validation failed: ${validation.errors.join(', ')}`);
                }
                
            } catch (parseError) {
                console.log('[ToolParser] JSON parse error in block', i + 1, ':', parseError.message);
                result.errors.push(`JSON parse error in block ${i + 1}: ${parseError.message}`);
            }
        }

        return result;
    }

    /**
     * Extract and validate tool call from response
     * @param {string} response - The AI response
     * @returns {Object} Tool call extraction result
     */
    extractToolCall(response) {
        const result = {
            success: false,
            toolCall: null,
            errors: []
        };

        // Filter out thinking blocks before processing
        const filteredResponse = this.filterThinkingBlocks(response);

        // Look for JSON code block
        const jsonMatch = filteredResponse.match(this.patterns.jsonBlock);
        
        if (!jsonMatch) {
            result.errors.push('No JSON code block found in response');
            return result;
        }

        const jsonString = jsonMatch[1].trim();
        
        if (!jsonString) {
            result.errors.push('Empty JSON code block');
            return result;
        }

        try {
            const preprocessed = this.preprocessJsonString(jsonString);
            const parsed = JSON.parse(preprocessed);
            const validation = this.validateToolCall(parsed);
            
            if (validation.valid) {
                result.toolCall = parsed;
                result.success = true;
            } else {
                result.errors.push(...validation.errors);
            }
            
        } catch (parseError) {
            result.errors.push(`JSON parse error: ${parseError.message}`);
        }

        return result;
    }

    /**
     * Validate a parsed tool call object
     * @param {Object} toolCall - The parsed tool call
     * @returns {Object} Validation result
     */
    validateToolCall(toolCall) {
        const result = {
            valid: false,
            errors: []
        };

        // Check basic structure
        if (!toolCall || typeof toolCall !== 'object') {
            result.errors.push('Tool call must be an object');
            return result;
        }

        // Apply fuzzy matching to normalize the tool call object
        const normalized = this.applyFuzzyMatching(toolCall);
        
        // Copy normalized properties back to original object
        Object.assign(toolCall, normalized);

        result.valid = true;
        return result;
    }

    /**
     * Apply fuzzy matching to normalize tool call field names
     * @param {Object} toolCall - The parsed tool call object
     * @returns {Object} Normalized tool call object
     */
    applyFuzzyMatching(toolCall) {
        // Create a copy to avoid mutating the original
        const normalized = { ...toolCall };
        const keys = Object.keys(normalized);
        
        // If object has exactly 2 keys with one string and one object value, apply fuzzy matching
        if (keys.length === 2) {
            let nameKey = null;
            let paramsKey = null;
            
            // Find which key has string value (tool name) and which has object value (parameters)
            for (const key of keys) {
                const value = normalized[key];
                if (typeof value === 'string') {
                    nameKey = key;
                } else if (typeof value === 'object' && value !== null) {
                    paramsKey = key;
                }
            }
            
            // If we found both patterns, rewrite the field names
            if (nameKey && paramsKey) {
                if (nameKey !== 'name') {
                    normalized.name = normalized[nameKey];
                    delete normalized[nameKey];
                    console.log(`[ToolParser] Fuzzy match: '${nameKey}' -> 'name'`);
                }
                
                if (paramsKey !== 'parameters') {
                    normalized.parameters = normalized[paramsKey];
                    delete normalized[paramsKey];
                    console.log(`[ToolParser] Fuzzy match: '${paramsKey}' -> 'parameters'`);
                }
            }
        }
        
        return normalized;
    }

    /**
     * Preprocess JSON string to fix common formatting issues
     * @param {string} jsonString - Raw JSON string
     * @returns {string} Preprocessed JSON string
     */
    preprocessJsonString(jsonString) {
        try {
            // First try to parse as-is
            JSON.parse(jsonString);
            return jsonString;
        } catch (error) {
            console.log('[ToolParser] JSON preprocessing needed, error:', error.message);
            
            // More robust approach: parse character by character to properly handle strings
            let processed = '';
            let inString = false;
            let isKey = false;
            let i = 0;
            
            while (i < jsonString.length) {
                const char = jsonString[i];
                const nextChar = jsonString[i + 1];
                
                if (char === '"' && (i === 0 || jsonString[i - 1] !== '\\')) {
                    if (!inString) {
                        // Entering a string - check if it's a key
                        inString = true;
                        // Look ahead to see if this string is followed by a colon
                        let j = i + 1;
                        let tempStr = '';
                        while (j < jsonString.length && jsonString[j] !== '"') {
                            if (jsonString[j] === '\\') j++; // Skip escaped chars
                            j++;
                        }
                        if (j < jsonString.length) {
                            j++; // Skip closing quote
                            while (j < jsonString.length && /\s/.test(jsonString[j])) j++; // Skip whitespace
                            isKey = jsonString[j] === ':';
                        }
                    } else {
                        // Exiting a string
                        inString = false;
                        isKey = false;
                    }
                    processed += char;
                } else if (inString && !isKey) {
                    // We're inside a string value (not a key), escape control characters
                    switch (char) {
                        case '\n':
                            processed += '\\n';
                            break;
                        case '\r':
                            processed += '\\r';
                            break;
                        case '\t':
                            processed += '\\t';
                            break;
                        case '\f':
                            processed += '\\f';
                            break;
                        case '\b':
                            processed += '\\b';
                            break;
                        case '\\':
                            // Only escape if not already escaped
                            if (nextChar && 'nrtfb"\\'.includes(nextChar)) {
                                processed += char; // Already properly escaped
                            } else {
                                processed += '\\\\';
                            }
                            break;
                        default:
                            processed += char;
                    }
                } else {
                    processed += char;
                }
                i++;
            }
            
            console.log('[ToolParser] Preprocessed JSON result:', processed);
            return processed;
        }
    }

    /**
     * Extract all code blocks from response (utility method)
     * @param {string} response - The AI response
     * @returns {Array} Array of code block objects
     */
    extractCodeBlocks(response) {
        const blocks = [];
        let match;
        
        // Reset regex
        this.patterns.codeBlock.lastIndex = 0;
        
        while ((match = this.patterns.codeBlock.exec(response)) !== null) {
            blocks.push({
                language: match[1] || 'text',
                content: match[2].trim()
            });
            console.log('[ToolParser] Extracted code block:', blocks[blocks.length - 1]);
        }

        return blocks;
    }
} 