import { EVENTS } from '../../core/events.js';

/**
 * Plugin for handling settings state
 */
export class SettingsStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.settingsAdapter = stateService.storage?.settings;
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
    async loadFromStorage() {
        try {
            if (!this.settingsAdapter) {
                console.log('[StateService::SettingsState] No settings adapter found');
                return {};
            }

            console.log('[StateService::SettingsState] Loading settings from adapter...');
            console.log('[StateService::SettingsState] Settings adapter:', this.settingsAdapter);
            
            const settings = await this.settingsAdapter.getAll();
            console.log('[StateService::SettingsState] Raw settings from adapter:', settings);
            
            // If settings is null or undefined, initialize with empty object
            const validSettings = settings || {};
            
            this.stateService.state.settings = validSettings;
            console.log('[StateService::SettingsState] Settings loaded and set in state:', validSettings);
            console.log('[StateService::SettingsState] Final state.settings:', this.stateService.state.settings);
            
            return validSettings;
        } catch (error) {
            console.error('[StateService::SettingsState] Error loading settings:', error);
            
            // Initialize with empty settings on error
            this.stateService.state.settings = {};
            return {};
        }
    }

    /**
     * Save settings
     */
    async saveToStorage() {
        try {
            if (!this.settingsAdapter) {
                console.log('[StateService::SettingsState] No settings adapter found');
                return;
            }

            console.log('[StateService::SettingsState] Saving settings to adapter...');
            console.log('[StateService::SettingsState] Settings to save:', this.stateService.state.settings);
            console.log('[StateService::SettingsState] Settings adapter:', this.settingsAdapter);
            
            await this.settingsAdapter.setAll(this.stateService.state.settings);
            console.log('[StateService::SettingsState] Settings saved successfully');
            
            // Verify the save by immediately reading back
            const verifySettings = await this.settingsAdapter.getAll();
            console.log('[StateService::SettingsState] Verification read after save:', verifySettings);
            
        } catch (error) {
            console.error('[StateService::SettingsState] Error saving settings:', error);
            throw error;
        }
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
        if (!this.stateService.state.settings?.ai?.models[type]) {
            type = 'chat';
        }

        const model = this.stateService.state.settings?.ai?.models[type];
        const provider = this.stateService.state.settings?.ai?.providers[model.provider];
        const config = {...model, ...provider};
        console.log('[StateService::SettingsState] Model config:', config);
        return config;
    }

} 