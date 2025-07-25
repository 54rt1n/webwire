// src/js/client/panel-event-handlers.js
import { EVENTS } from '../core/events.js';
import { CONTENT_ACTIONS, BACKGROUND_ACTIONS } from '../core/cc-actions.js';
import { EventBindableComponent } from '../core/event-bindable-panel.js';

export class ContentEventHandlers extends EventBindableComponent {
    constructor(core) {
        super(core.eventBus);
        this.core = core;
        this.stateService = core.stateService;
        this.dispatcher = core.dispatcher;
    }

    setupEventListeners() {
        console.log('[ContentEventHandlers] Setting up event listeners');
        this.setupStashListeners();
        this.setupSettingsListeners();
        this.setupChatListeners();
        this.setupContentActions();
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
            await this.dispatcher.dispatch(BACKGROUND_ACTIONS.SAVE_STASH, { announce, options }, { target: 'background' });
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
            const response = await this.dispatcher.dispatch(BACKGROUND_ACTIONS.LOAD_STASH, options, { target: 'background' });
            // TODO Patch the state with the stash response
        } catch (error) {
            console.error('[MCPApp] Failed to load stash data:', error);
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
        throw new Error('Not implemented');
    }

    /**
     * Setup chat listeners
     */
    setupChatListeners() {
        this.onAsync(EVENTS.CHAT.CANCEL_TOOL, this.handleCancelTool);
        this.onAsync(EVENTS.CHAT.EXECUTE_TOOL, this.handleExecuteTool);
        this.onAsync(EVENTS.CHAT.SAVE_MESSAGE, this.handleSaveMessage);
        this.onAsync(EVENTS.CHAT.SAVE_PANEL_VISIBILITY, this.handleSavePanelVisibility);
        this.onAsync(EVENTS.CHAT.END_CONVERSATION, this.handleEndConversation);
        this.onAsync(EVENTS.CHAT.UPDATE_SETTINGS, this.handleUpdateSettings);
        this.onAsync(EVENTS.CHAT.GET_OR_CREATE_THREAD, this.handleGetOrCreateThread);
        this.onAsync(EVENTS.CHAT.CREATE_NEW_THREAD, this.handleCreateNewThread);
        this.onAsync(EVENTS.CHAT.RESYNC, this.handleResync);
        this.onAsync(EVENTS.CHAT.UPDATE_CONVERSATION, this.handleUpdateConversation);
    }

