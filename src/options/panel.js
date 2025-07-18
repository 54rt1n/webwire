import '../shared/global.scss';
import './style.scss';
import { MessageBuilder } from '../chat/message-builder.js';

export class OptionsPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.elements = this._DOMElements();
        this.populateTokenizerDropdowns();
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
                    tokenizer: document.getElementById('chatTokenizer'),
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
                    tokenizer: document.getElementById('thoughtTokenizer'),
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
                    tokenizer: document.getElementById('toolTokenizer'),
                    temperature: document.getElementById('toolTemp'),
                    maxTokens: document.getElementById('toolMaxTokens'),
                    topP: document.getElementById('toolTopP'),
                    minP: document.getElementById('toolMinP'),
                    topK: document.getElementById('toolTopK'),
                    frequencyPenalty: document.getElementById('toolFreqPenalty'),
                    presencePenalty: document.getElementById('toolPresPenalty'),
                }
            },
            systemMessage: document.getElementById('systemMessage'),
            userHeader: document.getElementById('userHeader'),
            userFooter: document.getElementById('userFooter'),
            saveBtn: document.getElementById('saveBtn'),
            status: document.getElementById('status')
        };

        return elements;
    }

    /**
     * Show a status message
     */
    showStatus(message, isError = false) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${isError ? 'error' : 'success'}`;
        this.elements.status.style.display = 'block';
    }

    /**
     * Clear status message
     */
    clearStatus() {
        this.elements.status.style.display = 'none';
    }

    /**
     * Populate tokenizer dropdowns with available options
     */
    populateTokenizerDropdowns() {
        const tokenizers = MessageBuilder.availableTokenizers();
        
        // Add empty option for chat tokenizer
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '(Auto-detect)';
        this.elements.modelConfigs.chat.tokenizer.appendChild(emptyOption);
        
        // Populate chat tokenizer dropdown
        tokenizers.forEach(tokenizer => {
            const option = document.createElement('option');
            option.value = tokenizer.id;
            option.textContent = tokenizer.name;
            option.title = tokenizer.description;
            this.elements.modelConfigs.chat.tokenizer.appendChild(option);
        });
        
        // Populate thought tokenizer dropdown (with same options)
        tokenizers.forEach(tokenizer => {
            const option = document.createElement('option');
            option.value = tokenizer.id;
            option.textContent = tokenizer.name;
            option.title = tokenizer.description;
            this.elements.modelConfigs.thought.tokenizer.appendChild(option);
        });
        
        // Populate tool tokenizer dropdown (with same options)
        tokenizers.forEach(tokenizer => {
            const option = document.createElement('option');
            option.value = tokenizer.id;
            option.textContent = tokenizer.name;
            option.title = tokenizer.description;
            this.elements.modelConfigs.tool.tokenizer.appendChild(option);
        });
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

        // System prompt settings
        this.elements.systemMessage.value = settings.aim?.systemMessage || '';
        this.elements.userHeader.value = settings.aim?.userHeader || '';
        this.elements.userFooter.value = settings.aim?.userFooter || '';

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
                    this.elements.modelConfigs[modelType].tokenizer.value = modelConfig.tokenizer || '';
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
        console.log('[OptionsPanel] getAllSettings', this.elements);
        const settings = {
            aim: {
                userName: this.elements.userNameInput.value.trim(),
                personaName: this.elements.personaNameInput.value.trim(),
                showThought: this.elements.showThoughtCheckbox.checked,
                autoThink: this.elements.autoThinkCheckbox.checked,
                systemMessage: this.elements.systemMessage.value.trim() || undefined,
                userHeader: this.elements.userHeader.value.trim() || undefined,
                userFooter: this.elements.userFooter.value.trim() || undefined,
            },
            mcp: {
                serverUrl: this.elements.mcpServerUrlInput.value.trim()
            },
            ai: {
                providers: {},
                models: {}
            },
            ui: {
                autoInject: this.elements.autoInjectCheckbox.checked
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
                tokenizer: this.elements.modelConfigs[modelType].tokenizer.value.trim() || undefined,
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