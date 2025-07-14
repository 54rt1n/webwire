// StashPanel - Floating stash viewer for MCP
import './stash-panel.scss';

export class StashPanel {
    constructor(eventBus, stateService) {
        this.eventBus = eventBus;
        this.stateService = stateService;
        this.panel = null;
        this.isVisible = false;
        this._onStashUpdated = this._onStashUpdated.bind(this);
        this._onRemoveClick = this._onRemoveClick.bind(this);
    }

    initialize() {
        this.show();
    }

    show() {
        if (this.panel) return;
        this._createPanel();
        document.body.appendChild(this.panel);
        this.isVisible = true;
        this._renderItems();
        this._attachListeners();
    }

    hide() {
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        this.panel = null;
        this.isVisible = false;
        this._detachListeners();
    }

    _createPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'ww-stash-panel stash-panel-box';
        this.panel.innerHTML = `
            <div class="stash-panel-header">Stash</div>
            <ul class="stash-panel-list"></ul>
        `;
    }

    _renderItems() {
        if (!this.stateService || !this.stateService.stash) return;
        const items = this.stateService.stash.getAllKeys('mcp');
        // Hide the panel if empty
        if (items.length === 0) {
            this.hide();
            return;
        }
        // Show the panel if not visible
        if (!this.isVisible) {
            this.show();
            return;
        }
        if (!this.panel) return;
        const list = this.panel.querySelector('.stash-panel-list');
        list.innerHTML = '';
        items.forEach(uri => {
            const li = document.createElement('li');
            li.className = 'stash-panel-item';
            li.setAttribute('data-uri', uri);
            li.innerHTML = `
                <span class="stash-panel-label">${this._shortLabel(uri)}</span>
                <button class="stash-panel-remove" title="Remove">&times;</button>
            `;
            list.appendChild(li);
        });
    }

    _attachListeners() {
        if (!this.eventBus) return;
        this.eventBus.on('stash:updated', this._onStashUpdated);
        if (this.panel) {
            this.panel.addEventListener('click', this._onRemoveClick);
        }
    }

    _detachListeners() {
        if (!this.eventBus) return;
        this.eventBus.off('stash:updated', this._onStashUpdated);
        if (this.panel) {
            this.panel.removeEventListener('click', this._onRemoveClick);
        }
    }

    _onStashUpdated() {
        this._renderItems();
    }

    _onRemoveClick(e) {
        if (e.target.classList.contains('stash-panel-remove')) {
            const li = e.target.closest('.stash-panel-item');
            if (li) {
                const uri = li.getAttribute('data-uri');
                this.eventBus.emit('stash:remove', { uri });
            }
        }
    }

    _shortLabel(uri) {
        // Show a short label for the stash item
        return uri;
    }
} 