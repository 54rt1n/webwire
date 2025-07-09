import '../shared/global.scss';
import './style.css';

/**
 * UI management for the MCP test interface providing all user interaction controls.
 * Handles connection status, tool display, chat interface, system configuration,
 * and real-time updates with automatic state persistence.
 * 
 * @example
 * const panel = new MCPTestPanel();
 * panel.setStateService(stateService);
 * await panel.initialize();
 * 
 * // Setup event handlers
 * panel.setupEventListeners({
 *   onConnect: () => connectToMCP(),
 *   onSendChat: () => sendMessage()
 * });
 * 
 * // Update UI state
 * panel.updateConnectionStatus('connected', 'Connected to server');
 * panel.renderTools(tools);
 * panel.addChatMessage('user', 'Hello');
 */

export class MCPTestPanel {
    constructor() {
        this.initializeElements();
        //this.conversationId = 'mcp-test-' + Date.now();
        this.conversationId = 'default-convo';
        this.stateService = null; // Will be set externally
        this.collapsedSections = new Set(['mcp-config', 'tools', 'mcp-system']); // Track collapsed sections - start with all collapsed
    }

    initializeElements() {
        // MCP Configuration elements
        this.mcpUrlInput = document.getElementById('mcpUrl');
        this.autoConnectCheckbox = document.getElementById('autoConnectCheckbox');
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionMessage = document.getElementById('connectionMessage');

        // Summary elements
        this.mcpConfigSummary = document.getElementById('mcpConfigSummary');
        this.toolsSummary = document.getElementById('toolsSummary');

        // Tools elements
        this.listToolsBtn = document.getElementById('listToolsBtn');
        this.refreshToolsBtn = document.getElementById('refreshToolsBtn');
        this.toolsContainer = document.getElementById('toolsContainer');

        // System Message elements
        this.mcpSystemMessage = document.getElementById('mcpSystemMessage');
        this.mcpSystemSummary = document.getElementById('mcpSystemSummary');
        this.saveSystemMessageBtn = document.getElementById('saveSystemMessageBtn');
        this.discardSystemMessageBtn = document.getElementById('discardSystemMessageBtn');

        // Chat elements
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendChatBtn = document.getElementById('sendChatBtn');
        this.retryChatBtn = document.getElementById('retryChatBtn');
        this.replayToolsBtn = document.getElementById('replayToolsBtn');
        this.clearChatBtn = document.getElementById('clearChatBtn');

        // Debug elements
        this.showStateBtn = document.getElementById('showStateBtn');
        this.showStatsBtn = document.getElementById('showStatsBtn');
        this.debugContainer = document.getElementById('debugContainer');
        
        // Track last user message for retry functionality
        this.lastUserMessage = null;
    }

    /**
     * Update connection status display
     * @param {string} status - 'connected', 'disconnected', 'connecting'
     * @param {string} message - Optional status message
     */
    updateConnectionStatus(status, message = '') {
        this.connectionStatus.className = `connection-status ${status}`;
        this.connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        if (message) {
            this.connectionMessage.textContent = message;
            this.connectionMessage.className = `status-message ${status === 'connected' ? 'success' : status === 'connecting' ? 'info' : 'error'}`;
            this.connectionMessage.style.display = 'block';
        } else {
            this.connectionMessage.style.display = 'none';
        }

        // Update button states
        this.connectBtn.disabled = status === 'connected' || status === 'connecting';
        this.disconnectBtn.disabled = status === 'disconnected';
        this.listToolsBtn.disabled = status !== 'connected';
        this.refreshToolsBtn.disabled = status !== 'connected';
        this.sendChatBtn.disabled = status !== 'connected' || !this.chatInput.value.trim();
        this.retryChatBtn.disabled = status !== 'connected' || !this.lastUserMessage;
        this.replayToolsBtn.disabled = status !== 'connected';
        this.chatInput.disabled = status !== 'connected';

        // Update MCP configuration summary
        this.updateMcpConfigSummary();
    }

