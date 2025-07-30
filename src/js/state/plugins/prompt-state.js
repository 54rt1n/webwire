/**
 * Prompt State Plugin
 * 
 * Manages prompt library state including JSON-based prompt configurations,
 * user preferences for prompt status (active/inactive), and prompt data persistence.
 */

import { EVENTS } from '../../core/events.js';

export class PromptStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        // Storage may not exist in content contexts
        this.storage = stateService.storage?.prompts;
    }

    /**
     * Load prompts from storage
     */
    async loadFromStorage() {
        if (this.storage) {
            const savedState = await this.storage.load();
            if (savedState && savedState.prompts) {
                this.stateService.state.prompts = savedState.prompts;
            }
        }
        // In content contexts, prompts come from initial state, so nothing to load
    }

    /**
     * Save prompts to storage
     */
    async saveToStorage() {
        if (this.storage) {
            await this.storage.save({
                prompts: this.stateService.state.prompts
            });
        }
        // In content contexts, saving happens through cross-context dispatch
    }

    /**
     * Set all prompts, replacing existing prompts
     * @param {Object} prompts - Prompt configurations keyed by prompt ID
     */
    setPrompts(prompts) {
        this.stateService.state.prompts = { ...prompts };
        this.eventBus.emit(EVENTS.PROMPT.UPDATED, { prompts });
    }

    /**
     * Set or update a single prompt
     * @param {string} promptId - The prompt identifier
     * @param {Object} promptData - The prompt configuration
     */
    setPrompt(promptId, promptData) {
        if (!this.stateService.state.prompts) {
            this.stateService.state.prompts = {};
        }
        
        this.stateService.state.prompts[promptId] = { ...promptData };
        this.eventBus.emit(EVENTS.PROMPT.CREATED, { promptId, prompt: promptData });
    }

    /**
     * Get a specific prompt by ID
     * @param {string} promptId - The prompt identifier
     * @returns {Object|undefined} The prompt configuration or undefined if not found
     */
    getPrompt(promptId) {
        return this.stateService.state.prompts?.[promptId];
    }

    /**
     * Get all prompts
     * @returns {Object} All prompt configurations keyed by prompt ID
     */
    getAllPrompts() {
        return this.stateService.state.prompts || {};
    }

    /**
     * Get only active prompts
     * @returns {Object} Active prompt configurations keyed by prompt ID
     */
    getActivePrompts() {
        const prompts = this.getAllPrompts();
        return Object.entries(prompts)
            .filter(([_, prompt]) => prompt.status === 'active')
            .reduce((acc, [id, prompt]) => ({ ...acc, [id]: prompt }), {});
    }

    /**
     * Get only inactive prompts
     * @returns {Object} Inactive prompt configurations keyed by prompt ID
     */
    getInactivePrompts() {
        const prompts = this.getAllPrompts();
        return Object.entries(prompts)
            .filter(([_, prompt]) => prompt.status === 'inactive')
            .reduce((acc, [id, prompt]) => ({ ...acc, [id]: prompt }), {});
    }

    /**
     * Toggle the status of a prompt between active and inactive
     * @param {string} promptId - The prompt identifier
     * @returns {boolean} True if toggle was successful, false if prompt not found
     */
    togglePromptStatus(promptId) {
        const prompt = this.getPrompt(promptId);
        if (!prompt) {
            return false;
        }

        const newStatus = prompt.status === 'active' ? 'inactive' : 'active';
        prompt.status = newStatus;

        this.eventBus.emit(EVENTS.PROMPT.STATUS_CHANGED, { 
            promptId, 
            oldStatus: prompt.status === 'active' ? 'inactive' : 'active', 
            newStatus 
        });

        return true;
    }

    /**
     * Set the status of a prompt
     * @param {string} promptId - The prompt identifier
     * @param {string} status - The new status ('active' or 'inactive')
     * @returns {boolean} True if update was successful, false if prompt not found
     */
    setPromptStatus(promptId, status) {
        const prompt = this.getPrompt(promptId);
        if (!prompt) {
            return false;
        }

        const oldStatus = prompt.status;
        prompt.status = status;

        this.eventBus.emit(EVENTS.PROMPT.STATUS_CHANGED, { 
            promptId, 
            oldStatus, 
            newStatus: status 
        });

        return true;
    }

    /**
     * Delete a prompt
     * @param {string} promptId - The prompt identifier
     * @returns {boolean} True if deletion was successful, false if prompt not found
     */
    deletePrompt(promptId) {
        const prompt = this.getPrompt(promptId);
        if (!prompt) {
            return false;
        }

        delete this.stateService.state.prompts[promptId];

        this.eventBus.emit(EVENTS.PROMPT.DELETED, { promptId, prompt });
        return true;
    }

    /**
     * Update prompt data (excluding status changes)
     * @param {string} promptId - The prompt identifier
     * @param {Object} updates - Fields to update
     * @returns {boolean} True if update was successful, false if prompt not found
     */
    updatePrompt(promptId, updates) {
        const prompt = this.getPrompt(promptId);
        if (!prompt) {
            return false;
        }

        Object.assign(prompt, updates);

        this.eventBus.emit(EVENTS.PROMPT.UPDATED, { 
            promptId, 
            prompt 
        });

        return true;
    }

    /**
     * Import prompts from external data, merging with existing
     * @param {Object} importedPrompts - Prompt configurations to import
     * @param {boolean} overwrite - Whether to overwrite existing prompts with same ID
     */
    importPrompts(importedPrompts, overwrite = false) {
        const currentPrompts = this.getAllPrompts();
        let importedCount = 0;
        let skippedCount = 0;

        Object.entries(importedPrompts).forEach(([promptId, promptData]) => {
            if (currentPrompts[promptId] && !overwrite) {
                skippedCount++;
            } else {
                this.setPrompt(promptId, promptData);
                importedCount++;
            }
        });
        
        this.eventBus.emit(EVENTS.PROMPT.IMPORTED, { 
            importedCount,
            skippedCount,
            prompts: importedPrompts
        });
    }

    /**
     * Export selected prompts
     * @param {string[]} promptIds - Array of prompt IDs to export (empty = all)
     * @returns {Object} Exported prompt configurations
     */
    exportPrompts(promptIds = []) {
        const allPrompts = this.getAllPrompts();
        
        if (promptIds.length === 0) {
            promptIds = Object.keys(allPrompts);
        }

        const exportedPrompts = {};
        promptIds.forEach(promptId => {
            if (allPrompts[promptId]) {
                exportedPrompts[promptId] = allPrompts[promptId];
            }
        });

        this.eventBus.emit(EVENTS.PROMPT.EXPORTED, { 
            promptIds,
            prompts: exportedPrompts
        });

        return exportedPrompts;
    }

    /**
     * Get prompt statistics
     * @returns {Object} Statistics about prompts
     */
    getStats() {
        const prompts = this.getAllPrompts();
        const promptEntries = Object.entries(prompts);
        
        return {
            total: promptEntries.length,
            active: promptEntries.filter(([_, p]) => p.status === 'active').length,
            inactive: promptEntries.filter(([_, p]) => p.status === 'inactive').length,
            withMCP: promptEntries.filter(([_, p]) => p.features?.mcp).length,
            withPageContent: promptEntries.filter(([_, p]) => p.features?.pageContent).length,
            withAutoThink: promptEntries.filter(([_, p]) => p.features?.autoThink).length
        };
    }

    /**
     * Search prompts by query string across all text fields
     * @param {string} query - Search query (case-insensitive)
     * @returns {Object} Matching prompt configurations keyed by prompt ID
     */
    searchPrompts(query) {
        if (!query || typeof query !== 'string') {
            return this.getAllPrompts();
        }

        const searchQuery = query.toLowerCase().trim();
        if (searchQuery === '') {
            return this.getAllPrompts();
        }

        const allPrompts = this.getAllPrompts();
        const matchingPrompts = {};

        Object.entries(allPrompts).forEach(([promptId, prompt]) => {
            const searchableFields = [
                prompt.buttonText || '',
                prompt.userPrompt || '',
                prompt.systemPrompt || '',
                promptId // Also search the prompt ID itself
            ];

            // Search through all text fields
            const hasMatch = searchableFields.some(field => 
                field.toLowerCase().includes(searchQuery)
            );

            if (hasMatch) {
                matchingPrompts[promptId] = prompt;
            }
        });

        return matchingPrompts;
    }

    /**
     * Validate a prompt configuration
     * @param {Object} promptData - The prompt data to validate
     * @returns {Object} Validation result with isValid boolean and errors array
     */
    validatePrompt(promptData) {
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
            Object.keys(promptData.features).forEach(feature => {
                if (!validFeatures.includes(feature)) {
                    errors.push(`Unknown feature: ${feature}`);
                }
                if (typeof promptData.features[feature] !== 'boolean') {
                    errors.push(`Feature ${feature} must be boolean`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}