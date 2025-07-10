import { EVENTS } from '../core/events.js';

export class PanelEventHandlers {
    constructor(core) {
        this.core = core;
        this.eventBus = core.eventBus;
        this.stateService = core.stateService;
    }

    /**
     * Setup Event Listeners
     */
    setupEventListeners() {
        this.eventBus.onAsync(EVENTS.STASH.ADD, this.handleStashAdd.bind(this));
        this.eventBus.onAsync(EVENTS.STASH.SAVE, this.handleSaveStash.bind(this));
        this.eventBus.onAsync(EVENTS.STASH.CLEAR, this.handleStashClearAll.bind(this));
        this.eventBus.onAsync(EVENTS.STASH.REMOVE, this.handleStashRemove.bind(this));
        this.eventBus.onAsync(EVENTS.STASH.LOAD, this.handleLoadStash.bind(this));
    }

    /**
     * Handle stash add request
     * @param {Object} data - { uri, content }
     * @param {Object} options - { autoSave: boolean }
     */
    async handleStashAdd(data, { autoSave = true, ...options } = {}) {
        console.log('[MCPApp] Handling stash add request:', data);
        if (!this.stateService || !this.stateService.stash) {
            console.error('[MCPApp] No stash service available');
            return;
        }

        const { uri, content } = data;
        if (!uri || !content) {
            console.error('[MCPApp] Invalid stash add request:', data);
            return;
        }

        const added = this.stateService.stash.set(uri, content);

        if (added) {
            console.log(`[MCPApp] Added ${uri} to stash`);
            if (autoSave) {
                await this.handleSaveStash(false);
            }
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri, added: true, saved: true, ...options });
        } else {
            console.log(`[MCPApp] ${uri} was already in stash`);
        }
    }

    /**
     * Handle stash remove request
     * @param {Object} data - { uri }
     * @param {Object} options - { autoSave: boolean }
     */
    async handleStashRemove(data, { autoSave = true, ...options } = {}) {
        if (!this.stateService || !this.stateService.stash) {
            console.error('[MCPApp] No stash service available', this.stateService, this.stateService?.stash);
            return;
        }

        const { uri } = data;
        if (!uri) {
            console.error('[MCPApp] Invalid stash remove request:', data);
            return;
        }

        const removed = this.stateService.stash.delete(uri);
        
        if (removed) {
            console.log(`[MCPApp] Removed ${uri} from stash`);
            if (autoSave) {
                await this.handleSaveStash(false);
            }
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri, removed: true, saved: true, ...options });
        } else {
            console.log(`[MCPApp] ${uri} was not in stash`);
        }
    }

    /**
     * Handle stash clear all request
     */
    async handleStashClearAll() {
        if (!this.stateService || !this.stateService.stash) {
            console.error('[MCPApp] No stash service available');
            return;
        }

        this.stateService.stash.clearAll();
        console.log('[MCPApp] Cleared all stash content');
        await this.handleSaveStash(false);
        this.eventBus.emit(EVENTS.STASH.UPDATED, { uri: 'all', cleared: true, saved: true, ...options });
    }

    /**
     * Save stash data to storage
     */
    async handleSaveStash(announce = true, options = {}) {
        if (!this.stateService || !this.stateService.stash) return;
        
        try {
            await this.stateService.stash.saveToStorage();
            console.log('[MCPApp] Stash data saved successfully');
            if (announce) {
                this.eventBus.emit(EVENTS.STASH.SAVED, options);
            }
        } catch (error) {
            console.error('[MCPApp] Failed to save stash data:', error);
        }
    }

    /**
     * Handle loading the stash from storage
     */
    async handleLoadStash(options) {
        if (!this.stateService || !this.stateService.stash) return;
        try {
            await this.stateService.stash.loadFromStorage();
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri: 'all', loaded: true, saved: true, ...options });
        } catch (error) {
            console.error('[MCPApp] Failed to load stash data:', error);
        }
    }
}