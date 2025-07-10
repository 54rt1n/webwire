import { initializeContext } from '../js/context/context-init.js';
import { OptionsPanel } from './panel.js';
import { createInitialState } from '../js/state/state-container.js';
import { EventBus } from '../js/core/event-bus.js';

/**
 * Options Page Script
 * 
 * Handles options page UI and interactions for configuring the extension.
 */
class OptionsApp {
    constructor() {
        this.panel = new OptionsPanel();
        this.eventBus = new EventBus();
        this.storage = null;
        this.stateService = null;
        this.dispatcher = null;
        this.initialState = createInitialState();
    }

    async initialize() {
        const { dispatcher, stateService, storage } = await initializeContext(this.eventBus);
        this.dispatcher = dispatcher;
        this.stateService = stateService;
        this.storage = storage;

        // Test background script connectivity
        await this.testBackgroundConnection();

        await this.loadSettings();
        this.setupEventListeners();
    }

    async testBackgroundConnection() {
        try {
            console.log('[OptionsApp] Testing background script connection...');
            
            const response = await chrome.runtime.sendMessage({
                action: 'PING',
                source: 'options-page-test',
                timestamp: Date.now()
            });
            
            console.log('[OptionsApp] Background script ping response:', response);
            
            if (response && response.success) {
                console.log('[OptionsApp] ✅ Background script is reachable');
            } else {
                console.warn('[OptionsApp] ⚠️ Background script responded but with error:', response);
            }
            
        } catch (error) {
            console.error('[OptionsApp] ❌ Cannot reach background script:', error);
            console.error('[OptionsApp] This means settings notifications will not work!');
        }
    }

    setupEventListeners() {
        this.panel.saveBtn.addEventListener('click', () => {
            console.log('[OptionsApp] 🔘 Save button clicked!');
            this.saveAllSettings();
        });

        // Add real-time validation for required fields
        this.setupRealtimeValidation();
    }

    /**
     * Setup real-time validation for better UX
     */
    setupRealtimeValidation() {
        const requiredFields = [
            'chatModel',
            'chatProvider', 
            'featherlessApiKey',
            'openaiApiKey',
            'googleApiKey',
            'anthropicApiKey',
            'groqApiKey',
            'metaApiKey',
            'aimindApiKey',
            'openrouterApiKey'
        ];

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => {
                    // Clear highlight when user starts typing
                    if (field.style.border) {
                        field.style.border = '';
                        field.style.backgroundColor = '';
                    }
                });

