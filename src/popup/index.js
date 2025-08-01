import { WebWirePopup } from './popup.js';
import { AppConfig } from '../js/core/app-config.js';
import { logger } from '../js/core/logging.js';

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
        logger.log('WebWirePopupApp', 'Initializing WebWire Popup...');
        
        try {
            // Initialize the popup UI
            await this.popup.initialize();
            
            // Setup event listeners
            this.setupEventListeners();
            
            logger.log('WebWirePopupApp', 'WebWire Popup initialized successfully');
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to initialize:', error);
            this.popup.showError(`Initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup event listeners for UI interactions
     */
    setupEventListeners() {
        this.popup.setupEventListeners({
            onConversations: (e) => this.openConversations(e),
            onPrompts: (e) => this.openPrompts(e),
            onSettings: () => this.openSettings(),
            onHelp: (e) => this.openHelp(e),
            onToggleAssistant: (e) => this.toggleAssistant(e)
        });
    }

    /**
     * Toggle assistant visibility
     * @param {Event} e - Click event
     */
    async toggleAssistant(e) {
        try {
            logger.log('WebWirePopupApp', 'Toggling assistant...');
            const result = await this.popup.toggleAssistant();
            logger.log('WebWirePopupApp', 'Assistant toggled:', result);
            
            // Update the UI to reflect the new state
            await this.popup.updateAssistantUI(result.visible);
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to toggle assistant:', error);
            if (error.autoInjectDisabled) {
                // Show a more user-friendly message for auto-inject disabled
                this.popup.showError('Auto-inject is disabled. Click the WebWire icon in the toolbar while on a webpage to activate the assistant.');
            } else {
                this.popup.showError(`Failed to toggle assistant: ${error.message}`);
            }
        }
    }



    /**
     * Open the options/settings page
     */
    async openSettings() {
        try {
            logger.log('WebWirePopupApp', 'Opening settings page...');
            
            await chrome.runtime.openOptionsPage();
            this.popup.close();
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to open settings:', error);
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
            logger.log('WebWirePopupApp', 'Opening help documentation...');
            
            const guideUrl = chrome.runtime.getURL('guide.html');
            chrome.tabs.create({
                url: guideUrl
            });
            this.popup.close();
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to open help:', error);
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
            logger.log('WebWirePopupApp', 'Opening MCP panel...');
            
            const mcpUrl = chrome.runtime.getURL('mcp_status.html');
            logger.log('WebWirePopupApp', 'MCP URL:', mcpUrl);
            
            const tab = await chrome.tabs.create({
                url: mcpUrl
            });
            logger.log('WebWirePopupApp', 'Tab created:', tab);
            
            this.popup.close();
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to open MCP panel:', error);
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
            logger.log('WebWirePopupApp', 'Opening Conversations panel...');
            
            const conversationsUrl = chrome.runtime.getURL('conversations.html');
            logger.log('WebWirePopupApp', 'Conversations URL:', conversationsUrl);
            
            const tab = await chrome.tabs.create({
                url: conversationsUrl
            });
            logger.log('WebWirePopupApp', 'Tab created:', tab);
            
            this.popup.close();
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to open Conversations panel:', error);
            this.popup.showError(`Failed to open Conversations panel: ${error.message}`);
            
            // Don't close popup if there's an error so user can see it
        }
    }

    /**
     * Opens the Prompts panel in a new tab
     * @param {Event} e - Click event
     */
    async openPrompts(e) {
        try {
            e.preventDefault();
            logger.log('WebWirePopupApp', 'Opening Prompts panel...');
            
            const promptsUrl = chrome.runtime.getURL('prompts.html');
            logger.log('WebWirePopupApp', 'Prompts URL:', promptsUrl);
            
            const tab = await chrome.tabs.create({
                url: promptsUrl
            });
            logger.log('WebWirePopupApp', 'Tab created:', tab);
            
            this.popup.close();
            
        } catch (error) {
            logger.error('WebWirePopupApp', 'Failed to open Prompts panel:', error);
            this.popup.showError(`Failed to open Prompts panel: ${error.message}`);
            
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
            logger.error('WebWirePopupApp', 'Failed to refresh status:', error);
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const config = AppConfig.pageFactory('lite');
    const app = new WebWirePopupApp(config);
    app.initialize();
}); 