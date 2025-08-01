import { EventBindableComponent } from '../../js/core/event-bindable-panel.js';
import { EVENTS } from '../../js/core/events.js';
import { logger } from '../../js/core/logging.js';

/**
 * StashButton - A reusable component for adding/removing items from the MCP stash
 * Uses EventBus to communicate with MCP system for content fetching and storage
 */
export class StashButton extends EventBindableComponent {
    constructor(eventBus, stateService) {
        super(eventBus);
        this.stateService = stateService;
        this.button = null;
        this.currentUri = null;
        this.currentSource = null;
        this.onToggle = null; // Optional callback when stash state changes
        
        // Listen for stash updates
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for stash updates
     */
    setupEventListeners() {
        // Listen for stash updates to refresh button state
        this.on('stash:updated', (data) => {
            if (data.uri === this.currentUri) {
                this._updateButton();
            }
        });
    }

    /**
     * Create a stash button element
     * @param {string} uri - The URI to stash (without prefix)
     * @param {string} source - The source type ('fs', 'kb', 'list')
     * @param {Object} options - Button options
     * @param {string} options.size - Button size ('sm', 'icon', etc.)
     * @param {Function} options.onToggle - Callback when stash state changes
     * @returns {HTMLElement} The button element
     */
    create(uri, source, { size = 'icon', onToggle = null } = {}) {
        this.currentUri = this._formatUri(uri, source);
        this.currentSource = source;
        this.onToggle = onToggle;
        
        this.button = document.createElement('button');
        this.button.className = `btn btn-${size} stash-button`;
        this.button.setAttribute('data-uri', this.currentUri);
        this.button.setAttribute('data-source', this.currentSource);
        
        this._updateButton();
        this._attachEventListener();
        
        return this.button;
    }

    /**
     * Update an existing button's URI and state
     * @param {string} uri - The new URI to stash
     * @param {string} source - The source type ('fs', 'kb', 'list')
     */
    updateUri(uri, source) {
        if (!this.button) return;
        
        this.currentUri = this._formatUri(uri, source);
        this.currentSource = source;
        this.button.setAttribute('data-uri', this.currentUri);
        this.button.setAttribute('data-source', this.currentSource);
        this._updateButton();
    }

    /**
     * Format URI with appropriate prefix
     * @param {string} uri - The URI to format
     * @param {string} source - The source type ('fs', 'kb', 'list')
     * @returns {string} Formatted URI with prefix
     * @private
     */
    _formatUri(uri, source) {
        // If URI already has a proper scheme, use it as-is
        if (uri.includes('://')) {
            return uri;
        }
        
        // Add appropriate prefix
        switch (source) {
            case 'fs':
                return `fs://${uri}`;
            case 'kb':
                return uri.startsWith('kb://') ? uri : `kb://${uri}`;
            case 'list':
                // Convert listName:itemIndex to list://listName/itemIndex
                if (uri.includes(':')) {
                    const [listName, itemIndex] = uri.split(':');
                    return `list://${listName}/${itemIndex}`;
                }
                return `list://${uri}`;
            default:
                return uri;
        }
    }

    /**
     * Check if the current URI is in the stash
     * @returns {boolean} True if URI is in stash
     * @private
     */
    _isInStash() {
        if (!this.currentUri || !this.stateService.stash) return false;
        
        return this.stateService.stash.has(this.currentUri);
    }

    /**
     * Update button appearance based on stash state
     * @private
     */
    _updateButton() {
        if (!this.button) return;
        
        const isStashed = this._isInStash();
        
        // Update button content and styling
        if (isStashed) {
            this.button.innerHTML = this._getRemoveIcon();
            this.button.title = 'Remove from stash';
            this.button.classList.add('stashed');
            this.button.classList.remove('not-stashed');
        } else {
            this.button.innerHTML = this._getAddIcon();
            this.button.title = 'Add to stash';
            this.button.classList.add('not-stashed');
            this.button.classList.remove('stashed');
        }
    }

    /**
     * Get the add icon SVG
     * @returns {string} SVG markup for add icon
     * @private
     */
    _getAddIcon() {
        return `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
        `;
    }

    /**
     * Get the remove icon SVG
     * @returns {string} SVG markup for remove icon
     * @private
     */
    _getRemoveIcon() {
        return `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
            </svg>
        `;
    }

    /**
     * Attach click event listener
     * @private
     */
    _attachEventListener() {
        if (!this.button) return;
        
        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleStash();
        });
    }

    /**
     * Toggle the URI in/out of the stash
     * @private
     */
    _toggleStash() {
        if (!this.currentUri || !this.currentSource) return;
        
        const isStashed = this._isInStash();
        
        if (isStashed) {
            // Emit remove event
            logger.log('StashButton', `Requesting remove from stash: ${this.currentUri}`);
            this.eventBus.emit(EVENTS.STASH.REMOVE, {
                uri: this.currentUri,
                source: this.currentSource
            });
        } else {
            // Emit add event
            logger.log('StashButton', `Requesting add to stash: ${this.currentUri} (${this.currentSource})`);
            this.eventBus.emit(EVENTS.STASH.ADD, {
                uri: this.currentUri,
                source: this.currentSource
            });
        }
        
        // Call onToggle callback if provided
        if (this.onToggle) {
            this.onToggle(this.currentUri, !isStashed);
        }
    }

    /**
     * Get all stashed URIs of a specific source type
     * @param {string} source - The source type to filter by ('fs', 'kb', 'list')
     * @returns {Array<string>} Array of stashed URIs of the specified source type
     */
    getStashedBySource(source) {
        if (!this.stateService.stash) return [];
        
        const prefix = `${source}://`;
        return this.stateService.stash.filterURIs(new RegExp(`^${prefix}`));
    }

    /**
     * Get all stashed URIs
     * @returns {Array<string>} Array of all stashed URIs
     */
    getAllStashed() {
        if (!this.stateService.stash) return [];
        return this.stateService.stash.getAllKeys();
    }

    /**
     * Clear all stashed items (emits clear event)
     */
    clearAll() {
        logger.log('StashButton', 'Requesting clear all stashed items');
        this.eventBus.emit(EVENTS.STASH.CLEAR_ALL);
        this._updateButton();
    }

    /**
     * Destroy the button and clean up event listeners
     */
    destroy() {
        if (this.button) {
            this.button.remove();
            this.button = null;
        }
        // EventBus automatically handles cleanup of listeners
    }
}

/**
 * Factory function to create stash buttons with shared event bus and state service
 * @param {Object} eventBus - The event bus instance
 * @param {Object} stateService - The state service instance
 * @returns {Function} Function that creates StashButton instances
 */
export function createStashButtonFactory(eventBus, stateService) {
    return (uri, source, options = {}) => {
        const button = new StashButton(eventBus, stateService);
        return button.create(uri, source, options);
    };
} 