    /**
     * Handle resync request from ChatService
     */
    async handleResync(data) {
        console.log('[ContentEventHandlers] Handling resync request');
        
        try {
            // Gather local content state
            const localState = {
                panelInjected: this.core?.chatService?.isReady() || false,
                mcpConnected: false, // TODO: Get from chatService when available
                aiClientConfigured: false, // TODO: Get from chatService when available
                servicesReady: !!(this.core && this.core.stateService)
            };
            
            // Get fresh state from background, including our local state
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.GET_WEBWIRE_STATE,
                { contentState: localState },
                { target: 'background' }
            );
            
            if (response.success && response.result) {
                console.log('[ContentEventHandlers] Received fresh state from background:', response.result);
                
                // Update the content state service
                if (this.core?.stateService) {
                    this.core.stateService.setState(response.result);
                }
                
                return { success: true };
            } else {
                throw new Error('Failed to get state from background');
            }
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to resync:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle end conversation request from ChatService
     */
    async handleEndConversation(data) {
        console.log('[ContentEventHandlers] Handling end conversation request:', data);
        
        try {
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.END_CONVERSATION,
                data,
                { target: 'background' }
            );
            
            console.log('[ContentEventHandlers] End conversation response:', response);
            return response;
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to end conversation:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle execute tool event
     */
    async handleExecuteTool(data) {
        console.log('[MCPApp] Handling execute tool event:', data);
        try {
            const { callId, name } = data;
            // We need to look up the threadId and the messageId for the callId
            const { threadId, messageId } = this.stateService.conversation.getThreadAndMessageForCallId(callId);
            const toolResult = await this.core.mcpConnector.executeTool(name, {}, {callId});
            // Update the conversation state with the tool result
            this.stateService.conversation.updateToolResult(threadId, messageId, callId, toolResult);
            console.log('[MCPApp] Updated tool result (saving to disk):', this.stateService.state.conversation.history[threadId]);
            // Save to disk
            await this.dispatcher.dispatch(BACKGROUND_ACTIONS.SAVE_CONVERSATION, { threadId }, { target: 'background' });

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
            console.error('[MCPApp] Failed to execute tool:', error);
        }
    }

    /**
     * Handle cancel tool event
     */
    async handleCancelTool(data) {
        console.log('[MCPApp] Handling cancel tool event:', data);
        return {
            success: true,
            threadId: data.threadId,
            messageId: data.messageId,
            callId: data.callId
        };
    }

    /**
     * Handle save message request using EventDispatcher
     */
    async handleSaveMessage(data) {
        try {
            const threadId = this.stateService.conversation.getActiveThreadId();
            if (!threadId) {
                console.log('[ContentEventHandlers] No threadId found in data:', data);
                throw new Error('[ContentEventHandlers] No threadId found in data');
            }

            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE,
                data,
                { target: 'background' }
            );

            this.eventBus.emit(EVENTS.UI.THREAD_SAVED, { threadId, data, status: 'success' });
            return response;
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to save message:', error);
            this.eventBus.emit(EVENTS.UI.THREAD_SAVED, { data, status: 'error', error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle save panel visibility using EventDispatcher
     */
    async handleSavePanelVisibility(data) {
        try {
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY,
                data,
                { target: 'background' }
            );
            return response;
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to save panel visibility:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle update settings request using EventDispatcher
     */
    async handleUpdateSettings(data) {
        console.log('[ContentEventHandlers] Handling settings update request:', data);
        try {
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
                data,
                { target: 'background' }
            );
            console.log('[ContentEventHandlers] Settings update response from background:', response);
            return response;
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to update settings:', error);
            return { success: false, error: error.message };
        }
    }

    async handleUpdateConversation(data) {
        console.log('[ContentEventHandlers] Handling update conversation request:', data);
        try {
            // Validate we have a threadId, messages, and metadata
            const threadId = this.stateService.conversation.getActiveThreadId();
            if (!threadId) {
                console.error('[ContentEventHandlers] Invalid update conversation request:', data);
                throw new Error('[ContentEventHandlers] Invalid update conversation request');
            }

            const { messages, metadata } = this.stateService.conversation.getConversation(threadId);
            
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.UPDATE_CONVERSATION,
                { threadId, messages, metadata },
                { target: 'background' }
            );
            
            // Emit THREAD_SAVED event to update UI
            this.eventBus.emit(EVENTS.UI.THREAD_SAVED, { 
                threadId, 
                status: 'success' 
            });
            
            return response;
        } catch (error) {
            if (error.message.includes('Extension context')) {
                console.log('[ContentEventHandlers] Background gone. Reload required.');
            } else {
                console.error('[ContentEventHandlers] Failed to update conversation:', error);
            }
            
            // Emit THREAD_SAVED event with error status
            this.eventBus.emit(EVENTS.UI.THREAD_SAVED, { 
                status: 'error', 
                error: error.message 
            });
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle get or create thread request using EventDispatcher
     */
    async handleGetOrCreateThread(data) {
        try {
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD,
                data,
                { target: 'background' }
            );

            console.log('[ContentEventHandlers] handleGetOrCreateThread', response);
            
            // Emit conversation loaded event for ChatService
            if (response.success && response.result) {
                // CRITICAL: Update local conversation state from background data
                if (this.stateService && this.stateService.conversation) {
                    console.log('[ContentEventHandlers] Syncing thread state from background:', response.result.threadId);
                    this.stateService.conversation.patchConversation({
                        threadId: response.result.threadId,
                        metadata: response.result.metadata,
                        messages: response.result.messages,
                        isActive: true  // This is the current active thread
                    });
                }
                
                this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
                    conversation: response.result
                });
            } else {
                console.error('[ContentEventHandlers] Failed to get/create thread:', response.error);
            }
            
            return response;
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to get/create thread:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle create new thread request from ChatService
     */
    async handleCreateNewThread(data) {
        console.log('[ContentEventHandlers] Handling create new thread request:', data);
        
        try {
            const response = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.CREATE_NEW_THREAD,
                data,
                { target: 'background' }
            );
            
            if (response.success && response.thread) {
                this.currentThreadId = response.thread.threadId;
                
                // CRITICAL: Update local conversation state from background data
                if (this.stateService && this.stateService.conversation) {
                    console.log('[ContentEventHandlers] Syncing new thread state from background:', response.thread.threadId);
                    this.stateService.conversation.patchConversation({
                        threadId: response.thread.threadId,
                        metadata: response.thread.metadata,
                        messages: response.thread.messages || [],
                        isActive: true  // This is the new active thread
                    });
                }
                
                // Emit conversation loaded event for ChatService
                this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
                    conversation: response.thread
                });
            }
            
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to create new thread:', error);
            return { success: false, error: error.message };
        }
    }

    setupContentActions() {
        // Late-bind content actions that depend on services
        this.onAsync(CONTENT_ACTIONS.SETTINGS_CHANGED, this.handleSettingsChanged);
        this.onAsync(CONTENT_ACTIONS.CONVERSATION_UPDATED, this.handleConversationUpdated);
    }

    /**
     * Handle content action: ping (early-bind safe)
     */
    async handlePing(data) {
        return { success: true, status: 'ready' };
    }

    /**
     * Handle content action: get webwire state (early-bind safe)
     * This is called during initialization so must handle missing services gracefully
     */
    async handleGetWebwireState(data) {
        try {
            // Check if services are initialized
            const servicesReady = this.core && this.core.stateService;
            
            return {
                success: true,
                state: {
                    panelInjected: false,
                    mcpConnected: false,
                    aiClientConfigured: false,
                    servicesReady: servicesReady
                }
            };
        } catch (error) {
            console.error('[ContentEventHandlers] Error getting state:', error);
            return {
                success: true,
                state: {
                    panelInjected: false,
                    mcpConnected: false,
                    aiClientConfigured: false,
                    servicesReady: false
                }
            };
        }
    }

    /**
     * Handle content action: settings changed
     */
    async handleSettingsChanged(data) {
        try {
            console.log('[ContentEventHandlers] Settings changed:', data.settings);
            this.currentSettings = data.settings || {};
            
            // Trigger full resync to ensure everything is properly updated
            await this.handleResync({});
            
            // Notify UI of settings update
            this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, { settings: this.currentSettings });
            
            return { success: true };
        } catch (error) {
            console.error('[ContentEventHandlers] Failed to handle settings change:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: conversation updated
     */
    async handleConversationUpdated(data) {
        try {
            // The data IS the conversation update data from notifyTabsOfConversationUpdate
            const { conversation } = data;
            
            // CRITICAL: Update local conversation state from background data
            if (this.stateService && this.stateService.conversation && conversation) {
                console.log('[WebWireContentHost] Syncing conversation state from background:', conversation.threadId);
                this.stateService.conversation.patchConversation(conversation);
            }
            
            // Forward to ChatService for UI updates
            this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, { conversation });
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to handle conversation update:', error);
            return { success: false, error: error.message };
        }
    }
}

export class EarlyEventHandlers extends EventBindableComponent {
    constructor(eventBus, contentHost) {
        super(eventBus);
        this.contentHost = contentHost;
        this.chatService = contentHost.chatService;
    }

    setupEventListeners() {
        console.log('[EarlyEventHandlers] Setting up event listeners');
        this.onAsync(CONTENT_ACTIONS.PING, this.handlePing);
        this.onAsync(CONTENT_ACTIONS.GET_WEBWIRE_STATE, this.handleGetWebwireState);
        this.onAsync(CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL, this.handleInjectPanel);
        this.onAsync(CONTENT_ACTIONS.TOGGLE_WEBWIRE_PANEL, this.handleTogglePanel);
    }

    /**
     * Handle content action: ping (early-bind safe)
     */
    async handlePing(data) {
        return { success: true, status: 'ready' };
    }

    /**
     * Handle content action: inject panel
     */
    async handleInjectPanel(data) {
        try {
            await this.contentHost.injectPanel();
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to inject panel:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: toggle panel
     */
    async handleTogglePanel(data) {
        try {
            await this.chatService.togglePanel();
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to toggle panel:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: get webwire state
     */
    async handleGetWebwireState(data) {
        try {
            return {
                success: true,
                state: {
                    panelInjected: this.chatService.isReady(),
                    mcpConnected: false, // ChatService would need to expose this
                    aiClientConfigured: false // ChatService would need to expose this
                }
            };
        } catch (error) {
            console.error('[WebWireContentHost] Error getting state:', error);
            return {
                success: true,
                state: {
                    panelInjected: false,
                    mcpConnected: false,
                    aiClientConfigured: false
                }
            };
        }
    }
}