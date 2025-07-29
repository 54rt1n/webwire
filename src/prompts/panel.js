import '../shared/global.scss';
import './style.scss';
import { EVENTS } from '../js/core/events.js';
import { emojiBrowser } from '../components/emoji-browser.js';

/**
 * PromptsPanel
 * Manages all UI rendering and event handling for the Prompts Panel.
 * This class does not contain any business logic for data management; it only
 * receives data and renders it to the DOM.
 */
export class PromptsPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.stateService = null;
        this.currentEditingPromptId = null;
        
        this.elements = this._DOMElements();
        this.handlers = null; // Will be set during initialization
    }

    /**
     * Caches all necessary DOM elements for performance.
     * @private
     */
    _DOMElements() {
        return {
            // Main containers
            promptsContainer: document.getElementById('prompts-list-container'),
            promptsCountDisplay: document.getElementById('prompts-count-display'),
            emptyState: document.getElementById('prompts-empty-state'),
            
            // Search
            searchInput: document.getElementById('prompts-search'),
            
            // Action buttons
            newPromptBtn: document.getElementById('new-prompt-btn'),
            importPromptsBtn: document.getElementById('import-prompts-btn'),
            exportAllPromptsBtn: document.getElementById('export-all-prompts-btn'),
            
            // Delete modal
            deleteModal: document.getElementById('delete-confirmation-modal'),
            deletePromptDetails: document.getElementById('delete-prompt-details'),
            confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
            cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
            deleteModalCloseBtn: document.getElementById('modal-close-btn'),
            
            // Prompt edit modal
            promptModal: document.getElementById('prompt-modal'),
            promptModalTitle: document.getElementById('prompt-modal-title'),
            promptModalCloseBtn: document.getElementById('prompt-modal-close-btn'),
            promptModalSaveBtn: document.getElementById('prompt-modal-save-btn'),
            promptModalCancelBtn: document.getElementById('prompt-modal-cancel-btn'),
            
            // Form fields
            promptForm: document.getElementById('prompt-form'),
            promptId: document.getElementById('prompt-id'),
            promptStatus: document.getElementById('prompt-status'),
            promptButtonText: document.getElementById('prompt-button-text'),
            promptButtonIcon: document.getElementById('prompt-button-icon'),
            promptButtonIconValue: document.getElementById('prompt-button-icon-value'),
            promptIconEmoji: document.getElementById('prompt-icon-emoji'),
            promptUserPrompt: document.getElementById('prompt-user-prompt'),
            promptSystemPrompt: document.getElementById('prompt-system-prompt'),
            
            // Feature toggles
            featurePageContent: document.getElementById('feature-pageContent'),
            featureMcp: document.getElementById('feature-mcp'),
            featureAutoThink: document.getElementById('feature-autoThink'),
            featureNoBaseSystemPrompt: document.getElementById('feature-noBaseSystemPrompt'),
            featureBrowserTools: document.getElementById('feature-browserTools'),
            featureAutoExecuteTools: document.getElementById('feature-autoExecuteTools')
        };
    }

    /**
     * Sets the state service for data access
     * @param {object} stateService - The state service instance
     */
    setStateService(stateService) {
        this.stateService = stateService;
    }

    /**
     * Initializes the panel with event handlers
     * @param {object} handlers - Object containing handler functions
     */
    initialize(handlers) {
        this.handlers = handlers;
        this._setupEventListeners();
        console.log('[PromptsPanel] Initialized');
    }

    /**
     * Sets up all DOM event listeners
     * @private
     */
    _setupEventListeners() {
        // Action buttons
        this.elements.newPromptBtn.addEventListener('click', () => {
            if (this.handlers.onNewPrompt) {
                this.handlers.onNewPrompt();
            }
        });

        this.elements.importPromptsBtn.addEventListener('click', () => {
            if (this.handlers.onImportPrompts) {
                this.handlers.onImportPrompts();
            }
        });

        this.elements.exportAllPromptsBtn.addEventListener('click', () => {
            if (this.handlers.onExportPrompts) {
                this.handlers.onExportPrompts([]);
            }
        });

        // Search functionality
        this.elements.searchInput.addEventListener('input', (e) => {
            this._filterPrompts(e.target.value);
        });

        // Delete modal
        this.elements.confirmDeleteBtn.addEventListener('click', () => {
            this._handleConfirmDelete();
        });

        this.elements.cancelDeleteBtn.addEventListener('click', () => {
            this._hideDeleteModal();
        });

        this.elements.deleteModalCloseBtn.addEventListener('click', () => {
            this._hideDeleteModal();
        });

        // Prompt edit modal
        this.elements.promptModalSaveBtn.addEventListener('click', () => {
            this._handleSavePrompt();
        });

        this.elements.promptModalCancelBtn.addEventListener('click', () => {
            this.closePromptModal();
        });

        this.elements.promptModalCloseBtn.addEventListener('click', () => {
            this.closePromptModal();
        });

        // Close modals on overlay click
        this.elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === this.elements.deleteModal) {
                this._hideDeleteModal();
            }
        });

        this.elements.promptModal.addEventListener('click', (e) => {
            if (e.target === this.elements.promptModal) {
                this.closePromptModal();
            }
        });

        // Prevent form submission
        this.elements.promptForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleSavePrompt();
        });

        // Icon selector
        this.elements.promptButtonIcon.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const emoji = await emojiBrowser.open();
                this.elements.promptIconEmoji.textContent = emoji;
                this.elements.promptButtonIconValue.value = emoji;
            } catch (error) {
                // User cancelled or closed the browser
                console.log('Emoji selection cancelled');
            }
        });
    }

    /**
     * Renders the prompts list
     * @param {Object} prompts - Object of prompt configurations keyed by ID
     */
    renderPrompts(prompts) {
        const promptEntries = Object.entries(prompts);
        console.log(`[PromptsPanel] Rendering ${promptEntries.length} prompts`);
        
        // Update count
        const activeCount = promptEntries.filter(([_, p]) => p.status === 'active').length;
        this.elements.promptsCountDisplay.textContent = 
            `${promptEntries.length} prompts (${activeCount} active)`;

        // Clear existing content
        this.elements.promptsContainer.innerHTML = '';
        
        if (!prompts || promptEntries.length === 0) {
            this.elements.promptsContainer.style.display = 'none';
            this.elements.emptyState.style.display = 'block';
            return;
        }

        this.elements.promptsContainer.style.display = 'block';
        this.elements.emptyState.style.display = 'none';

        // Create prompt items
        promptEntries.forEach(([promptId, prompt]) => {
            const promptEl = this._createPromptElement(promptId, prompt);
            this.elements.promptsContainer.appendChild(promptEl);
        });
    }

    /**
     * Creates a prompt list item element
     * @param {string} promptId - The prompt identifier
     * @param {object} prompt - Prompt configuration object
     * @returns {HTMLElement} Prompt element
     * @private
     */
    _createPromptElement(promptId, prompt) {
        const promptEl = this._createEl('div', {
            className: `prompt-card ${prompt.status === 'inactive' ? 'inactive' : ''}`,
            'data-prompt-id': promptId
        });

        // Count active features
        const activeFeatures = Object.entries(prompt.features || {})
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => this._getFeatureLabel(feature));

        promptEl.innerHTML = `
            <div class="prompt-card-header">
                <h3 class="prompt-card-title">
                    <span class="prompt-icon">${prompt.buttonIcon || '📖'}</span>
                    ${this._escapeHtml(prompt.buttonText)}
                </h3>
                <div class="prompt-status ${prompt.status}">
                    ${prompt.status === 'active' ? 'Active' : 'Inactive'}
                </div>
            </div>
            <div class="prompt-id">${promptId}</div>
            <div class="prompt-card-body">
                <div class="prompt-preview">
                    ${this._escapeHtml(prompt.userPrompt.substring(0, 150))}${prompt.userPrompt.length > 150 ? '...' : ''}
                </div>
            </div>
            <div class="prompt-card-footer">
                <div class="prompt-features">
                    ${activeFeatures.length > 0 ? 
                        activeFeatures.map(f => `<span class="feature-badge">${f}</span>`).join('') :
                        '<span class="no-features">No special features</span>'
                    }
                </div>
                <div class="prompt-actions">
                    <button class="action-btn edit" title="Edit prompt" data-prompt-id="${promptId}">
                        ✏️
                    </button>
                    <button class="action-btn toggle" title="Toggle status" data-prompt-id="${promptId}">
                        ${prompt.status === 'active' ? '⏸️' : '▶️'}
                    </button>
                    <button class="action-btn delete" title="Delete prompt" data-prompt-id="${promptId}">
                        🗑️
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        this._setupPromptEventListeners(promptEl, promptId, prompt);

        return promptEl;
    }

    /**
     * Sets up event listeners for a prompt element
     * @param {HTMLElement} promptEl - The prompt element
     * @param {string} promptId - The prompt ID
     * @param {object} prompt - The prompt data
     * @private
     */
    _setupPromptEventListeners(promptEl, promptId, prompt) {
        // Edit button
        const editBtn = promptEl.querySelector('.action-btn.edit');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.handlers.onEditPrompt) {
                this.handlers.onEditPrompt(promptId);
            }
        });

        // Toggle button
        const toggleBtn = promptEl.querySelector('.action-btn.toggle');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.handlers.onTogglePrompt) {
                this.handlers.onTogglePrompt(promptId);
            }
        });

        // Delete button
        const deleteBtn = promptEl.querySelector('.action-btn.delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._showDeleteConfirmation(promptId, prompt);
        });

        // Click prompt to edit
        promptEl.addEventListener('click', () => {
            if (this.handlers.onEditPrompt) {
                this.handlers.onEditPrompt(promptId);
            }
        });
    }

    /**
     * Opens the prompt edit modal
     * @param {string} promptId - The prompt ID (null for new prompt)
     * @param {object} promptData - The prompt data (null for new prompt)
     */
    openPromptModal(promptId, promptData) {
        this.currentEditingPromptId = promptId;
        
        // Update modal title
        this.elements.promptModalTitle.textContent = promptId ? 'Edit Prompt' : 'New Prompt';
        
        // Fill form with data
        if (promptData) {
            this.elements.promptId.value = promptId || '';
            this.elements.promptId.disabled = !!promptId; // Disable ID field when editing
            this.elements.promptStatus.value = promptData.status || 'active';
            this.elements.promptButtonText.value = promptData.buttonText || '';
            this.elements.promptIconEmoji.textContent = promptData.buttonIcon || '📖';
            this.elements.promptButtonIconValue.value = promptData.buttonIcon || '📖';
            this.elements.promptUserPrompt.value = promptData.userPrompt || '';
            this.elements.promptSystemPrompt.value = promptData.systemPrompt || '';
            
            // Set features
            this.elements.featurePageContent.checked = promptData.features?.pageContent || false;
            this.elements.featureMcp.checked = promptData.features?.mcp || false;
            this.elements.featureAutoThink.checked = promptData.features?.autoThink || false;
            this.elements.featureNoBaseSystemPrompt.checked = promptData.features?.noBaseSystemPrompt || false;
            this.elements.featureBrowserTools.checked = promptData.features?.browserTools || false;
            this.elements.featureAutoExecuteTools.checked = promptData.features?.autoExecuteTools || false;
        } else {
            // Clear form for new prompt
            this.elements.promptForm.reset();
            this.elements.promptId.disabled = false;
            this.elements.promptStatus.value = 'active';
            this.elements.promptIconEmoji.textContent = '📖';
            this.elements.promptButtonIconValue.value = '📖';
        }
        
        // Show modal
        this.elements.promptModal.style.display = 'flex';
        
        // Focus first field
        setTimeout(() => {
            if (!promptId) {
                this.elements.promptId.focus();
            } else {
                this.elements.promptButtonText.focus();
            }
        }, 100);
    }

    /**
     * Closes the prompt edit modal
     */
    closePromptModal() {
        this.elements.promptModal.style.display = 'none';
        this.currentEditingPromptId = null;
    }

    /**
     * Handles saving a prompt from the modal
     * @private
     */
    _handleSavePrompt() {
        // Get form data
        const promptId = this.elements.promptId.value.trim() || this.currentEditingPromptId;
        if (!promptId) {
            alert('Please enter a Prompt ID');
            this.elements.promptId.focus();
            return;
        }

        const promptData = {
            buttonText: this.elements.promptButtonText.value.trim(),
            buttonIcon: this.elements.promptButtonIconValue.value,
            userPrompt: this.elements.promptUserPrompt.value.trim(),
            systemPrompt: this.elements.promptSystemPrompt.value.trim(),
            status: this.elements.promptStatus.value,
            features: {
                pageContent: this.elements.featurePageContent.checked,
                mcp: this.elements.featureMcp.checked,
                autoThink: this.elements.featureAutoThink.checked,
                noBaseSystemPrompt: this.elements.featureNoBaseSystemPrompt.checked,
                browserTools: this.elements.featureBrowserTools.checked,
                autoExecuteTools: this.elements.featureAutoExecuteTools.checked
            }
        };

        // Basic validation
        if (!promptData.buttonText) {
            alert('Please enter button text');
            this.elements.promptButtonText.focus();
            return;
        }

        if (!promptData.userPrompt) {
            alert('Please enter a user prompt');
            this.elements.promptUserPrompt.focus();
            return;
        }

        if (!promptData.systemPrompt) {
            alert('Please enter a system prompt');
            this.elements.promptSystemPrompt.focus();
            return;
        }

        // Call handler to save
        if (this.handlers.onSavePrompt) {
            this.handlers.onSavePrompt(promptId, promptData);
        }
    }

    /**
     * Shows delete confirmation modal
     * @param {string} promptId - The prompt ID to delete
     * @param {object} prompt - The prompt data
     * @private
     */
    _showDeleteConfirmation(promptId, prompt) {
        this.pendingDeletePromptId = promptId;
        
        this.elements.deletePromptDetails.innerHTML = `
            <div class="prompt-info">
                <strong>${prompt.buttonIcon} ${this._escapeHtml(prompt.buttonText)}</strong>
            </div>
            <div class="prompt-id-small">ID: ${promptId}</div>
        `;
        
        this.elements.deleteModal.style.display = 'flex';
    }

    /**
     * Hides the delete confirmation modal
     * @private
     */
    _hideDeleteModal() {
        this.elements.deleteModal.style.display = 'none';
        this.pendingDeletePromptId = null;
    }

    /**
     * Handles confirmed deletion
     * @private
     */
    _handleConfirmDelete() {
        if (this.pendingDeletePromptId && this.handlers.onDeletePrompt) {
            this.handlers.onDeletePrompt(this.pendingDeletePromptId);
        }
        this._hideDeleteModal();
    }

    /**
     * Filters prompts based on search term
     * @param {string} searchTerm - The search term
     * @private
     */
    _filterPrompts(searchTerm) {
        const term = searchTerm.toLowerCase();
        const promptItems = this.elements.promptsContainer.querySelectorAll('.prompt-card');
        
        let visibleCount = 0;
        let activeCount = 0;
        
        promptItems.forEach(item => {
            const promptId = item.dataset.promptId.toLowerCase();
            const title = item.querySelector('.prompt-card-title').textContent.toLowerCase();
            const preview = item.querySelector('.prompt-preview').textContent.toLowerCase();
            
            const matches = !term || 
                promptId.includes(term) || 
                title.includes(term) || 
                preview.includes(term);
            
            item.style.display = matches ? 'block' : 'none';
            
            if (matches) {
                visibleCount++;
                if (!item.classList.contains('inactive')) {
                    activeCount++;
                }
            }
        });
        
        // Update count
        this.elements.promptsCountDisplay.textContent = 
            `${visibleCount} prompts (${activeCount} active)`;
    }

    /**
     * Gets a human-readable label for a feature
     * @param {string} feature - The feature key
     * @returns {string} The label
     * @private
     */
    _getFeatureLabel(feature) {
        const labels = {
            pageContent: 'Page Content',
            mcp: 'MCP Tools',
            autoThink: 'Auto Think',
            noBaseSystemPrompt: 'No Base Prompt',
            browserTools: 'Browser Tools',
            autoExecuteTools: 'Auto Execute'
        };
        return labels[feature] || feature;
    }

    /**
     * Creates a DOM element with optional properties
     * @param {string} tag - Element tag name
     * @param {object} props - Element properties
     * @returns {HTMLElement} Created element
     * @private
     */
    _createEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        return el;
    }

    /**
     * Escapes HTML in text content
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}