    /**
     * Show a status message in a container
     * @param {HTMLElement} container - Container element
     * @param {string} message - Status message
     * @param {string} type - 'success', 'error', 'info', 'warning'
     */
    showStatus(container, message, type = 'info') {
        container.innerHTML = `<div class="status-message ${type}">${message}</div>`;
    }

    /**
     * Get the MCP server URL from input
     * @returns {string} The MCP server URL
     */
    getMcpUrl() {
        return this.mcpUrlInput.value.trim();
    }

    /**
     * Set the MCP server URL in input
     * @param {string} url - The MCP server URL
     */
    setMcpUrl(url) {
        this.mcpUrlInput.value = url || '';
        // Update summary when URL changes
        this.updateMcpConfigSummary();
    }

    /**
     * Get the auto-connect checkbox state
     * @returns {boolean} Whether auto-connect is enabled
     */
    getAutoConnect() {
        return this.autoConnectCheckbox.checked;
    }

    /**
     * Set the auto-connect checkbox state
     * @param {boolean} enabled - Whether auto-connect should be enabled
     */
    setAutoConnect(enabled) {
        this.autoConnectCheckbox.checked = enabled || false;
    }

    /**
     * Render the tools list
     * @param {Array} tools - Array of tools in OpenAI format
     */
    renderTools(tools) {
        if (!tools || tools.length === 0) {
            this.showStatus(this.toolsContainer, 'No tools available from MCP server', 'info');
            this.updateToolsSummary([]);
            return;
        }

        const toolsList = document.createElement('div');
        toolsList.className = 'tools-list';

        tools.forEach(tool => {
            const toolItem = document.createElement('div');
            toolItem.className = 'tool-item';

            toolItem.innerHTML = `
                <div class="tool-name">${tool.function.name}</div>
                <div class="tool-description">${tool.function.description || 'No description provided'}</div>
                <div class="tool-parameters">${JSON.stringify(tool.function.parameters, null, 2)}</div>
            `;

            toolsList.appendChild(toolItem);
        });

        this.toolsContainer.innerHTML = '';
        this.toolsContainer.appendChild(toolsList);
        
        // Update tools summary
        this.updateToolsSummary(tools);
    }

    /**
     * Add a message to the chat display
     * @param {string} type - 'user', 'assistant', 'system', 'error'
     * @param {string} content - Message content
     * @param {Object} options - Optional parameters
     * @returns {HTMLElement} The message element
     */
    addChatMessage(type, content, { statusText = '', additionalContent = '', isLoading = false, isHtml = false, ...options } = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;

        const timestamp = new Date().toLocaleTimeString();
        const typeLabel = type === 'user' ? 'You' : 
                         type === 'assistant' ? 'Assistant' : 
                         type === 'system' ? 'System' : 'Error';

        let messageContent = content;
        if (isHtml) {
            messageContent = content;
        } else {
            messageContent = this.escapeHtml(content);
            messageContent = messageContent.replace(/\n/g, '<br>');
        }

        if (additionalContent) {
            additionalContent = this.escapeHtml(additionalContent);
            additionalContent = additionalContent.replace(/\n/g, '<br>');
        }

        let messageHtml = `
            <div class="message-meta"><strong>${typeLabel}</strong> <small>${timestamp}</small></div>
            <div class="message-content">${messageContent}</div>
            <div class="status-bar">${statusText}</div>
            <div class="additional-content">${additionalContent}</div>
        `;

        messageDiv.innerHTML = messageHtml;

        // Add loading class if specified
        if (isLoading) {
            messageDiv.classList.add('loading');
        }

        this.chatMessages.appendChild(messageDiv);
        this.scrollChatToBottom();

        return messageDiv;
    }

