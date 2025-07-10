import './document-modal.css';
import { StashButton } from './stash-button.js';
import { EVENTS } from '../js/core/events.js';

/**
 * DocumentModal
 * A modal component for displaying knowledge base documents with content and metadata.
 * Features a two-column layout with document content on the left and index metadata on the right.
 */
export class DocumentModal {
    constructor(stateService = null) {
        this.modal = null;
        this.isOpen = false;
        this.onClose = null;
        this.currentDocument = null;
        this.stateService = stateService;
        this.stashButton = null;
    }

    /**
     * Opens the modal with the specified document data.
     * @param {Object} documentData - The document data from KB
     * @param {string} documentData.uri - Document URI
     * @param {string} documentData.content - Document content
     * @param {Object} documentData.index - Document metadata/index
     * @param {Function} onClose - Optional callback when modal is closed
     */
    open(documentData, onClose = null) {
        if (this.isOpen) {
            this.close();
        }

        this.currentDocument = documentData;
        this.onClose = onClose;
        this.isOpen = true;
        this._createModal(documentData);
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
            this.currentDocument = null;
            
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
     * @param {Object} documentData - The document data
     * @private
     */
    _createModal(documentData) {
        this.modal = document.createElement('div');
        this.modal.className = 'document-modal-overlay';
        
        const title = this._extractTitle(documentData);
        
        this.modal.innerHTML = `
            <div class="document-modal">
                <div class="document-modal-header">
                    <h2 class="document-modal-title">${this._escapeHtml(title)}</h2>
                    <div class="document-modal-actions">
                        <div class="document-modal-stash-container"></div>
                        <button class="btn btn-icon document-modal-copy" title="Copy Content">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2Zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6ZM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2Z"/>
                            </svg>
                        </button>
                        <button class="btn btn-icon document-modal-close" title="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="document-modal-body">
                    <div class="document-modal-content">
                        <div class="document-content-wrapper">
                            ${this._renderContent(documentData.content)}
                        </div>
                    </div>
                    <div class="document-modal-sidebar">
                        <h3 class="sidebar-title">Document Metadata</h3>
                        <div class="document-metadata">
                            ${this._renderMetadata(documentData)}
                        </div>
                    </div>
                </div>
             </div>
         `;
    }

    /**
     * Extract a readable title from document data
     * @param {Object} documentData - The document data
     * @returns {string} Document title
     * @private
     */
    _extractTitle(documentData) {
        // Try to get title from index metadata
        if (documentData.index && documentData.index.title) {
            return documentData.index.title;
        }
        
        // Extract from URI
        const uri = documentData.uri || documentData.urn || 'Unknown Document';
        const parts = uri.replace('kb://', '').split('/');
        const name = parts[parts.length - 1];
        
        return name
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Render document content with proper formatting
     * @param {string} content - The document content
     * @returns {string} Formatted HTML content
     * @private
     */
    _renderContent(content) {
        if (!content) {
            return '<div class="empty-content">No content available</div>';
        }

        // Check if content is markdown (simple detection)
        const hasMarkdownIndicators = 
            content.includes('# ') || 
            content.includes('## ') ||
            content.includes('```') ||
            content.includes('- ') ||
            content.includes('* ') ||
            content.includes('[') && content.includes('](');

        if (hasMarkdownIndicators) {
            // Basic markdown rendering (you could use a proper markdown library here)
            return this._renderBasicMarkdown(content);
        }

        // Plain text with line breaks preserved
        return `<pre class="document-text">${this._escapeHtml(content)}</pre>`;
    }

    /**
     * Basic markdown rendering
     * @param {string} markdown - Markdown content
     * @returns {string} HTML content
     * @private
     */
    _renderBasicMarkdown(markdown) {
        let html = this._escapeHtml(markdown);
        
        // Headers
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        
        // Bold and italic
        html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Code blocks
        html = html.replace(/```(.*?)```/gs, '<pre class="code-block">$1</pre>');
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Lists
        html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Line breaks
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';
        
        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');
        
        return `<div class="markdown-content">${html}</div>`;
    }

    /**
     * Render document metadata in a key-value format
     * @param {Object} documentData - The document data
     * @returns {string} HTML for metadata display
     * @private
     */
    _renderMetadata(documentData) {
        const metadata = [];
        
        // Add URI
        metadata.push({
            key: 'URI',
            value: documentData.uri || documentData.urn || 'Unknown'
        });
        
        // Add score if available
        if (documentData.score !== undefined) {
            metadata.push({
                key: 'Relevance Score',
                value: documentData.score.toFixed(3)
            });
        }
        
        // Add index metadata
        if (documentData.index) {
            Object.entries(documentData.index).forEach(([key, value]) => {
                // Format the key
                const formattedKey = key
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase());
                
                // Format the value
                let formattedValue = value;
                if (value instanceof Date) {
                    formattedValue = value.toLocaleString();
                } else if (typeof value === 'object') {
                    formattedValue = JSON.stringify(value, null, 2);
                } else if (typeof value === 'boolean') {
                    formattedValue = value ? 'Yes' : 'No';
                }
                
                metadata.push({
                    key: formattedKey,
                    value: formattedValue
                });
            });
        }
        
        // Add relations if available
        if (documentData.relations && documentData.relations.length > 0) {
            const relationsList = documentData.relations
                .map(rel => `${rel.predicate}: ${rel.target}`)
                .join('\n');
            
            metadata.push({
                key: 'Relations',
                value: relationsList
            });
        }
        
        // Generate HTML
        return metadata.map(item => `
            <div class="metadata-item">
                <div class="metadata-key">${this._escapeHtml(item.key)}</div>
                <div class="metadata-value">${this._escapeHtml(String(item.value))}</div>
            </div>
        `).join('');
    }

    /**
     * Attaches event listeners for modal interactions.
     * @private
     */
    _attachEventListeners() {
        // Close button
        const closeBtn = this.modal.querySelector('.document-modal-close');
        closeBtn.addEventListener('click', () => this.close());

        // Copy button
        const copyBtn = this.modal.querySelector('.document-modal-copy');
        copyBtn.addEventListener('click', () => this._copyContent());

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
     * Copy document content to clipboard
     * @private
     */
    _copyContent() {
        if (!this.currentDocument || !this.currentDocument.content) return;
        
        navigator.clipboard.writeText(this.currentDocument.content).then(() => {
            // Show feedback
            const copyBtn = this.modal.querySelector('.document-modal-copy');
            const originalTitle = copyBtn.title;
            copyBtn.title = 'Copied!';
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.title = originalTitle;
                copyBtn.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy content:', err);
        });
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
     * @param {Object} documentData - The new document data to display
     */
    updateContent(documentData) {
        if (!this.isOpen || !this.modal) return;
        
        this.currentDocument = documentData;
        
        // Update title
        const titleEl = this.modal.querySelector('.document-modal-title');
        titleEl.textContent = this._extractTitle(documentData);
        
        // Update content
        const contentEl = this.modal.querySelector('.document-content-wrapper');
        contentEl.innerHTML = this._renderContent(documentData.content);
        
        // Update metadata
        const metadataEl = this.modal.querySelector('.document-metadata');
        metadataEl.innerHTML = this._renderMetadata(documentData);
        
        // Update stash button
        this._updateStashButton();
    }

    /**
     * Sets the modal to loading state.
     */
    setLoading() {
        if (!this.isOpen || !this.modal) return;
        
        const contentEl = this.modal.querySelector('.document-content-wrapper');
        contentEl.innerHTML = '<div class="loading-content">Loading document content...</div>';
        
        const metadataEl = this.modal.querySelector('.document-metadata');
        metadataEl.innerHTML = '<div class="loading-content">Loading metadata...</div>';
    }

    /**
     * Add stash button to the modal if state service is available
     * @private
     */
    _addStashButton() {
        if (!this.stateService || !this.currentDocument) return;
        
        const stashContainer = this.modal.querySelector('.document-modal-stash-container');
        if (!stashContainer) return;
        
        const uri = this.currentDocument.uri || this.currentDocument.urn;
        if (!uri) return;
        
        // Create stash button
        this.stashButton = new StashButton(this.eventBus, this.stateService);
        const button = this.stashButton.create(uri, 'kb', {
            size: 'icon',
            onToggle: (stashedUri, isStashed) => {
                console.log(`[DocumentModal] ${isStashed ? 'Added to' : 'Removed from'} stash: ${stashedUri}`);
                
                // Emit event through the event bus to notify other components
                if (this.stateService && this.stateService.eventBus) {
                    this.stateService.eventBus.emit(EVENTS.STASH.UPDATED, {
                        uri,
                        isStashed,
                        type: 'kb',
                        source: 'document-modal'
                    });
                }
            }
        });
        
        stashContainer.appendChild(button);
    }

    /**
     * Update stash button when document changes
     * @private
     */
    _updateStashButton() {
        if (!this.stashButton || !this.currentDocument) return;
        
        const uri = this.currentDocument.uri || this.currentDocument.urn;
        if (uri) {
            this.stashButton.updateUri(uri, 'kb');
        }
    }

    /**
     * Set the state service for stash functionality
     * @param {Object} stateService - The state service instance
     */
    setStateService(stateService) {
        this.stateService = stateService;
    }

    /**
     * Checks if the modal is currently open.
     * @returns {boolean} True if modal is open
     */
    get isVisible() {
        return this.isOpen;
    }
}

// Export a singleton instance for convenience (state service will be set later)
export const documentModal = new DocumentModal();