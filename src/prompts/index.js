import { EVENTS } from '../js/core/events.js';
import { BasePanelApp } from '../core/base-panel-app.js';
import { PromptsPanel } from './panel.js';
import { AppConfig } from '../js/core/app-config.js';
import { PromptLoader } from '../js/utils/prompt-loader.js';
import { logger } from '../js/core/logging.js';

/**
 * PromptsPanelApp
 * The main controller for the Prompts Panel. This class wires together the
 * state management (data/business logic) and the PromptsPanel (UI/view logic).
 */
class PromptsPanelApp extends BasePanelApp {
    constructor(config) {
        super(config, 'prompts');
    }

    // --- HOOK METHODS: Implementation for BasePanelApp ---

    _getPanelComponent() {
        return PromptsPanel;
    }

    _initializeDependencies() {
        // Prompts panel doesn't need additional dependencies
    }

    _wireUpDependencies() {
        // Wire up the panel with state service
        if (this.core.stateService) {
            this.panel.setStateService(this.core.stateService);
        }
    }

    _getUIHandlers() {
        return {
            onEditPrompt: this.editPrompt.bind(this),
            onTogglePrompt: this.togglePrompt.bind(this),
            onDeletePrompt: this.deletePrompt.bind(this),
            onNewPrompt: this.newPrompt.bind(this),
            onSavePrompt: this.savePrompt.bind(this),
            onImportPrompts: this.importPrompts.bind(this),
            onExportPrompts: this.exportPrompts.bind(this),
            onResetPrompts: this.resetPrompts.bind(this),
            onRefreshPrompts: this.refreshPrompts.bind(this),
            onSearchPrompts: this.searchPrompts.bind(this),
            onReorderPrompt: this.reorderPrompt.bind(this)
        };
    }

    async _loadData() {
        // Load initial prompts
        await this.loadPrompts();
    }

    /**
     * Setup event listeners for prompt events
     */
    setupEventListeners() {
        // Listen for prompt updates
        this.on(EVENTS.PROMPT.UPDATED, (payload) => {
            logger.log('PromptsPanelApp', 'Prompt updated:', payload);
            this.refreshPrompts();
        });

        // Listen for prompt status changes
        this.on(EVENTS.PROMPT.STATUS_CHANGED, (payload) => {
            logger.log('PromptsPanelApp', 'Prompt status changed:', payload);
            this.refreshPrompts();
        });

        // Listen for prompt deletion
        this.on(EVENTS.PROMPT.DELETED, (payload) => {
            logger.log('PromptsPanelApp', 'Prompt deleted:', payload);
            this.refreshPrompts();
        });
    }

    /**
     * Load all prompts and render them
     */
    async loadPrompts() {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        try {
            logger.log('PromptsPanelApp', 'Loading prompts...');
            
            // Get all prompts from state
            const prompts = this.core.stateService.prompts.getAllPrompts();
            
            logger.log("PromptsPanelApp", `Loaded ${Object.keys(prompts).length} prompts`);
            this.panel.renderPrompts(prompts);
            
        } catch (error) {
            logger.error('PromptsPanelApp', 'Failed to load prompts:', error);
            this.panel.renderPrompts({});
        }
    }

    /**
     * Refresh prompts list
     */
    async refreshPrompts() {
        logger.log('PromptsPanelApp', 'Refreshing prompts...');
        await this.loadPrompts();
    }

