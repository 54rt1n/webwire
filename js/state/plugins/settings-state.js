import { EVENTS } from '../../constants/events.js';

/**
 * Plugin for handling settings state
 */
export class SettingsStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.settingsAdapter = stateService.storage.settings;
    }

    /**
     * Set settings
     * @param {Object} settings 
     */
    setSettings(settings) {
        this.stateService.state.settings = settings;
        console.log('[StateService::SettingsState] Settings set:', settings);
    }

    /**
     * Read settings and set them in the state
     */
    async loadSettings() {
        const settings = await this.settingsAdapter.getAll();
        this.stateService.state.settings = settings;
        console.log('[StateService::SettingsState] Settings read:', settings);
        return settings;
    }

    /**
     * Save settings
     */
    async saveSettings() {
        await this.settingsAdapter.setAll(this.stateService.state.settings);
    }

    /**
     * Get settings
     * @returns {Object}
     */
    getSettings() {
        return this.stateService.state.settings;
    }

    /**
     * Get model config
     */
    getModelConfig(type = null) {
        if (type === null) 
            type = 'chat';

        // If the type is not in the model config, return set the type to chat
        if (!this.stateService.state.settings.ai.models[type]) {
            type = 'chat';
        }

        const model = this.stateService.state.settings.ai.models[type];
        const provider = this.stateService.state.settings.ai.providers[model.provider];
        const config = {...model, ...provider};
        console.log('[StateService::SettingsState] Model config:', config);
        return config;
    }

} 