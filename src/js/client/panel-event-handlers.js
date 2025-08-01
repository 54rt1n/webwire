// src/js/client/panel-event-handlers.js
import { EVENTS } from '../core/events.js';
import { EventBindableComponent } from '../core/event-bindable-panel.js';
import { logger } from '../core/logging.js';

export class PanelEventHandlers extends EventBindableComponent {
    constructor(core) {
        super(core.eventBus);
        this.core = core;
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
        this.onAsync(EVENTS.STASH.ADD, this.handleStashAdd);
        this.onAsync(EVENTS.STASH.SAVE, this.handleSaveStash);
        this.onAsync(EVENTS.STASH.CLEAR, this.handleStashClearAll);
        this.onAsync(EVENTS.STASH.REMOVE, this.handleStashRemove);
        this.onAsync(EVENTS.STASH.LOAD, this.handleLoadStash);
    }

    /**
     * Handle stash add request
     * @param {Object} data - { uri, content }
     * @param {Object} options - { autoSave: boolean }
     */
    async handleStashAdd(data, { autoSave = true, ...options } = {}) {
        logger.log('PanelEventHandlers', 'Handling stash add request:', data);
        if (!this.stateService || !this.stateService.stash) {
            logger.error('PanelEventHandlers', 'No stash service available');
            return;
        }

        const { uri, content } = data;
        if (!uri || !content) {
            logger.error('PanelEventHandlers', 'Invalid stash add request:', data);
            return;
        }

        const added = this.stateService.stash.set(uri, content);

        if (added) {
            logger.log('PanelEventHandlers', `Added ${uri} to stash`);
            if (autoSave) {
                await this.handleSaveStash(false);
            }
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri, added: true, saved: true, ...options });
        } else {
            logger.log('PanelEventHandlers', `${uri} was already in stash`);
        }
    }

    /**
     * Handle stash remove request
     * @param {Object} data - { uri }
     * @param {Object} options - { autoSave: boolean }
     */
    async handleStashRemove(data, { autoSave = true, ...options } = {}) {
        if (!this.stateService || !this.stateService.stash) {
            logger.error('PanelEventHandlers', 'No stash service available', this.stateService, this.stateService?.stash);
            return;
        }

        const { uri } = data;
        if (!uri) {
            logger.error('PanelEventHandlers', 'Invalid stash remove request:', data);
            return;
        }

        const removed = this.stateService.stash.delete(uri);
        
        if (removed) {
            logger.log('PanelEventHandlers', `Removed ${uri} from stash`);
            if (autoSave) {
                await this.handleSaveStash(false);
            }
            this.eventBus.emit(EVENTS.STASH.UPDATED, { uri, removed: true, saved: true, ...options });
        } else {
            logger.log('PanelEventHandlers', `${uri} was not in stash`);
        }
    }

    /**
     * Handle stash clear all request
     */
    async handleStashClearAll() {
        if (!this.stateService || !this.stateService.stash) {
            logger.error('PanelEventHandlers', 'No stash service available');
            return;
        }

        this.stateService.stash.clearAll();
        logger.log('PanelEventHandlers', 'Cleared all stash content');
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
            logger.log('PanelEventHandlers', 'Stash data saved successfully');
            if (announce) {
                this.eventBus.emit(EVENTS.STASH.SAVED, options);
            }
        } catch (error) {
            logger.error('PanelEventHandlers', 'Failed to save stash data:', error);
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
            logger.error('PanelEventHandlers', 'Failed to load stash data:', error);
        }
    }

    /**
     * Setup settings listeners
     */
    setupSettingsListeners() {
        this.onAsync(EVENTS.SETTINGS.CHANGE, this.handleSettingsChange);
    }

    /**
     * Handle settings change event
     */
    async handleSettingsChange(data) {
        if (!this.stateService || !this.stateService.settings) {
            logger.error('PanelEventHandlers', 'No settings service available');
            return;
        }
        try {
            logger.log('PanelEventHandlers', 'Handling settings changed event:', data);
            await this.stateService.settings.saveToStorage();
        } catch (error) {
            logger.error('PanelEventHandlers', 'Failed to save settings:', error);
        }
    }

    /**
     * Setup chat listeners
     */
    setupChatListeners() {
        this.onAsync(EVENTS.CHAT.CREATE_NEW_THREAD, this.handleCreateNewThread);
        this.onAsync(EVENTS.CHAT.EXECUTE_TOOL, this.handleExecuteTool);
        this.onAsync(EVENTS.CHAT.CANCEL_TOOL, this.handleCancelTool);
    }

    /**
     * Handle create new thread event
     */
    async handleCreateNewThread(data) {
        logger.log('PanelEventHandlers', 'Handling create new thread event:', data);
        if (!this.stateService || !this.stateService.conversation || !this.stateService.disk) {
            logger.error('PanelEventHandlers', 'State service or required plugins missing');
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
        logger.log('PanelEventHandlers', 'Handling execute tool event:', data);
        try {
            const { callId, name } = data;
            // We need to look up the threadId and the messageId for the callId
            const { threadId, messageId } = this.stateService.conversation.getThreadAndMessageForCallId(callId);
            const toolResult = await this.core.mcpConnector.executeTool(name, {}, {callId});
            // Update the conversation state with the tool result
            this.stateService.conversation.updateToolResult(threadId, messageId, callId, toolResult);
            logger.log('PanelEventHandlers', 'Updated tool result (saving to disk):', this.stateService.state.conversation.history[threadId]);
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
            logger.error('PanelEventHandlers', 'Failed to execute tool:', error);
        }
    }

    /**
     * Handle cancel tool event
     */
    async handleCancelTool(data) {
        logger.log('PanelEventHandlers', 'Handling cancel tool event:', data);
        return {
            success: true,
            threadId: data.threadId,
            messageId: data.messageId,
            callId: data.callId
        };
    }

}