    /**
     * Edit an existing prompt
     * @param {string} promptId - The prompt ID to edit
     */
    async editPrompt(promptId) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        const prompt = this.core.stateService.prompts.getPrompt(promptId);
        if (prompt) {
            this.panel.openPromptModal(promptId, prompt);
        }
    }

    /**
     * Toggle prompt status (active/inactive)
     * @param {string} promptId - The prompt ID to toggle
     */
    async togglePrompt(promptId) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        try {
            logger.log("PromptsPanelApp", `Toggling prompt ${promptId}...`);
            
            this.core.stateService.prompts.togglePromptStatus(promptId);
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            logger.log("PromptsPanelApp", `Prompt ${promptId} toggled`);
            
            // Emit event for other components
            this.eventBus.emit(EVENTS.PROMPT.STATUS_CHANGED, { promptId });
            
        } catch (error) {
            logger.error("PromptsPanelApp", `Failed to toggle prompt ${promptId}:`, error);
        }
    }

    /**
     * Delete a prompt
     * @param {string} promptId - The prompt ID to delete
     */
    async deletePrompt(promptId) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        try {
            logger.log("PromptsPanelApp", `Deleting prompt ${promptId}...`);
            
            this.core.stateService.prompts.deletePrompt(promptId);
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            logger.log("PromptsPanelApp", `Prompt ${promptId} deleted`);
            
            // Emit event for other components
            this.eventBus.emit(EVENTS.PROMPT.DELETED, { promptId });
            
        } catch (error) {
            logger.error("PromptsPanelApp", `Failed to delete prompt ${promptId}:`, error);
        }
    }

    /**
     * Create a new prompt
     */
    async newPrompt() {
        // Open modal with empty prompt data
        this.panel.openPromptModal(null, null);
    }

    /**
     * Save a prompt (create or update)
     * @param {string} promptId - The prompt ID
     * @param {Object} promptData - The prompt data
     */
    async savePrompt(promptId, promptData) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        try {
            logger.log("PromptsPanelApp", `Saving prompt ${promptId}...`);
            
            // Validate prompt
            const validation = this.core.stateService.prompts.validatePrompt(promptData);
            if (!validation.isValid) {
                logger.error('PromptsPanelApp', 'Prompt validation failed:', validation.errors);
                alert('Prompt validation failed:\n' + validation.errors.join('\n'));
                return;
            }
            
            // Set or update prompt
            this.core.stateService.prompts.setPrompt(promptId, promptData);
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            logger.log("PromptsPanelApp", `Prompt ${promptId} saved`);
            
            // Close modal
            this.panel.closePromptModal();
            
            // Refresh the list
            await this.refreshPrompts();
            
        } catch (error) {
            logger.error("PromptsPanelApp", `Failed to save prompt ${promptId}:`, error);
            alert('Failed to save prompt. Please try again.');
        }
    }

    /**
     * Import prompts from file
     */
    async importPrompts() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const importedPrompts = JSON.parse(text);
                
                // Validate imported data
                const validation = PromptLoader.validatePrompts(importedPrompts);
                if (!validation.isValid) {
                    alert('Invalid prompt file:\n' + validation.errors.join('\n'));
                    return;
                }
                
                // Import prompts
                this.core.stateService.prompts.importPrompts(validation.valid, true);
                
                // Save state
                await this.core.stateService.prompts.saveToStorage();
                
                // Refresh
                await this.refreshPrompts();
                
                alert(`Successfully imported ${Object.keys(validation.valid).length} prompts`);
                
            } catch (error) {
                logger.error('PromptsPanelApp', 'Failed to import prompts:', error);
                alert('Failed to import prompts. Please check the file format.');
            }
        };
        
        input.click();
    }

    /**
     * Search prompts by query
     * @param {string} query - Search query string
     * @returns {Object} Matching prompts
     */
    async searchPrompts(query) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return {};
        }

        try {
            logger.log("PromptsPanelApp", `Searching prompts with query: "${query}"`);
            
            const results = this.core.stateService.prompts.searchPrompts(query);
            
            logger.log("PromptsPanelApp", `Found ${Object.keys(results).length} matching prompts`);
            return results;
            
        } catch (error) {
            logger.error('PromptsPanelApp', 'Failed to search prompts:', error);
            return {};
        }
    }

    /**
     * Export prompts to file
     * @param {string[]} promptIds - Array of prompt IDs to export (empty = all)
     */
    async exportPrompts(promptIds = []) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        try {
            const exportData = this.core.stateService.prompts.exportPrompts(promptIds);
            
            // Create and download JSON file
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `webwire-prompts-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            logger.log("PromptsPanelApp", `Exported ${Object.keys(exportData).length} prompts`);
            
        } catch (error) {
            logger.error('PromptsPanelApp', 'Failed to export prompts:', error);
            alert('Failed to export prompts. Please try again.');
        }
    }

    /**
     * Reset prompts to default bundled versions
     */
    async resetPrompts() {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            logger.error('PromptsPanelApp', 'No prompts state service available');
            return;
        }

        try {
            // Confirm with user
            const confirmed = confirm('This will reset all default prompts to their original versions. User-created prompts will not be affected. Continue?');
            if (!confirmed) {
                return;
            }

            logger.log('PromptsPanelApp', 'Resetting prompts to defaults...');
            
            // Load bundled prompts
            const bundledPrompts = await PromptLoader.loadPrompts();
            
            // Reset each bundled prompt by ID
            let resetCount = 0;
            for (const [promptId, promptData] of Object.entries(bundledPrompts)) {
                this.core.stateService.prompts.setPrompt(promptId, promptData, { preserveStatus: true, preserveDisplayOrder: true });
                resetCount++;
            }
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            logger.log('PromptsPanelApp', `Reset ${resetCount} prompts to defaults`);
            
            // Refresh the UI
            await this.refreshPrompts();
            
            alert(`Successfully reset ${resetCount} prompts to their default versions.`);
            
        } catch (error) {
            logger.error('PromptsPanelApp', 'Failed to reset prompts:', error);
            alert('Failed to reset prompts. Please try again.');
        }
    }
    
    /**
     * Reorder a prompt to a new position
     * @param {string} promptId - The prompt ID to move
     * @param {number} newPosition - The new position index
     */
    async reorderPrompt(promptId, newPosition) {
        try {
            this.core.stateService.prompts.reorderPrompt(promptId, newPosition);
            await this.core.stateService.prompts.saveToStorage();
            await this.refreshPrompts();
        } catch (error) {
            logger.error('PromptsPanelApp', `Failed to reorder prompt ${promptId}:`, error);
        }
    }
}

// Kick off the application.
document.addEventListener('DOMContentLoaded', () => {
    const config = AppConfig.pageFactory('lite');
    
    const app = new PromptsPanelApp(config);
    app.initialize();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});