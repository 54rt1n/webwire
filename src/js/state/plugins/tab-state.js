import { createInitialUiState } from '../state-container.js';

/**
 * Plugin for handling tab state
 */
export class TabStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.tabAdapter = stateService.storage?.tab;
    }

    /**
     * Set tab state
     * @param {string} tabId 
     * @param {Object} tabState 
     */
    setTabState(tabId, tabState, { setDefault = false } = {}) {
        if (setDefault) {
            this.stateService.state.tabs[tabId] = this.stateService.state.tabs.default;
        } else {
            this.stateService.state.tabs[tabId] = tabState;
        }
        console.log('[StateService::TabState] Tab state set:', tabId, tabState);
    }

    /**
     * Read tab state and set them in the state
     */
    async loadFromStorage() {
        if (!this.tabAdapter) {
            console.log('[StateService::TabState] No tab adapter found');
            return createInitialTabState();
        }

        let tabState = await this.tabAdapter.getAll();
        if (!tabState) {
            console.log('[StateService::TabState] No tab state found');
            tabState = createInitialTabState();
        }
        this.stateService.state.tab = tabState;
        console.log('[StateService::TabState] Tab state read:', tabState);
        return tabState;
    }

    /**
     * Save tab state
     */
    async saveToStorage() {
        if (!this.tabAdapter) {
            console.log('[StateService::TabState] No tab adapter found');
            return;
        }

        await this.tabAdapter.setAll(this.stateService.state.tabs);
    }

    /**
     * Get tab state
     * @returns {Object}
     */
    getTabState(tabId) {
        return this.stateService.state.tabs[tabId];
    }
} 