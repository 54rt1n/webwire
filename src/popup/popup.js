import '../shared/global.scss';
import './style.css';

/**
 * UI management for the WebWire popup providing status display and user interaction controls.
 * Handles status updates, button interactions, and communication with the background script.
 * 
 * @example
 * const popup = new WebWirePopup();
 * await popup.initialize();
 * 
 * // Setup event handlers
 * popup.setupEventListeners({
 *   onTogglePanel: () => togglePanel(),
 *   onAnalyzePage: () => analyzePage(),
 *   onOpenOptions: () => openOptions()
 * });
 * 
 * // Update status
 * popup.updateStatus({ panelInjected: true, mcpConnected: false });
 */

export class WebWirePopup {
    constructor() {
        this.initializeElements();
        this.currentTab = null;
    }

    initializeElements() {
        // Status elements
        this.loadingElement = document.getElementById('loading');
        this.contentElement = document.getElementById('content');
        this.panelStatusElement = document.getElementById('panel-status');
        this.panelIndicatorElement = document.getElementById('panel-indicator');
        this.mcpStatusElement = document.getElementById('mcp-status');
        this.mcpIndicatorElement = document.getElementById('mcp-indicator');
        this.toolsCountElement = document.getElementById('tools-count');

        // Action buttons
        this.togglePanelBtn = document.getElementById('toggle-panel');
        this.analyzePageBtn = document.getElementById('analyze-page');
        this.openOptionsBtn = document.getElementById('open-options');
        this.helpLink = document.getElementById('help-link');
        this.mcpLink = document.getElementById('mcp-link');
    }

    /**
     * Initialize the popup
     */
    async initialize() {
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;

            // Load initial status
            await this.loadStatus();

            // Show content
            this.showContent();

        } catch (error) {
            console.error('Failed to initialize popup:', error);
            this.showError('Failed to initialize');
        }
    }

    /**
     * Setup event listeners for UI interactions
     * @param {Object} handlers - Object containing event handlers
     */
    setupEventListeners(handlers) {
        this.togglePanelBtn.addEventListener('click', handlers.onTogglePanel);
        this.analyzePageBtn.addEventListener('click', handlers.onAnalyzePage);
        this.openOptionsBtn.addEventListener('click', handlers.onOpenOptions);
        this.helpLink.addEventListener('click', handlers.onHelp);
        this.mcpLink.addEventListener('click', handlers.onMCP);
    }

    /**
     * Load status from background script
     */
    async loadStatus() {
        try {
            // Get WebWire state from background
            const response = await chrome.runtime.sendMessage({
                action: 'GET_WEBWIRE_STATE'
            });

            console.log('response', response);

            if (response && response.success) {
                this.updateStatus(response.state);
            } else {
                this.updateStatus({});
            }

        } catch (error) {
            console.error('Failed to load status:', error);
            this.updateStatus({});
        }
    }

    /**
     * Update status display based on state
     * @param {Object} state - WebWire state object
     */
    updateStatus(state) {
        // Update panel status
        const panelActive = state.panelInjected || false;
        this.panelStatusElement.textContent = panelActive ? 'Active' : 'Inactive';
        this.panelIndicatorElement.className = 
            `status-indicator ${panelActive ? 'connected' : 'disconnected'}`;

        // Update MCP status
        const mcpConnected = state.mcpConnected || false;
        this.mcpStatusElement.textContent = mcpConnected ? 'Connected' : 'Disconnected';
        this.mcpIndicatorElement.className = 
            `status-indicator ${mcpConnected ? 'connected' : 'disconnected'}`;

        // Update tools count
        const toolsCount = (state.tools && state.tools.length) || 0;
        this.toolsCountElement.textContent = toolsCount.toString();

        // Update button text
        this.togglePanelBtn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            ${panelActive ? 'Hide Panel' : 'Show Panel'}
        `;
    }

    /**
     * Show loading state
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        this.loadingElement.innerHTML = `
            <div class="spinner"></div>
            <div>${message}</div>
        `;
        this.loadingElement.style.display = 'block';
        this.contentElement.style.display = 'none';
    }

    /**
     * Show content and hide loading
     */
    showContent() {
        this.loadingElement.style.display = 'none';
        this.contentElement.style.display = 'block';
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        console.error(message);
        const content = this.contentElement;
        content.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #ef4444;">
                <p>Error: ${message}</p>
                <button onclick="window.close()" style="margin-top: 10px;">Close</button>
            </div>
        `;
        content.style.display = 'block';
        this.loadingElement.style.display = 'none';
    }

    /**
     * Get current tab
     * @returns {Object} Current tab object
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * Close the popup window
     */
    close() {
        window.close();
    }
} 