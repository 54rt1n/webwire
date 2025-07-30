import { EVENTS, EVENT_CONTEXT } from '../js/core/events.js';
import { EventBindableComponent } from '../js/core/event-bindable-panel.js';
import { PromptsPanel } from './panel.js';
import { WebWireClientCore } from '../js/client/webwire-client-core.js';
import { PanelEventHandlers } from '../js/client/panel-event-handlers.js';
import { EventBus } from '../js/core/event-bus.js';
import { AppConfig } from '../js/core/app-config.js';
import { PromptLoader } from '../js/utils/prompt-loader.js';

/**
 * PromptsPanelApp
 * The main controller for the Prompts Panel. This class wires together the
 * state management (data/business logic) and the PromptsPanel (UI/view logic).
 */
class PromptsPanelApp extends EventBindableComponent {
    constructor(config) {
        const eventBus = new EventBus({domain: 'prompts', debug: true});
        super(eventBus);
        this.config = config;
        this.core = new WebWireClientCore(this.eventBus, config);
        this.panelEventHandlers = null;
        this.panel = new PromptsPanel(this.eventBus);
        
        this.setupEventListeners();
    }

    /**
     * Initializes the entire application.
     */
    async initialize() {
        console.log('[PromptsPanelApp] Initializing Prompts Panel...');

        await this.core.initialize();
        this.panelEventHandlers = new PanelEventHandlers(this.core);
        this.panelEventHandlers.setupEventListeners();

        // Set up state service for prompts management
        if (this.core.stateService) {
            this.panel.setStateService(this.core.stateService);
        }

        // Setup UI event handlers
        const handlers = {
            onEditPrompt: this.editPrompt.bind(this),
            onTogglePrompt: this.togglePrompt.bind(this),
            onDeletePrompt: this.deletePrompt.bind(this),
            onNewPrompt: this.newPrompt.bind(this),
            onSavePrompt: this.savePrompt.bind(this),
            onImportPrompts: this.importPrompts.bind(this),
            onExportPrompts: this.exportPrompts.bind(this),
            onRefreshPrompts: this.refreshPrompts.bind(this),
            onSearchPrompts: this.searchPrompts.bind(this)
        };
        this.panel.initialize(handlers);

        // Load initial prompts
        await this.loadPrompts();
        
        console.log('[PromptsPanelApp] Initialization complete');
    }

    /**
     * Setup event listeners for prompt events
     */
    setupEventListeners() {
        // Listen for prompt updates
        this.on(EVENTS.PROMPT.UPDATED, (payload) => {
            console.log('[PromptsPanelApp] Prompt updated:', payload);
            this.refreshPrompts();
        });

        // Listen for prompt status changes
        this.on(EVENTS.PROMPT.STATUS_CHANGED, (payload) => {
            console.log('[PromptsPanelApp] Prompt status changed:', payload);
            this.refreshPrompts();
        });

        // Listen for prompt deletion
        this.on(EVENTS.PROMPT.DELETED, (payload) => {
            console.log('[PromptsPanelApp] Prompt deleted:', payload);
            this.refreshPrompts();
        });
    }

    /**
     * Load all prompts and render them
     */
    async loadPrompts() {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            console.error('[PromptsPanelApp] No prompts state service available');
            this.panel.renderPrompts({});
            return;
        }

