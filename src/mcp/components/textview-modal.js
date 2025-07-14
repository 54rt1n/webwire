import './textview.scss';
import { StashButton } from './stash-button.js';

/**
 * TextViewModal
 * A self-injecting modal component for displaying file contents.
 * Creates and manages its own DOM elements and lifecycle.
 */
export class TextViewModal {
    constructor() {
        this.eventBus = null;
        this.modal = null;
        this.isOpen = false;
        this.onClose = null;
        this.stateService = null;
        this.stashButton = null;
        this.currentFilePath = null;
    }

    /**
     * Opens the modal with the specified file content.
     * @param {string} fileName - The name of the file being displayed
     * @param {string} content - The file content to display
     * @param {Function} onClose - Optional callback when modal is closed
     */
    open(fileName, content, onClose = null) {
        if (this.isOpen) {
            this.close();
        }

        this.currentFilePath = fileName;
        this.onClose = onClose;
        this.isOpen = true;
        this._createModal(fileName, content);
        this._attachEventListeners();
        
        // Add to DOM and show
        document.body.appendChild(this.modal);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            this.modal.classList.add('modal-visible');
        });

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Closes the modal and cleans up.
     */
    close() {
        if (!this.isOpen || !this.modal) return;

        this.isOpen = false;
        
        // Trigger exit animation
        this.modal.classList.remove('modal-visible');
        
        // Remove from DOM after animation
        setTimeout(() => {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            this.modal = null;
            
            // Restore body scroll
            document.body.style.overflow = '';
            
            // Call onClose callback if provided
            if (this.onClose) {
                this.onClose();
                this.onClose = null;
            }
        }, 200); // Match CSS transition duration
    }

    /**
     * Creates the modal DOM structure.
     * @param {string} fileName - The name of the file
     * @param {string} content - The file content
     * @private
     */
    _createModal(fileName, content) {
        this.modal = document.createElement('div');
        this.modal.className = 'textview-modal-overlay';
        
        this.modal.innerHTML = `
            <div class="textview-modal">
                <div class="textview-modal-header">
                    <h2 class="textview-modal-title">${this._escapeHtml(fileName)}</h2>
                    <div class="textview-modal-actions">
                        <div class="textview-modal-stash-container"></div>
                        <button class="btn btn-icon textview-modal-close" title="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="textview-modal-content">
                     <textarea 
                         class="textview-modal-textarea" 
                         readonly 
                         placeholder="Loading file content..."
                     ></textarea>
                </div>
             </div>
         `;
         
         // Set textarea content safely (avoids double-escaping)
         const textarea = this.modal.querySelector('.textview-modal-textarea');
         textarea.value = content;
    }

    /**
     * Attaches event listeners for modal interactions.
     * @private
     */
    _attachEventListeners() {
        // Close button
        const closeBtn = this.modal.querySelector('.textview-modal-close');
        closeBtn.addEventListener('click', () => this.close());

        // Close on overlay click (but not on modal content click)
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Close on Escape key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        // Store reference to remove listener later
        this.modal._keydownHandler = handleKeyDown;

        // Add stash button if state service is available
        this._addStashButton();
    }

    /**
     * Escapes HTML special characters.
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Updates the content of an already open modal.
     * @param {string} content - The new content to display
     */
    updateContent(content) {
        if (!this.isOpen || !this.modal) return;
        
        const textarea = this.modal.querySelector('.textview-modal-textarea');
        if (textarea) {
            textarea.value = content;
            textarea.classList.remove('loading');
        }
    }

    /**
     * Sets the modal to loading state.
     */
    setLoading() {
        if (!this.isOpen || !this.modal) return;
        
        const textarea = this.modal.querySelector('.textview-modal-textarea');
        if (textarea) {
            textarea.value = '';
            textarea.placeholder = 'Loading file content...';
            textarea.classList.add('loading');
        }
    }

    /**
     * Add stash button to the modal if state service is available
     * @private
     */
    _addStashButton() {
        if (!this.stateService || !this.currentFilePath) return;
        
        const stashContainer = this.modal.querySelector('.textview-modal-stash-container');
        if (!stashContainer) return;
        
        // Create stash button
        this.stashButton = new StashButton(this.eventBus, this.stateService);
        const button = this.stashButton.create(this.currentFilePath, 'fs', {
            size: 'icon',
            onToggle: async (stashedUri, isStashed) => {
                console.log(`[TextViewModal] ${isStashed ? 'Added to' : 'Removed from'} stash: ${stashedUri}`);
                this.eventBus.emit(isStashed ? EVENTS.STASH.ADD : EVENTS.STASH.REMOVE, { uri: stashedUri, isStashed, type: 'fs' });
            }
        });
        
        stashContainer.appendChild(button);
    }

    /**
     * Set the state service for stash functionality
     * @param {Object} stateService - The state service instance
     * @param {Function} saveStashFn - Function to call when stash needs to be saved
     */
    setStateService(eventBus, stateService, saveStashFn = null) {
        this.eventBus = eventBus;
        this.stateService = stateService;
        this.saveStashFn = saveStashFn;
    }

    /**
     * Checks if the modal is currently open.
     * @returns {boolean} True if modal is open
     */
    get isVisible() {
        return this.isOpen;
    }
}