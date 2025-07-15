import { EVENT_TYPES, EVENT_CONTEXT } from '../js/core/events.js';
import { initializeContext } from '../js/context/context-init.js';
import { EventBus } from '../js/core/event-bus.js';
import { BACKGROUND_ACTIONS, CONTENT_ACTIONS } from '../chat/chat-constants.js';

/**
 * WebWire Extension Background Script
 * 
 * Handles extension lifecycle, communication between content scripts,
 * and manages global extension state.
 */

class WebWireBackground {
    constructor() {
        this.activeTabs = new Map();
        this.eventBus = new EventBus({domain: 'background'});
        this.extensionSettings = {};
        this.dispatcher = null;
        this.errorBoundary = null;
    }

    async initialize() {
        console.log('WebWire background script initializing...');

        const { dispatcher, errorBoundary, stateService, storage } = await initializeContext(this.eventBus, EVENT_CONTEXT.BACKGROUND);
        this.dispatcher = dispatcher;
        this.errorBoundary = errorBoundary;
        this.stateService = stateService;
        this.storage = storage;
        
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
            if (this.stateService?.state && this.stateService?.settings) {
                this.stateService.state.settings = { ...this.stateService.state.settings, ...data.settings };
                await this.stateService.settings.saveToStorage();
                return { success: true };
            } else {
                throw new Error('State service not initialized');
            }
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_WEBWIRE_STATE, async (data, options) => {
            const { sender } = options;
            const tabId = await this.resolveTabId(sender, data);
            const state = await this.getWebWireState(tabId);
            return state;
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_WEBWIRE_STATE, async (data, options) => {
            const success = await this.saveState(data.state);
            return { success };
        });

        // Handle thread/conversation operations
        this.eventBus.onAsync(BACKGROUND_ACTIONS.END_CONVERSATION, async (data, options) => {
            const activeThreadId = this.stateService.conversation.getActiveThreadId();
            if (activeThreadId) {
                console.log('[WebWireBackground] Ending active conversation:', activeThreadId);
                this.stateService.conversation.updateConversationStatus(activeThreadId, 'completed');
                await this.stateService.disk.saveToStorage();
                return { success: true, threadId: activeThreadId };
            } else {
                console.log('[WebWireBackground] No active conversation to end');
                return { success: true, message: 'No active conversation' };
            }
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD, async (data, options) => {
            let threadId = this.stateService.conversation.getCurrentConversation();
            let reason = null;
            if (!threadId) {
                threadId = this.stateService.conversation.createNewConversation();
                reason = 'new_conversation';
            } else {
                reason = 'existing_conversation';
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
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_ACTIVE_THREAD, async (data, options) => {
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
                    error: 'No active thread'
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
            
            // Auto-save state and notify listeners
            await this.stateService.disk.saveToStorage();
            
            // Notify all tabs about the conversation update
            const completeConversationState = {
                threadId: data.threadId,
                metadata: this.stateService.state.conversation.metadata[data.threadId],
                messages: this.stateService.conversation.getConversationMessages(data.threadId),
                isActive: this.stateService.conversation.getActiveThreadId() === data.threadId
            };

            console.log('[WebWireBackground] SAVE_THREAD_MESSAGE', completeConversationState, data);
            
            await this.notifyTabsOfConversationUpdate(data.threadId, {
                action: CONTENT_ACTIONS.CONVERSATION_UPDATED,
                conversation: completeConversationState,
                timestamp: Date.now()
            });
            
            return { success: true };
        });

        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY, async (data, options) => {
            await this.savePanelVisibilityState(data.visible);
            return { success: true };
        });

        this.eventBus.on(BACKGROUND_ACTIONS.PING, (data, options) => {
            return { 
                success: true, 
                status: 'ready',
                timestamp: Date.now(),
                stateServiceReady: !!this.stateService
            };
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

    async loadState() {
        try {
            console.log('[WebWireBackground] Loading state...');
            console.log('[WebWireBackground] State service available:', !!this.stateService);
            console.log('[WebWireBackground] Settings plugin available:', !!this.stateService?.settings);
            
            await this.stateService.settings.loadFromStorage();
            console.log('[WebWireBackground] Settings loaded, current state.settings:', this.stateService.state.settings);
            
            await this.stateService.ui.loadFromStorage();
            console.log('[WebWireBackground] UI state loaded, current state.ui:', this.stateService.state.ui);
            
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
     * @returns {Promise<number>} The resolved tab ID
     * @throws {Error} When no tab context is available
     */
    // Helper method to resolve tab ID from sender or message
    async resolveTabId(sender, message) {
        // If message explicitly includes a tab ID, use it
        if (message.tabId) {
            return message.tabId;
        }
        
        // If sender has tab context (content script), use it
        if (sender.tab && sender.tab.id) {
            return sender.tab.id;
        }
        
        // If message indicates it needs active tab or comes from non-tab context
        if (message.needsActiveTab || !message.fromContent) {
            const activeTab = await this.getActiveTab();
            if (activeTab && activeTab.id) {
                return activeTab.id;
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
        return this.getWebWireState(tabId);
    }

    async handleCaptureContent(message, sender) {
        const tabId = await this.resolveTabId(sender, message);
        return this.capturePageContent(tabId);
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
        const settingsKeys = ['webwireState', 'webwireSettingsState', 'app-settings'];
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
                await this.stateService.settings.loadFromStorage();
                await this.stateService.ui.loadFromStorage();
                await this.stateService.disk.loadFromStorage();
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

    async notifyTabsOfConversationUpdate(threadId, updateData) {
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
            
            console.log(`Notifying ${validTabs.length} valid tabs about conversation update for thread: ${threadId}`);
            
            let successCount = 0;
            const notifications = validTabs.map(async (tab) => {
                try {
                    // First ping to check if content script is available
                    await this.dispatcher.dispatch(
                        CONTENT_ACTIONS.PING,
                        {},
                        { target: 'content', tabId: tab.id }
                    );
                    
                    // If ping succeeds, send the conversation update
                    await this.dispatcher.dispatch(
                        CONTENT_ACTIONS.CONVERSATION_UPDATED,
                        updateData,
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
            
            console.log(`Conversation update notifications completed: ${successful} tabs notified successfully out of ${validTabs.length} checked`);
        } catch (error) {
            console.error('Failed to notify tabs of conversation update:', error);
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

    async getWebWireState(tabId) {
        try {
            // Check if state service is available
            if (!this.stateService?.state) {
                console.warn('State service not available, returning default state');
                return {
                    settings: {},
                    conversation: {},
                    mcp: {},
                    panelInjected: false,
                    mcpConnected: false,
                    aiClientConfigured: false,
                    frameworkReady: false
                };
            }

            // Get state from our state service
            const state = {
                settings: this.stateService.state.settings || {},
                conversation: this.stateService.state.conversation || {},
                mcp: this.stateService.state.mcp || {},
                ui: this.stateService.state.ui || {},
                panelInjected: false, // We'll determine this by trying to ping content script
                frameworkReady: true
            };

            // Try to get additional state from content script if available
            try {
                await this.dispatcher.dispatch(
                    CONTENT_ACTIONS.PING,
                    {},
                    { target: 'content', tabId: tabId }
                );
                const response = await this.dispatcher.dispatch(
                    CONTENT_ACTIONS.GET_WEBWIRE_STATE,
                    {},
                    { target: 'content', tabId: tabId }
                );
                
                if (response.success && response.state) {
                    state.panelInjected = response.state.panelInjected || false;
                    state.mcpConnected = response.state.mcpConnected || false;
                    state.aiClientConfigured = response.state.aiClientConfigured || false;
                }
            } catch (error) {
                // Content script not available, use defaults
                state.panelInjected = false;
                state.mcpConnected = false;
                state.aiClientConfigured = false;
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
                frameworkReady: false
            };
        }
    }

    async handlePanelMessage(message, sender) {
        // Forward panel messages to appropriate handlers
        try {
            // Handle settings updates that don't need tab context
            if (message.type === 'SETTINGS_UPDATE') {
                await this.saveSettings(message.data.settings);
                return { success: true };
            }
            
            // For other messages, resolve tab ID
            const tabId = await this.resolveTabId(sender, message);
            
            switch (message.type) {
                case 'AI_CHAT_REQUEST':
                    return await this.handleAIChatRequest(message.data, tabId);
                    
                case 'MCP_CONNECT_REQUEST':
                    return await this.handleMCPConnectRequest(message.data, tabId);
                    
                default:
                    // Forward to content script via EventDispatcher
                    return await this.dispatcher.dispatch(
                        'FORWARD_TO_CONTENT',
                        message,
                        { target: 'content', tabId: tabId }
                    );
            }
        } catch (error) {
            console.error('Failed to handle panel message:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    async handleAIChatRequest(data, tabId) {
        // For now, delegate to content script
        // In a full implementation, this could handle AI requests directly
        return await this.dispatcher.dispatch(
            CONTENT_ACTIONS.AI_CHAT_REQUEST,
            data,
            { target: 'content', tabId: tabId }
        );
    }

    async handleMCPConnectRequest(data, tabId) {
        // For now, delegate to content script
        // In a full implementation, this could manage MCP connections centrally
        return await this.dispatcher.dispatch(
            CONTENT_ACTIONS.MCP_CONNECT_REQUEST,
            data,
            { target: 'content', tabId: tabId }
        );
    }

    async capturePageContent(tabId) {
        try {
            const response = await this.dispatcher.dispatch(
                CONTENT_ACTIONS.CAPTURE_PAGE_CONTENT,
                {},
                { target: 'content', tabId: tabId }
            );
            
            return response.data;
        } catch (error) {
            console.error('Failed to capture page content:', error);
            throw error;
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

async function factory() {
    // Initialize the background script
    const webwireBackground = new WebWireBackground();
    await webwireBackground.initialize();

    return webwireBackground;
}

factory().then(webwireBackground => {
    self.webwireBackground = webwireBackground;
}, (error) => {
    console.error('Failed to initialize background script:', error);
});