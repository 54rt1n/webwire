import { EVENT_TYPES, EVENT_CONTEXT, EVENTS } from '../js/core/events.js';
import { initializeContext } from '../js/context/context-init.js';
import { EventBus } from '../js/core/event-bus.js';
import { BACKGROUND_ACTIONS, CONTENT_ACTIONS } from '../js/core/cc-actions.js';
import { mergeState } from '../js/utils/deep-merge.js';

/**
 * WebWire Extension Background Script
 * 
 * Handles extension lifecycle, communication between content scripts,
 * and manages global extension state.
 */

class WebWireBackground {
    constructor(config) {
        this.config = config;
        this.activeTabs = new Map();
        this.eventBus = new EventBus({domain: 'background'});
        this.extensionSettings = {};
        this.dispatcher = null;
        this.errorBoundary = null;
        this.sentryService = null;
    }

    async initialize() {
        console.log('WebWire background script initializing...');

        const { dispatcher, errorBoundary, stateService, storage, sentryService } = await initializeContext(this.eventBus, EVENT_CONTEXT.BACKGROUND, {config: this.config});
        this.dispatcher = dispatcher;
        this.errorBoundary = errorBoundary;
        this.stateService = stateService;
        this.storage = storage;
        this.sentryService = sentryService;
        
        // Load extension settings and state
        await this.loadSettings();
        await this.loadState();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('WebWire background script initialized');
    }

