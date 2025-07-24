// src/js/client/panel-event-handlers.js
import { EVENTS } from '../core/events.js';

export class PanelEventHandlers {
    constructor(core) {
        this.core = core;
        this.eventBus = core.eventBus;
        this.stateService = core.stateService;
    }

    setupEventListeners() {
        this.setupStashListeners();
        this.setupSettingsListeners();
        this.setupChatListeners();
    }

    /**
     * Setup Event Listeners
     */
    setupStashListeners() {
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
        console.log('[PanelEventHandlers] Handling stash add request:', data);
        if (!this.stateService || !this.stateService.stash) {
            console.error('[PanelEventHandlers] No stash service available');
            return;
        }

        const { uri, content } = data;
        if (!uri || !content) {
            console.error('[PanelEventHandlers] Invalid stash add request:', data);
            return;
        }

        const added = this.stateService.stash.set(uri, content);

        if (added) {
            console.log(`[PanelEventHandlers] Added ${uri} to stash`);
            if (autoSave) {
                await this.handleSaveStash(false);
            }
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri, added: true, saved: true, ...options });
        } else {
            console.log(`[PanelEventHandlers] ${uri} was already in stash`);
        }
    }

    /**
     * Handle stash remove request
     * @param {Object} data - { uri }
     * @param {Object} options - { autoSave: boolean }
     */
    async handleStashRemove(data, { autoSave = true, ...options } = {}) {
        if (!this.stateService || !this.stateService.stash) {
            console.error('[PanelEventHandlers] No stash service available', this.stateService, this.stateService?.stash);
            return;
        }

        const { uri } = data;
        if (!uri) {
            console.error('[PanelEventHandlers] Invalid stash remove request:', data);
            return;
        }

        const removed = this.stateService.stash.delete(uri);
        
        if (removed) {
            console.log(`[PanelEventHandlers] Removed ${uri} from stash`);
            if (autoSave) {
                await this.handleSaveStash(false);
            }
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri, removed: true, saved: true, ...options });
        } else {
            console.log(`[PanelEventHandlers] ${uri} was not in stash`);
        }
    }

    /**
     * Handle stash clear all request
     */
    async handleStashClearAll() {
        if (!this.stateService || !this.stateService.stash) {
            console.error('[PanelEventHandlers] No stash service available');
            return;
        }

        this.stateService.stash.clearAll();
        console.log('[PanelEventHandlers] Cleared all stash content');
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
            console.log('[PanelEventHandlers] Stash data saved successfully');
            if (announce) {
                this.eventBus.emit(EVENTS.STASH.SAVED, options);
            }
        } catch (error) {
            console.error('[PanelEventHandlers] Failed to save stash data:', error);
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
            console.error('[PanelEventHandlers] Failed to load stash data:', error);
        }
    }

    /**
     * Setup settings listeners
     */
    setupSettingsListeners() {
        this.eventBus.onAsync(EVENTS.SETTINGS.CHANGE, this.handleSettingsChange.bind(this));
    }

    /**
     * Handle settings change event
     */
    async handleSettingsChange(data) {
        if (!this.stateService || !this.stateService.settings) {
            console.error('[PanelEventHandlers] No settings service available');
            return;
        }
        try {
            console.log('[PanelEventHandlers] Handling settings changed event:', data);
            await this.stateService.settings.saveToStorage();
        } catch (error) {
            console.error('[PanelEventHandlers] Failed to save settings:', error);
        }
    }

    /**
     * Setup chat listeners
     */
    setupChatListeners() {
        this.eventBus.onAsync(EVENTS.CHAT.CREATE_NEW_THREAD, this.handleCreateNewThread.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.EXECUTE_TOOL, this.handleExecuteTool.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.CANCEL_TOOL, this.handleCancelTool.bind(this));
    }

    /**
     * Handle create new thread event
     */
    async handleCreateNewThread(data) {
        console.log('[PanelEventHandlers] Handling create new thread event:', data);
        if (!this.stateService || !this.stateService.conversation || !this.stateService.disk) {
            console.error('[PanelEventHandlers] State service or required plugins missing');
            return;
        }
        const threadId = this.stateService.conversation.createNewConversation();
        // Save to disk
        await this.stateService.disk.saveToStorage();
        // Emit event to notify listeners (e.g., chat panel) of new thread
        this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
            conversation: {
                threadId: threadId,
                messages: [],
                metadata: this.stateService.state.conversation.metadata[threadId]
            }
        });
        return {
            success: true,
            threadId: threadId
        };
    }

    /**
     * Handle execute tool event
     */
    async handleExecuteTool(data) {
        console.log('[PanelEventHandlers] Handling execute tool event:', data);
        try {
            const { callId, name } = data;
            // We need to look up the threadId and the messageId for the callId
            const { threadId, messageId } = this.stateService.conversation.getThreadAndMessageForCallId(callId);
            const toolResult = await this.core.mcpConnector.executeTool(name, {}, {callId});
            // Update the conversation state with the tool result
            this.stateService.conversation.updateToolResult(threadId, messageId, callId, toolResult);
            console.log('[PanelEventHandlers] Updated tool result (saving to disk):', this.stateService.state.conversation.history[threadId]);
            // Save to disk
            await this.stateService.disk.saveToStorage();

            // Emit event to notify listeners (e.g., chat panel) of tool result
            this.eventBus.emit(EVENTS.CHAT.TOOL_RESULT, { threadId, messageId, callId, toolResult });
            return {
                success: true,
                threadId: threadId,
                messageId: messageId,
                callId: callId,
                toolResult: toolResult
            };
        } catch (error) {
            console.error('[PanelEventHandlers] Failed to execute tool:', error);
        }
    }

    /**
     * Handle cancel tool event
     */
    async handleCancelTool(data) {
        console.log('[PanelEventHandlers] Handling cancel tool event:', data);
        return {
            success: true,
            threadId: data.threadId,
            messageId: data.messageId,
            callId: data.callId
        };
    }

}