        try {
            console.log('[PromptsPanelApp] Loading prompts...');
            
            // Get all prompts from state
            const prompts = this.core.stateService.prompts.getAllPrompts();
            
            console.log(`[PromptsPanelApp] Loaded ${Object.keys(prompts).length} prompts`);
            this.panel.renderPrompts(prompts);
            
        } catch (error) {
            console.error('[PromptsPanelApp] Failed to load prompts:', error);
            this.panel.renderPrompts({});
        }
    }

    /**
     * Refresh prompts list
     */
    async refreshPrompts() {
        console.log('[PromptsPanelApp] Refreshing prompts...');
        await this.loadPrompts();
    }

    /**
     * Edit an existing prompt
     * @param {string} promptId - The prompt ID to edit
     */
    async editPrompt(promptId) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            console.error('[PromptsPanelApp] No prompts state service available');
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
            console.error('[PromptsPanelApp] No prompts state service available');
            return;
        }

        try {
            console.log(`[PromptsPanelApp] Toggling prompt ${promptId}...`);
            
            this.core.stateService.prompts.togglePromptStatus(promptId);
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            console.log(`[PromptsPanelApp] Prompt ${promptId} toggled`);
            
            // Emit event for other components
            this.eventBus.emit(EVENTS.PROMPT.STATUS_CHANGED, { promptId });
            
        } catch (error) {
            console.error(`[PromptsPanelApp] Failed to toggle prompt ${promptId}:`, error);
        }
    }

    /**
     * Delete a prompt
     * @param {string} promptId - The prompt ID to delete
     */
    async deletePrompt(promptId) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            console.error('[PromptsPanelApp] No prompts state service available');
            return;
        }

        try {
            console.log(`[PromptsPanelApp] Deleting prompt ${promptId}...`);
            
            this.core.stateService.prompts.deletePrompt(promptId);
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            console.log(`[PromptsPanelApp] Prompt ${promptId} deleted`);
            
            // Emit event for other components
            this.eventBus.emit(EVENTS.PROMPT.DELETED, { promptId });
            
        } catch (error) {
            console.error(`[PromptsPanelApp] Failed to delete prompt ${promptId}:`, error);
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
            console.error('[PromptsPanelApp] No prompts state service available');
            return;
        }

        try {
            console.log(`[PromptsPanelApp] Saving prompt ${promptId}...`);
            
            // Validate prompt
            const validation = this.core.stateService.prompts.validatePrompt(promptData);
            if (!validation.isValid) {
                console.error('Prompt validation failed:', validation.errors);
                alert('Prompt validation failed:\n' + validation.errors.join('\n'));
                return;
            }
            
            // Set or update prompt
            this.core.stateService.prompts.setPrompt(promptId, promptData);
            
            // Save state
            await this.core.stateService.prompts.saveToStorage();
            
            console.log(`[PromptsPanelApp] Prompt ${promptId} saved`);
            
            // Close modal
            this.panel.closePromptModal();
            
            // Refresh the list
            await this.refreshPrompts();
            
        } catch (error) {
            console.error(`[PromptsPanelApp] Failed to save prompt ${promptId}:`, error);
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
                console.error('[PromptsPanelApp] Failed to import prompts:', error);
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
            console.error('[PromptsPanelApp] No prompts state service available');
            return {};
        }

        try {
            console.log(`[PromptsPanelApp] Searching prompts with query: "${query}"`);
            
            const results = this.core.stateService.prompts.searchPrompts(query);
            
            console.log(`[PromptsPanelApp] Found ${Object.keys(results).length} matching prompts`);
            return results;
            
        } catch (error) {
            console.error('[PromptsPanelApp] Failed to search prompts:', error);
            return {};
        }
    }

    /**
     * Export prompts to file
     * @param {string[]} promptIds - Array of prompt IDs to export (empty = all)
     */
    async exportPrompts(promptIds = []) {
        if (!this.core.stateService || !this.core.stateService.prompts) {
            console.error('[PromptsPanelApp] No prompts state service available');
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
            
            console.log(`[PromptsPanelApp] Exported ${Object.keys(exportData).length} prompts`);
            
        } catch (error) {
            console.error('[PromptsPanelApp] Failed to export prompts:', error);
            alert('Failed to export prompts. Please try again.');
        }
    }
}

// Kick off the application.
document.addEventListener('DOMContentLoaded', () => {
    const config = AppConfig.pageFactory('lite');
    
    const app = new PromptsPanelApp(config);
    app.initialize();
});