import { BaseSimpleApp } from '../core/base-simple-app.js';
import { OptionsPanel } from './panel.js';
import { createInitialState, createInitialSettingsState } from '../js/state/state-container.js';
import { deepMerge } from '../js/utils/deep-merge.js';
import { AppConfig } from '../js/core/app-config.js';
import { logger } from '../js/core/logging.js';

/**
 * Options Page Script
 * 
 * Handles options page UI and interactions for configuring the extension.
 */
class OptionsApp extends BaseSimpleApp {
    constructor(config) {
        super(config, 'options');
        this.initialState = createInitialState();
    }

    // --- HOOK METHODS: Implementation for BaseSimpleApp ---

    _getPanelComponent() {
        return OptionsPanel;
    }

    _initializeDependencies() {
        // Options panel doesn't need additional dependencies
    }

    _wireUpDependencies() {
        // No additional wiring needed for options
    }

    _getUIHandlers() {
        return {
            // Options panel handles its own events via direct DOM listeners
        };
    }

    async _loadData() {
        await this.loadSettings();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.panel.elements.saveBtn.addEventListener('click', () => {
            logger.log('OptionsApp', '🔘 Save button clicked!');
            this.saveAllSettings();
        });

        // Add real-time validation for required fields
        this.setupRealtimeValidation();
    }

    /**
     * Setup real-time validation for better UX
     */
    setupRealtimeValidation() {
        // Get all fields with validation attributes
        const fieldsWithValidation = document.querySelectorAll('[data-validate], [data-depends-on]');

        fieldsWithValidation.forEach(field => {
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
        });
    }

    /**
     * Validate a single field
     */
    validateSingleField(field) {
        const value = field.value.trim();
        const isRequired = this.isFieldRequired(field);
        const hasEncryptedValue = field.dataset.encryptedValue ? true : false;
        
        // Field is invalid only if required AND empty AND no encrypted value
        if (isRequired && !value && !hasEncryptedValue) {
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
     * Check if a field is required based on data attributes and current settings
     */
    isFieldRequired(field) {
        // Check for data-validate="required" attribute
        if (field.dataset.validate === 'required') {
            return true;
        }

        // Check for conditional requirements (data-depends-on)
        if (field.dataset.dependsOn) {
            const dependsOn = field.dataset.dependsOn;
            const provider = field.dataset.provider;
            
            if (dependsOn === 'chatProvider' && provider) {
                const providerSelect = document.getElementById('chatProvider');
                const selectedProvider = providerSelect?.value;
                
                // API key is required if this provider is selected
                return selectedProvider === provider;
            }
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
            const settings = await this.stateService.settings.loadFromStorage();
            const defaultSettings = settings || createInitialSettingsState();
            const hydratedSettings = this.hydrateSettings(defaultSettings);
            
            // Get encryption status for all providers
            const encryptionStatuses = await this.stateService.settings.getAllProvidersEncryptionStatus();
            
            // Pass both settings and statuses to the panel
            this.panel.setAllSettings(hydratedSettings, encryptionStatuses);
        } catch (error) {
            logger.error('OptionsApp', 'Error loading settings:', error);
            this.panel.showStatus('Error loading settings: ' + error.message, true);
        }
    }

    /**
     * Ensures the loaded settings object has the same structure as the initial state,
     * preventing errors from missing keys if the structure changed.
     */
    hydrateSettings(loadedSettings) {
        return deepMerge(this.initialState.settings, loadedSettings);
    }

    /**
     * Validate settings and return detailed validation result
     */
    validateSettings(settings) {
        const errors = [];
        const missingFields = [];

        // Get all fields with validation attributes
        const fieldsToValidate = document.querySelectorAll('[data-validate], [data-depends-on]');
        
        fieldsToValidate.forEach(field => {
            if (this.isFieldRequired(field)) {
                const value = field.value?.trim() || '';
                const hasEncryptedValue = field.dataset.encryptedValue ? true : false;
                
                // Field is valid if it has a value OR has an encrypted value stored
                if (!value && !hasEncryptedValue) {
                    const fieldLabel = this.getFieldLabel(field.id);
                    errors.push(`${fieldLabel} is required`);
                    missingFields.push(field.id);
                }
            }
        });

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
        fieldIds.forEach((fieldId, index) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.style.border = '2px solid #ef4444';
                field.style.backgroundColor = '#fef2f2';
                
                // Scroll to first missing field
                if (index === 0) {
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
        logger.log('OptionsApp', '===== SAVE ALL SETTINGS STARTED =====');
        
        try {
            const settings = this.panel.getAllSettings();
            logger.log('OptionsApp', '1. Settings from panel:', settings);
            
            // Enhanced validation with visual feedback
            const validationResult = this.validateSettings(settings);
            
            if (!validationResult.isValid) {
                logger.log('OptionsApp', '❌ Validation failed:', validationResult.errors);
                this.highlightMissingFields(validationResult.missingFields);
                this.panel.showStatus(validationResult.message, true);
                return;
            }

            logger.log('OptionsApp', '2. Validation passed, saving to state service...');
            await this.stateService.settings.setSettings(settings, { autoEncrypt: true });
            logger.log('OptionsApp', '3. Settings set in state service with encryption enabled');
            
            await this.stateService.settings.saveToStorage();
            logger.log('OptionsApp', '4. Settings saved to storage');
            
            // Update encryption status indicators after save
            const encryptionStatuses = await this.stateService.settings.getAllProvidersEncryptionStatus();
            this.panel.setAllSettings(await this.stateService.settings.getSettings(), encryptionStatuses);
            
            // No need to notify background - it will detect the storage change automatically
            this.panel.showStatus('Saved', false);
            logger.log('OptionsApp', '===== SAVE ALL SETTINGS COMPLETED =====');

        } catch (error) {
            logger.error('OptionsApp', '❌ Error in saveAllSettings:', error);
            logger.error('OptionsApp', 'Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.panel.showStatus(`Error saving settings: ${error.message}`, true);
            logger.log('OptionsApp', '===== SAVE ALL SETTINGS FAILED =====');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const config = AppConfig.pageFactory('lite');
    const app = new OptionsApp(config);
    app.initialize();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});