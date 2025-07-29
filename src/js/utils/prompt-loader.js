/**
 * Prompt Loader Utility
 * 
 * Handles loading JSON-based prompt configurations from the filesystem
 * and provides utilities for prompt validation and merging.
 */

export class PromptLoader {
    /**
     * Load all prompts from JSON files
     * @returns {Promise<Object>} Merged prompt configurations
     */
    static async loadPrompts() {
        const promptFiles = [
            'summarize-page.json',
            'timeline-analysis.json'
        ];
        
        const prompts = {};
        
        for (const file of promptFiles) {
            try {
                console.log(`[PromptLoader] Attempting to load: /prompts/${file}`);
                const response = await fetch(`/prompts/${file}`);
                console.log(`[PromptLoader] Response for ${file}:`, response.status, response.statusText);
                if (response.ok) {
                    const promptData = await response.json();
                    console.log(`[PromptLoader] Loaded data from ${file}:`, promptData);
                    Object.assign(prompts, promptData);
                } else {
                    console.warn(`Failed to load prompt file: ${file} - ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                console.error(`Error loading prompt file ${file}:`, error);
            }
        }
        
        return prompts;
    }

    /**
     * Load prompts with fallback to Chrome extension resources
     * @returns {Promise<Object>} Merged prompt configurations
     */
    static async loadPromptsWithFallback() {
        let prompts = {};
        
        // Try loading from standard web path first
        try {
            prompts = await this.loadPrompts();
            if (Object.keys(prompts).length > 0) {
                return prompts;
            }
        } catch (error) {
            console.log('Standard loading failed, trying Chrome extension resources');
        }

        // Fallback to Chrome extension resource URLs
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            const promptFiles = [
                'summarize-page.json',
                'timeline-analysis.json'
            ];
            
            for (const file of promptFiles) {
                try {
                    const url = chrome.runtime.getURL(`prompts/${file}`);
                    const response = await fetch(url);
                    if (response.ok) {
                        const promptData = await response.json();
                        Object.assign(prompts, promptData);
                    }
                } catch (error) {
                    console.error(`Error loading prompt file ${file} from extension:`, error);
                }
            }
        }
        
        return prompts;
    }

    /**
     * Load a single prompt file
     * @param {string} filename - The prompt file name
     * @returns {Promise<Object>} Prompt configuration from file
     */
    static async loadPromptFile(filename) {
        try {
            let response;
            
            // Try standard web path first
            try {
                response = await fetch(`/prompts/${filename}`);
            } catch (error) {
                // Fallback to Chrome extension resource
                if (typeof chrome !== 'undefined' && chrome.runtime) {
                    const url = chrome.runtime.getURL(`prompts/${filename}`);
                    response = await fetch(url);
                }
            }
            
            if (response && response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error(`Error loading prompt file ${filename}:`, error);
        }
        
        return {};
    }

    /**
     * Validate loaded prompts against schema
     * @param {Object} prompts - Prompt configurations to validate
     * @returns {Object} Validation results with valid/invalid prompts
     */
    static validatePrompts(prompts) {
        const validPrompts = {};
        const invalidPrompts = {};
        const errors = [];

        for (const [promptId, promptData] of Object.entries(prompts)) {
            const validation = this.validatePrompt(promptData);
            
            if (validation.isValid) {
                validPrompts[promptId] = promptData;
            } else {
                invalidPrompts[promptId] = {
                    data: promptData,
                    errors: validation.errors
                };
                errors.push(`Prompt ${promptId}: ${validation.errors.join(', ')}`);
            }
        }

        return {
            valid: validPrompts,
            invalid: invalidPrompts,
            errors,
            isValid: errors.length === 0
        };
    }

    /**
     * Validate a single prompt configuration
     * @param {Object} promptData - The prompt data to validate
     * @returns {Object} Validation result with isValid boolean and errors array
     */
    static validatePrompt(promptData) {
        const errors = [];
        
        if (!promptData || typeof promptData !== 'object') {
            errors.push('Prompt data must be an object');
            return { isValid: false, errors };
        }

        // Required fields
        const requiredFields = ['buttonText', 'buttonIcon', 'userPrompt', 'systemPrompt', 'status'];
        requiredFields.forEach(field => {
            if (!promptData[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        });

        // Validate status
        if (promptData.status && !['active', 'inactive'].includes(promptData.status)) {
            errors.push('Status must be "active" or "inactive"');
        }

        // Validate features if present
        if (promptData.features) {
            const validFeatures = [
                'pageContent', 'mcp', 'autoThink', 
                'noBaseSystemPrompt', 'browserTools', 'autoExecuteTools'
            ];
            
            if (typeof promptData.features !== 'object') {
                errors.push('Features must be an object');
            } else {
                Object.keys(promptData.features).forEach(feature => {
                    if (!validFeatures.includes(feature)) {
                        errors.push(`Unknown feature: ${feature}`);
                    }
                    if (typeof promptData.features[feature] !== 'boolean') {
                        errors.push(`Feature ${feature} must be boolean`);
                    }
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Create default prompt structure
     * @param {string} promptId - The prompt identifier
     * @param {Object} overrides - Fields to override in default structure
     * @returns {Object} Default prompt configuration
     */
    static createDefaultPrompt(promptId, overrides = {}) {
        return {
            buttonIcon: 'analyze',
            buttonText: 'New Prompt',
            systemPrompt: 'You are a helpful AI assistant.',
            userPrompt: 'Please help me with this task.',
            status: 'active',
            features: {
                pageContent: false,
                mcp: false,
                autoThink: false,
                noBaseSystemPrompt: false,
                browserTools: false,
                autoExecuteTools: false
            },
            ...overrides
        };
    }

    /**
     * Merge user preferences with default prompts
     * @param {Object} defaultPrompts - Default prompt configurations
     * @param {Object} userPreferences - User status preferences and customizations
     * @returns {Object} Merged prompt configurations
     */
    static mergeUserPreferences(defaultPrompts, userPreferences = {}) {
        const mergedPrompts = { ...defaultPrompts };

        // Apply user preferences (mainly status changes and custom prompts)
        Object.entries(userPreferences).forEach(([promptId, preferences]) => {
            if (mergedPrompts[promptId]) {
                // Merge preferences into existing prompt
                mergedPrompts[promptId] = {
                    ...mergedPrompts[promptId],
                    ...preferences
                };
            } else {
                // Add completely custom user prompt
                mergedPrompts[promptId] = preferences;
            }
        });

        return mergedPrompts;
    }

    /**
     * Extract user preferences from prompt configurations
     * @param {Object} prompts - Full prompt configurations
     * @param {Object} defaultPrompts - Default prompt configurations for comparison
     * @returns {Object} User preferences/customizations only
     */
    static extractUserPreferences(prompts, defaultPrompts = {}) {
        const preferences = {};

        Object.entries(prompts).forEach(([promptId, promptData]) => {
            const defaultPrompt = defaultPrompts[promptId];
            
            if (!defaultPrompt) {
                // Completely custom prompt
                preferences[promptId] = promptData;
            } else {
                // Check for changes from default
                const changes = {};
                let hasChanges = false;

                // Check status changes
                if (promptData.status !== defaultPrompt.status) {
                    changes.status = promptData.status;
                    hasChanges = true;
                }

                // Check feature changes
                if (promptData.features && defaultPrompt.features) {
                    Object.keys(promptData.features).forEach(feature => {
                        if (promptData.features[feature] !== defaultPrompt.features[feature]) {
                            if (!changes.features) changes.features = {};
                            changes.features[feature] = promptData.features[feature];
                            hasChanges = true;
                        }
                    });
                }

                // Check content changes
                ['buttonText', 'buttonIcon', 'userPrompt', 'systemPrompt'].forEach(field => {
                    if (promptData[field] !== defaultPrompt[field]) {
                        changes[field] = promptData[field];
                        hasChanges = true;
                    }
                });

                if (hasChanges) {
                    preferences[promptId] = changes;
                }
            }
        });

        return preferences;
    }

    /**
     * Get list of available prompt files
     * @returns {string[]} Array of prompt file names
     */
    static getAvailablePromptFiles() {
        return [
            'summarize-page.json',
            'timeline-analysis.json'
        ];
    }

    /**
     * Check if prompt loading is supported in current environment
     * @returns {boolean} True if prompt loading is supported
     */
    static isSupported() {
        return typeof fetch !== 'undefined';
    }
}