                field.addEventListener('blur', () => {
                    // Show validation on field blur
                    this.validateSingleField(field);
                });
            }
        });
    }

    /**
     * Validate a single field
     */
    validateSingleField(field) {
        const value = field.value.trim();
        const isRequired = this.isFieldRequired(field.id);
        
        if (isRequired && !value) {
            field.style.border = '2px solid #ef4444';
            field.style.backgroundColor = '#fef2f2';
            
            // Show field-specific tooltip
            this.showFieldTooltip(field, `${this.getFieldLabel(field.id)} is required`);
        } else {
            field.style.border = '';
            field.style.backgroundColor = '';
        }
    }

    /**
     * Check if a field is required based on current settings
     */
    isFieldRequired(fieldId) {
        if (fieldId === 'chatModel' || fieldId === 'chatProvider') {
            return true;
        }

        // API key is required if provider is selected
        const providerSelect = document.getElementById('chatProvider');
        const selectedProvider = providerSelect?.value;
        
        if (selectedProvider && fieldId === `${selectedProvider}ApiKey`) {
            return true;
        }

        return false;
    }

    /**
     * Get user-friendly field label
     */
    getFieldLabel(fieldId) {
        const labels = {
            'chatModel': 'Chat Model Name',
            'chatProvider': 'Chat Provider',
            'featherlessApiKey': 'Featherless API Key',
            'openaiApiKey': 'OpenAI API Key',
            'googleApiKey': 'Google API Key',
            'anthropicApiKey': 'Anthropic API Key',
            'groqApiKey': 'Groq API Key',
            'metaApiKey': 'Meta API Key',
            'aimindApiKey': 'AIMind API Key',
            'openrouterApiKey': 'OpenRouter API Key'
        };
        return labels[fieldId] || fieldId;
    }

    /**
     * Show field-specific tooltip
     */
    showFieldTooltip(field, message) {
        // Remove existing tooltip
        const existingTooltip = document.querySelector('.field-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'field-tooltip';
        tooltip.textContent = message;
        tooltip.style.cssText = `
            position: absolute;
            background: #ef4444;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            max-width: 200px;
            margin-top: 4px;
        `;

        // Position tooltip
        const rect = field.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + window.scrollY) + 'px';

        document.body.appendChild(tooltip);

        // Remove tooltip after 3 seconds
        setTimeout(() => {
            tooltip.remove();
        }, 3000);
    }

    /**
     * Load settings from storage and render the UI
     */
    async loadSettings() {
        try {
            const settings = await this.stateService.settings.loadSettings();
            // If no settings, use the default initial state structure
            const hydratedSettings = this.hydrateSettings(settings);
            this.panel.setAllSettings(hydratedSettings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.panel.showStatus('Error loading settings: ' + error.message, true);
        }
    }

    /**
     * Ensures the loaded settings object has the same structure as the initial state,
     * preventing errors from missing keys if the structure changed.
     */
    hydrateSettings(loadedSettings) {
        // Deep merge of loadedSettings onto initialState.
        // A simple structuredClone and Object.assign won't work for deep objects.
        const hydrated = JSON.parse(JSON.stringify(this.initialState.settings));

        if (!loadedSettings) return hydrated;

        for (const key in hydrated) {
            if (loadedSettings[key]) {
                Object.assign(hydrated[key], loadedSettings[key]);
            }
        }
        
        // Deep merge for nested providers and models
        if (loadedSettings.ai?.providers) {
            for (const provider in hydrated.ai.providers) {
                if (loadedSettings.ai.providers[provider]) {
                    Object.assign(hydrated.ai.providers[provider], loadedSettings.ai.providers[provider]);
                }
            }
        }

        if (loadedSettings.ai?.models) {
             for (const modelType in hydrated.ai.models) {
                if (loadedSettings.ai.models[modelType]) {
                    if (typeof hydrated.ai.models[modelType] !== 'object' || hydrated.ai.models[modelType] === null) {
                        hydrated.ai.models[modelType] = {};
                    }
                    Object.assign(hydrated.ai.models[modelType], loadedSettings.ai.models[modelType]);
                }
            }
        }

        return hydrated;
    }

    /**
     * Validate settings and return detailed validation result
     */
    validateSettings(settings) {
        const errors = [];
        const missingFields = [];

        // Check for required Chat Model fields
        if (!settings.ai?.models?.chat?.model || settings.ai.models.chat.model.trim() === '') {
            errors.push('Chat Model Name is required');
            missingFields.push('chatModel');
        }

        if (!settings.ai?.models?.chat?.provider || settings.ai.models.chat.provider.trim() === '') {
            errors.push('Chat Provider is required');
            missingFields.push('chatProvider');
        }

        // Check if provider has required API key
        if (settings.ai?.models?.chat?.provider) {
            const provider = settings.ai.models.chat.provider;
            const providerConfig = settings.ai?.providers?.[provider];
            
            if (!providerConfig?.apiKey || providerConfig.apiKey.trim() === '') {
                errors.push(`${provider} API Key is required`);
                missingFields.push(`${provider}ApiKey`);
            }
        }

        const isValid = errors.length === 0;
        const message = isValid ? 'Validation passed' : `Please fix the following: ${errors.join(', ')}`;

        return {
            isValid,
            errors,
            missingFields,
            message
        };
    }

    /**
     * Highlight missing fields visually
     */
    highlightMissingFields(fieldIds) {
        // Clear previous highlights
        this.clearFieldHighlights();

        // Highlight missing fields
        fieldIds.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.style.border = '2px solid #ef4444';
                field.style.backgroundColor = '#fef2f2';
                
                // Scroll to first missing field
                if (fieldIds.indexOf(fieldId) === 0) {
                    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    field.focus();
                }
            }
        });

        // Auto-clear highlights after 5 seconds
        setTimeout(() => {
            this.clearFieldHighlights();
        }, 5000);
    }

    /**
     * Clear field validation highlights
     */
    clearFieldHighlights() {
        const allInputs = document.querySelectorAll('input, select, textarea');
        allInputs.forEach(input => {
            input.style.border = '';
            input.style.backgroundColor = '';
        });
    }
    
    /**
     * Save all settings to storage
     */
    async saveAllSettings() {
        console.log('[OptionsApp] ===== SAVE ALL SETTINGS STARTED =====');
        
        try {
            const settings = this.panel.getAllSettings();
            console.log('[OptionsApp] 1. Settings from panel:', settings);
            
            // Enhanced validation with visual feedback
            const validationResult = this.validateSettings(settings);
            if (!validationResult.isValid) {
                console.log('[OptionsApp] ❌ Validation failed:', validationResult.errors);
                this.highlightMissingFields(validationResult.missingFields);
                this.panel.showStatus(validationResult.message, true);
                return;
            }

            console.log('[OptionsApp] 2. Validation passed, saving to state service...');
            await this.stateService.settings.setSettings(settings);
            console.log('[OptionsApp] 3. Settings set in state service');
            
            await this.stateService.settings.saveSettings();
            console.log('[OptionsApp] 4. Settings saved to storage');
            
            console.log('[OptionsApp] 5. About to notify background script...');

            // Notify background script that settings have been updated
            console.log('[OptionsApp] About to notify background script...');
            console.log('[OptionsApp] Chrome runtime available:', !!chrome?.runtime);
            console.log('[OptionsApp] Extension context ID:', chrome?.runtime?.id);
            
            // Always attempt to notify, regardless of connectivity test results
            const message = {
                action: 'SETTINGS_UPDATED',
                settings: settings,
                timestamp: Date.now(),
                source: 'options-page'
            };
            
            console.log('[OptionsApp] Sending SETTINGS_UPDATED message to background:', message);
            
            try {
                const response = await chrome.runtime.sendMessage(message);
                
                console.log('[OptionsApp] ✅ Response from background script:', response);
                
                if (response && response.success) {
                    console.log('[OptionsApp] ✅ Background script successfully processed settings update');
                } else {
                    console.warn('[OptionsApp] ⚠️ Background script returned error or unexpected response:', response);
                }
                
            } catch (error) {
                console.error('[OptionsApp] ❌ Failed to notify background script:', error);
                console.error('[OptionsApp] Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
                
                // This is not critical, the storage listener should still catch the change
                console.log('[OptionsApp] 📡 Relying on storage listener fallback...');
                
                // If direct messaging fails, manually trigger a storage change event
                // by writing a special trigger key that the background can detect
                try {
                    console.log('[OptionsApp] 🔄 Triggering storage change fallback...');
                    await chrome.storage.local.set({
                        'webwire-settings-trigger': {
                            timestamp: Date.now(),
                            source: 'options-fallback'
                        }
                    });
                    console.log('[OptionsApp] ✅ Storage trigger set successfully');
                } catch (storageError) {
                    console.error('[OptionsApp] ❌ Even storage fallback failed:', storageError);
                }
            }

            console.log('[OptionsApp] 6. All steps completed successfully');
            this.panel.showStatus('All settings saved successfully');
            console.log('[OptionsApp] ===== SAVE ALL SETTINGS COMPLETED =====');

        } catch (error) {
            console.error('[OptionsApp] ❌ Error in saveAllSettings:', error);
            console.error('[OptionsApp] Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.panel.showStatus(`Error saving settings: ${error.message}`, true);
            console.log('[OptionsApp] ===== SAVE ALL SETTINGS FAILED =====');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new OptionsApp();
    app.initialize();
});