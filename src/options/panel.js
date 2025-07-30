import '../../src/shared/global.scss';
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
        const elements = {
            userNameInput: document.getElementById('userName'),
            personaNameInput: document.getElementById('personaName'),
            providerInputs: {
                featherless: { apiKey: document.getElementById('featherlessApiKey') },
                openai: { apiKey: document.getElementById('openaiApiKey') },
                google: { apiKey: document.getElementById('googleApiKey') },
                anthropic: { apiKey: document.getElementById('anthropicApiKey') },
                groq: { apiKey: document.getElementById('groqApiKey') },
                meta: { apiKey: document.getElementById('metaApiKey') },
                openrouter: { apiKey: document.getElementById('openrouterApiKey') },
                hyperbolic: { apiKey: document.getElementById('hyperbolicApiKey') },
                huggingface: { apiKey: document.getElementById('huggingfaceApiKey') },
                local: { 
                    apiEndpoint: document.getElementById('localModelEndpoint'),
                    apiKey: document.getElementById('localModelApiKey')
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
        ['chat', 'thought', 'code', 'creative'].forEach(type => {
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
        if (!this.elements.status) {
            console.error('[OptionsPanel] Status element not found!');
            return;
        }
        
        this.elements.status.textContent = message;
        this.elements.status.className = `ww-status-message ${isError ? 'status-error' : 'status-success'}`;
        this.elements.status.style.display = 'flex';
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
        
        ['chat', 'thought', 'code', 'creative'].forEach(type => {
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
                        if (this.elements.providerInputs[provider][key]) {
                            this.elements.providerInputs[provider][key].value = providerConfig[key] || '';
                        }
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
        
        // Update all model summaries after loading settings
        ['chat', 'thought', 'code', 'creative'].forEach(modelId => {
            this.updateModelSummary(modelId);
        });
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
                systemMessage: this.elements.systemMessage.value.trim() || undefined,
                minimalSystemMessage: this.elements.minimalSystemMessage.value.trim() || undefined,
                userHeader: this.elements.userHeader.value.trim() || undefined,
                userFooter: this.elements.userFooter.value.trim() || undefined,
            },
            ai: {
                providers: {},
                models: {}
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

    /**
     * Render dynamic sections
     */
    renderDynamicSections() {
        this.renderModelConfigs();
        this.renderProviderSettings();
    }

    /**
     * Render model configuration sections
     */
    renderModelConfigs() {
        const container = document.getElementById('model-configs');
        if (!container) return;
        
        container.innerHTML = '';
        
        const models = [
            { id: 'chat', title: 'Chat Model (Primary)', placeholder: 'e.g., gpt-4-turbo', defaultTemp: '0.8', defaultMaxTokens: '2048', defaultMaxContentTokens: '16384', defaultMinP: '0.05' },
            { id: 'thought', title: 'Thought Model (Optional)', placeholder: 'Leave blank to use Chat Model', isOptional: true },
            { id: 'code', title: 'Code Model (Optional)', placeholder: 'Leave blank to use Chat Model', isOptional: true },
            { id: 'creative', title: 'Creative Model (Optional)', placeholder: 'Leave blank to use Chat Model', isOptional: true }
        ];
        
        const providers = ['featherless', 'openai', 'google', 'anthropic', 'groq', 'meta', 'openrouter', 'hyperbolic', 'huggingface', 'local'];
        
        models.forEach(model => {
            const div = document.createElement('div');
            div.className = 'ww-model-config';
            div.dataset.modelId = model.id;
            div.innerHTML = `
                <div class="ww-model-header">
                    <h3>${model.title}</h3>
                    <button class="ww-toggle-btn" data-model-id="${model.id}" aria-label="Toggle ${model.title}">
                        <span class="ww-toggle-icon">▼</span>
                    </button>
                </div>
                <div class="ww-model-summary" data-model-id="${model.id}" style="display: none;">
                    <span class="ww-summary-text">Not configured</span>
                </div>
                <div class="ww-model-content" data-model-id="${model.id}">
                    <div class="ww-model-grid">
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}Model">Model Name:</label>
                            <input type="text" id="${model.id}Model" class="ww-form-input" placeholder="${model.placeholder}">
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}Provider">Provider:</label>
                            <select id="${model.id}Provider" class="ww-form-select">
                                ${model.isOptional ? '<option value="">(Same as Chat)</option>' : ''}
                                ${providers.map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}Tokenizer">Tokenizer: <a href="guide.html#tokenizers" target="_blank" class="ww-label-help">?</a></label>
                            <select id="${model.id}Tokenizer" class="ww-form-select">
                                <!-- Options will be populated dynamically -->
                            </select>
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}Temp">Temperature: <a href="guide.html#samplers" target="_blank" class="ww-label-help">?</a></label>
                            <input type="number" id="${model.id}Temp" class="ww-form-input" min="0" max="2" step="0.1" placeholder="${model.defaultTemp || 'Optional'}">
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}MaxTokens">Max Response Tokens:</label>
                            <input type="number" id="${model.id}MaxTokens" class="ww-form-input" min="1" placeholder="${model.defaultMaxTokens || 'Optional'}">
                            <small class="ww-form-help">Maximum tokens for AI response</small>
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}MaxContentTokens">Max Content Tokens:</label>
                            <input type="number" id="${model.id}MaxContentTokens" class="ww-form-input" min="1" placeholder="${model.defaultMaxContentTokens || 'Optional'}">
                            <small class="ww-form-help">Maximum tokens for page content/context</small>
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}TopP">Top P:</label>
                            <input type="number" id="${model.id}TopP" class="ww-form-input" min="0" max="1" step="0.01" placeholder="Optional">
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}MinP">Min P:</label>
                            <input type="number" id="${model.id}MinP" class="ww-form-input" min="0" max="1" step="0.01" placeholder="${model.defaultMinP || 'Optional'}">
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}TopK">Top K:</label>
                            <input type="number" id="${model.id}TopK" class="ww-form-input" min="1" step="1" placeholder="Optional">
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}FreqPenalty">Frequency Penalty:</label>
                            <input type="number" id="${model.id}FreqPenalty" class="ww-form-input" min="-2" max="2" step="0.1" placeholder="Optional">
                        </div>
                        <div class="ww-form-group">
                            <label class="ww-form-label" for="${model.id}PresPenalty">Presence Penalty:</label>
                            <input type="number" id="${model.id}PresPenalty" class="ww-form-input" min="-2" max="2" step="0.1" placeholder="Optional">
                        </div>
                        <div class="ww-checkbox-group">
                            <div class="ww-checkbox-item">
                                <input type="checkbox" id="${model.id}MinimalMode">
                                <div class="ww-checkbox-label">
                                    <div class="ww-checkbox-title">Minimal Mode</div>
                                    <div class="ww-checkbox-description">Use minimal system prompt for this model</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

        // Setup collapse event listeners
        this.setupCollapseListeners();
        
        // Set initial states - chat open, others closed
        this.setInitialCollapseStates();
    }

    /**
     * Render provider settings
     */
    renderProviderSettings() {
        const container = document.getElementById('provider-settings');
        if (!container) return;
        
        container.innerHTML = '';
        
        const providers = [
            { id: 'openai', name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
            { id: 'anthropic', name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
            { id: 'google', name: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey' },
            { id: 'featherless', name: 'Featherless', url: 'https://featherless.ai/keys' },
            { id: 'groq', name: 'Groq', url: 'https://console.groq.com/keys' },
            { id: 'meta', name: 'Meta Llama', url: 'https://llama.developer.meta.com/api-keys' },
            { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/keys' },
            { id: 'hyperbolic', name: 'Hyperbolic', url: 'https://app.hyperbolic.xyz/keys' },
            { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/settings/tokens' }
        ];
        
        // Create a provider section panel for API keys
        const apiKeysSection = document.createElement('div');
        apiKeysSection.className = 'ww-model-config';
        apiKeysSection.innerHTML = `
            <div class="ww-model-header">
                <h3>API Keys</h3>
            </div>
            <div class="ww-model-grid" id="api-keys-grid">
            </div>
        `;
        
        const grid = apiKeysSection.querySelector('#api-keys-grid');
        
        providers.forEach(provider => {
            const formGroup = document.createElement('div');
            formGroup.className = 'ww-form-group';
            formGroup.innerHTML = `
                <label class="ww-form-label" for="${provider.id}ApiKey">
                    ${provider.name} API Key:
                    <a href="${provider.url}" target="_blank" class="ww-label-help">🔗</a>
                </label>
                <input type="password" id="${provider.id}ApiKey" class="ww-form-input" placeholder="Enter ${provider.name} API key">
            `;
            grid.appendChild(formGroup);
        });
        
        container.appendChild(apiKeysSection);
        
        // Local models section
        const localSection = document.createElement('div');
        localSection.className = 'ww-model-config';
        localSection.innerHTML = `
            <div class="ww-model-header">
                <h3>Local Models</h3>
                <a href="guide.html#local-models" target="_blank" class="ww-provider-link">📖 Configuration Guide</a>
            </div>
            <div class="ww-model-grid">
                <div class="ww-form-group">
                    <label class="ww-form-label" for="localModelEndpoint">Local Model Endpoint:</label>
                    <input type="text" id="localModelEndpoint" class="ww-form-input" placeholder="e.g. http://localhost:8000/v1">
                </div>
                <div class="ww-form-group">
                    <label class="ww-form-label" for="localModelApiKey">Local Model API Key (Optional):</label>
                    <input type="password" id="localModelApiKey" class="ww-form-input" placeholder="Enter Local Model API key">
                </div>
            </div>
        `;
        container.appendChild(localSection);
    }

    /**
     * Setup collapse/expand event listeners for model sections
     */
    setupCollapseListeners() {
        const toggleButtons = document.querySelectorAll('.ww-toggle-btn');
        toggleButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modelId = btn.dataset.modelId;
                this.toggleModelSection(modelId);
                // Update summary when toggling
                this.updateModelSummary(modelId);
            });
        });

        // Also update summaries when model inputs change
        ['chat', 'thought', 'code', 'creative'].forEach(modelId => {
            const modelInput = document.getElementById(`${modelId}Model`);
            const providerSelect = document.getElementById(`${modelId}Provider`);
            const tempInput = document.getElementById(`${modelId}Temp`);
            const maxTokensInput = document.getElementById(`${modelId}MaxTokens`);
            const maxContentTokensInput = document.getElementById(`${modelId}MaxContentTokens`);

            [modelInput, providerSelect, tempInput, maxTokensInput, maxContentTokensInput].forEach(el => {
                if (el) {
                    el.addEventListener('change', () => this.updateModelSummary(modelId));
                    el.addEventListener('input', () => this.updateModelSummary(modelId));
                }
            });
        });
    }

    /**
     * Set initial collapse states - chat open, others closed
     */
    setInitialCollapseStates() {
        ['chat', 'thought', 'code', 'creative'].forEach(modelId => {
            const isChat = modelId === 'chat';
            const content = document.querySelector(`.ww-model-content[data-model-id="${modelId}"]`);
            const summary = document.querySelector(`.ww-model-summary[data-model-id="${modelId}"]`);
            const icon = document.querySelector(`.ww-toggle-btn[data-model-id="${modelId}"] .ww-toggle-icon`);
            
            if (content && summary && icon) {
                if (isChat) {
                    // Chat starts open
                    content.style.display = 'block';
                    summary.style.display = 'none';
                    icon.textContent = '▼';
                } else {
                    // Others start closed
                    content.style.display = 'none';
                    summary.style.display = 'block';
                    icon.textContent = '▶';
                }
            }
            
            // Update summary for all sections
            this.updateModelSummary(modelId);
        });
    }

    /**
     * Toggle a model section between collapsed and expanded
     */
    toggleModelSection(modelId) {
        const content = document.querySelector(`.ww-model-content[data-model-id="${modelId}"]`);
        const summary = document.querySelector(`.ww-model-summary[data-model-id="${modelId}"]`);
        const icon = document.querySelector(`.ww-toggle-btn[data-model-id="${modelId}"] .ww-toggle-icon`);
        
        if (content && summary && icon) {
            const isCollapsed = content.style.display === 'none';
            
            if (isCollapsed) {
                // Expand
                content.style.display = 'block';
                summary.style.display = 'none';
                icon.textContent = '▼';
            } else {
                // Collapse
                content.style.display = 'none';
                summary.style.display = 'block';
                icon.textContent = '▶';
            }
        }
    }

    /**
     * Generate and update summary for a model configuration
     */
    updateModelSummary(modelId) {
        const summaryContainer = document.querySelector(`.ww-model-summary[data-model-id="${modelId}"]`);
        const summaryEl = summaryContainer?.querySelector('.ww-summary-text');
        if (!summaryEl || !summaryContainer) return;

        const modelInput = document.getElementById(`${modelId}Model`);
        const providerSelect = document.getElementById(`${modelId}Provider`);
        const tempInput = document.getElementById(`${modelId}Temp`);
        const maxContentTokensInput = document.getElementById(`${modelId}MaxContentTokens`);

        const modelName = modelInput?.value?.trim() || '';
        const provider = providerSelect?.value || '';
        const temperature = tempInput?.value || '';
        const maxContentTokens = maxContentTokensInput?.value || '';

        if (!modelName && !provider) {
            summaryEl.textContent = 'Not configured';
            summaryEl.className = 'ww-summary-text summary-empty';
            summaryContainer.classList.remove('summary-configured');
        } else {
            const parts = [];
            
            if (modelName) {
                parts.push(modelName);
            }
            
            if (provider) {
                parts.push(provider.charAt(0).toUpperCase() + provider.slice(1));
            }
            
            if (temperature) {
                parts.push(`temp: ${temperature}`);
            }
            
            if (maxContentTokens) {
                parts.push(`${maxContentTokens} tokens`);
            }
            
            summaryEl.textContent = parts.join(' • ');
            summaryEl.className = 'ww-summary-text summary-configured';
            summaryContainer.classList.add('summary-configured');
        }
    }
} 