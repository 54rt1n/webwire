import { createInitialUiState } from '../state-container.js';

/**
 * Plugin for handling UI state. This is a blend of methods operating on the:
 * - state.ui (idempotent, used on the client side)
 * - state.tabs[tabId] (tab state, persisted on the server to maintain the state through navigation)
 * - state.settings.ui (global settings, configured in the settings panel)
 */
export class UiStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
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
     * Set tabId
     */
    setTabId(tabId) {
        this.stateService.state.ui.tabId = tabId;
    }

    /**
     * Get tabId
     */
    getTabId() {
        return this.stateService.state.ui.tabId;
    }

    _currentTab() {
        const tabId = this.getTabId();
        if (!tabId) return null;
        if (!this.stateService.state.tabs[tabId]) return null;
        return this.stateService.state.tabs[tabId];
    }

    /**
     * Get include page content setting
     */
    getIncludePageContent() {
        const tab = this._currentTab();
        if (!tab) return false;
        return tab.includePageContent;
    }

    /**
     * Set include page content setting
     */
    setIncludePageContent(includePageContent) {
        const tab = this._currentTab();
        if (!tab) return;
        tab.includePageContent = includePageContent;
    }

    /**
     * Get use MCP setting
     */
    getUseMCP() {
        const tab = this._currentTab();
        if (!tab) return false;
        return tab.useMCP;
    }

    /**
     * Set use MCP setting
     */
    setUseMCP(useMCP) {
        const tab = this._currentTab();
        if (!tab) return;
        tab.useMCP = useMCP;
    }

    /**
     * Get use browser tools setting
     */
    getUseBrowserTools() {
        const tab = this._currentTab();
        if (!tab) return false;
        return tab.useBrowserTools;
    }

    /**
     * Set use browser tools setting
     */
    setUseBrowserTools(useBrowserTools) {
        const tab = this._currentTab();
        if (!tab) return;
        tab.useBrowserTools = useBrowserTools;
    }

    /**
     * Get auto execute tools setting
     */
    getAutoExecuteTools() {
        const tab = this._currentTab();
        if (!tab) return false;
        return tab.autoExecuteTools;
    }

    /**
     * Set auto execute tools setting
     */
    setAutoExecuteTools(autoExecuteTools) {
        const tab = this._currentTab();
        if (!tab) return;
        tab.autoExecuteTools = autoExecuteTools;
    }

    /**
     * Get selected model setting
     */
    getSelectedModel() {
        const tab = this._currentTab();
        if (!tab) return false;
        return tab.selectedModel;
    }

    /**
     * Set selected model setting
     */
    setSelectedModel(selectedModel) {
        const tab = this._currentTab();
        if (!tab) return;
        tab.selectedModel = selectedModel;
    }

    /**
     * Track default setting
     */
    getTrackDefault() {
        const tab = this._currentTab();
        if (!tab) return false;
        return tab.trackDefault;
    }
    
    /**
     * Set track default setting
     */
    setTrackDefault(trackDefault) {
        const tab = this._currentTab();
        if (!tab) return;
        tab.trackDefault = trackDefault;
    }
} 