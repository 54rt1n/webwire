import '../../src/shared/global.scss';
import './style.scss';
import { EventDispatcher } from '../../src/js/core/event-dispatcher.js';
import { BACKGROUND_ACTIONS } from '../../src/js/core/cc-actions.js';

/**
 * UI management for the WebWire popup providing status display and user interaction controls.
 * Handles status updates, button interactions, and communication with the background script.
 * 
 * @example
 * const popup = new WebWirePopup(config);
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
    constructor(config) {
        this.config = config;
        this.initializeElements();
        this.currentTab = null;
        this.dispatcher = new EventDispatcher('popup');
    }

    initializeElements() {
        // Status elements
        this.loadingElement = document.getElementById('loading');
        this.contentElement = document.getElementById('content');
        this.configMessageElement = document.getElementById('config-message');
        
        // Stat elements
        this.conversationCountElement = document.getElementById('conversation-count');
        this.conversationIndicatorElement = document.getElementById('conversation-indicator');
        this.configStatusElement = document.getElementById('config-status');
        this.configIndicatorElement = document.getElementById('config-indicator');
        this.messageCountElement = document.getElementById('message-count');
        this.messageIndicatorElement = document.getElementById('message-indicator');

        // Action buttons
        this.conversationsBtn = document.getElementById('conversations-btn');
        this.promptsBtn = document.getElementById('prompts-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.helpBtn = document.getElementById('help-btn');
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
        this.conversationsBtn.addEventListener('click', handlers.onConversations);
        this.promptsBtn.addEventListener('click', handlers.onPrompts);
        this.settingsBtn.addEventListener('click', handlers.onSettings);
        this.helpBtn.addEventListener('click', handlers.onHelp);
    }

    /**
     * Load status from background script
     */
    async loadStatus() {
        try {
            this.showLoading('Loading stats...');
            
            const stats = await this.dispatcher.dispatch(
                BACKGROUND_ACTIONS.GET_EXTENSION_STATS,
                {},
                { target: 'background' }
            );

            const { success, result } = stats;
            if (!success) {
                throw new Error('Failed to load stats');
            }

            console.log('Extension stats:', result);
            this.updateStatus(result);
            this.showContent();

        } catch (error) {
            console.error('Failed to load status:', error);
            this.updateStatus({});
            this.showContent();
        }
    }

    /**
     * Update status display based on stats
     * @param {Object} stats - Extension stats object
     */
    updateStatus(stats) {
        // Update configuration status (most important)
        const configValid = stats.configurationValid || false;
        this.configStatusElement.textContent = configValid ? 'Valid' : 'Invalid';
        this.configIndicatorElement.className = 
            `status-indicator ${configValid ? 'connected' : 'warning'}`;
        
        // Show/hide config message
        if (configValid) {
            this.configMessageElement.style.display = 'none';
        } else {
            this.configMessageElement.style.display = 'block';
        }
        
        // Update conversation count
        const conversationCount = stats.conversationCount || 0;
        this.conversationCountElement.textContent = conversationCount;
            
        // Update message count
        const messageCount = stats.totalMessages || 0;
        this.messageCountElement.textContent = messageCount;
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