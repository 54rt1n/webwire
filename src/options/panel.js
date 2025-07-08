export class OptionsPanel {
    constructor() {
        // General settings
        this.userNameInput = document.getElementById('userName');
        this.personaNameInput = document.getElementById('personaName');
        this.mcpServerUrlInput = document.getElementById('mcpServerUrl');
        this.showThoughtCheckbox = document.getElementById('showThought');
        this.autoThinkCheckbox = document.getElementById('autoThink');

        // Provider settings
        this.providerInputs = {
            featherless: { apiKey: document.getElementById('featherlessApiKey') },
            openai: { apiKey: document.getElementById('openaiApiKey') },
            google: { apiKey: document.getElementById('googleApiKey') },
            anthropic: { apiKey: document.getElementById('anthropicApiKey') },
            groq: { apiKey: document.getElementById('groqApiKey') },
            meta: { apiKey: document.getElementById('metaApiKey') },
            aimind: {
                apiKey: document.getElementById('aimindApiKey'),
                apiEndpoint: document.getElementById('aimindApiEndpoint')
            },
            openrouter: {
                apiKey: document.getElementById('openrouterApiKey'),
                apiEndpoint: document.getElementById('openrouterApiEndpoint')
            }
        };

        // Model settings
        this.modelConfigs = {
            chat: {
                model: document.getElementById('chatModel'),
                provider: document.getElementById('chatProvider'),
                temperature: document.getElementById('chatTemp'),
                maxTokens: document.getElementById('chatMaxTokens'),
                topP: document.getElementById('chatTopP'),
                minP: document.getElementById('chatMinP'),
                topK: document.getElementById('chatTopK'),
                frequencyPenalty: document.getElementById('chatFreqPenalty'),
                presencePenalty: document.getElementById('chatPresPenalty'),
            },
            thought: {
                model: document.getElementById('thoughtModel'),
                provider: document.getElementById('thoughtProvider'),
                temperature: document.getElementById('thoughtTemp'),
                maxTokens: document.getElementById('thoughtMaxTokens'),
                topP: document.getElementById('thoughtTopP'),
                minP: document.getElementById('thoughtMinP'),
                topK: document.getElementById('thoughtTopK'),
                frequencyPenalty: document.getElementById('thoughtFreqPenalty'),
                presencePenalty: document.getElementById('thoughtPresPenalty'),
            },
            tool: {
                model: document.getElementById('toolModel'),
                provider: document.getElementById('toolProvider'),
                temperature: document.getElementById('toolTemp'),
                maxTokens: document.getElementById('toolMaxTokens'),
                topP: document.getElementById('toolTopP'),
                minP: document.getElementById('toolMinP'),
                topK: document.getElementById('toolTopK'),
                frequencyPenalty: document.getElementById('toolFreqPenalty'),
                presencePenalty: document.getElementById('toolPresPenalty'),
            }
        };
        
        // Save button and status
        this.saveBtn = document.getElementById('saveBtn');
        this.status = document.getElementById('status');
    }

    /**
     * Show a status message
     */
    showStatus(message, isError = false) {
        this.status.textContent = message;
        this.status.className = `status ${isError ? 'error' : 'success'}`;
        this.status.style.display = 'block';
        
        setTimeout(() => {
            this.status.style.display = 'none';
        }, 3000);
    }

    /**
     * Set all settings fields from a settings object
     */
    setAllSettings(settings) {
        if (!settings) return;

        // General settings
        this.userNameInput.value = settings.aim?.userName || '';
        this.personaNameInput.value = settings.aim?.personaName || '';
        this.mcpServerUrlInput.value = settings.mcp?.serverUrl || '';
        this.showThoughtCheckbox.checked = settings.aim?.showThought || false;
        this.autoThinkCheckbox.checked = settings.aim?.autoThink || false;

        // Provider settings
        if (settings.ai?.providers) {
            for (const provider in this.providerInputs) {
                const providerConfig = settings.ai.providers[provider];
                if (providerConfig) {
                    for (const key in this.providerInputs[provider]) {
                        this.providerInputs[provider][key].value = providerConfig[key] || '';
                    }
                }
            }
        }
        
        // Model settings
        if (settings.ai?.models) {
            for (const modelType in this.modelConfigs) {
                const modelConfig = settings.ai.models[modelType];
                if (modelConfig) {
                    this.modelConfigs[modelType].model.value = modelConfig.model || '';
                    this.modelConfigs[modelType].provider.value = modelConfig.provider || '';
                    if (modelConfig.samplerConfig) {
                        this.modelConfigs[modelType].temperature.value = modelConfig.samplerConfig.temperature ?? '';
                        this.modelConfigs[modelType].maxTokens.value = modelConfig.samplerConfig.maxTokens ?? '';
                        this.modelConfigs[modelType].topP.value = modelConfig.samplerConfig.topP ?? '';
                        this.modelConfigs[modelType].minP.value = modelConfig.samplerConfig.minP ?? '';
                        this.modelConfigs[modelType].topK.value = modelConfig.samplerConfig.topK ?? '';
                        this.modelConfigs[modelType].frequencyPenalty.value = modelConfig.samplerConfig.frequencyPenalty ?? '';
                        this.modelConfigs[modelType].presencePenalty.value = modelConfig.samplerConfig.presencePenalty ?? '';
                    }
                }
            }
        }
    }

    /**
     * Get all settings from the form fields
     */
    getAllSettings() {
        const settings = {
            aim: {
                userName: this.userNameInput.value.trim(),
                personaName: this.personaNameInput.value.trim(),
                showThought: this.showThoughtCheckbox.checked,
                autoThink: this.autoThinkCheckbox.checked,
            },
            mcp: {
                serverUrl: this.mcpServerUrlInput.value.trim()
            },
            ai: {
                providers: {},
                models: {}
            }
        };

        // Get provider settings
        for (const provider in this.providerInputs) {
            settings.ai.providers[provider] = {};
            for (const key in this.providerInputs[provider]) {
                const value = this.providerInputs[provider][key].value.trim();
                if (value) {
                    settings.ai.providers[provider][key] = value;
                }
            }
        }
        
        // Get model settings
        for (const modelType in this.modelConfigs) {
            const modelConfig = {
                model: this.modelConfigs[modelType].model.value.trim(),
                provider: this.modelConfigs[modelType].provider.value.trim(),
                samplerConfig: {}
            };
            
            const temp = this.modelConfigs[modelType].temperature.value.trim();
            if (temp) modelConfig.samplerConfig.temperature = parseFloat(temp);
            
            const maxTokens = this.modelConfigs[modelType].maxTokens.value.trim();
            if (maxTokens) modelConfig.samplerConfig.maxTokens = parseInt(maxTokens, 10);

            const topP = this.modelConfigs[modelType].topP.value.trim();
            if (topP) modelConfig.samplerConfig.topP = parseFloat(topP);

            const minP = this.modelConfigs[modelType].minP.value.trim();
            if (minP) modelConfig.samplerConfig.minP = parseFloat(minP);

            const topK = this.modelConfigs[modelType].topK.value.trim();
            if (topK) modelConfig.samplerConfig.topK = parseInt(topK, 10);

            const freqPenalty = this.modelConfigs[modelType].frequencyPenalty.value.trim();
            if (freqPenalty) modelConfig.samplerConfig.frequencyPenalty = parseFloat(freqPenalty);
            
            const presPenalty = this.modelConfigs[modelType].presencePenalty.value.trim();
            if (presPenalty) modelConfig.samplerConfig.presencePenalty = parseFloat(presPenalty);
            
            // Only add model if name is specified
            if (modelConfig.model) {
                settings.ai.models[modelType] = modelConfig;
            }
        }

        return settings;
    }
} 