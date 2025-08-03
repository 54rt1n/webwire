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
     * Get the next available display order
     * @returns {number} Next display order number
     */
    getNextDisplayOrder() {
        const prompts = this.getAllPrompts();
        if (!prompts || Object.keys(prompts).length === 0) return 1;
        
        const orders = Object.values(prompts)
            .map(p => p.displayOrder || 0)
            .filter(order => Number.isInteger(order));
        
        return orders.length > 0 ? Math.max(...orders) + 1 : 1;
    }


    /**
     * Add a new prompt or update existing one
     * @param {string} promptId - The prompt identifier
     * @param {Object} promptData - The prompt configuration
     * @param {Object} options - Configuration options
     * @param {boolean} options.preserveStatus - Preserve existing prompt status
     * @param {boolean} options.preserveDisplayOrder - Preserve existing display order
     */
    setPrompt(promptId, promptData, options = {}) {
        if (!this.stateService.state.prompts) {
            this.stateService.state.prompts = {};
        }
        
        const existingPrompt = this.getPrompt(promptId);
        const prompt = { ...promptData };
        
        // Handle preserveStatus option
        if (options.preserveStatus && existingPrompt && existingPrompt.status !== undefined) {
            prompt.status = existingPrompt.status;
        }
        
        // Handle preserveDisplayOrder option
        if (options.preserveDisplayOrder && existingPrompt && existingPrompt.displayOrder !== undefined) {
            prompt.displayOrder = existingPrompt.displayOrder;
        } else {
            // If new prompt, assign display order
            if (!existingPrompt && prompt.displayOrder === undefined) {
                prompt.displayOrder = this.getNextDisplayOrder();
            } else if (existingPrompt && existingPrompt.displayOrder !== undefined) {
                // Preserve existing display order if not provided
                prompt.displayOrder = promptData.displayOrder !== undefined ? promptData.displayOrder : existingPrompt.displayOrder;
            }
        }
        
        this.stateService.state.prompts[promptId] = prompt;
        this.eventBus.emit(existingPrompt ? EVENTS.PROMPT.UPDATED : EVENTS.PROMPT.CREATED, { promptId, prompt });
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

        // Reindex display order after deletion to close gaps
        this.reindexDisplayOrder();

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
     * Set all prompts at once (used for initial loading)
     * @param {Object} prompts - Prompt configurations keyed by prompt ID
     */
    setPrompts(prompts) {
        // Assign display order to each prompt if not present
        let maxOrder = 0;
        Object.values(prompts).forEach(prompt => {
            if (prompt.displayOrder && prompt.displayOrder > maxOrder) {
                maxOrder = prompt.displayOrder;
            }
        });
        
        Object.entries(prompts).forEach(([id, prompt]) => {
            if (!prompt.displayOrder) {
                prompt.displayOrder = ++maxOrder;
            }
        });
        
        this.stateService.state.prompts = prompts;
        this.eventBus.emit(EVENTS.PROMPT.UPDATED, { prompts });
    }

    /**
     * Reorder a prompt to a new position
     * @param {string} promptId - The prompt ID to move
     * @param {number} newPosition - The new position (1-based)
     */
    reorderPrompt(promptId, newPosition) {
        const prompt = this.getPrompt(promptId);
        if (!prompt || !prompt.displayOrder) {
            return false;
        }

        const oldPosition = prompt.displayOrder;
        if (oldPosition === newPosition) {
            return true;
        }

        const allPrompts = this.getAllPrompts();
        
        // Update the moved prompt
        prompt.displayOrder = newPosition;
        
        // Shift prompts that are between the new and old positions
        Object.values(allPrompts).forEach(p => {
            if (p !== prompt && p.displayOrder) {
                if (oldPosition < newPosition) {
                    // Moving forward: shift items between old and new positions backward
                    if (p.displayOrder > oldPosition && p.displayOrder <= newPosition) {
                        p.displayOrder -= 1;
                    }
                } else {
                    // Moving backward: shift items between new and old positions forward
                    if (p.displayOrder >= newPosition && p.displayOrder < oldPosition) {
                        p.displayOrder += 1;
                    }
                }
            }
        });

        this.eventBus.emit(EVENTS.PROMPT.REORDERED, { 
            promptId, 
            oldPosition, 
            newPosition 
        });

        return true;
    }

    /**
     * Reindex display order to ensure sequential numbering (1, 2, 3, ...)
     * This fixes gaps that occur after prompt deletions
     */
    reindexDisplayOrder() {
        const prompts = this.getAllPrompts();
        const sortedEntries = Object.entries(prompts)
            .filter(([, prompt]) => prompt.displayOrder !== undefined)
            .sort(([, a], [, b]) => (a.displayOrder || 0) - (b.displayOrder || 0));

        // Reassign sequential display orders
        sortedEntries.forEach(([promptId, prompt], index) => {
            prompt.displayOrder = index + 1;
        });

        // Return count of reindexed prompts
        return sortedEntries.length;
    }

    /**
     * Get prompts ordered by display order
     * @returns {Array} Array of [promptId, prompt] pairs ordered by display order
     */
    getPromptsOrderedByDisplayOrder() {
        const allPrompts = this.getAllPrompts();
        return Object.entries(allPrompts)
            .sort(([, a], [, b]) => (a.displayOrder || 0) - (b.displayOrder || 0));
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