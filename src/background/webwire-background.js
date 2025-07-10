import { EVENT_TYPES, EVENT_CONTEXT } from '../js/core/events.js';
import { initializeContext } from '../js/context/context-init.js';
import { EventBus } from '../js/core/event-bus.js';

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
        
        this.initialize();
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
            
            await this.stateService.settings.loadSettings();
            console.log('[WebWireBackground] Settings loaded, current state.settings:', this.stateService.state.settings);
            
            await this.stateService.ui.loadUiState();
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
                await this.stateService.settings.saveSettings();
            }
            
            if (state.conversation) {
                this.stateService.state.conversation = { ...this.stateService.state.conversation, ...state.conversation };
            }
            
            if (state.mcp) {
                this.stateService.state.mcp = { ...this.stateService.state.mcp, ...state.mcp };
            }
            
            if (state.ui) {
                this.stateService.state.ui = { ...this.stateService.state.ui, ...state.ui };
                await this.stateService.ui.saveUiState();
            }
            
            await this.stateService.disk.saveState();
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
            await this.stateService.ui.saveUiState();
            
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

        // Handle messages from content scripts and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Handle async operations by wrapping in a promise
            this.handleMessage(message, sender, sendResponse)
                .catch(error => {
                    console.error('Error in handleMessage:', error);
                    sendResponse({ 
                        success: false, 
                        error: error.message 
                    });
                });
            return true; // Always return true to keep message channel open for async responses
        });

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
            await this.sendToContentScript(tab.id, {
                action: 'TOGGLE_WEBWIRE_PANEL'
            });
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

    async handleMessage(message, sender, sendResponse) {
        console.log('[WebWireBackground] ===== MESSAGE RECEIVED =====');
        console.log('[WebWireBackground] Action:', message.action);
        console.log('[WebWireBackground] Sender:', sender);
        console.log('[WebWireBackground] Full message:', message);
        console.log('[WebWireBackground] State service available:', !!this.stateService);
        console.log('[WebWireBackground] =============================');
        
        const { action } = message;

        try {
            switch (action) {
                case 'GET_WEBWIRE_SETTINGS':
                    const settings = this.stateService?.state?.settings || {};
                    sendResponse({ 
                        success: true, 
                        settings: settings 
                    });
                    return false;

                case 'SAVE_WEBWIRE_SETTINGS':
                    if (this.stateService?.state && this.stateService?.settings) {
                        this.stateService.state.settings = { ...this.stateService.state.settings, ...message.settings };
                        this.stateService.settings.saveSettings()
                            .then(() => sendResponse({ success: true }))
                            .catch(error => sendResponse({ 
                                success: false, 
                                error: error.message 
                            }));
                    } else {
                        sendResponse({ 
                            success: false, 
                            error: 'State service not initialized' 
                        });
                    }
                    return true;

                case 'SAVE_WEBWIRE_STATE':
                    this.saveState(message.state)
                        .then(success => sendResponse({ success }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'INJECT_WEBWIRE_PANEL':
                    this.handleInjectPanel(message, sender)
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'GET_WEBWIRE_STATE':
                    this.handleGetState(message, sender)
                        .then(state => sendResponse({ 
                            success: true, 
                            state 
                        }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'WEBWIRE_PANEL_MESSAGE':
                    this.handlePanelMessage(message, sender)
                        .then(response => sendResponse(response))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'CAPTURE_PAGE_CONTENT':
                    this.handleCaptureContent(message, sender)
                        .then(content => sendResponse({ 
                            success: true, 
                            content 
                        }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'TOGGLE_WEBWIRE_PANEL':
                    this.handleTogglePanel(message, sender)
                        .then(response => sendResponse(response))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'SETTINGS_UPDATED':
                    this.handleSettingsUpdated(message, sender)
                        .then(response => sendResponse(response))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'PING':
                    console.log('[WebWireBackground] PING received from:', message.source || 'unknown');
                    sendResponse({ 
                        success: true, 
                        status: 'ready',
                        timestamp: Date.now(),
                        stateServiceReady: !!this.stateService
                    });
                    return false;

                // Thread operations (using existing conversation plugin)
                case 'GET_THREAD':
                    const threadId = message.threadId;
                    const threadData = {
                        metadata: this.stateService.state.conversation.metadata[threadId],
                        messages: this.stateService.conversation.getConversationMessages(threadId)
                    };
                    sendResponse({ 
                        success: true, 
                        thread: threadData
                    });
                    return false;

                case 'SAVE_THREAD_MESSAGE':
                    this.stateService.conversation.storeMessage(
                        message.threadId,
                        message.userMessage,
                        message.assistantMessage,
                        message.options || {}
                    );
                    
                    // Auto-save state and notify listeners
                    this.stateService.disk.saveState()
                        .then(async () => {
                            // Notify all tabs about the conversation update with complete state
                            const completeConversationState = {
                                threadId: message.threadId,
                                metadata: this.stateService.state.conversation.metadata[message.threadId],
                                messages: this.stateService.conversation.getConversationMessages(message.threadId),
                                isActive: this.stateService.conversation.getActiveConversationId() === message.threadId
                            };
                            
                            await this.notifyTabsOfConversationUpdate(message.threadId, {
                                action: 'CONVERSATION_UPDATED',
                                conversation: completeConversationState,
                                timestamp: Date.now()
                            });
                            
                            sendResponse({ success: true });
                        })
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'CREATE_THREAD':
                    const newThreadId = this.stateService.conversation.createThreadId(
                        message.options?.userName,
                        message.options?.personaName
                    );
                    // Initialize empty conversation
                    this.stateService.conversation.storeMessage(
                        newThreadId,
                        { role: 'system', content: '' },
                        null,
                        message.options || {}
                    );
                    // Remove placeholder message
                    this.stateService.state.conversation.history[newThreadId] = [];
                    
                    sendResponse({ 
                        success: true, 
                        threadId: newThreadId 
                    });
                    return false;

                case 'LIST_THREADS':
                    const threads = this.stateService.conversation.listConversations(message.filters || {});
                    sendResponse({ 
                        success: true, 
                        threads 
                    });
                    return false;

                case 'DELETE_THREAD':
                    const deleted = this.stateService.conversation.clearConversationHistory(message.threadId);
                    if (deleted) {
                        this.stateService.disk.saveState()
                            .then(() => sendResponse({ success: true }))
                            .catch(error => sendResponse({ 
                                success: false, 
                                error: error.message 
                            }));
                    } else {
                        sendResponse({ 
                            success: false, 
                            error: 'Thread not found' 
                        });
                    }
                    return deleted;

                case 'GET_ACTIVE_THREAD':
                    const activeThreadId = this.stateService.conversation.getActiveConversationId();
                    if (activeThreadId) {
                        const activeThreadData = {
                            threadId: activeThreadId,
                            metadata: this.stateService.state.conversation.metadata[activeThreadId],
                            messages: this.stateService.conversation.getConversationMessages(activeThreadId)
                        };
                        sendResponse({ 
                            success: true, 
                            thread: activeThreadData 
                        });
                    } else {
                        sendResponse({ 
                            success: false, 
                            error: 'No active thread' 
                        });
                    }
                    return false;

                case 'SET_ACTIVE_THREAD':
                    this.stateService.conversation.setActiveConversation(message.threadId);
                    sendResponse({ success: true });
                    return false;

                case 'SAVE_PANEL_VISIBILITY':
                    this.savePanelVisibilityState(message.visible)
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'GET_OR_CREATE_CURRENT_THREAD':
                    const currentThreadId = this.stateService.conversation.getOrCreateCurrentConversation(message.options || {});
                    const currentThreadData = {
                        threadId: currentThreadId,
                        metadata: this.stateService.state.conversation.metadata[currentThreadId],
                        messages: this.stateService.conversation.getConversationMessages(currentThreadId)
                    };
                    sendResponse({ 
                        success: true, 
                        thread: currentThreadData 
                    });
                    return false;

                default:
                    console.warn('Unknown action:', action);
                    sendResponse({ 
                        success: false, 
                        error: 'Unknown action' 
                    });
                    return false;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ 
                success: false, 
                error: error.message 
            });
            return false;
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
            await this.sendToContentScript(tabId, {
                action: 'TOGGLE_WEBWIRE_PANEL'
            });
            
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
                await this.stateService.settings.loadSettings();
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
                await this.stateService.settings.loadSettings();
                await this.stateService.ui.loadUiState();
                await this.stateService.disk.loadFromStorage();
                console.log('[WebWireBackground] ✅ WebWire state reloaded after storage change');
                
                // Notify all active tabs about settings change
                await this.notifyTabsOfSettingsChange();
                
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
                    await this.pingContentScriptSilent(tab.id);
                    
                    // If ping succeeds, send the settings update
                    await this.sendToContentScriptSilent(tab.id, {
                        action: 'SETTINGS_CHANGED',
                        data: {
                            settings: this.stateService?.state?.settings || {}
                        }
                    });
                    
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
                    await this.pingContentScriptSilent(tab.id);
                    
                    // If ping succeeds, send the conversation update
                    await this.sendToContentScriptSilent(tab.id, {
                        action: 'CONVERSATION_UPDATED',
                        data: updateData
                    });
                    
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
            await this.pingContentScript(tabId);
            
            // Content script is available, inject panel
            await this.sendToContentScript(tabId, {
                action: 'INJECT_WEBWIRE_PANEL'
            });
            
        } catch (error) {
            // Content script not available, inject it first
            console.log('Content script not available, injecting...');
            await this.injectContentScript(tabId);
            
            // Wait for content script to initialize with exponential backoff
            await this.waitForContentScript(tabId);
            
            // Now inject the panel
            await this.sendToContentScript(tabId, {
                action: 'INJECT_WEBWIRE_PANEL'
            });
        }
    }

    async sendToContentScript(tabId, message) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, message);
            return response;
        } catch (error) {
            console.error('Failed to send message to content script:', tabId, message, error);
            throw error;
        }
    }

    async sendToContentScriptSilent(tabId, message) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, message);
            return response;
        } catch (error) {
            // Silent version - don't log errors as they're expected for tabs without content scripts
            throw error;
        }
    }

    async pingContentScript(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
            if (response && response.success) {
                return true;
            }
            throw new Error('Content script ping failed');
        } catch (error) {
            throw new Error('Content script not responsive');
        }
    }

    async pingContentScriptSilent(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
            if (response && response.success) {
                return true;
            }
            throw new Error('Content script ping failed');
        } catch (error) {
            // Silent version - don't log, just throw for caller to handle
            throw new Error('Content script not responsive');
        }
    }

    async waitForContentScript(tabId, maxAttempts = 10) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await this.pingContentScript(tabId);
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
                await this.pingContentScript(tabId);
                const response = await this.sendToContentScript(tabId, {
                    action: 'GET_WEBWIRE_STATE'
                });
                
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
                    // Forward to content script
                    return await this.sendToContentScript(tabId, message);
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
        return await this.sendToContentScript(tabId, {
            action: 'AI_CHAT_REQUEST',
            data
        });
    }

    async handleMCPConnectRequest(data, tabId) {
        // For now, delegate to content script
        // In a full implementation, this could manage MCP connections centrally
        return await this.sendToContentScript(tabId, {
            action: 'MCP_CONNECT_REQUEST',
            data
        });
    }

    async capturePageContent(tabId) {
        try {
            const response = await this.sendToContentScript(tabId, {
                action: 'CAPTURE_PAGE_CONTENT'
            });
            
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

// Initialize the background script
const webwireBackground = new WebWireBackground();

// Export for debugging
self.webwireBackground = webwireBackground;
