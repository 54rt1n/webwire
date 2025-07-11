import { EVENTS } from '../../core/events.js';

/**
 * Plugin for handling UI state
 */
export class UiStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.uiAdapter = stateService.storage.ui;
    }

    /**
     * Set UI state
     * @param {Object} uiState 
     */
    setUiState(uiState) {
        this.stateService.state.ui = uiState;
        console.log('[StateService::UiState] UI state set:', uiState);
    }

    /**
     * Read UI state and set them in the state
     */
    async loadFromStorage() {
        const uiState = await this.uiAdapter.getAll();
        this.stateService.state.ui = uiState;
        console.log('[StateService::UiState] UI state read:', uiState);
        return uiState;
    }

    /**
     * Save UI state
     */
    async saveToStorage() {
        await this.uiAdapter.setAll(this.stateService.state.ui);
    }

    /**
     * Get UI state
     * @returns {Object}
     */
    getUiState() {
        return this.stateService.state.ui;
    }

    /**
     * Set auto-inject settings
     * @param {boolean} autoInject 
     */
    setAutoInject(autoInject) {
        this.stateService.state.settings.ui.autoInject = autoInject;
    }

    /**
     * Get auto-inject settings
     */
    getAutoInject() {
        return this.stateService.state.settings.ui.autoInject;
    }

    /**
     * Get include page content setting
     */
    getIncludePageContent() {
        return this.stateService.state.settings.ui.includePageContent;
    }

    /**
     * Set include page content setting
     */
    setIncludePageContent(includePageContent) {
        this.stateService.state.settings.ui.includePageContent = includePageContent;
    }
} 