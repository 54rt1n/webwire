import '../shared/global.scss';
import './style.css';

export class OptionsPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.elements = this._DOMElements();
    }

    /**
     * Get elements from the DOM
     */
    _DOMElements() {
        return {
            userNameInput: document.getElementById('userName'),
            personaNameInput: document.getElementById('personaName'),
            mcpServerUrlInput: document.getElementById('mcpServerUrl'),
            showThoughtCheckbox: document.getElementById('showThought'),
            autoThinkCheckbox: document.getElementById('autoThink'),
            autoInjectCheckbox: document.getElementById('autoInject'),
            providerInputs: {
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
            },
            modelConfigs: {
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
            },
            saveBtn: document.getElementById('saveBtn'),
            status: document.getElementById('status')
        };

        return elements;
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
        this.elements.userNameInput.value = settings.aim?.userName || '';
        this.elements.personaNameInput.value = settings.aim?.personaName || '';
        this.elements.mcpServerUrlInput.value = settings.mcp?.serverUrl || '';
        this.elements.showThoughtCheckbox.checked = settings.aim?.showThought || false;
        this.elements.autoThinkCheckbox.checked = settings.aim?.autoThink || false;
        this.elements.autoInjectCheckbox.checked = settings.ui?.autoInject || false;

        // Provider settings
        if (settings.ai?.providers) {
            for (const provider in this.elements.providerInputs) {
                const providerConfig = settings.ai.providers[provider];
                if (providerConfig) {
                    for (const key in this.elements.providerInputs[provider]) {
                        this.elements.providerInputs[provider][key].value = providerConfig[key] || '';
                    }
                }
            }
        }
        
        // Model settings
        if (settings.ai?.models) {
            for (const modelType in this.elements.modelConfigs) {
                const modelConfig = settings.ai.models[modelType];
                if (modelConfig) {
                    this.elements.modelConfigs[modelType].model.value = modelConfig.model || '';
                    this.elements.modelConfigs[modelType].provider.value = modelConfig.provider || '';
                    if (modelConfig.samplerConfig) {
                        this.elements.modelConfigs[modelType].temperature.value = modelConfig.samplerConfig.temperature ?? '';
                        this.elements.modelConfigs[modelType].maxTokens.value = modelConfig.samplerConfig.maxTokens ?? '';
                        this.elements.modelConfigs[modelType].topP.value = modelConfig.samplerConfig.topP ?? '';
                        this.elements.modelConfigs[modelType].minP.value = modelConfig.samplerConfig.minP ?? '';
                        this.elements.modelConfigs[modelType].topK.value = modelConfig.samplerConfig.topK ?? '';
                        this.elements.modelConfigs[modelType].frequencyPenalty.value = modelConfig.samplerConfig.frequencyPenalty ?? '';
                        this.elements.modelConfigs[modelType].presencePenalty.value = modelConfig.samplerConfig.presencePenalty ?? '';
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
                userName: this.elements.userNameInput.value.trim(),
                personaName: this.elements.personaNameInput.value.trim(),
                showThought: this.elements.showThoughtCheckbox.checked,
                autoThink: this.elements.autoThinkCheckbox.checked,
            },
            mcp: {
                serverUrl: this.elements.mcpServerUrlInput.value.trim()
            },
            ai: {
                providers: {},
                models: {}
            },
            ui: {
                autoInject: this.autoInjectCheckbox.checked
            }
        };

        // Get provider settings
        for (const provider in this.elements.providerInputs) {
            settings.ai.providers[provider] = {};
            for (const key in this.elements.providerInputs[provider]) {
                const value = this.elements.providerInputs[provider][key].value.trim();
                if (value) {
                    settings.ai.providers[provider][key] = value;
                }
            }
        }
        
        // Get model settings
        for (const modelType in this.elements.modelConfigs) {
            const modelConfig = {
                model: this.elements.modelConfigs[modelType].model.value.trim(),
                provider: this.elements.modelConfigs[modelType].provider.value.trim(),
                samplerConfig: {}
            };
            
            const temp = this.elements.modelConfigs[modelType].temperature.value.trim();
            if (temp) modelConfig.samplerConfig.temperature = parseFloat(temp);
            
            const maxTokens = this.elements.modelConfigs[modelType].maxTokens.value.trim();
            if (maxTokens) modelConfig.samplerConfig.maxTokens = parseInt(maxTokens, 10);

            const topP = this.elements.modelConfigs[modelType].topP.value.trim();
            if (topP) modelConfig.samplerConfig.topP = parseFloat(topP);

            const minP = this.elements.modelConfigs[modelType].minP.value.trim();
            if (minP) modelConfig.samplerConfig.minP = parseFloat(minP);

            const topK = this.elements.modelConfigs[modelType].topK.value.trim();
            if (topK) modelConfig.samplerConfig.topK = parseInt(topK, 10);

            const freqPenalty = this.elements.modelConfigs[modelType].frequencyPenalty.value.trim();
            if (freqPenalty) modelConfig.samplerConfig.frequencyPenalty = parseFloat(freqPenalty);
            
            const presPenalty = this.elements.modelConfigs[modelType].presencePenalty.value.trim();
            if (presPenalty) modelConfig.samplerConfig.presencePenalty = parseFloat(presPenalty);
            
            // Only add model if name is specified
            if (modelConfig.model) {
                settings.ai.models[modelType] = modelConfig;
            }
        }

        return settings;
    }
} 