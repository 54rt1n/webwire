import '../shared/global.scss';
import './style.scss';
import { MessageBuilder } from '../chat/message-builder.js';

export class OptionsPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.renderDynamicSections();
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
            modelConfigs: {},
            systemMessage: document.getElementById('systemMessage'),
            minimalSystemMessage: document.getElementById('minimalSystemMessage'),
            userHeader: document.getElementById('userHeader'),
            userFooter: document.getElementById('userFooter'),
            saveBtn: document.getElementById('saveBtn'),
            status: document.getElementById('status')
        };

        // Populate model configs after dynamic generation
        const modelTypes = ['chat', 'thought', 'code', 'creative'];
        modelTypes.forEach(type => {
            elements.modelConfigs[type] = {
                model: document.getElementById(`${type}Model`),
                provider: document.getElementById(`${type}Provider`),
                tokenizer: document.getElementById(`${type}Tokenizer`),
                temperature: document.getElementById(`${type}Temp`),
                maxTokens: document.getElementById(`${type}MaxTokens`),
                maxContentTokens: document.getElementById(`${type}MaxContentTokens`),
                topP: document.getElementById(`${type}TopP`),
                minP: document.getElementById(`${type}MinP`),
                topK: document.getElementById(`${type}TopK`),
                frequencyPenalty: document.getElementById(`${type}FreqPenalty`),
                presencePenalty: document.getElementById(`${type}PresPenalty`),
                minimalMode: document.getElementById(`${type}MinimalMode`)
            };
        });

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
     * Render dynamic sections for model configs and provider settings
     */
    renderDynamicSections() {
        this.renderModelConfigs();
        this.renderProviderSettings();
    }

    /**
     * Render model configuration sections
     */
    renderModelConfigs() {
        const modelConfigsContainer = document.getElementById('model-configs');
        if (!modelConfigsContainer) return;

        // Clear existing content
        modelConfigsContainer.innerHTML = '';

        const models = [
            { id: 'chat', title: 'Chat Model (Primary)', placeholder: 'e.g., gpt-4-turbo', defaultTemp: '0.8', defaultMaxTokens: '2048', defaultMaxContentTokens: '16384', defaultMinP: '0.05' },
            { id: 'thought', title: 'Thought Model (Optional)', placeholder: 'Leave blank to use Chat Model', isOptional: true },
            { id: 'code', title: 'Code Model (Optional)', placeholder: 'Leave blank to use Chat Model', isOptional: true },
            { id: 'creative', title: 'Creative Model (Optional)', placeholder: 'Leave blank to use Chat Model', isOptional: true }
        ];

        const providers = ['featherless', 'openai', 'google', 'anthropic', 'groq', 'meta', 'aimind', 'openrouter'];

        models.forEach(model => {
            const modelDiv = document.createElement('div');
            modelDiv.className = 'model-config';
            modelDiv.innerHTML = `
                <h3>${model.title}</h3>
                <div class="grid">
                    <div class="form-group">
                        <label for="${model.id}Model">Model Name:</label>
                        <input type="text" id="${model.id}Model" placeholder="${model.placeholder}">
                    </div>
                    <div class="form-group">
                        <label for="${model.id}Provider">Provider:</label>
                        <select id="${model.id}Provider">
                            ${model.isOptional ? '<option value="">(Same as Chat)</option>' : ''}
                            ${providers.map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="${model.id}Tokenizer">Tokenizer:</label>
                        <select id="${model.id}Tokenizer">
                            ${model.isOptional ? '<option value="">(Same as Chat)</option>' : ''}
                            <!-- Options will be populated dynamically -->
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="${model.id}Temp">Temperature:</label>
                        <input type="number" id="${model.id}Temp" min="0" max="2" step="0.1" placeholder="${model.defaultTemp || 'Optional'}">
                    </div>
                    <div class="form-group">
                        <label for="${model.id}MaxTokens">Max Response Tokens:</label>
                        <input type="number" id="${model.id}MaxTokens" min="1" placeholder="${model.defaultMaxTokens || 'Optional'}">
                        <small>Maximum tokens for AI response</small>
                    </div>
                    <div class="form-group">
                        <label for="${model.id}MaxContentTokens">Max Content Tokens:</label>
                        <input type="number" id="${model.id}MaxContentTokens" min="1" placeholder="${model.defaultMaxContentTokens || 'Optional'}">
                        <small>Maximum tokens for page content/context</small>
                    </div>
                    <div class="form-group">
                        <label for="${model.id}TopP">Top P:</label>
                        <input type="number" id="${model.id}TopP" min="0" max="1" step="0.01" placeholder="Optional">
                    </div>
                    <div class="form-group">
                        <label for="${model.id}MinP">Min P:</label>
                        <input type="number" id="${model.id}MinP" min="0" max="1" step="0.01" placeholder="${model.defaultMinP || 'Optional'}">
                    </div>
                    <div class="form-group">
                        <label for="${model.id}TopK">Top K:</label>
                        <input type="number" id="${model.id}TopK" min="1" step="1" placeholder="Optional">
                    </div>
                    <div class="form-group">
                        <label for="${model.id}FreqPenalty">Frequency Penalty:</label>
                        <input type="number" id="${model.id}FreqPenalty" min="-2" max="2" step="0.1" placeholder="Optional">
                    </div>
                    <div class="form-group">
                        <label for="${model.id}PresPenalty">Presence Penalty:</label>
                        <input type="number" id="${model.id}PresPenalty" min="-2" max="2" step="0.1" placeholder="Optional">
                    </div>
                    <div class="form-group checkbox-group">
                        <input type="checkbox" id="${model.id}MinimalMode">
                        <label for="${model.id}MinimalMode">Minimal Mode</label>
                        <small>Use minimal system prompt for this model</small>
                    </div>
                </div>
            `;
            modelConfigsContainer.appendChild(modelDiv);
        });
    }

    /**
     * Render provider settings
     */
    renderProviderSettings() {
        const providerSettingsContainer = document.getElementById('provider-settings');
        if (!providerSettingsContainer) return;

        // Clear existing content
        providerSettingsContainer.innerHTML = '';

        const providers = [
            { id: 'featherless', name: 'Featherless', hasKey: true },
            { id: 'openai', name: 'OpenAI', hasKey: true },
            { id: 'google', name: 'Google', hasKey: true },
            { id: 'anthropic', name: 'Anthropic', hasKey: true },
            { id: 'groq', name: 'Groq', hasKey: true },
            { id: 'meta', name: 'Meta', hasKey: true },
            { id: 'aimind', name: 'AIMind', hasKey: true, hasEndpoint: true },
            { id: 'openrouter', name: 'OpenRouter', hasKey: true, hasEndpoint: true }
        ];

        // Regular providers
        const regularProvidersDiv = document.createElement('div');
        regularProvidersDiv.className = 'ww-grid-2';
        
        providers.filter(p => p.hasKey && !p.hasEndpoint).forEach(provider => {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            formGroup.innerHTML = `
                <label for="${provider.id}ApiKey">${provider.name} API Key:</label>
                <input type="password" id="${provider.id}ApiKey" placeholder="Enter ${provider.name} API key">
            `;
            regularProvidersDiv.appendChild(formGroup);
        });
        
        providerSettingsContainer.appendChild(regularProvidersDiv);

        // Providers with endpoints
        providers.filter(p => p.hasEndpoint).forEach(provider => {
            const providerSection = document.createElement('div');
            providerSection.innerHTML = `
                <h3>${provider.name}</h3>
                <div class="ww-grid-2">
                    <div class="form-group">
                        <label for="${provider.id}ApiEndpoint">${provider.name} API Endpoint:</label>
                        <input type="text" id="${provider.id}ApiEndpoint" placeholder="e.g. ${provider.id === 'aimind' ? 'http://localhost:8000/v1' : 'https://openrouter.ai/api/v1'}">
                    </div>
                    <div class="form-group">
                        <label for="${provider.id}ApiKey">${provider.name} API Key:</label>
                        <input type="password" id="${provider.id}ApiKey" placeholder="Enter ${provider.name} API key">
                    </div>
                </div>
            `;
            providerSettingsContainer.appendChild(providerSection);
        });
    }

    /**
     * Populate tokenizer dropdowns with available options
     */
    populateTokenizerDropdowns() {
        const tokenizers = MessageBuilder.availableTokenizers();
        const modelTypes = ['chat', 'thought', 'code', 'creative'];
        
        modelTypes.forEach(type => {
            const dropdown = this.elements.modelConfigs[type]?.tokenizer;
            if (!dropdown) return;
            
            // Add default option
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = type === 'chat' ? '(Auto-detect)' : '(Same as Chat)';
            dropdown.appendChild(emptyOption);
            
            // Add tokenizer options
            tokenizers.forEach(tokenizer => {
                const option = document.createElement('option');
                option.value = tokenizer.id;
                option.textContent = tokenizer.name;
                option.title = tokenizer.description;
                dropdown.appendChild(option);
            });
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
        this.elements.minimalSystemMessage.value = settings.aim?.minimalSystemMessage || '';
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
                        this.elements.modelConfigs[modelType].maxContentTokens.value = modelConfig.samplerConfig.maxContentTokens ?? '';
                        this.elements.modelConfigs[modelType].topP.value = modelConfig.samplerConfig.topP ?? '';
                        this.elements.modelConfigs[modelType].minP.value = modelConfig.samplerConfig.minP ?? '';
                        this.elements.modelConfigs[modelType].topK.value = modelConfig.samplerConfig.topK ?? '';
                        this.elements.modelConfigs[modelType].frequencyPenalty.value = modelConfig.samplerConfig.frequencyPenalty ?? '';
                        this.elements.modelConfigs[modelType].presencePenalty.value = modelConfig.samplerConfig.presencePenalty ?? '';
                    }
                    // Set minimal mode checkbox
                    this.elements.modelConfigs[modelType].minimalMode.checked = modelConfig.minimalMode || false;
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
                minimalSystemMessage: this.elements.minimalSystemMessage.value.trim() || undefined,
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
            
            const maxContentTokens = this.elements.modelConfigs[modelType].maxContentTokens.value.trim();
            if (maxContentTokens) modelConfig.samplerConfig.maxContentTokens = parseInt(maxContentTokens, 10);

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
            
            // Get minimal mode checkbox value
            modelConfig.minimalMode = this.elements.modelConfigs[modelType].minimalMode.checked;
            
            // Only add model if name is specified
            if (modelConfig.model) {
                settings.ai.models[modelType] = modelConfig;
            }
        }

        return settings;
    }
} 