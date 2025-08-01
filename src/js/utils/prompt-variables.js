/**
 * Prompt Variables Utility
 * 
 * Handles variable replacement in prompts with support for:
 * - Date/time variables (CURRENT_DATE, CURRENT_DATETIME, CURRENT_ISO)
 * - User context variables (USER, ASSISTANT)
 * - AI model variables (AI.MODEL, AI.PROVIDER)
 * - Page context variables (PAGE.TITLE, PAGE.URL, PAGE.DOMAIN)
 * - Conversation variables (CONVERSATION.ID)
 * 
 * Variables use the format {{VARIABLE_NAME}} where:
 * - Variable names are UPPERCASE
 * - Nested objects are flattened with dot notation (AI.MODEL)
 * - Unknown variables are left unchanged
 */

export class PromptVariables {
    /**
     * Flattens a nested object into dot notation keys
     * @param {Object} obj - Object to flatten
     * @param {string} prefix - Current key prefix
     * @returns {Object} Flattened object with dot notation keys
     */
    static flattenObject(obj, prefix = '') {
        const flattened = {};
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const newKey = prefix ? `${prefix}.${key}` : key;
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    // Recursively flatten nested objects
                    Object.assign(flattened, this.flattenObject(value, newKey));
                } else {
                    // Add the value directly
                    flattened[newKey] = value;
                }
            }
        }
        
        return flattened;
    }

    /**
     * Formats a date for CURRENT_DATE variable
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     */
    static formatDate(date) {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Formats a date for CURRENT_DATETIME variable
     * @param {Date} date - Date to format
     * @returns {string} Formatted datetime string
     */
    static formatDateTime(date) {
        const dateStr = this.formatDate(date);
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `${dateStr} at ${timeStr}`;
    }

    /**
     * Extract domain from URL
     * @param {string} url - Full URL
     * @returns {string} Domain name
     */
    static extractDomain(url) {
        if (!url) return '';
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            return '';
        }
    }

    /**
     * Builds the complete variable dictionary from state and context
     * @param {Object} stateService - State service instance
     * @param {Object} pageContext - Page context object (can be pageUtils result or syntheticMessages result)
     * @returns {Object} Variable dictionary with flattened keys
     */
    static buildVariableDict(stateService, pageContext) {
        const now = new Date();
        
        // Extract page information from different possible formats
        let pageTitle = '';
        let pageUrl = '';
        let pageDomain = '';
        
        if (pageContext) {
            // If pageContext is from pageUtils.getCurrentPageContent() (direct extract result)
            if (pageContext.title && pageContext.url) {
                pageTitle = pageContext.title;
                pageUrl = pageContext.url;
                pageDomain = this.extractDomain(pageUrl);
            }
            // If pageContext is from messageBuilder.buildPageContext() (synthetic messages)
            else if (pageContext.syntheticMessages && pageContext.syntheticMessages.length > 0) {
                // Look for page metadata in synthetic messages
                for (const message of pageContext.syntheticMessages) {
                    try {
                        const parsed = JSON.parse(message);
                        if (parsed.title && parsed.url) {
                            pageTitle = parsed.title;
                            pageUrl = parsed.url;
                            pageDomain = this.extractDomain(pageUrl);
                            break;
                        }
                    } catch (e) {
                        // Not JSON, continue
                    }
                }
            }
        }
        
        // Fallback to DOM if available and no page context
        if (!pageTitle && typeof document !== 'undefined') {
            pageTitle = document.title || '';
        }
        if (!pageUrl && typeof window !== 'undefined') {
            pageUrl = window.location.href || '';
            pageDomain = this.extractDomain(pageUrl);
        }
        
        // Build base variables
        const variables = {
            // Date/time variables
            CURRENT_DATE: this.formatDate(now),
            CURRENT_DATETIME: this.formatDateTime(now),
            CURRENT_ISO: now.toISOString(),
            
            // User context variables
            USER: stateService?.state?.settings?.aim?.userName || 'User',
            ASSISTANT: stateService?.state?.settings?.aim?.personaName || 'Assistant',
            
            // AI model variables (nested, will be flattened)
            AI: {
                MODEL: stateService?.state?.settings?.ai?.models?.chat?.model || '',
                PROVIDER: stateService?.state?.settings?.ai?.models?.chat?.provider || ''
            },
            
            // Page context variables (nested, will be flattened)
            PAGE: {
                TITLE: pageTitle,
                URL: pageUrl,
                DOMAIN: pageDomain
            },
            
            // Conversation variables (nested, will be flattened)
            CONVERSATION: {
                ID: stateService?.conversation?.getActiveThreadId?.() || ''
            }
        };
        
        // Flatten nested objects to dot notation
        return this.flattenObject(variables);
    }

    /**
     * Replaces variables in text using the format {{VARIABLE_NAME}}
     * @param {string} text - Text containing variables to replace
     * @param {Object} variableDict - Dictionary of variable names to values
     * @returns {string} Text with variables replaced
     */
    static replaceVariables(text, variableDict) {
        if (!text || typeof text !== 'string') {
            return text || '';
        }
        
        // Use regex to find all {{VARIABLE_NAME}} patterns
        return text.replace(/\{\{([A-Z][A-Z0-9_.]*)\}\}/g, (match, variableName) => {
            const value = variableDict[variableName];
            
            // Only replace if the variable exists and has a non-null, non-undefined value
            if (value !== null && value !== undefined) {
                return String(value);
            }
            
            // Leave unknown or null/undefined variables unchanged
            return match;
        });
    }

    /**
     * Processes prompt text by replacing all variables
     * @param {string} promptText - Prompt text to process
     * @param {Object} stateService - State service instance
     * @param {Object} pageContext - Page context object
     * @returns {string} Processed prompt text with variables replaced
     */
    static processPromptText(promptText, stateService, pageContext) {
        if (!promptText) {
            return '';
        }
        
        const variableDict = this.buildVariableDict(stateService, pageContext);
        return this.replaceVariables(promptText, variableDict);
    }

    /**
     * Gets a list of all available variables for UI display
     * @returns {Array} Array of variable information objects
     */
    static getAvailableVariables() {
        return [
            {
                name: 'CURRENT_DATE',
                description: 'Current date in long format (e.g., "January 15, 2025")',
                example: 'January 15, 2025'
            },
            {
                name: 'CURRENT_DATETIME', 
                description: 'Current date and time (e.g., "January 15, 2025 at 2:30 PM")',
                example: 'January 15, 2025 at 2:30 PM'
            },
            {
                name: 'CURRENT_ISO',
                description: 'Current date/time in ISO format (e.g., "2025-01-15T14:30:45.123Z")',
                example: '2025-01-15T14:30:45.123Z'
            },
            {
                name: 'USER',
                description: 'Current user name from settings',
                example: 'John'
            },
            {
                name: 'ASSISTANT',
                description: 'Current AI assistant persona name',
                example: 'Claude'
            },
            {
                name: 'AI.MODEL',
                description: 'Current AI model name',
                example: 'gpt-4'
            },
            {
                name: 'AI.PROVIDER',
                description: 'Current AI provider name',
                example: 'openai'
            },
            {
                name: 'PAGE.TITLE',
                description: 'Title of the current web page',
                example: 'WebWire Documentation'
            },
            {
                name: 'PAGE.URL',
                description: 'URL of the current web page',
                example: 'https://example.com/docs'
            },
            {
                name: 'PAGE.DOMAIN',
                description: 'Domain of the current web page',
                example: 'example.com'
            },
            {
                name: 'CONVERSATION.ID',
                description: 'ID of the current conversation thread',
                example: 'thread-abc123'
            }
        ];
    }
}