    /**
     * Setup EventBus listeners for handling cross-context events
     */
    setupEventBusListeners() {
        // Handle state and settings requests
        this.eventBus.on(BACKGROUND_ACTIONS.GET_WEBWIRE_SETTINGS, (data, options) => {
            const settings = this.stateService?.state?.settings || {};
            return { success: true, settings: settings };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS, async (data, options) => {
            if (this.stateService?.state && this.stateService?.tab) {
                const { tabId, ...settings } = data;
                this.stateService.tab.setTabState(tabId, settings);
                await this.stateService.tab.saveToStorage();
                return { success: true };
            } else {
                throw new Error('State service not initialized');
            }
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_WEBWIRE_STATE, async (data, options) => {
            const { sender } = options;
            const tabId = await this.resolveTabId(sender, data);
            const state = await this.getWebWireState(tabId, data.contentState);
            return state;
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_WEBWIRE_STATE, async (data, options) => {
            const success = await this.saveState(data.state);
            return { success };
        });

        // Handle thread/conversation operations
        this.eventBus.onAsync(BACKGROUND_ACTIONS.END_CONVERSATION, async (data, options) => {
            const tabId = await this.resolveTabId(options.sender, data);
            const activeThreadId = this.stateService.conversation.getActiveThreadId();
            
            // End the current conversation if there is one
            if (activeThreadId) {
                console.log('[WebWireBackground] Ending active conversation:', activeThreadId, 'for tab:', tabId);
                this.stateService.conversation.updateConversationStatus(activeThreadId, 'completed');
            }
            
            // Create a new empty conversation for the tab immediately
            const newThreadId = this.stateService.conversation.createNewConversation({tabId});
            console.log('[WebWireBackground] Created new empty conversation:', newThreadId, 'for tab:', tabId);
            
            // Update the tab's persistent tracked thread ID
            const tabState = this.stateService.tab.getTabState(tabId);
            if (tabState) {
                tabState.trackedThreadId = newThreadId;
                console.log('[WebWireBackground] Updated tab', tabId, 'trackedThreadId to', newThreadId);
            }
            
            await this.stateService.disk.saveToStorage();
            
            return { 
                success: true, 
                endedThreadId: activeThreadId,
                newThreadId: newThreadId 
            };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.UPDATE_CONVERSATION, async (data, options) => {
            const { threadId, messages, metadata } = data;
            const success = await this.stateService.conversation.updateConversation(threadId, messages, metadata);
            await this.stateService.disk.saveToStorage();
            return { success };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD, async (data, options) => {
            try {
            let tabId = options.tabId;
            if (!tabId) {
                tabId = await this.resolveTabId(options.sender, data);
            }
            console.log('[WebWireBackground] GET_OR_CREATE_CURRENT_THREAD', tabId, data, options);
            
            let threadId = null;
            let reason = null;
            
            // If createOnly is true, skip recovery and create new conversation
            if (data.createOnly) {
                threadId = this.stateService.conversation.createNewConversation({tabId});
                reason = 'new_conversation_forced';
                
                // Update the tab's persistent tracked thread ID
                const tabState = this.stateService.tab.getTabState(tabId);
                if (tabState) {
                    tabState.trackedThreadId = threadId;
                    console.log('[WebWireBackground] Updated tab', tabId, 'trackedThreadId to', threadId);
                }
            } else {
                // Normal flow: try to get current or recover
                threadId = this.stateService.conversation.getCurrentConversation({tabId});
                if (!threadId) {
                    threadId = this.stateService.conversation.createNewConversation({tabId});
                    reason = 'new_conversation';
                    
                    // Update the tab's persistent tracked thread ID
                    const tabState = this.stateService.tab.getTabState(tabId);
                    if (tabState) {
                        tabState.trackedThreadId = threadId;
                        console.log('[WebWireBackground] Updated tab', tabId, 'trackedThreadId to', threadId);
                    }
                } else {
                    reason = 'existing_conversation';
                }
            }
            
            // Save tab state if we created a new conversation
            if (reason === 'new_conversation' || reason === 'new_conversation_forced') {
                await this.stateService.tab.saveToStorage();
                console.log('[WebWireBackground] Saved tab state after creating new conversation');
            }
            
            const messages = this.stateService.conversation.getConversationMessages(threadId);
            const currentThreadData = {
                threadId: threadId,
                metadata: this.stateService.state.conversation.metadata[threadId],
                messages: messages,
                reason: reason
            };
            console.log('[WebWireBackground] GET_OR_CREATE_CURRENT_THREAD', currentThreadData);
            return currentThreadData;
        } catch (error) {
            console.error('[WebWireBackground] Error in GET_OR_CREATE_CURRENT_THREAD:', error);
            return {
                success: false,
                error: error.message
            };
        }
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_ACTIVE_THREAD, async (data, options) => {
            const tabId = await this.resolveTabId(options.sender, data);
            const threadId = this.stateService.conversation.getActiveThreadId();
            if (threadId) {
                const messages = this.stateService.conversation.getConversationMessages(threadId);
                return {
                    success: true,
                    thread: {
                        threadId: threadId,
                        metadata: this.stateService.state.conversation.metadata[threadId],
                        messages: messages
                    }
                };
            } else {
                return {
                    success: false,
                    error: 'No active thread for tab: ' + tabId
                };
            }
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE, async (data, options) => {
            this.stateService.conversation.storeMessage(
                data.threadId,
                data.userMessage,
                data.assistantMessage,
                data.options || {}
            );
            
            // Auto-save state
            await this.stateService.disk.saveToStorage();
            
            console.log('[WebWireBackground] SAVE_THREAD_MESSAGE - saved for tab only', data);
            
            return { success: true };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.UPDATE_MESSAGE, async (data, options) => {
            this.stateService.conversation.markMessage(
                data.threadId,
                data.messageId,
                data.status
            );
            
            // Auto-save state
            await this.stateService.disk.saveToStorage();
            
            console.log('[WebWireBackground] UPDATE_MESSAGE - marked message', data);
            
            return { success: true };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY, async (data, options) => {
            await this.savePanelVisibilityState(data.visible);
            return { success: true };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_EXTENSION_STATS, (data, options) => {
            const conversationStats = this.stateService?.conversation?.getStats() || { conversationCount: 0, totalMessages: 0 };
            const configurationValid = this.stateService?.settings?.isValid() || false;
            const assistantEnabled = this.stateService?.ui?.getAssistantEnabled() ?? true;
            
            return {
                conversationCount: conversationStats.conversationCount,
                totalMessages: conversationStats.totalMessages,
                configurationValid: configurationValid,
                assistantEnabled: assistantEnabled
            };
        });

        // Assistant state management
        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_ASSISTANT_STATE, async (data, options) => {
            const assistantEnabled = this.stateService?.ui?.getAssistantEnabled() ?? true;
            return { assistantEnabled };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.UPDATE_ASSISTANT_VISIBILITY, async (data, options) => {
            if (this.stateService?.ui) {
                this.stateService.ui.setAssistantEnabled(data.visible);
                await this.stateService.disk.saveToStorage();
                return { success: true, visible: data.visible };
            }
            throw new Error('State service not initialized');
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.PING, (data, options) => {
            return { 
                success: true, 
                status: 'ready',
                timestamp: Date.now(),
                stateServiceReady: !!this.stateService
            };
        });
        
        // Handle settings updates from options page
        this.eventBus.onAsync(EVENTS.SETTINGS.UPDATED, async (data, options) => {
            console.log('[WebWireBackground] Handling SETTINGS_UPDATED event');
            await this.handleSettingsUpdated(data, options.sender);
            return { success: true };
        });

        // Sentry error reporting handler
        this.eventBus.onAsync(BACKGROUND_ACTIONS.REPORT_ERROR, async (data, options) => {
            try {
                if (!this.sentryService || !this.sentryService.initialized) {
                    console.error('[WebWireBackground] Sentry not initialized, logging error locally:', data);
                    return { success: false, error: 'Sentry not available' };
                }

                const { error, context = {}, level = 'error' } = data;
                
                // Add extension context
                const enrichedContext = {
                    ...context,
                    source: options.source || 'unknown',
                    tabId: options.sender?.tab?.id,
                    url: options.sender?.tab?.url,
                    extensionVersion: chrome.runtime.getManifest().version
                };

                if (level === 'message') {
                    this.sentryService.captureMessage(error.message || String(error), level, enrichedContext);
                } else {
                    this.sentryService.captureException(error, enrichedContext);
                }

                return { success: true };
            } catch (err) {
                console.error('[WebWireBackground] Failed to report error to Sentry:', err);
                return { success: false, error: err.message };
            }
        });

        console.log('[WebWireBackground] EventBus listeners set up');
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get('webwireSettings');
            this.extensionSettings = result.webwireSettings || {
                autoInject: false,
                enableShortcuts: true,
                defaultMcpServer: ''
            };
        } catch (error) {
            console.error('Failed to load extension settings:', error);
        }
    }

    async saveSettings(settings) {
        try {
            this.extensionSettings = { ...this.extensionSettings, ...settings };
            await chrome.storage.sync.set({ webwireSettings: this.extensionSettings });
        } catch (error) {
            console.error('Failed to save extension settings:', error);
        }
    }

    async cleanupTabs() {
        const browserTabs = await this.getAllTabs();
        const currentTabs = Object.keys(this.stateService.state.tabs);
        const tabsToRemove = currentTabs.filter(tabId => !browserTabs.some(tab => tab.id === tabId));
        for (const tabId of tabsToRemove) {
            this.stateService.tab.setTabState(tabId, null, { setDefault: true });
        }
        await this.stateService.tab.saveToStorage();
    }

    async loadState() {
        try {
            console.log('[WebWireBackground] Loading state...');
            console.log('[WebWireBackground] State service available:', !!this.stateService);
            console.log('[WebWireBackground] Settings plugin available:', !!this.stateService?.settings);
            
            await this.stateService.settings.loadFromStorage();
            console.log('[WebWireBackground] Settings loaded, current state.settings:', this.stateService.state.settings);
            
            await this.stateService.tab.loadFromStorage();
            console.log('[WebWireBackground] Tab state loaded, current state.tabs:', this.stateService.state.tabs);
            await this.cleanupTabs();
            
            await this.stateService.disk.loadFromStorage();
            console.log('[WebWireBackground] Disk state loaded');
            
            console.log('[WebWireBackground] Final state after loading:', this.stateService.state);
            console.log('WebWire state loaded in background');
        } catch (error) {
            console.error('Failed to load WebWire state:', error);
        }
    }

    async saveState(state) {
        try {
            // Update state service and save
            if (state.settings) {
                this.stateService.state.settings = { ...this.stateService.state.settings, ...state.settings };
                await this.stateService.settings.saveToStorage();
            }
            
            if (state.conversation) {
                this.stateService.state.conversation = { ...this.stateService.state.conversation, ...state.conversation };
            }
            
            if (state.mcp) {
                this.stateService.state.mcp = { ...this.stateService.state.mcp, ...state.mcp };
            }
            
            if (state.ui) {
                this.stateService.state.ui = { ...this.stateService.state.ui, ...state.ui };
                await this.stateService.ui.saveToStorage();
            }
            
            await this.stateService.disk.saveToStorage();
            return true;
        } catch (error) {
            console.error('Failed to save WebWire state:', error);
            return false;
        }
    }

    /**
     * Save panel visibility state
     * @param {boolean} visible - Whether the panel should be visible
     */
    async savePanelVisibilityState(visible) {
        try {
            console.log(`[WebWireBackground] Saving panel visibility state: ${visible}`);

            if (!this.stateService.state.ui) {
                this.stateService.state.ui = {};
            }
            
            // Update UI state with panel visibility
            this.stateService.state.ui.panelVisible = visible;
            
            // Save UI state
            await this.stateService.ui.saveToStorage();
            
            console.log(`[WebWireBackground] Panel visibility state saved successfully: ${visible}`);
            return true;
        } catch (error) {
            console.error('[WebWireBackground] Failed to save panel visibility state:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Handle extension icon clicks
        chrome.action.onClicked.addListener((tab) => {
            this.handleActionClick(tab);
        });

        // Handle keyboard shortcuts
        chrome.commands.onCommand.addListener((command, tab) => {
            this.handleCommand(command, tab);
        });

        // Setup EventBus listeners for cross-context events (EventDispatcher handles Chrome messaging)
        this.setupEventBusListeners();

        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        // Handle extension installation/update
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstalled(details);
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, areaName) => {
            this.handleStorageChanged(changes, areaName);
        });
    }

    async handleActionClick(tab) {
        console.log('Extension icon clicked for tab:', tab.id);
        
        try {
            // Toggle WebWire panel in the active tab
            await this.dispatcher.dispatch(
                CONTENT_ACTIONS.TOGGLE_WEBWIRE_PANEL,
                {},
                { target: 'content', tabId: tab.id }
            );
        } catch (error) {
            console.error('Failed to toggle panel:', error);
            // If content script isn't loaded, inject it first
            await this.injectContentScript(tab.id);
        }
    }

    async handleCommand(command, tab) {
        console.log('Command received:', command, 'for tab:', tab.id);
        
        switch (command) {
            case 'toggle-panel':
                if (this.extensionSettings.enableShortcuts) {
                    await this.handleActionClick(tab);
                }
                break;
        }
    }

    /**
     * Resolves tab ID for operations that require tab context.
     * 
     * Tab ID Resolution Priority:
     * 1. Explicit tabId in message payload (highest priority)
     * 2. sender.tab.id when available (content script context)  
     * 3. Active tab when message indicates it needs one or comes from non-tab context
     * 
     * Usage patterns:
     * - Content scripts: sender.tab.id is automatically available
     * - Popup/Options: Uses active tab as fallback
     * - Panel: Should include explicit tabId in message or use active tab
     * - Background: Can specify explicit tabId for targeted operations
     * 
     * @param {Object} sender - Chrome extension message sender object
     * @param {Object} message - Message object that may contain tabId
     * @returns {Promise<string>} The resolved tab ID
     * @throws {Error} When no tab context is available
     */
    // Helper method to resolve tab ID from sender or message
    async resolveTabId(sender, message) {
        // If message explicitly includes a tab ID, use it
        if (message.tabId) {
            return message.tabId.toString();
        }
        
        // If sender has tab context (content script), use it
        if (sender.tab && sender.tab.id) {
            return sender.tab.id.toString();
        }
        
        // If message indicates it needs active tab or comes from non-tab context
        if (message.needsActiveTab || !message.fromContent) {
            const activeTab = await this.getActiveTab();
            if (activeTab && activeTab.id) {
                return activeTab.id.toString();
            }
        }
        
        throw new Error('No tab context available for this operation');
    }

    async handleInjectPanel(message, sender) {
        const tabId = await this.resolveTabId(sender, message);
        return this.injectPanel(tabId);
    }

    async handleGetState(message, sender) {
        const tabId = await this.resolveTabId(sender, message);
        return this.getWebWireState(tabId, message.contentState);
    }

    async handleTogglePanel(message, sender) {
        const tabId = await this.resolveTabId(sender, message);
        
        try {
            // First try to toggle the panel if content script is already loaded
            await this.dispatcher.dispatch(
                CONTENT_ACTIONS.TOGGLE_WEBWIRE_PANEL,
                {},
                { target: 'content', tabId: tabId }
            );
            
            return { success: true };
        } catch (error) {
            // Content script not loaded, inject panel first
            console.log('Content script not available for toggle, injecting panel...');
            
            try {
                await this.injectPanel(tabId);
                return { success: true, injected: true };
            } catch (injectError) {
                console.error('Failed to inject panel during toggle:', injectError);
                return { 
                    success: false, 
                    error: 'Failed to inject WebWire panel: ' + injectError.message 
                };
            }
        }
    }

    async handleSettingsUpdated(message, sender) {
        console.log('[WebWireBackground] ===== SETTINGS_UPDATED HANDLER =====');
        console.log('[WebWireBackground] Message:', message);
        console.log('[WebWireBackground] Sender:', sender);
        console.log('[WebWireBackground] Current stateService:', !!this.stateService);
        console.log('[WebWireBackground] Settings in message:', message.settings);
        console.log('[WebWireBackground] ===============================');
        
        try {
            // Reload state service settings
            if (this.stateService) {
                console.log('[WebWireBackground] Reloading settings from storage...');
                await this.stateService.settings.loadFromStorage();
                console.log('[WebWireBackground] Settings reloaded from storage:', this.stateService.state.settings);
            } else {
                console.error('[WebWireBackground] No state service available for settings reload!');
            }
            
            // Notify all tabs about the settings change
            console.log('[WebWireBackground] Notifying tabs of settings change...');
            await this.notifyTabsOfSettingsChange();
            
            const result = { 
                success: true, 
                message: 'Settings updated and tabs notified',
                timestamp: Date.now()
            };
            
            console.log('[WebWireBackground] Settings update handler completed successfully:', result);
            return result;
            
        } catch (error) {
            console.error('[WebWireBackground] Failed to handle settings update:', error);
            console.error('[WebWireBackground] Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            const errorResult = { 
                success: false, 
                error: error.message,
                timestamp: Date.now()
            };
            
            console.log('[WebWireBackground] Settings update handler failed:', errorResult);
            return errorResult;
        }
    }

    handleTabUpdate(tabId, changeInfo, tab) {
        // Track tab state
        if (changeInfo.status === 'complete') {
            this.activeTabs.set(tabId, {
                url: tab.url,
                title: tab.title,
                lastUpdate: Date.now()
            });

            // Auto-inject if enabled
            if (this.extensionSettings.autoInject) {
                this.injectPanel(tabId).catch(error => {
                    console.error('Auto-inject failed:', error);
                });
            }
        }
    }

    handleInstalled(details) {
        console.log('WebWire extension installed/updated:', details.reason);
        
        if (details.reason === 'install') {
            // Open options page on first install
            chrome.runtime.openOptionsPage();
        }
    }

    async handleStorageChanged(changes, areaName) {
        console.log('[WebWireBackground] ===== STORAGE CHANGED =====');
        console.log('[WebWireBackground] Area:', areaName);
        console.log('[WebWireBackground] Changes:', changes);
        console.log('[WebWireBackground] Change keys:', Object.keys(changes));
        console.log('[WebWireBackground] ============================');
        
        // Handle WebWire settings changes
        if (changes.webwireSettings) {
            console.log('[WebWireBackground] 🔄 WebWire extension settings changed, reloading...');
            await this.loadSettings();
        }
        
        // Handle state service storage changes (from options panel)
        const settingsKeys = [
            'webwireState', 
            'webwireSettingsState', 
            'app-settings',      // SettingsAdapter
            'app-state',         // StateAdapter  
            'app-tab',           // TabAdapter
            'app-stash',         // StashAdapter
            'webwire-prompts'    // PromptAdapter
        ];
        const hasSettingsChange = settingsKeys.some(key => changes[key]);
        
        // Handle manual trigger from options page (fallback mechanism)
        const hasTrigger = changes['webwire-settings-trigger'];
        
        if (this.stateService && (hasSettingsChange || hasTrigger)) {
            if (hasTrigger) {
                console.log('[WebWireBackground] 📡 Settings trigger detected (fallback mechanism activated)');
                console.log('[WebWireBackground] Trigger details:', hasTrigger.newValue);
            }
            
            console.log('[WebWireBackground] 🔄 WebWire state/settings changed, reloading state...');
            try {
                // Reload specific state based on what changed
                if (changes['app-settings'] && this.stateService.settings) {
                    await this.stateService.settings.loadFromStorage();
                    console.log('[WebWireBackground] ✅ Settings state reloaded after storage change');
                }
                
                if (changes['app-tab'] && this.stateService.tab) {
                    await this.stateService.tab.loadFromStorage();
                    console.log('[WebWireBackground] ✅ Tab state reloaded after storage change');
                }
                
                if (changes['app-state'] && this.stateService.disk) {
                    await this.stateService.disk.loadFromStorage();
                    console.log('[WebWireBackground] ✅ Disk state reloaded after storage change');
                }
                
                if (changes['app-stash'] && this.stateService.stash) {
                    await this.stateService.stash.loadFromStorage();
                    console.log('[WebWireBackground] ✅ Stash state reloaded after storage change');
                }
                
                if (changes['webwire-prompts'] && this.stateService.prompts) {
                    await this.stateService.prompts.loadFromStorage();
                    console.log('[WebWireBackground] ✅ Prompts state reloaded after storage change');
                }
                
                console.log('[WebWireBackground] ✅ WebWire state reloaded after storage change');
                
                // TODO the tabs will need to be updated with the dispatcher
                // Notify all active tabs about settings change
                //await this.notifyTabsOfSettingsChange();
                
                // Clean up the trigger key if it was used
                if (hasTrigger) {
                    try {
                        await chrome.storage.local.remove('webwire-settings-trigger');
                        console.log('[WebWireBackground] 🧹 Cleaned up settings trigger');
                    } catch (error) {
                        console.warn('[WebWireBackground] Failed to clean up trigger:', error);
                    }
                }
                
            } catch (error) {
                console.error('[WebWireBackground] ❌ Failed to reload state after storage change:', error);
            }
        }
    }

    async notifyTabsOfSettingsChange() {
        try {
            const tabs = await this.getAllTabs();
            
            // Filter tabs that can potentially have content scripts
            const validTabs = tabs.filter(tab => {
                return tab.url && 
                       (tab.url.startsWith('http://') || tab.url.startsWith('https://')) &&
                       !tab.url.includes('chrome-extension://') &&
                       !tab.url.startsWith('chrome://') &&
                       !tab.url.startsWith('moz-extension://') &&
                       !tab.url.startsWith('edge://');
            });
            
            console.log(`Checking ${validTabs.length} valid tabs for settings change notifications (out of ${tabs.length} total tabs)`);
            
            let successCount = 0;
            const notifications = validTabs.map(async (tab) => {
                try {
                    // First ping to check if content script is available
                    await this.dispatcher.dispatch(
                        CONTENT_ACTIONS.PING,
                        {},
                        { target: 'content', tabId: tab.id }
                    );
                    
                    // If ping succeeds, send the settings update
                    await this.dispatcher.dispatch(
                        CONTENT_ACTIONS.SETTINGS_CHANGED,
                        {
                            settings: this.stateService?.state?.settings || {}
                        },
                        { target: 'content', tabId: tab.id }
                    );
                    
                    successCount++;
                    return { success: true, tabId: tab.id, url: tab.url };
                } catch (error) {
                    // Content script not available, which is normal for most tabs
                    return { success: false, tabId: tab.id, url: tab.url, error: error.message };
                }
            });
            
            const results = await Promise.allSettled(notifications);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            
            console.log(`Settings change notifications completed: ${successful} tabs notified successfully out of ${validTabs.length} checked`);
        } catch (error) {
            console.error('Failed to notify tabs of settings change:', error);
        }
    }


    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
            console.log('Content script injected into tab:', tabId);
        } catch (error) {
            console.error('Failed to inject content script:', error);
            throw error;
        }
    }

    async injectPanel(tabId) {
        try {
            // Check if content script is already loaded and responsive
            await this.dispatcher.dispatch(
                CONTENT_ACTIONS.PING,
                {},
                { target: 'content', tabId: tabId }
            );
            
            // Content script is available, inject panel
            await this.dispatcher.dispatch(
                CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL,
                {},
                { target: 'content', tabId: tabId }
            );
            
        } catch (error) {
            // Content script not available, inject it first
            console.log('Content script not available, injecting...');
            await this.injectContentScript(tabId);
            
            // Wait for content script to initialize with exponential backoff
            await this.waitForContentScript(tabId);
            
            // Now inject the panel
            await this.dispatcher.dispatch(
                CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL,
                {},
                { target: 'content', tabId: tabId }
            );
        }
    }


    async waitForContentScript(tabId, maxAttempts = 10) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await this.dispatcher.dispatch(
                    CONTENT_ACTIONS.PING,
                    {},
                    { target: 'content', tabId: tabId }
                );
                console.log(`Content script ready after ${attempt} attempts`);
                return;
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw new Error(`Content script failed to initialize after ${maxAttempts} attempts`);
                }
                
                // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
                const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
                console.log(`Content script not ready, waiting ${delay}ms (attempt ${attempt}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async getWebWireState(tabId, contentState = null, { saveTabState = true, ...options } = {}) {
        try {
            // Check if state service is available
            if (!this.stateService?.state) {
                console.warn('State service not available, returning default state');
                return {
                    settings: {},
                    conversation: {},
                    frameworkReady: false
                };
            }

            // Initialize tab state if not present
            let tabStateChanged = false;
            let tabState = this.stateService.tab.getTabState(tabId);
            if (!tabState) {
                this.stateService.tab.setTabState(tabId, null, { setDefault: true }); 
                tabStateChanged = true;
                tabState = this.stateService.tab.getTabState(tabId);
            }

            // Get state from our state service
            let state = {
                settings: this.stateService.state.settings || {},
                conversation: this.stateService.state.conversation || {}, // TODO: tabs don't need all conversations
                prompts: this.stateService.state.prompts || {},
                tabs: {
                    default: this.stateService.state.tabs.default,
                    [tabId]: tabState // The client just needs it's own tab state
                },
                frameworkReady: true,
                tabId: tabId,
            };

            // If content state is provided, merge it with the state using deep merge
            if (contentState) {
                state = mergeState(state, contentState);
            }

            if (tabStateChanged && saveTabState) {
                await this.stateService.tab.saveToStorage();
            }

            console.log('[WebWireBackground] Returning state:', state);
            return state;
        } catch (error) {
            console.error('Failed to get WebWire state:', error);
            return {
                error: 'Failed to get state',
                settings: {},
                conversation: {},
                mcp: {},
                panelInjected: false,
                mcpConnected: false,
                aiClientConfigured: false,
                frameworkReady: false,
                tabId: tabId,
            };
        }
    }

    // Utility methods for extension management
    async getAllTabs() {
        try {
            return await chrome.tabs.query({});
        } catch (error) {
            console.error('Failed to get tabs:', error);
            return [];
        }
    }

    async getActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ 
                active: true, 
                currentWindow: true 
            });
            return tab;
        } catch (error) {
            console.error('Failed to get active tab:', error);
            return null;
        }
    }

    async openOptionsPage() {
        try {
            await chrome.runtime.openOptionsPage();
        } catch (error) {
            console.error('Failed to open options page:', error);
        }
    }

    // Debug and monitoring methods
    getStats() {
        return {
            activeTabs: this.activeTabs.size,
            settings: this.extensionSettings,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }
}

/**
 * Static factory for creating and initializing WebWireBackground instances
 * 
 * @param {Object} config - Configuration object from AppConfig
 * @returns {Promise<WebWireBackground>} Initialized background instance
 */
WebWireBackground.factory = async function(config) {
    if (!config) {
        throw new Error('WebWire config not found');
    }
    
    const webwireBackground = new WebWireBackground(config);
    await webwireBackground.initialize();
    
    return webwireBackground;
};

export { WebWireBackground };