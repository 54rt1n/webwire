import '../shared/global.scss';
import './style.scss';
import { EVENTS } from '../js/core/events.js';
import { emojiBrowser } from '../components/emoji-browser.js';
import { logger } from '../js/core/logging.js';

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
        
        this.elements = null;
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
            emptyState: document.getElementById('prompts-empty-state'),
            
            // Stats
            totalPromptsCount: document.getElementById('total-prompts-count'),
            activePromptsCount: document.getElementById('active-prompts-count'),
            inactivePromptsCount: document.getElementById('inactive-prompts-count'),
            
            // Search
            searchInput: document.getElementById('prompts-search'),
            searchClearBtn: document.getElementById('search-clear-btn'),
            searchResults: document.getElementById('search-results'),
            visibleCount: document.getElementById('visible-count'),
            totalCount: document.getElementById('total-count'),
            
            // Action buttons
            newPromptBtn: document.getElementById('new-prompt-btn'),
            importPromptsBtn: document.getElementById('import-prompts-btn'),
            exportAllPromptsBtn: document.getElementById('export-all-prompts-btn'),
            resetPromptsBtn: document.getElementById('reset-prompts-btn'),
            
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
            promptModalSaveAsBtn: document.getElementById('prompt-modal-save-as-btn'),
            promptModalDeleteBtn: document.getElementById('prompt-modal-delete-btn'),
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
        this.elements = this._DOMElements();
        this.handlers = handlers;
        this._setupEventListeners();
        logger.log('PromptsPanel', 'Initialized');
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

        this.elements.resetPromptsBtn.addEventListener('click', () => {
            if (this.handlers.onResetPrompts) {
                this.handlers.onResetPrompts();
            }
        });

        // Search functionality
        this.elements.searchInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            this._updateSearchUI(value);
            this._handleSearch(value);
        });

        // Search clear button
        if (this.elements.searchClearBtn) {
            this.elements.searchClearBtn.addEventListener('click', () => {
                this.elements.searchInput.value = '';
                this.elements.searchInput.dispatchEvent(new Event('input'));
                this.elements.searchInput.focus();
            });
        }

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

        this.elements.promptModalSaveAsBtn.addEventListener('click', () => {
            this._handleSaveAsPrompt();
        });

        this.elements.promptModalDeleteBtn.addEventListener('click', () => {
            this._handleDeleteFromModal();
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
                logger.log('PromptsPanel', 'Emoji selection cancelled');
            }
        });
    }

    /**
     * Renders the prompts list
     * @param {Object} prompts - Object of prompt configurations keyed by ID
     */
    renderPrompts(prompts) {
        const promptEntries = Object.entries(prompts);
        logger.log('PromptsPanel', `Rendering ${promptEntries.length} prompts`);
        
        // Update stats
        const totalCount = promptEntries.length;
        const activeCount = promptEntries.filter(([_, p]) => p.status === 'active').length;
        const inactiveCount = totalCount - activeCount;
        
        this.elements.totalPromptsCount.textContent = totalCount;
        this.elements.activePromptsCount.textContent = activeCount;
        this.elements.inactivePromptsCount.textContent = inactiveCount;

        // Clear existing content
        this.elements.promptsContainer.innerHTML = '';
        
        if (!prompts || promptEntries.length === 0) {
            this.elements.promptsContainer.style.display = 'none';
            this.elements.emptyState.style.display = 'block';
            return;
        }

        this.elements.promptsContainer.style.display = 'block';
        this.elements.emptyState.style.display = 'none';

        // Sort prompts by displayOrder
        const sortedPrompts = promptEntries.sort(([, a], [, b]) => {
            const orderA = a.displayOrder || 0;
            const orderB = b.displayOrder || 0;
            return orderA - orderB;
        });

        // Create prompt items
        sortedPrompts.forEach(([promptId, prompt]) => {
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
            className: `ww-prompt-card ${prompt.status === 'inactive' ? 'inactive' : ''}`,
            'data-prompt-id': promptId
        });

        // Count active features
        const activeFeatures = Object.entries(prompt.features || {})
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => this._getFeatureLabel(feature));

        promptEl.innerHTML = `
            <div class="ww-prompt-drag-handle" title="Drag to reorder">
                <span class="ww-drag-icon">☰</span>
            </div>
            <div class="ww-prompt-content-area">
                <div class="ww-prompt-header">
                    <div class="ww-prompt-info">
                        <h3 class="ww-prompt-title">
                            <span class="ww-prompt-icon">${prompt.buttonIcon || '📖'}</span>
                            ${this._escapeHtml(prompt.buttonText)}
                        </h3>
                    </div>
                    <div class="ww-prompt-actions">
                        <button class="ww-action-btn btn-edit" title="Edit prompt" data-prompt-id="${promptId}">
                            ✏️
                        </button>
                        <button class="ww-action-btn btn-toggle" title="Toggle status" data-prompt-id="${promptId}">
                            ${prompt.status === 'active' ? '⏸️' : '▶️'}
                        </button>
                        <button class="ww-action-btn btn-delete" title="Delete prompt" data-prompt-id="${promptId}">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="ww-prompt-description">
                    ${this._escapeHtml(prompt.userPrompt.substring(0, 150))}${prompt.userPrompt.length > 150 ? '...' : ''}
                </div>
                <div class="ww-prompt-footer">
                    <div class="ww-prompt-badges">
                        ${prompt.category ? `<span class="ww-category-badge">${this._escapeHtml(prompt.category)}</span>` : ''}
                        <span class="ww-status-badge status-${prompt.status}">
                            ${prompt.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div class="ww-prompt-tags">
                        ${activeFeatures.length > 0 ? 
                            activeFeatures.map(f => `<span class="ww-tag">${f}</span>`).join('') :
                            '<span class="ww-no-features">No special features</span>'
                        }
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        this._setupPromptEventListeners(promptEl, promptId, prompt);
        
        // Make draggable
        this._setupDragAndDrop(promptEl, promptId);

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
        const editBtn = promptEl.querySelector('.ww-action-btn.btn-edit');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.handlers.onEditPrompt) {
                this.handlers.onEditPrompt(promptId);
            }
        });

        // Toggle button
        const toggleBtn = promptEl.querySelector('.ww-action-btn.btn-toggle');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.handlers.onTogglePrompt) {
                this.handlers.onTogglePrompt(promptId);
            }
        });

        // Delete button
        const deleteBtn = promptEl.querySelector('.ww-action-btn.btn-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._showDeleteConfirmation(promptId, prompt);
        });

        // Click prompt to edit (but not on action buttons or drag handle)
        promptEl.addEventListener('click', (e) => {
            // Don't trigger edit if clicking on buttons or drag handle
            if (e.target.closest('.ww-prompt-actions') || 
                e.target.closest('.ww-prompt-drag-handle')) {
                return;
            }
            
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
        
        // Show/hide delete button (only for existing prompts)
        if (promptId) {
            this.elements.promptModalDeleteBtn.style.display = 'block';
        } else {
            this.elements.promptModalDeleteBtn.style.display = 'none';
        }
        
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
        this.elements.promptModal.classList.add('show');
        
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
        this.elements.promptModal.classList.remove('show');
        this.currentEditingPromptId = null;
    }

    /**
     * Handles delete from modal with confirmation
     * @private
     */
    _handleDeleteFromModal() {
        if (!this.currentEditingPromptId) {
            return;
        }

        // Store the prompt ID before closing the modal
        const promptIdToDelete = this.currentEditingPromptId;
        const promptData = this.stateService?.prompts?.getPrompt(promptIdToDelete);
        const promptName = promptData?.buttonText || promptIdToDelete;
        
        if (confirm(`Are you sure you want to delete the prompt "${promptName}"?\n\nThis action cannot be undone.`)) {
            // Close the modal first
            this.closePromptModal();
            
            // Call the delete handler with the stored ID
            if (this.handlers.onDeletePrompt) {
                this.handlers.onDeletePrompt(promptIdToDelete);
            }
        }
    }

    /**
     * Validates prompt ID (lowercase, numbers, dash only)
     * @param {string} id - The ID to validate
     * @returns {boolean} Whether the ID is valid
     * @private
     */
    _validatePromptId(id) {
        // Allow lowercase letters, numbers, and dashes only
        const validPattern = /^[a-z0-9-]+$/;
        return validPattern.test(id);
    }

    /**
     * Handles Save As functionality - prompts for new ID
     * @private
     */
    _handleSaveAsPrompt() {
        const currentId = this.elements.promptId.value.trim() || this.currentEditingPromptId;
        const suggestedId = currentId ? `${currentId}-copy` : 'new-prompt';
        
        let newId = prompt(`Enter new prompt ID (lowercase, numbers, dash only):`, suggestedId);
        
        if (newId === null) {
            return; // User cancelled
        }
        
        newId = newId.trim().toLowerCase();
        
        if (!newId) {
            alert('Please enter a valid ID');
            return;
        }
        
        if (!this._validatePromptId(newId)) {
            alert('ID must contain only lowercase letters, numbers, and dashes');
            return;
        }
        
        // Check if prompt already exists
        if (this.stateService && this.stateService.prompts && this.stateService.prompts.getPrompt(newId)) {
            if (!confirm(`A prompt with ID "${newId}" already exists. Do you want to overwrite it?`)) {
                return;
            }
        }
        
        // Temporarily set the ID and save
        const originalId = this.elements.promptId.value;
        const originalDisabled = this.elements.promptId.disabled;
        
        this.elements.promptId.value = newId;
        this.elements.promptId.disabled = false;
        
        // Save with new ID
        this._handleSavePrompt(true);
        
        // Restore original ID field state if save failed
        // Note: If save succeeds, the modal will close and this won't matter
    }

    /**
     * Handles saving a prompt from the modal
     * @param {boolean} isSaveAs - Whether this is a "Save As" operation
     * @private
     */
    _handleSavePrompt(isSaveAs = false) {
        // Get form data
        const promptId = this.elements.promptId.value.trim() || this.currentEditingPromptId;
        if (!promptId) {
            alert('Please enter a Prompt ID');
            this.elements.promptId.focus();
            return;
        }

        // Validate prompt ID format
        if (!this._validatePromptId(promptId)) {
            alert('Prompt ID must contain only lowercase letters, numbers, and dashes');
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
        this.elements.deletePromptDetails.innerHTML = `
            <div class="prompt-info">
                <strong>${prompt.buttonIcon} ${this._escapeHtml(prompt.buttonText)}</strong>
            </div>
            <div class="prompt-id-small">ID: ${promptId}</div>
        `;
        
        // Store promptId in the modal itself for the confirmation handler
        this.elements.deleteModal.dataset.promptId = promptId;
        this.elements.deleteModal.classList.add('show');
    }

    /**
     * Hides the delete confirmation modal
     * @private
     */
    _hideDeleteModal() {
        this.elements.deleteModal.classList.remove('show');
        delete this.elements.deleteModal.dataset.promptId;
    }

    /**
     * Handles confirmed deletion
     * @private
     */
    _handleConfirmDelete() {
        const promptId = this.elements.deleteModal.dataset.promptId;
        this._hideDeleteModal();
        
        if (promptId && this.handlers.onDeletePrompt) {
            this.handlers.onDeletePrompt(promptId);
        }
    }

    /**
     * Updates search UI elements
     * @param {string} searchTerm - The search term
     * @private
     */
    _updateSearchUI(searchTerm) {
        // Show/hide clear button
        if (this.elements.searchClearBtn) {
            this.elements.searchClearBtn.style.display = searchTerm ? 'flex' : 'none';
        }
        
        // Show/hide search results
        if (this.elements.searchResults) {
            this.elements.searchResults.style.display = searchTerm ? 'block' : 'none';
        }
    }

    /**
     * Handles search using the state service search method
     * @param {string} searchTerm - The search term
     * @private
     */
    async _handleSearch(searchTerm) {
        if (!this.handlers.onSearchPrompts) {
            logger.warn('PromptsPanel', 'No search handler available');
            return;
        }
        
        try {
            // Use the state service search method
            const searchResults = await this.handlers.onSearchPrompts(searchTerm);
            
            // Re-render with search results
            this.renderPrompts(searchResults);
            
            // Update search results display
            if (this.elements.searchResults && this.elements.visibleCount && this.elements.totalCount) {
                const resultCount = Object.keys(searchResults).length;
                const totalCount = this.stateService ? Object.keys(this.stateService.prompts.getAllPrompts()).length : 0;
                
                this.elements.visibleCount.textContent = resultCount;
                this.elements.totalCount.textContent = totalCount;
            }
            
        } catch (error) {
            logger.error('PromptsPanel', 'Search failed:', error);
        }
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
     * Sets up drag and drop for a prompt element
     * @param {HTMLElement} promptEl - The prompt element
     * @param {string} promptId - The prompt ID
     * @private
     */
    _setupDragAndDrop(promptEl, promptId) {
        const dragHandle = promptEl.querySelector('.ww-prompt-drag-handle');
        
        // Make the entire card draggable when grabbing the handle
        dragHandle.addEventListener('mousedown', (e) => {
            promptEl.setAttribute('draggable', 'true');
            promptEl.classList.add('dragging');
        });
        
        // Remove draggable when mouse up
        document.addEventListener('mouseup', () => {
            promptEl.setAttribute('draggable', 'false');
            promptEl.classList.remove('dragging');
        });
        
        // Drag start
        promptEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', promptId);
            promptEl.classList.add('dragging');
            
            // Store the dragging element
            this._draggedElement = promptEl;
            this._draggedPromptId = promptId;
            
            // Enable mousewheel scrolling during drag
            this._enableMousewheelScrolling();
        });
        
        // Drag over
        promptEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (this._draggedElement && this._draggedElement !== promptEl) {
                const rect = promptEl.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                
                if (e.clientY < midpoint) {
                    promptEl.classList.add('drag-over-top');
                    promptEl.classList.remove('drag-over-bottom');
                } else {
                    promptEl.classList.add('drag-over-bottom');
                    promptEl.classList.remove('drag-over-top');
                }
                
                // Auto-scroll when dragging near edges
                this._handleAutoScroll(e);
            }
        });
        
        // Drag leave
        promptEl.addEventListener('dragleave', () => {
            promptEl.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        
        // Drop
        promptEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            promptEl.classList.remove('drag-over-top', 'drag-over-bottom');
            
            if (!this._draggedPromptId || this._draggedPromptId === promptId) {
                return;
            }
            
            // Get all prompt elements in their current order
            const allPromptEls = Array.from(this.elements.promptsContainer.querySelectorAll('.ww-prompt-card'));
            const draggedIndex = allPromptEls.findIndex(el => el.querySelector('[data-prompt-id]')?.dataset.promptId === this._draggedPromptId);
            const targetIndex = allPromptEls.findIndex(el => el === promptEl);
            
            if (draggedIndex === -1 || targetIndex === -1) return;
            
            // Determine if we're inserting before or after based on mouse position
            const rect = promptEl.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const insertBefore = e.clientY < midpoint;
            
            // Calculate new position (1-based for state method)
            // targetIndex is 0-based, state method expects 1-based positions
            const newPosition = insertBefore ? targetIndex + 1 : targetIndex + 2;
            
            // Update the prompt order
            if (this.handlers.onReorderPrompt) {
                await this.handlers.onReorderPrompt(this._draggedPromptId, newPosition);
            }
        });
        
        // Drag end
        promptEl.addEventListener('dragend', () => {
            promptEl.classList.remove('dragging');
            promptEl.setAttribute('draggable', 'false');
            this._draggedElement = null;
            this._draggedPromptId = null;
            
            // Clean up any remaining drag-over classes
            document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-bottom');
            });
            
            // Stop auto-scroll animation
            if (this._scrollAnimationId) {
                cancelAnimationFrame(this._scrollAnimationId);
                this._scrollAnimationId = null;
            }
            
            // Disable mousewheel scrolling
            this._disableMousewheelScrolling();
        });
    }

    /**
     * Enable mousewheel scrolling during drag operations
     * @private
     */
    _enableMousewheelScrolling() {
        if (this._mousewheelHandler) return; // Already enabled
        
        this._mousewheelHandler = (e) => {
            // Allow normal mousewheel scrolling during drag
            // The deltaY value is positive for scrolling down, negative for up
            const scrollAmount = e.deltaY;
            window.scrollBy(0, scrollAmount);
            
            // Don't prevent default - let normal scrolling work
        };
        
        // Use passive listener for better performance
        document.addEventListener('wheel', this._mousewheelHandler, { passive: true });
    }
    
    /**
     * Disable mousewheel scrolling (cleanup)
     * @private
     */
    _disableMousewheelScrolling() {
        if (this._mousewheelHandler) {
            document.removeEventListener('wheel', this._mousewheelHandler);
            this._mousewheelHandler = null;
        }
    }

    /**
     * Handle auto-scrolling during drag operations
     * @param {DragEvent} e - The drag event
     * @private
     */
    _handleAutoScroll(e) {        
        const viewportHeight = window.innerHeight;
        const scrollThreshold = 200; // Distance from edge to start scrolling
        const maxScrollSpeed = 8;
        
        // Clear any existing scroll animation
        if (this._scrollAnimationId) {
            cancelAnimationFrame(this._scrollAnimationId);
            this._scrollAnimationId = null;
        }
        
        let scrollDirection = 0;
        let scrollSpeed = 0;
        
        // Check if we're near the top edge of the viewport
        if (e.clientY < scrollThreshold) {
            scrollDirection = -1; // Scroll up
            const intensity = 1 - (e.clientY / scrollThreshold);
            scrollSpeed = Math.max(1, maxScrollSpeed * intensity);
        }
        // Check if we're near the bottom edge of the viewport
        else if (e.clientY > viewportHeight - scrollThreshold) {
            scrollDirection = 1; // Scroll down
            const distanceFromBottom = viewportHeight - e.clientY;
            const intensity = 1 - (distanceFromBottom / scrollThreshold);
            scrollSpeed = Math.max(1, maxScrollSpeed * intensity);
        }
        
        // Start continuous scrolling if needed
        if (scrollDirection !== 0) {
            const doScroll = () => {
                window.scrollBy(0, scrollDirection * scrollSpeed);
                this._scrollAnimationId = requestAnimationFrame(doScroll);
            };
            this._scrollAnimationId = requestAnimationFrame(doScroll);
        }
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