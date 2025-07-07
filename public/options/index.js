/**
 * Options Page Script
 * 
 * Handles options page UI and interactions for configuring the extension.
 */

import { StorageManager } from '../js/storage/storage-manager.js';
import { StateService } from '../js/state/state-service.js';
import { globalEventBus } from '../js/core/event-bus.js';
import { OptionsPanel } from './panel.js';
import { createInitialState } from '../js/state/state-container.js';

class OptionsApp {
    constructor() {
        this.panel = new OptionsPanel();
        this.storage = new StorageManager(globalEventBus);
        this.stateService = new StateService(globalEventBus, this.storage.storage);
        this.initialState = createInitialState();
    }

    async initialize() {
        await this.loadSettings();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.panel.saveBtn.addEventListener('click', () => this.saveAllSettings());
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
     * Save all settings to storage
     */
    async saveAllSettings() {
        try {
            const settings = this.panel.getAllSettings();
            
            // Basic validation
            if (!settings.ai.models.chat?.model || !settings.ai.models.chat?.provider) {
                this.panel.showStatus('Chat Model Name and Provider are required.', true);
                return;
            }

            await this.stateService.settings.setSettings(settings);
            await this.stateService.settings.saveSettings();

            this.panel.showStatus('All settings saved successfully');

        } catch (error) {
            console.error('Error saving settings:', error);
            this.panel.showStatus(`Error saving settings: ${error.message}`, true);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new OptionsApp();
    app.initialize();
});