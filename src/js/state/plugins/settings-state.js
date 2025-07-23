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
            
            // If settings is null or undefined, keep the existing settings structure
            if (!settings) {
                console.log('[StateService::SettingsState] No settings found, keeping initial state');
                return this.stateService.state.settings;
            }
            
            // Deep merge loaded settings with existing settings to preserve structure
            const mergedSettings = this.deepMerge(this.stateService.state.settings || {}, settings);
            
            this.stateService.state.settings = mergedSettings;
            console.log('[StateService::SettingsState] Settings loaded and merged with initial state:', mergedSettings);
            console.log('[StateService::SettingsState] Final state.settings:', this.stateService.state.settings);
            
            return mergedSettings;
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
     * Patch settings - merge new settings into existing settings
     * @param {Object} settingsPatch - Partial settings object to merge
     */
    patchSettings(settingsPatch) {
        console.log('[StateService::SettingsState] Patching settings:', settingsPatch);
        
        // Deep merge the patch into existing settings
        this.stateService.state.settings = this.deepMerge(this.stateService.state.settings || {}, settingsPatch);
        
        console.log('[StateService::SettingsState] Settings after patch:', this.stateService.state.settings);
    }

    /**
     * Deep merge helper function
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Get model config
     */
    getModelConfig(type = null) {
        if (type === null) 
            type = 'chat';

        console.log('[StateService::SettingsState] Getting model config for type:', type);
        console.log('[StateService::SettingsState] Available models:', this.stateService.state.settings?.ai?.models);

        // If the type is not in the model config, return set the type to chat
        if (!this.stateService.state.settings?.ai?.models[type]) {
            console.log('[StateService::SettingsState] Type not found, defaulting to chat');
            type = 'chat';
        }

        const model = this.stateService.state.settings?.ai?.models[type];
        console.log('[StateService::SettingsState] Model for type', type, ':', model);
        
        if (!model || !model.provider) {
            console.warn('[StateService::SettingsState] No model configuration found for type:', type, 'model:', model);
            return null;
        }
        
        const provider = this.stateService.state.settings?.ai?.providers[model.provider];
        console.log('[StateService::SettingsState] Provider config for', model.provider, ':', provider);
        
        const config = {...model, ...provider};
        console.log('[StateService::SettingsState] Final model config:', config);
        return config;
    }

    getCurrentModelConfig() {
        const model = this.stateService.state.settings?.ui?.selectedModel || 'chat';
        const modelConfig = this.getModelConfig(model);
        console.log('[StateService::SettingsState] Current model config:', modelConfig);
        return modelConfig;
    }
} 