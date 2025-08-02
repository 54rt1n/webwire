import { EVENTS } from '../../core/events.js';
import { logger } from '../../core/logging.js';
import { encryptWithSalt, decryptWithSalt, ENCRYPTION_METHODS } from '../../utils/encryption-util.js';
import { generateEncryptionKey } from '../../utils/id-generator.js';
import { deepClone } from '../../utils/deep-merge.js';

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

        const { data, method } = value;

        // take the encrypted object and return our decrypted value
        const salt = this.config.get('security.salt');
        const password = this.stateService.state.settings.security.encryptionKey;

        const decrypted = await decryptWithSalt(data, salt, password, { method });
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

        // Preserve the security section which contains the encryption key
        const currentSecurity = this.stateService.state.settings?.security;
        
        // Merge the new settings with the existing state, preserving security
        this.stateService.state.settings = {
            ...settings,
            security: currentSecurity || {}
        };
        
        logger.debug('StateService::SettingsState', 'Settings set:', this.stateService.state.settings);
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
            
            // Check if encryption key is missing and generate one if needed
            if (!mergedSettings.security || !mergedSettings.security.encryptionKey) {
                logger.log('StateService::SettingsState', 'Missing encryption key, generating new one');
                if (!mergedSettings.security) {
                    mergedSettings.security = {};
                }
                mergedSettings.security.encryptionKey = generateEncryptionKey();
                // Save the new key immediately
                this.stateService.state.settings = mergedSettings;
                await this.saveToStorage();
            }
            
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
        return deepClone(this.stateService.state.settings);
    }


    /**
     * Get settings
     * @returns {Object}
     */
    async getSettingsAsync( { decrypt = false } = {} ) {
        const settings = deepClone(this.stateService.state.settings);
        if (decrypt) {
            for (const provider of Object.values(settings?.ai?.providers)) {
                if (provider.apiKey) {
                    provider.apiKey = await this._decryptKey(provider.apiKey);
                }
            }
        } else {}
        return settings;
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
     * Get provider config
     */
    async getProviderConfig(providerName) {
        const provider = this.stateService.state.settings?.ai?.providers[providerName];
        if (!provider) {
            logger.warn('StateService::SettingsState', 'No provider configuration found for model:', providerName);
            return null;
        }
        const { apiKey } = provider;

        logger.log('StateService::SettingsState', 'Provider config for', providerName, ':', provider);

        // Decrypt the encrypted key
        try {
            return await this._decryptKey(apiKey);
        } catch (error) {
            logger.error('StateService::SettingsState', 'Failed to decrypt API key:', error, 'provider:', provider);
            return null;
        }
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

        const apiKey = await this.getProviderConfig(model.provider);
        
        const config = {...model, apiKey};
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
        // API key can be either a string (plaintext) or an object (encrypted)
        const hasApiKey = provider.apiKey && (
            typeof provider.apiKey === 'string' || 
            (typeof provider.apiKey === 'object' && provider.apiKey.data)
        );
        
        if (chatModel.provider !== 'aimind' && !hasApiKey) {
            return false;
        }
        
        // For AIMind, check for both endpoint and key
        if (chatModel.provider === 'aimind' && (!provider.apiEndpoint || !hasApiKey)) {
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

    /**
     * Validate API key encryption status for a provider
     * @param {string} providerName - The provider name
     * @returns {Promise<'valid'|'missing'|'invalid'>} The encryption status
     */
    async validateApiKeyEncryption(providerName) {
        try {
            const provider = this.stateService.state.settings?.ai?.providers[providerName];
            if (!provider || !provider.apiKey) {
                return 'missing';
            }

            // Try to decrypt the key
            const decryptedKey = await this.getProviderConfig(providerName);
            if (decryptedKey) {
                return 'valid';
            } else {
                return 'invalid';
            }
        } catch (error) {
            logger.error('StateService::SettingsState', 'Failed to validate API key encryption:', error);
            return 'invalid';
        }
    }

    /**
     * Get encryption status for all providers
     * @returns {Promise<Object>} Map of provider name to status
     */
    async getAllProvidersEncryptionStatus() {
        const providers = this.stateService.state.settings?.ai?.providers || {};
        const status = {};
        
        for (const providerName of Object.keys(providers)) {
            status[providerName] = await this.validateApiKeyEncryption(providerName);
        }
        
        return status;
    }
} 