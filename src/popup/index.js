import { WebWirePopup } from './popup.js';

/**
 * WebWire Popup Application - Main business logic for the extension popup.
 * Handles communication with background script, panel management, page analysis,
 * and options navigation for the WebWire extension.
 * 
 * @example
 * const app = new WebWirePopupApp();
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
    constructor() {
        this.popup = new WebWirePopup();
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
            onTogglePanel: () => this.togglePanel(),
            onAnalyzePage: () => this.analyzePage(),
            onOpenOptions: () => this.openOptions(),
            onHelp: (e) => this.openHelp(e),
            onMCP: () => this.openMCP()
        });
    }

    /**
     * Toggle the WebWire panel on the current page
     */
    async togglePanel() {
        try {
            console.log('[WebWirePopupApp] Toggling WebWire panel...');
            
            const response = await chrome.runtime.sendMessage({
                action: 'TOGGLE_WEBWIRE_PANEL'
            });

            if (response.success) {
                console.log('[WebWirePopupApp] Panel toggled successfully');
                // Refresh status to reflect changes
                await this.popup.loadStatus();
                // Close popup after successful toggle
                this.popup.close();
            } else {
                console.error('[WebWirePopupApp] Failed to toggle panel:', response.error);
                this.popup.showError('Failed to toggle panel');
            }

        } catch (error) {
            console.error('[WebWirePopupApp] Failed to toggle panel:', error);
            this.popup.showError('Failed to toggle panel');
        }
    }

    /**
     * Trigger page analysis on the current tab
     */
    async analyzePage() {
        try {
            console.log('[WebWirePopupApp] Analyzing page...');
            
            const currentTab = this.popup.getCurrentTab();
            if (!currentTab) {
                this.popup.showError('No active tab found');
                return;
            }

            // First ensure panel is active
            await chrome.runtime.sendMessage({
                action: 'INJECT_WEBWIRE_PANEL'
            });

            // Send analyze message to content script
            await chrome.tabs.sendMessage(currentTab.id, {
                action: 'ANALYZE_PAGE'
            });

            console.log('[WebWirePopupApp] Page analysis triggered');
            
            // Close popup after triggering analysis
            this.popup.close();

        } catch (error) {
            console.error('[WebWirePopupApp] Failed to analyze page:', error);
            this.popup.showError('Failed to analyze page');
        }
    }

    /**
     * Open the options/settings page
     */
    async openOptions() {
        try {
            console.log('[WebWirePopupApp] Opening options page...');
            
            await chrome.runtime.openOptionsPage();
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open options:', error);
            this.popup.showError('Failed to open options');
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
            
            chrome.tabs.create({
                url: 'https://github.com/your-repo/webwire/wiki'
            });
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open help:', error);
            this.popup.showError('Failed to open help');
        }
    }

    /**
     * Open the MCP panel
     */
    async openMCP() {
        try {
            console.log('[WebWirePopupApp] Opening MCP panel...');
            
            const mcpUrl = chrome.runtime.getURL('mcp/index.html');
            await chrome.tabs.create({
                url: mcpUrl
            });
            this.popup.close();
            
        } catch (error) {
            console.error('[WebWirePopupApp] Failed to open MCP panel:', error);
            this.popup.showError('Failed to open MCP panel');
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
    const app = new WebWirePopupApp();
    app.initialize();
}); 