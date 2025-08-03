import './emoji-browser.scss';

/**
 * EmojiBrowser
 * A modal emoji picker that returns a promise with the selected emoji.
 * Usage: const emoji = await emojiBrowser.open();
 */
export class EmojiBrowser {
    constructor() {
        this.container = null;
        this.searchInput = null;
        this.isOpen = false;
        this.resolvePromise = null;
        this.rejectPromise = null;
        
        // Common emoji categories for prompt/action icons
        this.categories = {
            'Actions': ['📖', '📊', '📝', '🎯', '🔍', '💡', '⚡', '🚀', '🎨', '✨', '🔧', '⚙️', '🛠️', '🔨', '📋'],
            'Analysis': ['📈', '📉', '📊', '💹', '📌', '🎯', '🔬', '🔭', '🗂️', '📂', '📁', '🗃️', '🏷️'],
            'Communication': ['💬', '💭', '🗨️', '💡', '📢', '📣', '🔔', '📞', '✉️', '📧', '📨', '📩', '📮'],
            'Documents': ['📄', '📃', '📑', '📜', '📋', '📝', '📖', '📚', '📰', '🗞️', '📓', '📔', '📒', '📕', '📗'],
            'Status': ['✅', '❌', '⚠️', '❗', '❓', '‼️', '⁉️', '🚨', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣'],
            'Tech': ['💻', '🖥️', '⌨️', '🖱️', '💾', '💿', '📀', '🔌', '🔋', '📡', '🛰️', '🤖', '👾', '🕹️'],
            'Time': ['⏰', '⏱️', '⏲️', '🕐', '📅', '📆', '🗓️', '⏳', '⌛', '⏮️', '⏭️', '⏯️', '⏸️', '⏹️'],
            'Nature': ['🌟', '⭐', '✨', '💫', '☀️', '🌤️', '⛅', '☁️', '🌈', '🔥', '💧', '🌊', '🍃', '🌿'],
            'Objects': ['🔑', '🗝️', '🔒', '🔓', '🔏', '🔐', '🎁', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉', '🏅'],
            'Arrows': ['⬆️', '⬇️', '⬅️', '➡️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔄']
        };
        
        this._createBrowser();
        this._setupEventListeners();
    }

    /**
     * Creates the browser DOM structure
     * @private
     */
    _createBrowser() {
        this.container = document.createElement('div');
        this.container.className = 'emoji-browser-modal ww-modal';
        this.container.style.display = 'none';
        
        this.container.innerHTML = `
            <div class="emoji-browser-overlay"></div>
            <div class="emoji-browser-content">
                <div class="emoji-browser-header">
                    <h3>Choose an Icon</h3>
                    <button class="emoji-close-btn">&times;</button>
                </div>
                <div class="emoji-browser-search">
                    <input type="text" class="emoji-search" placeholder="Search emojis...">
                </div>
                <div class="emoji-browser-categories">
                    ${Object.entries(this.categories).map(([category, emojis]) => `
                        <div class="emoji-category" data-category="${category}">
                            <h4 class="emoji-category-title">${category}</h4>
                            <div class="emoji-grid">
                                ${emojis.map(emoji => `
                                    <button class="emoji-item" data-emoji="${emoji}" title="${category}">${emoji}</button>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        this.searchInput = this.container.querySelector('.emoji-search');
    }

    /**
     * Sets up event listeners
     * @private
     */
    _setupEventListeners() {
        // Close button
        this.container.querySelector('.emoji-close-btn').addEventListener('click', () => {
            this.close();
        });
        
        // Overlay click
        this.container.querySelector('.emoji-browser-overlay').addEventListener('click', () => {
            this.close();
        });
        
        // Emoji selection
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('emoji-item')) {
                const emoji = e.target.dataset.emoji;
                this._selectEmoji(emoji);
            }
        });
        
        // Search functionality
        this.searchInput.addEventListener('input', (e) => {
            this._filterEmojis(e.target.value);
        });
        
        // Close on escape
        this._escapeHandler = (e) => {
            if (this.isOpen && e.key === 'Escape') {
                this.close();
            }
        };
    }

    /**
     * Opens the emoji browser and returns a promise
     * @returns {Promise<string>} The selected emoji
     */
    open() {
        if (this.isOpen) {
            return Promise.reject(new Error('Emoji browser is already open'));
        }
        
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            
            // Show modal
            this.container.style.display = 'flex';
            this.isOpen = true;
            
            // Add escape listener
            document.addEventListener('keydown', this._escapeHandler);
            
            // Focus search and reset
            setTimeout(() => {
                this.searchInput.focus();
                this.searchInput.value = '';
                this._filterEmojis('');
            }, 50);
        });
    }

    /**
     * Closes the emoji browser
     */
    close() {
        if (!this.isOpen) return;
        
        this.container.style.display = 'none';
        this.isOpen = false;
        
        // Remove escape listener
        document.removeEventListener('keydown', this._escapeHandler);
        
        // Reject promise if still pending
        if (this.rejectPromise) {
            this.rejectPromise(new Error('Emoji browser closed without selection'));
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
    }

    /**
     * Handles emoji selection
     * @param {string} emoji - The selected emoji
     * @private
     */
    _selectEmoji(emoji) {
        if (this.resolvePromise) {
            this.resolvePromise(emoji);
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
        
        this.close();
    }

    /**
     * Filters emojis based on search term
     * @param {string} searchTerm - The search term
     * @private
     */
    _filterEmojis(searchTerm) {
        const term = searchTerm.toLowerCase();
        const categories = this.container.querySelectorAll('.emoji-category');
        
        categories.forEach(category => {
            const categoryName = category.dataset.category.toLowerCase();
            const emojiItems = category.querySelectorAll('.emoji-item');
            let hasVisibleEmoji = false;
            
            // Show/hide individual emojis
            emojiItems.forEach(item => {
                const matchesCategory = !term || categoryName.includes(term);
                const matchesEmoji = !term || item.textContent.includes(term);
                const isVisible = matchesCategory || matchesEmoji;
                
                item.style.display = isVisible ? '' : 'none';
                if (isVisible) hasVisibleEmoji = true;
            });
            
            // Show/hide entire category
            category.style.display = hasVisibleEmoji ? '' : 'none';
        });
    }

    /**
     * Updates the emoji categories (for customization)
     * @param {Object} categories - New categories object
     */
    updateCategories(categories) {
        this.categories = categories;
        
        // Rebuild the browser
        this.container.remove();
        this._createBrowser();
        this._setupEventListeners();
    }

    /**
     * Destroys the browser and removes event listeners
     */
    destroy() {
        if (this.container) {
            this.container.remove();
        }
        
        document.removeEventListener('keydown', this._escapeHandler);
        this.resolvePromise = null;
        this.rejectPromise = null;
    }
}

// Export singleton instance for easy use
export const emojiBrowser = new EmojiBrowser();