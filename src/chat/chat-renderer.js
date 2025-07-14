import { generateMessageId } from '../js/utils/id-generator.js';

/**
 * ChatUIRenderer - Handles all HTML generation for the Chat panel
 */
export class ChatUIRenderer {
    constructor() {
        // Store templates for reusability
        this.templates = {
            icons: {
                replay: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 4v6h6"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>`,
                
                plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>`,
                
                close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>`,
                
                analyze: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>`,
                
                chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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
                ${this.createPageContentToggleHTML()}
            </div>
        `;
    }

    /**
     * Create header HTML
     */
    createHeaderHTML() {
        return `
            <div class="header">
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
            <div class="top">
                <div class="agent-info">
                    <span class="name">WebWire Assistant</span>
                    <span class="conversation-id">Ready for conversation</span>
                </div>
                <div class="actions">
                    ${this.createHeaderButton('replay-turn', 'Replay Last Turn', this.templates.icons.replay)}
                    ${this.createHeaderButton('new-conversation', 'New Conversation', this.templates.icons.plus)}
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
            <button class="icon" id="${id}" title="${title}">
                ${iconSvg}
            </button>
        `;
    }

    /**
     * Create connection status HTML
     */
    createConnectionStatusHTML() {
        return `
            <div class="connection-status">
                <span class="status-indicator"></span>
                <span class="status-text">Ready</span>
            </div>
        `;
    }

    /**
     * Create page content toggle HTML
     */
    createPageContentToggleHTML() {
        return `
            <div class="page-content-toggle">
                <label class="label">
                    <input type="checkbox" class="checkbox">
                    <span class="text">Include page content</span>
                </label>
            </div>
        `;
    }

    /**
     * Create chat content HTML
     */
    createChatContentHTML() {
        return `
            <div class="content ww-chat">
                ${this.createWelcomeHTML()}
                ${this.createInputContainerHTML()}
            </div>
        `;
    }

    /**
     * Create welcome message HTML
     */
    createWelcomeHTML() {
        return `
            <div class="welcome-message">
                <div class="icon">🤖</div>
                <h3>WebWire Assistant</h3>
                <p>I can analyze this webpage and help you with questions. I also have access to various tools through MCP integration.</p>
                <div class="quick-actions">
                    <button class="btn" id="analyze-page-btn">
                        ${this.templates.icons.analyze}
                        Analyze This Page
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Create input container HTML
     */
    createInputContainerHTML() {
        return `
            <div class="input-container">
                <div class="wrapper">
                    <textarea 
                        class="input" 
                        placeholder="Ask me anything about this page or use tools..."
                        rows="1"
                    ></textarea>
                    <button class="reparse-button" disabled title="Reparse">®</button>
                    <button class="send-button" disabled title="Send">📨</button>
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
     * Create a message element
     */
    createMessageElement(message, options = {}) {
        const {
            isThinking = false,
            toolMessages = [],
            renderTools = true
        } = options;

        const messageEl = document.createElement('div');
        messageEl.className = `message ${isThinking ? 'thinking' : message.role}`;
        
        if (message.messageId || message.id) {
            messageEl.id = message.messageId || message.id;
        }

        messageEl.innerHTML = this.createMessageHTML(message, {
            isThinking,
            toolMessages,
            renderTools
        });

        return messageEl;
    }

    /**
     * Create message HTML
     */
    createMessageHTML(message, options = {}) {
        const { isThinking, toolMessages, renderTools } = options;

        const time = new Date(message.timestamp || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

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

        console.log('[ChatUIRenderer] Creating message HTML:', message, toolMessages, contentHTML);

        return `
            <div class="content">${contentHTML}</div>
            <div class="time">${time}</div>
        `;
    }

    /**
     * Create thinking content HTML
     */
    createThinkingContentHTML() {
        return `
            <span class="thinking-indicator">💭</span>
            <span class="streaming-content"></span>
            <span class="cursor">▊</span>
        `;
    }

    /**
     * Create error content HTML
     */
    createErrorContentHTML(content) {
        return `<span class="error-icon">❌</span><span class="error-text">${content}</span>`;
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
    createToolMessagesHTML(toolMessages) {
        let html = '<div class="tool-messages">';
        
        for (const toolMessage of toolMessages) {
            html += this.createToolMessageHTML(toolMessage);
        }
        
        html += '</div>';
        return html;
    }

    /**
     * Create individual tool message HTML
     */
    createToolMessageHTML(toolMessage) {
        const { display, callId, error, executionTime, parameters, name, success, ...results } = toolMessage;
        
        switch (display) {
            case 'success':
                const result = JSON.stringify(results, null, 2);
                return this.createToolSuccessHTML(callId, {name, result});
            
            case 'error':
                return this.createToolErrorHTML(callId, {name, error});
            
            case 'pending':
            default:
                return this.createToolPendingHTML(callId, {name, parameters});
        }
    }

    /**
     * Create tool success HTML
     */
    createToolSuccessHTML(callId, {name, result}) {
        return `
            <div id="${callId}" class="tool-message success">
                <div class="name">${this.escapeHTML(name)}</div>
                <div class="summary tool-success">${this.escapeHTML(result)}</div>
            </div>
        `;
    }

    /**
     * Create tool error HTML
     */
    createToolErrorHTML(callId, {name, error}) {
        return `
            <div id="${callId}" class="tool-message error">
                <div class="name">${this.escapeHTML(name)}</div>
                <div class="summary tool-error">${this.escapeHTML(error)}</div>
            </div>
        `;
    }

    /**
     * Create tool pending HTML
     */
    createToolPendingHTML(callId, {name, parameters}) {
        return `
            <div id="${callId}" class="tool-message pending" 
                 data-tool-name="${this.escapeHTML(name)}" 
                 >
                <div class="name">${this.escapeHTML(name)}</div>
                <div class="summary tool-pending">
                    <button class="tool-execute-btn" data-action="execute">✅ Execute</button>
                    <button class="tool-cancel-btn" data-action="cancel">❌ Cancel</button>
                </div>
            </div>
        `;
    }

    /**
     * Create welcome element (for dynamic insertion)
     */
    createWelcomeElement() {
        const welcomeEl = document.createElement('div');
        welcomeEl.className = 'welcome-message';
        welcomeEl.innerHTML = this.createWelcomeHTML().match(/<div class="welcome-message">([\s\S]*)<\/div>/)[1];
        return welcomeEl;
    }

    /**
     * Update streaming content HTML
     */
    updateStreamingContent(streamingElement, content) {
        if (streamingElement) {
            streamingElement.innerHTML = this.escapeAndFormatContent(content);
        }
    }

    /**
     * Update message to final state HTML
     */
    createFinalizedMessageHTML(finalContent, toolMessages = []) {
        let html = this.createMessageContentHTML(finalContent);
        
        if (toolMessages.length > 0) {
            html += this.createToolMessagesHTML(toolMessages);
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
     * Create error notification HTML
     */
    createErrorNotificationHTML(message) {
        return `<div class="ww-error-notification">${this.escapeHTML(message)}</div>`;
    }
}