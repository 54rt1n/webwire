import { generateMessageId } from '../js/utils/id-generator.js';

/**
 * ChatUIRenderer - Handles all HTML generation for the Chat panel
 */
export class ChatUIRenderer {
    constructor(config = null) {
        this.config = config;
        // Store templates for reusability
        this.templates = {
            icons: {
                replay: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 4v6h6"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>`,
                
                plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>`,
                
                close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>`,
                
                analyze: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>`,
                
                chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>`,
                
                streamingDots: `<div class="ww-streaming-dots">
                    <div class="ww-dot"></div>
                    <div class="ww-dot"></div>
                    <div class="ww-dot"></div>
                </div>`,
                
                send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m22 2-7 20-4-9-9-4Z"/>
                    <path d="M22 2 11 13"/>
                </svg>`,
                
                reparse: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"/>
                    <path d="M6 12c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"/>
                    <path d="M13 12h4"/>
                    <path d="M7 12h4"/>
                </svg>`,
                
                statusIndicator: `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <circle cx="6" cy="6" r="5"/>
                </svg>`,
                
                disk: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <!-- Main floppy body -->
                    <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
                    <!-- Metal slider -->
                    <rect x="7" y="3" width="10" height="5" fill="var(--color-gray-600)"/>
                    <!-- Metal slider opening -->
                    <rect x="9" y="3" width="6" height="3" fill="var(--color-gray-800)"/>
                    <!-- Label area -->
                    <rect x="6" y="11" width="12" height="8" rx="0.5" fill="var(--color-gray-100)"/>
                    <!-- Label lines -->
                    <line x1="8" y1="13" x2="16" y2="13" stroke="var(--color-gray-400)" stroke-width="0.5"/>
                    <line x1="8" y1="15" x2="16" y2="15" stroke="var(--color-gray-400)" stroke-width="0.5"/>
                    <line x1="8" y1="17" x2="14" y2="17" stroke="var(--color-gray-400)" stroke-width="0.5"/>
                </svg>`,
                
                copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>`,
                
                timeline: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>`,
                
                play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>`,
                
                pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="3" width="4" height="18"/>
                    <rect x="14" y="3" width="4" height="18"/>
                </svg>`
            }
        };
    }

    /**
     * Create the complete container HTML
     */
    createContainerHTML() {
        return `
            ${this.createPanelHTML()}
            ${this.createFabHTML()}
        `;
    }

    /**
     * Create the main panel HTML
     */
    createPanelHTML() {
        return `
            <div class="ww-panel hidden">
                ${this.createHeaderHTML()}
                ${this.createChatContentHTML()}
                ${this.createInputContainerHTML()}
            </div>
        `;
    }

    /**
     * Create header HTML
     */
    createHeaderHTML() {
        return `
            <div class="ww-header">
                ${this.createHeaderTopHTML()}
                ${this.createConnectionStatusHTML()}
            </div>
        `;
    }

    /**
     * Create header top section
     */
    createHeaderTopHTML() {
        return `
            <div class="ww-top">
                <div class="ww-agent-info">
                    <span class="ww-name">WebWire Assistant</span>
                    <div class="ww-thread-info">
                        <span class="ww-conversation-id">Ready for conversation</span>
                        <button class="ww-thread-action" id="resync" title="Resync">
                            ${this.templates.icons.replay}
                        </button>
                        <button class="ww-thread-action" id="new-conversation" title="New Conversation">
                            ${this.templates.icons.plus}
                        </button>
                    </div>
                </div>
                <div class="ww-tab-id" title="Tab ID"></div>
                <div class="ww-actions">
                    ${this.createHeaderButton('close-panel', 'Close', this.templates.icons.close)}
                </div>
            </div>
        `;
    }

    /**
     * Create header button
     */
    createHeaderButton(id, title, iconSvg) {
        return `
            <button class="ww-header-icon" id="${id}" title="${title}">
                ${iconSvg}
            </button>
        `;
    }

    /**
     * Create connection status HTML
     */
    createConnectionStatusHTML() {
        const showMcp = this.config && this.config.get && this.config.get('features.mcp.enabled', false);
        return `
            <div class="ww-connection-status">
                <span class="ww-status-indicator-ai">${this.templates.icons.statusIndicator}</span>
                ${showMcp ? `<span class="ww-status-indicator-mcp">${this.templates.icons.statusIndicator}</span>` : ''}
                <span class="ww-status-text">Ready</span>
                <span class="ww-save-indicator">${this.templates.icons.disk}</span>
            </div>
        `;
    }

    /**
     * Create page content toggle HTML
     */
    createPageContentToggleHTML() {
        return `
            <div class="ww-page-content-toggle">
                <label class="ww-label">
                    <input type="checkbox" class="ww-checkbox">
                    <span class="ww-text">Include page content</span>
                </label>
            </div>
        `;
    }

    /**
     * Create chat content HTML
     */
    createChatContentHTML() {
        return `
            <div class="ww-content ww-chat">
                ${this.createWelcomeHTML()}
            </div>
        `;
    }

    /**
     * Create welcome message HTML
     * @param {Object} activePrompts - Active prompts from state service (promptId -> promptData)
     */
    createWelcomeHTML(activePrompts = {}) {
        const promptButtons = Object.entries(activePrompts).map(([promptId, prompt]) => {
            // Use emoji directly from buttonIcon
            const icon = prompt.buttonIcon || '📖';
            
            return `
                <button class="ww-btn" data-prompt-id="${promptId}">
                    <span class="ww-btn-icon">${icon}</span>
                    ${prompt.buttonText}
                </button>
            `;
        }).join('');
        
        return `
            <div class="ww-welcome-message">
                <div class="ww-welcome-icon">🤖</div>
                <h3>WebWire Assistant</h3>
                <p>I can analyze this webpage and help you with questions. I also have access to various tools through MCP integration.</p>
                <div class="ww-quick-actions">
                    ${promptButtons}
                </div>
            </div>
        `;
    }

    /**
     * Create input container HTML
     */
    createInputContainerHTML() {
        return `
            <div class="ww-input-container">
                <div class="ww-settings-drawer">
                    <div class="ww-drawer-handle">
                        <div class="ww-drawer-summary">
                            <span class="ww-drawer-summary-text">Enabled: Page Content</span>
                        </div>
                        <button class="ww-drawer-toggle" title="Toggle settings">
                            <svg class="ww-chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ww-drawer-content">
                        <div class="ww-settings-grid">
                            <label class="ww-label">
                                <input type="checkbox" class="ww-checkbox ww-page-content-checkbox" checked>
                                <span class="ww-text">Include page content</span>
                            </label>
                            ${this._renderConditionalCheckboxes()}
                        </div>
                        <div class="ww-model-selector">
                            <div class="ww-model-selector-grid">
                                <div class="ww-model-radios">
                                    <div class="ww-model-radio-row">
                                        <label class="ww-label">
                                            <input type="radio" name="ww-selected-model" value="chat" class="ww-radio ww-model-chat" checked>
                                            <span class="ww-text">Chat</span>
                                        </label>
                                        <label class="ww-label">
                                            <input type="radio" name="ww-selected-model" value="thought" class="ww-radio ww-model-thought">
                                            <span class="ww-text">Thought</span>
                                        </label>
                                    </div>
                                    <div class="ww-model-radio-row">
                                        <label class="ww-label">
                                            <input type="radio" name="ww-selected-model" value="code" class="ww-radio ww-model-code">
                                            <span class="ww-text">Code</span>
                                        </label>
                                        <label class="ww-label">
                                            <input type="radio" name="ww-selected-model" value="creative" class="ww-radio ww-model-creative">
                                            <span class="ww-text">Creative</span>
                                        </label>
                                    </div>
                                </div>
                                <div class="ww-selected-model-display">
                                    <div class="ww-model-name-row">Selected: <span class="ww-model-name">-</span></div>
                                    <div class="ww-model-config-row">
                                        <span class="ww-model-temp">Temp: -</span>
                                        <span class="ww-model-max">Max: -</span>
                                        <span class="ww-model-config"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="ww-drawer-actions">
                            <button class="ww-reparse-button" title="Reparse with tools">Reparse</button>
                            <button class="ww-back-button" title="Mark last message as dropped">Back</button>
                            <button class="ww-retry-button" title="Retry last message">Retry</button>
                        </div>
                    </div>
                </div>
                <div class="ww-wrapper">
                    <textarea 
                        class="ww-input" 
                        placeholder="Ask me anything about this page or use tools..."
                    ></textarea>
                    <button class="ww-send-button" disabled title="Send message">
                        ${this.templates.icons.send}
                    </button>
                    <button class="ww-cancel-button" style="display: none;" title="Cancel response">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Create FAB HTML
     */
    createFabHTML() {
        return `
            <div class="ww-fab">
                ${this.templates.icons.chat}
            </div>
        `;
    }
    
    /**
     * Create streaming FAB content
     */
    createStreamingFabContent() {
        return this.templates.icons.streamingDots;
    }
    
    /**
     * Create normal FAB content
     */
    createNormalFabContent() {
        return this.templates.icons.chat;
    }

    /**
     * Create a message element
     */
    createMessageElement(message, options = {}) {
        const {
            isThinking = false,
        } = options;

        const messageEl = document.createElement('div');
        messageEl.className = `ww-message ${isThinking ? 'ww-thinking' : 'ww-' + message.role}`;
        
        if (message.messageId || message.id) {
            messageEl.id = message.messageId || message.id;
        }

        messageEl.innerHTML = this.createMessageHTML(message, options);

        return messageEl;
    }

    /**
     * Create message HTML
     */
    createMessageHTML(message, options = {}) {
        const { isThinking, toolMessages, renderTools, userName, personaName } = options;

        const time = new Date(message.timestamp || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Generate sender name using persona names if available
        let senderName = '';
        if (isThinking) {
            senderName = personaName || 'Assistant';
        } else if (message.role === 'user') {
            senderName = userName || 'You';
        } else if (message.role === 'assistant') {
            senderName = personaName || 'Assistant';
        } else if (message.role === 'error') {
            senderName = 'Error';
        }

        let contentHTML = '';
        
        if (isThinking) {
            contentHTML = this.createThinkingContentHTML();
        //} else if (message.role === 'error') {
        //    contentHTML = this.createErrorContentHTML(message.content);
        } else {
            contentHTML = this.createMessageContentHTML(message.content);
        }

        if (renderTools && toolMessages && toolMessages.length > 0) {
            contentHTML += this.createToolMessagesHTML(toolMessages, message.messageId);
        }

        const copyButtonHTML = (message.role === 'assistant' && !isThinking) 
            ? `<button class="ww-copy-button" data-message-id="${message.messageId || message.id}" title="Copy message">
                ${this.templates.icons.copy}
               </button>`
            : '';
            
        const playButtonHTML = (message.role === 'assistant' && !isThinking)
            ? `<button class="ww-play-button" data-message-id="${message.messageId || message.id}" title="Play message">
                ${this.templates.icons.play}
               </button>`
            : '';

        return `
            <div class="ww-sender">${senderName}</div>
            <div class="ww-content">${contentHTML}</div>
            <div class="ww-message-actions">
                ${playButtonHTML}
                ${copyButtonHTML}
                <div class="ww-time">${time}</div>
            </div>
        `;
    }

    /**
     * Create thinking content HTML
     */
    createThinkingContentHTML() {
        return `
            <span class="ww-thinking-line">
                <span class="ww-streaming-content">⚡ <span class="ww-cursor">▊</span></span>
            </span>
        `;
    }

    /**
     * Create error content HTML
     */
    createErrorContentHTML(content) {
        return `<span class="ww-error-icon">❌</span><span class="ww-error-text">${content}</span>`;
    }

    /**
     * Create message content HTML
     */
    createMessageContentHTML(content) {
        return this.escapeAndFormatContent(content);
    }

    /**
     * Create tool messages HTML
     */
    createToolMessagesHTML(toolMessages, messageId) {
        let html = '<div class="ww-tool-messages">';
        
        for (const toolMessage of toolMessages) {
            html += this.createToolMessageHTML(toolMessage, messageId);
        }
        
        html += '</div>';
        return html;
    }

    /**
     * Create individual tool message HTML
     */
    createToolMessageHTML(toolMessage, messageId) {
        const { display, callId, error, executionTime, parameters, name, success, ...results } = toolMessage;
        
        switch (display) {
            case 'success':
                const result = JSON.stringify(results, null, 2);
                return this.createToolSuccessHTML(callId, {name, result});
            
            case 'error':
                return this.createToolErrorHTML(callId, {name, error});
            
            case 'pending':
            default:
                return this.createToolPendingHTML(callId, {name, parameters, messageId});
        }
    }

    /**
     * Create tool success HTML
     */
    createToolSuccessHTML(callId, {name, result}) {
        return `
            <div id="${callId}" class="ww-tool-message ww-success">
                <div class="ww-name">${this.escapeHTML(name)}</div>
                <div class="ww-summary ww-success">${this.escapeHTML(result)}</div>
            </div>
        `;
    }

    /**
     * Create tool error HTML
     */
    createToolErrorHTML(callId, {name, error}) {
        return `
            <div id="${callId}" class="ww-tool-message ww-error">
                <div class="ww-name">${this.escapeHTML(name)}</div>
                <div class="ww-summary ww-error">${this.escapeHTML(error)}</div>
            </div>
        `;
    }

    /**
     * Create tool pending HTML
     */
    createToolPendingHTML(callId, {name, parameters, messageId}) {
        return `
            <div id="${callId}" class="ww-tool-message ww-pending" 
                 data-message-id="${messageId}"
                 data-call-id="${callId}"
                 data-tool-name="${this.escapeHTML(name)}" 
                 data-tool-parameters="${JSON.stringify(parameters)}"
                 >
                <div class="ww-name">${this.escapeHTML(name)}</div>
                <div class="ww-summary ww-pending">
                    <button class="ww-tool-btn" data-action="execute">✅ Execute</button>
                    <button class="ww-tool-btn" data-action="cancel">❌ Cancel</button>
                </div>
            </div>
        `;
    }

    /**
     * Create welcome element (for dynamic insertion)
     * @param {Object} activePrompts - Active prompts from state service
     */
    createWelcomeElement(activePrompts = {}) {
        const welcomeEl = document.createElement('div');
        welcomeEl.className = 'ww-welcome-message';
        welcomeEl.innerHTML = this.createWelcomeHTML(activePrompts).match(/<div class="ww-welcome-message">([\s\S]*)<\/div>/)[1];
        return welcomeEl;
    }

    /**
     * Update streaming content HTML
     */
    updateStreamingContent(streamingElement, content) {
        if (streamingElement) {
            // Format content and append cursor inline with the text, keeping lightning emoji
            const formattedContent = this.escapeAndFormatContent(content);
            streamingElement.innerHTML = '⚡ ' + formattedContent + '<span class="ww-cursor">▊</span>';
        }
    }

    /**
     * Update message to final state HTML
     */
    createFinalizedMessageHTML(finalContent, toolMessages = [], messageId) {
        let html = this.createMessageContentHTML(finalContent);
        
        if (toolMessages.length > 0) {
            html += this.createToolMessagesHTML(toolMessages, messageId);
        }
        
        return html;
    }

    /**
     * URL encode HTML and break new lines
     */
    escapeHTML(str) {
        if (!str) return '';
        return this.formatMessageContent(str);
    }
    
    /**
     * Format message content (basic HTML escaping and line breaks)
     */
    formatMessageContent(content) {
        if (!content) return '';
        
        // Basic HTML escaping
        const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Convert line breaks to <br>
        return escaped.replace(/\n/g, '<br>');
    }

    /**
     * Escape and format content (with line breaks)
     */
    escapeAndFormatContent(content) {
        if (!content) return '';
        
        const escaped = this.escapeHTML(content);
        return escaped.replace(/\n/g, '<br>');
    }

    /**
     * Create copy button HTML
     */
    createCopyButtonHTML(messageId) {
        return `<button class="ww-copy-button" data-message-id="${messageId}" title="Copy message">
            ${this.templates.icons.copy}
        </button>`;
    }

    createPlayButtonHTML(messageId) {
        return `<button class="ww-play-button" data-message-id="${messageId}" title="Play message">
            ${this.templates.icons.play}
        </button>`;
    }

    /**
     * Create error notification HTML
     */
    createErrorNotificationHTML(message) {
        return `<div class="ww-notification">${this.escapeHTML(message)}</div>`;
    }

    /**
     * Render conditional checkboxes based on configuration
     * @returns {string} HTML for conditional checkboxes
     */
    _renderConditionalCheckboxes() {
        let checkboxes = '';
        
        // Only show MCP checkbox if MCP is enabled
        if (this.config && this.config.get && this.config.get('features.mcp.enabled', false)) {
            checkboxes += `
                <label class="ww-label">
                    <input type="checkbox" class="ww-checkbox ww-mcp-checkbox">
                    <span class="ww-text">Use MCP</span>
                </label>`;
        }
        
        // Only show tools checkboxes if tools are enabled
        if (this.config && this.config.get && this.config.get('features.tools.enabled', false)) {
            checkboxes += `
                <label class="ww-label">
                    <input type="checkbox" class="ww-checkbox ww-browser-tools-checkbox">
                    <span class="ww-text">Use browser tools</span>
                </label>
                <label class="ww-label">
                    <input type="checkbox" class="ww-checkbox ww-auto-execute-checkbox">
                    <span class="ww-text">Auto-execute tools</span>
                </label>`;
        }
        
        return checkboxes;
    }
}