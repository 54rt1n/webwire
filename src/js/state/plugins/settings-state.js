import { EVENTS } from '../../core/events.js';
import { logger } from '../../core/logging.js';
import { encryptWithSalt, decryptWithSalt, ENCRYPTION_METHODS } from '../../utils/encryption-util.js';

/**
 * Plugin for handling settings state
 */
export class SettingsStatePlugin {
    constructor(stateService, config = null) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.settingsAdapter = stateService.storage?.settings;
        this.config = config;
    }

    async _encryptKey(value) {
        // If the value is already an object, return it (already encrypted)
        if (typeof value === 'object') {
            return value;
        }

        // take the key and return our encrypted value
        const salt = this.config?.get('security.salt');
        const password = this.stateService.state.settings.security.encryptionKey;

        const encrypted = await encryptWithSalt(value, salt, password, { method: ENCRYPTION_METHODS.AES_GCM });
        return {
            method: ENCRYPTION_METHODS.AES_GCM,
            data: encrypted
        };
    }

    async _decryptKey(value) {
        // If the value is already a string, return it (plaintext)
        if (typeof value === 'string') {
            return value;
        }

        // take the encrypted object and return our decrypted value
        const salt = this.config?.get('security.salt');
        const password = this.stateService.state.settings.security.encryptionKey;

        const decrypted = await decryptWithSalt(value.data, salt, password, { method: value.method });
        return decrypted;
    }

    /**
     * Set settings
     * @param {Object} settings 
     */
    async setSettings(settings, { autoEncrypt = false } = {}) {
        // Check our ai.provider.apiKey entries and apply our encryption
        if (autoEncrypt) {
            for (const provider of Object.values(settings.ai.providers)) {
                if (provider.apiKey) {
                    provider.apiKey = await this._encryptKey(provider.apiKey);
                }
            }
        }

        this.stateService.state.settings = settings;
        logger.debug('StateService::SettingsState', 'Settings set:', settings);
    }

    /**
     * Read settings and set them in the state
     */
    async loadFromStorage() {
        try {
            if (!this.settingsAdapter) {
                logger.log('StateService::SettingsState', 'No settings adapter found');
                return {};
            }

            logger.log('StateService::SettingsState', 'Loading settings from adapter...');
            logger.log('StateService::SettingsState', 'Settings adapter:', this.settingsAdapter);
            
            const settings = await this.settingsAdapter.getAll();
            logger.log('StateService::SettingsState', 'Raw settings from adapter:', settings);
            
            // If settings is null or undefined, keep the existing settings structure
            if (!settings) {
                logger.log('StateService::SettingsState', 'No settings found, keeping initial state');
                return this.stateService.state.settings;
            }
            
            // Deep merge loaded settings with existing settings to preserve structure
            const mergedSettings = this.deepMerge(this.stateService.state.settings || {}, settings);
            
            this.stateService.state.settings = mergedSettings;
            logger.log('StateService::SettingsState', 'Settings loaded and merged with initial state:', mergedSettings);
            logger.log('StateService::SettingsState', 'Final state.settings:', this.stateService.state.settings);
            
            return mergedSettings;
        } catch (error) {
            logger.error('StateService::SettingsState', 'Error loading settings:', error);
            
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
                logger.log('StateService::SettingsState', 'No settings adapter found');
                return;
            }

            logger.log('StateService::SettingsState', 'Saving settings to adapter...');
            logger.log('StateService::SettingsState', 'Settings to save:', this.stateService.state.settings);
            logger.log('StateService::SettingsState', 'Settings adapter:', this.settingsAdapter);
            
            await this.settingsAdapter.setAll(this.stateService.state.settings);
            logger.log('StateService::SettingsState', 'Settings saved successfully');
            
            // Verify the save by immediately reading back
            const verifySettings = await this.settingsAdapter.getAll();
            logger.log('StateService::SettingsState', 'Verification read after save:', verifySettings);
            
        } catch (error) {
            logger.error('StateService::SettingsState', 'Error saving settings:', error);
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
        logger.log('StateService::SettingsState', 'Patching settings:', settingsPatch);
        
        // Deep merge the patch into existing settings
        this.stateService.state.settings = this.deepMerge(this.stateService.state.settings || {}, settingsPatch);
        
        logger.log('StateService::SettingsState', 'Settings after patch:', this.stateService.state.settings);
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
    async getModelConfig(type = null) {
        if (type === null) 
            type = 'chat';

        logger.log('StateService::SettingsState', 'Getting model config for type:', type);
        logger.log('StateService::SettingsState', 'Available models:', this.stateService.state.settings?.ai?.models);

        // If the type is not in the model config, return set the type to chat
        if (!this.stateService.state.settings?.ai?.models[type]) {
            logger.log('StateService::SettingsState', 'Type not found, defaulting to chat');
            type = 'chat';
        }

        const model = this.stateService.state.settings?.ai?.models[type];
        if (!model || !model.provider) {
            logger.warn('StateService::SettingsState', 'No model configuration found for type:', type, 'model:', model);
            return null;
        }

        logger.log('StateService::SettingsState', 'Model for type', type, ':', model);
        
        const provider = this.stateService.state.settings?.ai?.providers[model.provider];
        if (!provider) {
            logger.warn('StateService::SettingsState', 'No provider configuration found for model:', model);
            return null;
        }

        logger.log('StateService::SettingsState', 'Provider config for', model.provider, ':', provider);

        // Decrypt the encrypted key
        try {
            provider.apiKey = await this._decryptKey(provider.apiKey);
        } catch (error) {
            logger.error('StateService::SettingsState', 'Failed to decrypt API key:', error);
            provider.apiKey = '';
        }
        
        const config = {...model, ...provider};
        logger.log('StateService::SettingsState', 'Final model config:', config);
        return config;
    }

    async getCurrentModelConfig() {
        const model = this.stateService.ui.getSelectedModel() || 'chat';
        const modelConfig = await this.getModelConfig(model);
        logger.log('StateService::SettingsState', 'Current model config:', modelConfig);
        return modelConfig;
    }

    /**
     * Validate if settings are properly configured
     * @returns {boolean} True if settings are valid for basic operation
     */
    isValid() {
        const settings = this.stateService.state.settings;
        
        // Check if settings exist
        if (!settings) {
            return false;
        }
        
        // Check if AI configuration exists
        if (!settings.ai || !settings.ai.models || !settings.ai.providers) {
            return false;
        }
        
        // Check if chat model is configured
        const chatModel = settings.ai.models.chat;
        if (!chatModel || !chatModel.provider || !chatModel.model) {
            return false;
        }
        
        // Check if the provider for the chat model has required configuration
        const provider = settings.ai.providers[chatModel.provider];
        if (!provider) {
            return false;
        }
        
        // Check for API key if required by provider
        if (chatModel.provider !== 'aimind' && !provider.apiKey) {
            return false;
        }
        
        // For AIMind, check for both endpoint and key
        if (chatModel.provider === 'aimind' && (!provider.apiEndpoint || !provider.apiKey)) {
            return false;
        }
        
        return true;
    }

    /**
     * Get crash reporting enabled
     * @returns {boolean}
     */
    getCrashReportingEnabled() {
        return this.stateService.state.settings.reporting.crashReportingEnabled;
    }

    /**
     * Set crash reporting enabled
     * @param {boolean} enabled
     */
    setCrashReportingEnabled(enabled) {
        this.stateService.state.settings.reporting.crashReportingEnabled = enabled;
    }
} 