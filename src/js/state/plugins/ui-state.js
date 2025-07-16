import { createInitialUiState } from '../state-container.js';

/**
 * Plugin for handling UI state
 */
export class UiStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.uiAdapter = stateService.storage?.ui;
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
        if (!this.uiAdapter) {
            console.log('[StateService::UiState] No UI adapter found');
            return createInitialUiState();
        }

        let uiState = await this.uiAdapter.getAll();
        if (!uiState) {
            console.log('[StateService::UiState] No UI state found');
            uiState = createInitialUiState();
        }
        this.stateService.state.ui = uiState;
        console.log('[StateService::UiState] UI state read:', uiState);
        return uiState;
    }

    /**
     * Save UI state
     */
    async saveToStorage() {
        if (!this.uiAdapter) {
            console.log('[StateService::UiState] No UI adapter found');
            return;
        }

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

    /**
     * Get use MCP setting
     */
    getUseMCP() {
        return this.stateService.state.settings.ui.useMCP;
    }

    /**
     * Set use MCP setting
     */
    setUseMCP(useMCP) {
        this.stateService.state.settings.ui.useMCP = useMCP;
    }

    /**
     * Get use browser tools setting
     */
    getUseBrowserTools() {
        return this.stateService.state.settings.ui.useBrowserTools;
    }

    /**
     * Set use browser tools setting
     */
    setUseBrowserTools(useBrowserTools) {
        this.stateService.state.settings.ui.useBrowserTools = useBrowserTools;
    }

    /**
     * Get auto execute tools setting
     */
    getAutoExecuteTools() {
        return this.stateService.state.settings.ui.autoExecuteTools;
    }

    /**
     * Set auto execute tools setting
     */
    setAutoExecuteTools(autoExecuteTools) {
        this.stateService.state.settings.ui.autoExecuteTools = autoExecuteTools;
    }
} 