    /**
     * Update a card's content
     * @param {HTMLElement} messageElement - The message element to update
     * @param {string} content - New content to append
     */
    updateStreamingMessage(messageElement, content) {
        if (!messageElement) return;

        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML += this.escapeHtml(content).replace(/\n/g, '<br>');
            this.scrollChatToBottom();
        }
    }

    /**
     * Update a card's status bar
     * @param {HTMLElement} messageElement - The message element to update
     * @param {string} status - The new status
     */
    updateCardStatus(messageElement, status) {
        if (!messageElement) return;
        const statusDiv = messageElement.querySelector('.status-bar');
        if (statusDiv) {
            statusDiv.textContent = status;
        }
    }

    /**
     * Update a card's additional content
     * @param {HTMLElement} messageElement - The message element to update
     * @param {string} content - The new content
     */
    updateCardAdditionalContent(messageElement, content) {
        if (!messageElement) return;
        // html encode and replace newlines with <br>
        content = this.escapeHtml(content);
        content = content.replace(/\n/g, '<br>');
        const additionalContentDiv = messageElement.querySelector('.additional-content');
        if (additionalContentDiv) {
            additionalContentDiv.innerHTML = content;
        }
    }

    /**
     * Clear chat messages
     */
    clearChat() {
        this.chatMessages.innerHTML = '';
        this.lastUserMessage = null;
        this.updateRetryButtonState();
        this.addChatMessage('system', 'Chat cleared. Ready for new messages.');
    }

    /**
     * Get chat input value
     * @returns {string} The chat input value
     */
    getChatInput() {
        return this.chatInput.value.trim();
    }

    /**
     * Clear chat input
     */
    clearChatInput() {
        this.chatInput.value = '';
        this.updateSendButtonState();
    }

    /**
     * Update send button state based on input
     */
    updateSendButtonState() {
        const hasInput = this.chatInput.value.trim().length > 0;
        const isConnected = !this.sendChatBtn.disabled;
        this.sendChatBtn.disabled = !hasInput || !isConnected;
        this.updateRetryButtonState();
    }

    /**
     * Scroll chat to bottom
     */
    scrollChatToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /**
     * Show debug information
     * @param {Object} debugInfo - Debug information object
     * @param {string} title - Debug section title
     */
    showDebugInfo(debugInfo, title = 'Debug Information') {
        const debugContent = document.createElement('div');
        debugContent.className = 'debug-content';
        debugContent.innerHTML = `
            <h3>${title}</h3>
            <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
        `;

        this.debugContainer.innerHTML = '';
        this.debugContainer.appendChild(debugContent);
    }

    /**
     * Show loading state in debug container
     * @param {string} message - Loading message
     */
    showDebugLoading(message = 'Loading...') {
        this.showStatus(this.debugContainer, message, 'info');
    }

    /**
     * Enable/disable chat interface
     * @param {boolean} enabled - Whether to enable chat
     */
    setChatEnabled(enabled) {
        this.chatInput.disabled = !enabled;
        this.updateSendButtonState();
    }

    /**
     * Set loading state for tools
     * @param {boolean} loading - Whether tools are loading
     */
    setToolsLoading(loading) {
        if (loading) {
            this.showStatus(this.toolsContainer, 'Loading tools...', 'info');
        }
        this.listToolsBtn.disabled = loading;
        this.refreshToolsBtn.disabled = loading;
    }

    /**
     * Set loading state for connection
     * @param {boolean} loading - Whether connection is loading
     */
    setConnectionLoading(loading) {
        this.connectBtn.disabled = loading;
        if (loading) {
            this.updateConnectionStatus('connecting', 'Connecting to MCP server...');
        }
    }

    /**
     * Escape HTML characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Setup event listeners for UI interactions
     * @param {Object} handlers - Object containing event handlers
     */
    setupEventListeners(handlers) {
        // Connection handlers
        this.connectBtn.addEventListener('click', handlers.onConnect);
        this.disconnectBtn.addEventListener('click', handlers.onDisconnect);

        // Tools handlers
        this.listToolsBtn.addEventListener('click', handlers.onListTools);
        this.refreshToolsBtn.addEventListener('click', handlers.onRefreshTools);

        // System Message handlers
        if (this.saveSystemMessageBtn) {
            this.saveSystemMessageBtn.addEventListener('click', () => this.saveSystemMessage());
        }
        if (this.discardSystemMessageBtn) {
            this.discardSystemMessageBtn.addEventListener('click', () => this.discardSystemMessage());
        }
        if (this.mcpSystemMessage) {
            this.mcpSystemMessage.addEventListener('input', () => {
                this.updateSystemMessageSummary();
                this.updateSystemMessageButtons();
            });
            this.mcpSystemMessage.addEventListener('blur', () => {
                this.updateSystemMessageSummary();
                this.updateSystemMessageButtons();
            });
        }

        // Chat handlers
        this.sendChatBtn.addEventListener('click', handlers.onSendChat);
        this.retryChatBtn.addEventListener('click', handlers.onRetryChat);
        this.replayToolsBtn.addEventListener('click', handlers.onReplayTools);
        this.clearChatBtn.addEventListener('click', handlers.onClearChat);
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlers.onSendChat();
            }
        });
        this.chatInput.addEventListener('input', () => {
            this.updateSendButtonState();
        });
        
        // Update summary when URL input changes
        this.mcpUrlInput.addEventListener('input', () => {
            this.updateMcpConfigSummary();
        });

        // Handle auto-connect checkbox changes
        this.autoConnectCheckbox.addEventListener('change', () => {
            handlers.onAutoConnectChanged();
            this.updateMcpConfigSummary(); // Update summary when auto-connect changes
        });

        // Debug handlers
        this.showStateBtn.addEventListener('click', handlers.onShowState);
        this.showStatsBtn.addEventListener('click', handlers.onShowStats);
    }

    /**
     * Get conversation ID for this session
     * @returns {string} Conversation ID
     */
    getConversationId() {
        return this.conversationId;
    }

    /**
     * Set the state service for persistence
     * @param {Object} stateService - The state service instance
     */
    setStateService(stateService) {
        this.stateService = stateService;
    }

    /**
     * Initialize collapsible sections
     */
    async initializeCollapsibleSections() {
        // Load UI state from storage first
        if (this.stateService && this.stateService.ui) {
            await this.stateService.ui.loadUiState();
        }
        
        // Load collapsed state from storage
        this.loadCollapsedState();
        
        // Setup collapsible headers
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            header.addEventListener('click', (e) => {
                const section = header.closest('.section');
                const sectionId = section.dataset.section;
                this.toggleSection(sectionId);
            });
        });
        
        // Apply initial collapsed states
        this.applyCollapsedStates();
    }

    /**
     * Toggle a section's collapsed state
     * @param {string} sectionId - The section identifier
     */
    toggleSection(sectionId) {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (!section) return;

        const content = section.querySelector('.section-content');
        const chevron = section.querySelector('.chevron');
        const summary = section.querySelector('.section-summary');
        
        if (this.collapsedSections.has(sectionId)) {
            // Expand
            this.collapsedSections.delete(sectionId);
            content.classList.remove('collapsed');
            chevron.classList.remove('collapsed');
            if (summary) {
                summary.classList.remove('visible');
            }
        } else {
            // Collapse
            this.collapsedSections.add(sectionId);
            content.classList.add('collapsed');
            chevron.classList.add('collapsed');
            if (summary) {
                summary.classList.add('visible');
            }
        }
        
        // Save state
        this.saveCollapsedState();
    }

    /**
     * Load collapsed state from storage
     */
    loadCollapsedState() {
        if (!this.stateService) return;
        
        const uiState = this.stateService.state.ui || {};
        const savedCollapsedSections = uiState.mcpPanelCollapsed;
        
        // If we have saved state, use it; otherwise keep the default collapsed state
        if (savedCollapsedSections !== undefined) {
            this.collapsedSections = new Set(savedCollapsedSections);
        }
        // If no saved state, keep the default: both panels collapsed
    }

    /**
     * Save collapsed state to storage
     */
    saveCollapsedState() {
        if (!this.stateService) return;
        
        const uiState = this.stateService.state.ui || {};
        uiState.mcpPanelCollapsed = Array.from(this.collapsedSections);
        this.stateService.state.ui = uiState;
        
        // Save to storage
        if (this.stateService.ui) {
            this.stateService.ui.saveUiState();
        }
    }

    /**
     * Apply collapsed states to sections
     */
    applyCollapsedStates() {
        this.collapsedSections.forEach(sectionId => {
            const section = document.querySelector(`[data-section="${sectionId}"]`);
            if (section) {
                const content = section.querySelector('.section-content');
                const chevron = section.querySelector('.chevron');
                const summary = section.querySelector('.section-summary');
                content.classList.add('collapsed');
                chevron.classList.add('collapsed');
                if (summary) {
                    summary.classList.add('visible');
                }
            }
        });
    }

    /**
     * Update MCP configuration summary
     */
    updateMcpConfigSummary() {
        if (!this.mcpConfigSummary) return;

        const url = this.getMcpUrl();
        const urlDisplay = url ? (url.length > 30 ? url.substring(0, 30) + '...' : url) : 'No URL configured';
        
        const urlElement = this.mcpConfigSummary.querySelector('.summary-url');
        const statusElement = this.mcpConfigSummary.querySelector('.summary-status');
        
        if (urlElement) {
            urlElement.textContent = urlDisplay;
        }
        
        if (statusElement) {
            const isConnected = this.connectBtn.disabled && !this.disconnectBtn.disabled;
            const autoConnect = this.getAutoConnect();
            const statusText = isConnected ? 'Connected' : 'Disconnected';
            const statusClass = isConnected ? 'connected' : 'disconnected';
            const autoConnectText = autoConnect ? ' • Auto-connect: On' : ' • Auto-connect: Off';
            
            statusElement.textContent = statusText + autoConnectText;
            statusElement.className = `summary-status ${statusClass}`;
        }
    }

    /**
     * Update tools summary
     * @param {Array} tools - Array of available tools
     */
    updateToolsSummary(tools = []) {
        if (!this.toolsSummary) return;

        const toolsElement = this.toolsSummary.querySelector('.summary-tools');
        if (toolsElement) {
            const count = tools.length;
            toolsElement.textContent = `${count} Tool${count !== 1 ? 's' : ''} Available`;
        }
    }

    /**
     * Get the system message value
     * @returns {string} The system message
     */
    getSystemMessage() {
        return this.mcpSystemMessage ? this.mcpSystemMessage.value.trim() : '';
    }

    /**
     * Set the system message value
     * @param {string} message - The system message
     */
    setSystemMessage(message) {
        if (this.mcpSystemMessage) {
            this.mcpSystemMessage.value = message || '';
        }
        this.updateSystemMessageSummary();
        this.updateSystemMessageButtons();
    }

    /**
     * Check if system message has changes and update button visibility
     */
    updateSystemMessageButtons() {
        if (!this.stateService) return;

        const hasChanges = this.stateService.mcp.hasSystemMessageChanged();
        const currentValue = this.getSystemMessage();
        const savedValue = this.stateService.mcp.getSystemMessage({ getSettings: true }) || '';

        // Show buttons if there are actual changes from user input
        const hasUserChanges = currentValue !== savedValue;
        
        if (this.saveSystemMessageBtn && this.discardSystemMessageBtn) {
            this.saveSystemMessageBtn.style.display = hasUserChanges ? 'flex' : 'none';
            this.discardSystemMessageBtn.style.display = hasUserChanges ? 'flex' : 'none';
        }
    }

    /**
     * Update system message summary
     */
    updateSystemMessageSummary() {
        if (!this.mcpSystemSummary) return;

        const summaryElement = this.mcpSystemSummary.querySelector('.summary-system-message');
        if (summaryElement) {
            const message = this.getSystemMessage();
            if (message) {
                const truncated = message.length > 50 ? message.substring(0, 50) + '...' : message;
                summaryElement.textContent = `Custom: "${truncated}"`;
                summaryElement.style.color = '#4CAF50';
                summaryElement.style.fontStyle = 'normal';
            } else {
                summaryElement.textContent = 'No custom system message';
                summaryElement.style.color = '#666';
                summaryElement.style.fontStyle = 'italic';
            }
        }
    }

    /**
     * Save system message to settings
     */
    async saveSystemMessage() {
        if (!this.stateService) return;

        try {
            const message = this.getSystemMessage();
            this.stateService.mcp.setSystemMessage(message, { setSettings: true });
            await this.stateService.settings.saveSettings();
            
            this.updateSystemMessageButtons();
            this.updateSystemMessageSummary();
            
            // Show success feedback
            this.addChatMessage('system', 'System message saved successfully');
            console.log('[MCPTestPanel] System message saved:', message);
        } catch (error) {
            console.error('[MCPTestPanel] Failed to save system message:', error);
            this.addChatMessage('error', `Failed to save system message: ${error.message}`);
        }
    }

    /**
     * Discard system message changes
     */
    discardSystemMessage() {
        if (!this.stateService) return;

        const savedMessage = this.stateService.mcp.getSystemMessage({ getSettings: true });
        this.setSystemMessage(savedMessage);
        this.updateSystemMessageButtons();
        
        console.log('[MCPTestPanel] System message changes discarded');
    }

    /**
     * Initialize the panel with default states
     */
    async initialize() {
        this.updateConnectionStatus('disconnected');
        this.showStatus(this.debugContainer, 'Debug information will appear here', 'info');
        
        // Initialize collapsible sections
        await this.initializeCollapsibleSections();
        
        // Load auto-connect setting from state
        if (this.stateService) {
            const autoConnect = this.stateService.state.settings.mcp?.autoConnect || false;
            console.log('[MCPTestPanel] Loading auto-connect setting:', autoConnect, this.stateService.state);
            this.setAutoConnect(autoConnect);
            
            // Load system message from settings
            const systemMessage = this.stateService.mcp.getSystemMessage({ getSettings: true });
            this.setSystemMessage(systemMessage);
            console.log('[MCPTestPanel] Loading system message:', systemMessage);
            
            // Check if we already have tools available from previous session
            const existingTools = this.stateService.state.mcp?.tools || [];
            if (existingTools.length > 0) {
                this.renderTools(existingTools);
            } else {
                this.showStatus(this.toolsContainer, 'Connect to MCP server to see available tools', 'info');
            }
        } else {
            this.showStatus(this.toolsContainer, 'Connect to MCP server to see available tools', 'info');
        }
        
        // Initialize summaries
        this.updateMcpConfigSummary();
        this.updateToolsSummary(this.stateService?.state.mcp?.tools || []);
        this.updateSystemMessageSummary();
        
        // Add initial message
        this.addChatMessage('system', 'MCP Test Interface initialized. Expand the panels above to configure and connect to an MCP server.');
    }

    /**
     * Set the last user message for retry functionality
     * @param {string} message - The last user message
     */
    setLastUserMessage(message) {
        this.lastUserMessage = message;
        this.updateRetryButtonState();
    }

    /**
     * Get the last user message
     * @returns {string|null} The last user message
     */
    getLastUserMessage() {
        return this.lastUserMessage;
    }

    /**
     * Update retry button state based on connection and last message
     */
    updateRetryButtonState() {
        const isConnected = !this.sendChatBtn.disabled || this.chatInput.disabled === false;
        this.retryChatBtn.disabled = !isConnected || !this.lastUserMessage;
    }
}
