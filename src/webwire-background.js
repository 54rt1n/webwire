import { EVENT_TYPES, EVENT_CONTEXT } from './js/core/events.js';
import { initializeContext } from './js/context/context-init.js';
/**
 * WebWire Extension Background Script
 * 
 * Handles extension lifecycle, communication between content scripts,
 * and manages global extension state.
 */

class WebWireBackground {
    constructor() {
        this.activeTabs = new Map();
        this.extensionSettings = {};
        this.dispatcher = null;
        this.errorBoundary = null;
        
        this.initialize();
    }

    async initialize() {
        console.log('WebWire background script initializing...');

        const { dispatcher, errorBoundary } = await initializeContext(EVENT_CONTEXT.BACKGROUND);
        this.dispatcher = dispatcher;
        this.errorBoundary = errorBoundary;
        
        // Load extension settings
        await this.loadSettings();
        
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
            return this.handleMessage(message, sender, sendResponse);
        });

        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        // Handle tab removal
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.activeTabs.delete(tabId);
        });

        // Handle extension installation/update
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstalled(details);
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

    handleMessage(message, sender, sendResponse) {
        console.log('Background received message:', message.action, 'from:', sender);
        
        const { action } = message;

        try {
            switch (action) {
                case 'GET_WEBWIRE_SETTINGS':
                    sendResponse({ 
                        success: true, 
                        settings: this.extensionSettings 
                    });
                    return false;

                case 'SAVE_WEBWIRE_SETTINGS':
                    this.saveSettings(message.settings)
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'INJECT_WEBWIRE_PANEL':
                    this.injectPanel(sender.tab.id)
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

                case 'GET_WEBWIRE_STATE':
                    this.getWebWireState(sender.tab.id)
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
                    this.capturePageContent(sender.tab.id)
                        .then(content => sendResponse({ 
                            success: true, 
                            content 
                        }))
                        .catch(error => sendResponse({ 
                            success: false, 
                            error: error.message 
                        }));
                    return true;

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

    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/index.js']
            });
            console.log('Content script injected into tab:', tabId);
        } catch (error) {
            console.error('Failed to inject content script:', error);
            throw error;
        }
    }

    async injectPanel(tabId) {
        try {
            // Ensure content script is loaded
            await this.sendToContentScript(tabId, {
                action: 'INJECT_WEBWIRE_PANEL'
            });
        } catch (error) {
            // If content script isn't available, inject it first
            console.log('Content script not available, injecting...');
            await this.injectContentScript(tabId);
            
            // Wait a bit for initialization
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try again
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
            console.error('Failed to send message to content script:', error);
            throw error;
        }
    }

    async getWebWireState(tabId) {
        try {
            // Get state from content script
            const response = await this.sendToContentScript(tabId, {
                action: 'GET_WEBWIRE_STATE'
            });
            
            return response.state || {};
        } catch (error) {
            console.error('Failed to get WebWire state:', error);
            return {};
        }
    }

    async handlePanelMessage(message, sender) {
        // Forward panel messages to appropriate handlers
        const tabId = sender.tab.id;
        
        try {
            switch (message.type) {
                case 'AI_CHAT_REQUEST':
                    return await this.handleAIChatRequest(message.data, tabId);
                    
                case 'MCP_CONNECT_REQUEST':
                    return await this.handleMCPConnectRequest(message.data, tabId);
                    
                case 'SETTINGS_UPDATE':
                    await this.saveSettings(message.data.settings);
                    return { success: true };
                    
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