import { WebWirePopup } from './popup.js';

/**
 * WebWire Popup Application - Main business logic for the extension popup.
 * Handles communication with background script, panel management, page analysis,
 * and options navigation for the WebWire extension.
 * 
 * @example
 * const app = new WebWirePopupApp(config);
 * await app.initialize();
 * 
 * // App automatically handles:
 * // - Status updates from background script
 * // - Panel toggle functionality
 * // - Page analysis triggering
 * // - Options page navigation
 * // - Help documentation access
 */
class WebWirePopupApp {
    constructor(config) {
        this.popup = new WebWirePopup(config);
    }

    /**
     * Initialize the popup application
     */
    async initialize() {
        console.log('[WebWirePopupApp] Initializing WebWire Popup...');
        
        try {
            // Initialize the popup UI
            await this.popup.initialize();
            
            // Setup event listeners
            this.setupEventListeners();
            
            console.log('[WebWirePopupApp] WebWire Popup initialized successfully');
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to initialize:', error);
            this.popup.showError(`Initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup event listeners for UI interactions
     */
    setupEventListeners() {
        this.popup.setupEventListeners({
            onConversations: (e) => this.openConversations(e),
            onSettings: () => this.openSettings(),
            onHelp: (e) => this.openHelp(e)
        });
    }



    /**
     * Open the options/settings page
     */
    async openSettings() {
        try {
            console.log('[WebWirePopupApp] Opening settings page...');
            
            await chrome.runtime.openOptionsPage();
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open settings:', error);
            this.popup.showError('Failed to open settings');
        }
    }

    /**
     * Open help documentation
     * @param {Event} e - Click event
     */
    openHelp(e) {
        try {
            e.preventDefault();
            console.log('[WebWirePopupApp] Opening help documentation...');
            
            const guideUrl = chrome.runtime.getURL('guide.html');
            chrome.tabs.create({
                url: guideUrl
            });
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open help:', error);
            this.popup.showError('Failed to open help');
        }
    }

    /**
     * Open the MCP panel
     * @param {Event} e - Click event
     */
    async openMCP(e) {
        try {
            e.preventDefault();
            console.log('[WebWirePopupApp] Opening MCP panel...');
            
            const mcpUrl = chrome.runtime.getURL('mcp_status.html');
            console.log('[WebWirePopupApp] MCP URL:', mcpUrl);
            
            const tab = await chrome.tabs.create({
                url: mcpUrl
            });
            console.log('[WebWirePopupApp] Tab created:', tab);
            
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open MCP panel:', error);
            this.popup.showError(`Failed to open MCP panel: ${error.message}`);
            
            // Don't close popup if there's an error so user can see it
        }
    }

    /**
     * Opens the Conversations panel in a new tab
     * @param {Event} e - Click event
     */
    async openConversations(e) {
        try {
            e.preventDefault();
            console.log('[WebWirePopupApp] Opening Conversations panel...');
            
            const conversationsUrl = chrome.runtime.getURL('conversations.html');
            console.log('[WebWirePopupApp] Conversations URL:', conversationsUrl);
            
            const tab = await chrome.tabs.create({
                url: conversationsUrl
            });
            console.log('[WebWirePopupApp] Tab created:', tab);
            
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open Conversations panel:', error);
            this.popup.showError(`Failed to open Conversations panel: ${error.message}`);
            
            // Don't close popup if there's an error so user can see it
        }
    }

    /**
     * Refresh the popup status
     */
    async refreshStatus() {
        try {
            await this.popup.loadStatus();
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to refresh status:', error);
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // import { AppConfig } from '../src/core/app-config.js';
    // const config = AppConfig.pageFactory('lite');
    const app = new WebWirePopupApp(config);
    app.initialize();
}); 