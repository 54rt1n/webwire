import { MCPTestPanel } from './panel.js';
import { initializeContext } from '../js/context/context-init.js';
import { EVENTS } from '../js/core/events.js';
import MCPConnector from '../js/mcp/mcp-connector.js';
import { ToolParser } from '../js/mcp/tool-parser.js';
import { ToolFormatter } from '../js/mcp/tool-formatter.js';
import { AIClientFactory } from '../js/ai/ai-client-factory.js';

/**
 * MCP Test Application - Main business logic for testing MCP server connections.
 * Handles MCP connection management, tool execution, AI chat integration,
 * and conversation persistence for the MCP testing interface.
 * 
 * @example
 * const app = new MCPTestApp();
 * await app.initialize();
 * 
 * // App automatically handles:
 * // - MCP server connections
 * // - Tool discovery and execution
 * // - AI chat with tool calling
 * // - Conversation history persistence
 * // - Error handling and reconnection
 */
class MCPTestApp {
    constructor() {
        this.panel = new MCPTestPanel();
        this.storage = null;
        this.stateService = null;
        this.dispatcher = null;
        this.mcpConnector = null;
        this.aiClient = null;
        this.toolParser = new ToolParser();
        this.currentStreamingMessage = null;
    }

    /**
     * Initialize the MCP test application
     */
    async initialize() {
        console.log('[MCPTestApp] Initializing MCP Test Application...');
        
        try {

            const { dispatcher, stateService, storage } = await initializeContext();
            this.dispatcher = dispatcher;
            this.stateService = stateService;
            this.storage = storage;
            // Load settings and state first
            await this.stateService.settings.loadSettings();
            await this.stateService.disk.loadFromStorage();
            
            // Set state service for the panel and initialize
            this.panel.setStateService(this.stateService);
            await this.panel.initialize();
            
            this.renderHistory();

            console.log('[MCPTestApp] State:', this.stateService.state);
            
            // Load MCP URL from settings
            const mcpUrl = this.stateService.state.settings?.mcp?.serverUrl;
            if (mcpUrl) {
                this.panel.setMcpUrl(mcpUrl);
            }
            
            // Setup AI client for chat functionality
            await this.setupAIClient();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Subscribe to MCP events
            this.setupMCPEventListeners();
            
            // Auto-connect if enabled
            await this.handleAutoConnect();
            
            console.log('[MCPTestApp] MCP Test Application initialized successfully');
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to initialize:', error);
            this.panel.addChatMessage('error', `Initialization failed: ${error.message}`, { isHtml: true });
        }
    }

    /**
     * Renders the conversation history on load.
     */
    renderHistory() {
        const conversationId = this.panel.getConversationId();
        const messages = this.stateService.conversation.getConversationMessages(conversationId);
        
        // Keep track of the last user message for retry functionality
        let lastUserMessage = null;
        
        messages.forEach(msg => {
            const { role, content, toolCalls, toolResults, timestamp, parseErrors, ...rest } = msg;
            
            // Track the last user message (excluding retry messages)
            if (role === 'user' && !content.startsWith('[Retry]')) {
                lastUserMessage = content;
            }
            
            if (role === 'assistant') {
                let statusText = '';
                let additionalContent = '';
                if (toolCalls && toolCalls.length > 0) {
                    statusText = `Executed ${toolCalls.length} tool call(s)...`;
                }
                if (toolResults && toolResults.length > 0) {
                    const toolResultsContent = toolResults.map(result => JSON.stringify(result.response, null, 2)).join('\n\n');
                    additionalContent = `Tool results: ${toolResultsContent}`;
                }
                if (parseErrors && parseErrors.length > 0) {
                    additionalContent = `Parse errors: ${parseErrors.join(', ')}`;
                }
                this.panel.addChatMessage(role, content, { statusText, additionalContent, ...rest });
            } else {
                this.panel.addChatMessage(role, content, { ...rest });
            }
        });
        
        // Restore the last user message for retry functionality
        if (lastUserMessage) {
            this.panel.setLastUserMessage(lastUserMessage);
        }
        
        console.log(`[MCPTestApp] Rendered ${messages.length} messages from history.`);
    }

    /**
     * Setup AI client for chat functionality
     */
    async setupAIClient() {
        try {
            const modelConfig = this.stateService.settings.getModelConfig('tools');
            if (modelConfig && modelConfig.provider && modelConfig.model) {
                this.aiClient = AIClientFactory.createClient(this.dispatcher, modelConfig);
                console.log('[MCPTestApp] AI client configured:', modelConfig.provider, modelConfig.model);
            } else {
                console.warn('[MCPTestApp] No AI model configuration found');
            }
        } catch (error) {
            console.error('[MCPTestApp] Failed to setup AI client:', error);
        }
    }

    /**
     * Setup event listeners for UI interactions
     */
    setupEventListeners() {
        this.panel.setupEventListeners({
            onConnect: () => this.connectToMCP(),
            onDisconnect: () => this.disconnectFromMCP(),
            onListTools: () => this.listTools(),
            onRefreshTools: () => this.refreshTools(),
            onSendChat: () => this.sendChatMessage(),
            onRetryChat: () => this.retryChatMessage(),
            onReplayTools: () => this.replayLastToolCall(),
            onClearChat: () => this.clearChat(),
            onShowState: () => this.showState(),
            onShowStats: () => this.showStats(),
            onAutoConnectChanged: () => this.handleAutoConnectChanged(),
        });

        // Listen for streaming AI responses
        this.dispatcher.on(EVENTS.AI.STREAM_CHUNK, ({ chunk }) => {
            if (this.currentStreamingMessage) {
                this.panel.updateStreamingMessage(this.currentStreamingMessage, chunk);
            }
        });
    }

    /**
     * Setup MCP event listeners
     */
    setupMCPEventListeners() {
        this.dispatcher.on(EVENTS.MCP.CONNECTED, () => {
            this.panel.updateConnectionStatus('connected', 'Successfully connected to MCP server');
        });

        this.dispatcher.on(EVENTS.MCP.DISCONNECTED, () => {
            this.panel.updateConnectionStatus('disconnected', 'Disconnected from MCP server');
        });

        this.dispatcher.on(EVENTS.MCP.CONNECTION_ERROR, ({ error }) => {
            this.panel.updateConnectionStatus('disconnected', `Connection error: ${error}`);
        });

        this.dispatcher.on(EVENTS.MCP.INITIALIZED, () => {
            this.listTools();
        });

        this.dispatcher.on(EVENTS.MCP.TOOLS_UPDATED, ({ tools, count }) => {
            this.panel.renderTools(tools);
        });
    }

    /**
     * Connect to MCP server
     */
    async connectToMCP() {
        const url = this.panel.getMcpUrl();
        if (!url) {
            this.panel.updateConnectionStatus('disconnected', 'Please enter a valid MCP server URL');
            return;
        }

        try {
            this.panel.setConnectionLoading(true);

            // Create new MCP connector
            this.mcpConnector = new MCPConnector(url, this.stateService);
            
            // Initialize the connection
            const tools = await this.mcpConnector.initialize();
            
            // Save the URL to settings
            await this.saveMcpUrl(url);
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to connect to MCP:', error);
            this.panel.updateConnectionStatus('disconnected', `Connection failed: ${error.message}`);
        } finally {
            this.panel.setConnectionLoading(false);
        }
    }

    /**
     * Disconnect from MCP server
     */
    async disconnectFromMCP() {
        if (this.mcpConnector) {
            this.mcpConnector.disconnect();
            this.mcpConnector = null;
        }
    }

    /**
     * List available tools
     */
    async listTools() {
        if (!this.mcpConnector) {
            return;
        }

        try {
            this.panel.setToolsLoading(true);

            const tools = this.stateService.mcp.getMcpTools();
            this.panel.renderTools(tools);
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to list tools:', error);
        } finally {
            this.panel.setToolsLoading(false);
        }
    }

    /**
     * Refresh tools (same as list tools but with different messaging)
     */
    async refreshTools() {
        if (!this.mcpConnector) {
            return;
        }

        try {
            this.panel.setToolsLoading(true);

            // Re-fetch tools from server
            const tools = await this.mcpConnector.fetchTools();
            this.stateService.mcp.setMcpTools(tools);
            this.panel.renderTools(tools);
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to refresh tools:', error);
        } finally {
            this.panel.setToolsLoading(false);
        }
    }

    /**
     * Send chat message
     */
    async sendChatMessage() {
        const message = this.panel.getChatInput();
        if (!message) return;

        if (!this.mcpConnector) {
            this.panel.addChatMessage('error', 'Not connected to MCP server');
            return;
        }

        if (!this.aiClient) {
            this.panel.addChatMessage('error', 'AI client not configured. Please configure AI settings in the options page.');
            return;
        }

        try {
            this.panel.clearChatInput();
            this.panel.addChatMessage('user', message);
            
            // Store the last user message for retry functionality
            this.panel.setLastUserMessage(message);

            // Add thinking message
            this.currentStreamingMessage = this.panel.addChatMessage('assistant', '', { isLoading: true, statusText: 'Thinking...' });

            // Get conversation history
            const conversationId = this.panel.getConversationId();
            const history = this.stateService.conversation.getConversationMessages(conversationId);

            // Get previous tool results from last assistant message
            const lastAssistantMessage = this.stateService.conversation.getLastAssistantMessage(conversationId);
            const previousToolResults = lastAssistantMessage?.toolResults || [];

            // Create system prompt that includes available tools
            const tools = this.stateService.mcp.getMcpTools();
            const systemPrompt = ToolFormatter.generateSystemPrompt(tools);
            const userHeader = ToolFormatter.generateUserHeader(tools, previousToolResults);
            const metadata = this.stateService.aim.getAimMetadata();

            // Prepend user header to the message
            const messageWithHeader = `${userHeader}\n\n${message}`;

            console.log('[MCPTestApp] System prompt:', systemPrompt);
            console.log('[MCPTestApp] User header:', userHeader);
            console.log('[MCPTestApp] Message with header:', messageWithHeader);
            console.log('[MCPTestApp] Metadata:', metadata);
            console.log('[MCPTestApp] Tools:', tools);

            // Generate AI response
            const response = await this.aiClient.generateTurn(messageWithHeader, history, { 
                systemPrompt,
                metadata,
                maxHistory: 10 
            });

            // Parse response for tool calls
            const parseResult = this.toolParser.parseResponse(response);
            
            // Execute any tool calls found
            let toolExecutionResults = [];
            if (parseResult.success && parseResult.toolCalls.length > 0) {
                toolExecutionResults = await this.executeToolCalls(parseResult.toolCalls, this.currentStreamingMessage);
            } else {
                // No tool calls - update status to Complete
                this.panel.updateCardStatus(this.currentStreamingMessage, 'Complete');
            }

            // Store messages in conversation history (use original message without header)
            const userMessage = { role: 'user', content: message };
            const assistantMessage = { 
                role: 'assistant', 
                content: response,
                toolCalls: parseResult.toolCalls || [],
                toolResults: toolExecutionResults,
                parseErrors: parseResult.errors || [],
            };

            const messageOptions = this.stateService.aim.getAimMessageOptions();
            this.stateService.conversation.storeMessage(
                conversationId, 
                userMessage, 
                assistantMessage, 
                messageOptions
            );

            // Clear streaming message
            this.currentStreamingMessage = null;

            // Save state
            await this.stateService.disk.saveState();

        } catch (error) {
            console.error('[MCPTestApp] Failed to send chat message:', error);
            this.panel.addChatMessage('error', `Failed to send message: ${error.message}`);
            this.currentStreamingMessage = null;
        }
    }



    /**
     * Replay the last tool call - reparse and re-execute tools from the last assistant message
     */
    async replayLastToolCall() {
        if (!this.mcpConnector) {
            this.panel.addChatMessage('error', 'Not connected to MCP server');
            return;
        }

        try {
            // Get the last assistant message from state service
            const conversationId = this.panel.getConversationId();
            const lastAssistantMessage = this.stateService.conversation.getLastAssistantMessage(conversationId);
            
            if (!lastAssistantMessage) {
                return;
            }

            this.panel.addChatMessage('system', `Replaying tool calls from last assistant message...`);

            // Parse the message content for tool calls
            const parseResult = this.toolParser.parseResponse(lastAssistantMessage.content);
            
            if (!parseResult.success || parseResult.toolCalls.length === 0) {
                this.panel.addChatMessage('system', 'No tool calls found in the last assistant message');
                return;
            }

            // Add a status message for the replay
            this.currentStreamingMessage = this.panel.addChatMessage('assistant', 
                `Replaying ${parseResult.toolCalls.length} tool call(s)...`, 
                { isLoading: true, statusText: 'Re-executing tools...' }
            );

            // Execute the tool calls
            const toolExecutionResults = await this.executeToolCalls(parseResult.toolCalls, this.currentStreamingMessage);

            // Update the original message in conversation history with new tool results
            lastAssistantMessage.toolCalls = parseResult.toolCalls;
            lastAssistantMessage.toolResults = toolExecutionResults;
            lastAssistantMessage.parseErrors = parseResult.errors || [];
            lastAssistantMessage.isReplay = true;
            
            // Update the conversation state
            this.stateService.conversation.storeMessage(
                conversationId,
                { role: 'user', content: '[Tool Replay]' },
                lastAssistantMessage,
                {}
            );

            // Clear the replay message loading state and show final status
            this.currentStreamingMessage = null;
            //this.panel.updateCardStatus(replayMessage, `✓ Replayed ${parseResult.toolCalls.length} tool call(s)`);

            // Save state
            await this.stateService.disk.saveState();

            console.log(`[MCPTestApp] Replayed ${parseResult.toolCalls.length} tool calls from last assistant message`);
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to replay tool calls:', error);
            this.panel.addChatMessage('error', `Failed to replay tool calls: ${error.message}`);
        }
    }

    /**
     * Retry the last chat message
     */
    async retryChatMessage() {
        const lastMessage = this.panel.getLastUserMessage();
        if (!lastMessage) {
            //this.panel.addChatMessage('error', 'No message to retry');
            return;
        }

        if (!this.mcpConnector) {
            //this.panel.addChatMessage('error', 'Not connected to MCP server');
            return;
        }

        if (!this.aiClient) {
            //this.panel.addChatMessage('error', 'AI client not configured. Please configure AI settings in the options page.');
            return;
        }

        try {
            //this.panel.addChatMessage('user', `[Retry] ${lastMessage}`);

            // Add thinking message
            this.currentStreamingMessage = this.panel.addChatMessage('assistant', '', { isLoading: true });

            // Get conversation history
            const conversationId = this.panel.getConversationId();
            const history = this.stateService.conversation.getConversationMessages(conversationId);

            // Get previous tool results from last assistant message
            const lastAssistantMessage = this.stateService.conversation.getLastAssistantMessage(conversationId);
            const previousToolResults = lastAssistantMessage?.toolResults || [];

            // Create system prompt that includes available tools
            const tools = this.stateService.mcp.getMcpTools();
            const systemPrompt = ToolFormatter.generateSystemPrompt(tools);
            const userHeader = ToolFormatter.generateUserHeader(tools, previousToolResults);
            const metadata = this.stateService.aim.getAimMetadata();

            // Prepend user header to the message
            const messageWithHeader = `${userHeader}\n\n${lastMessage}`;

            console.log('[MCPTestApp] Retrying message:', lastMessage);

            // Generate AI response
            const response = await this.aiClient.generateTurn(messageWithHeader, history, { 
                systemPrompt,
                metadata,
                maxHistory: 10 
            });

            // Parse response for tool calls
            const parseResult = this.toolParser.parseResponse(response);

            // Execute any tool calls found
            let toolExecutionResults = [];
            if (parseResult.success && parseResult.toolCalls.length > 0) {
                toolExecutionResults = await this.executeToolCalls(parseResult.toolCalls, this.currentStreamingMessage);
            } else {
                // No tool calls - update status to Complete
                this.panel.updateCardStatus(this.currentStreamingMessage, 'Complete');
            }

            // Store messages in conversation history (use original message without header)
            const userMessage = { role: 'user', content: `[Retry] ${lastMessage}` };
            const assistantMessage = { 
                role: 'assistant', 
                content: response,
                toolCalls: parseResult.toolCalls || [],
                toolResults: toolExecutionResults,
                parseErrors: parseResult.errors || [],
                isRetry: true
            };

            const messageOptions = this.stateService.aim.getAimMessageOptions();
            this.stateService.conversation.storeMessage(
                conversationId, 
                userMessage, 
                assistantMessage, 
                messageOptions
            );

            // Save state
            await this.stateService.disk.saveState();

            // Clear streaming message
            this.currentStreamingMessage = null;

        } catch (error) {
            console.error('[MCPTestApp] Failed to retry chat message:', error);
            //this.panel.addChatMessage('error', `Failed to retry message: ${error.message}`);
            this.currentStreamingMessage = null;
        }
    }

    /**
     * Execute tool calls and return structured results
     */
    async executeToolCalls(toolCalls, streamingMessage) {
        const results = [];
        
        //this.panel.addChatMessage('system', `Executing ${toolCalls.length} tool call(s)...`);
        
        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            const executionStart = Date.now();

            if (!toolCall.name || toolCall.name === 'undefined') {
                console.error(`[MCPTestApp] Tool call ${i + 1} has no name`);
                continue;
            }
            
            let resultEntry = {
                index: i + 1,
                request: {
                    name: toolCall.name,
                    parameters: toolCall.parameters,
                    timestamp: new Date().toISOString()
                }
            };
            
            try {
                //this.panel.addChatMessage('system', `[${i + 1}/${toolCalls.length}] Executing: ${toolCall.name}`);
                console.log(`[MCPTestApp] Executing tool ${toolCall.name} with parameters:`, toolCall.parameters);
                
                const { success, executionTime, ...response }= await this.mcpConnector.executeTool(toolCall.name, toolCall.parameters);

                resultEntry.response = response;
                resultEntry.success = success;
                resultEntry.executionTime = executionTime;

                // Display result
                this.panel.updateCardStatus(streamingMessage, `[${i + 1}/${toolCalls.length}] ✓ ${toolCall.name} completed (${resultEntry.executionTime}ms)`);
                
                // Show result content if not too long
                const toolResultsContent = JSON.stringify(resultEntry.response, null, 2);
                this.panel.updateCardAdditionalContent(streamingMessage, `Result: ${toolResultsContent}`);
                
                console.log(`[MCPTestApp] Tool ${toolCall.name} completed ${success ? 'successfully' : 'with error'}:`, resultEntry.response);
                
            } catch (error) {
                resultEntry.success = false;
                resultEntry.error = error.message;
                resultEntry.executionTime = Date.now() - executionStart;
                
                console.error(`[MCPTestApp] Tool ${toolCall.name} execution failed:`, error);
                this.panel.updateCardStatus(streamingMessage, `[${i + 1}/${toolCalls.length}] ✗ ${toolCall.name} failed: ${error.message}`);
            }
            
            results.push(resultEntry);
        }
        
        // Summary
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
        
        //this.panel.addChatMessage('system', `Tool execution summary: ${successful} successful, ${failed} failed, ${totalTime}ms total`);
        
        if (failed > 0) {
            const failedTools = results.filter(r => !r.success);
            console.warn(`[MCPTestApp] Failed tools:`, failedTools);
        }
        
        return results;
    }

    /**
     * Clear chat messages
     */
    clearChat() {
        this.panel.clearChat();
        
        // Clear conversation history
        const conversationId = this.panel.getConversationId();
        this.stateService.conversation.clearConversationHistory(conversationId);
    }

    /**
     * Show current state
     */
    showState() {
        this.panel.showDebugLoading('Loading state...');
        
        try {
            const mcpState = this.stateService.mcp.getMcpState();
            const mcpSummary = this.stateService.mcp.getMcpSummary();
            
            const debugInfo = {
                mcpState,
                mcpSummary,
                timestamp: new Date().toISOString()
            };
            
            this.panel.showDebugInfo(debugInfo, 'MCP State');
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to show state:', error);
            this.panel.addChatMessage('error', `Failed to show state: ${error.message}`);
        }
    }

    /**
     * Show statistics
     */
    showStats() {
        this.panel.showDebugLoading('Loading statistics...');
        
        try {
            // Get conversation history for tool execution stats
            const conversationId = this.panel.getConversationId();
            const history = this.stateService.conversation.getConversationMessages(conversationId);
            
            // Calculate tool execution statistics
            const toolStats = this.calculateToolStats(history);
            
            const stats = {
                mcp: {
                    connected: this.stateService.mcp.isMcpConnected(),
                    initialized: this.stateService.mcp.isMcpInitialized(),
                    toolsCount: this.stateService.mcp.getMcpTools().length,
                    pendingRequestsCount: Object.keys(this.stateService.mcp.getMcpPendingRequests()).length
                },
                ai: {
                    configured: this.aiClient?.isConfigured() || false,
                    stats: this.aiClient?.getStats() || null
                },
                session: {
                    conversationId: this.panel.getConversationId(),
                    messageCount: history.length,
                    timestamp: new Date().toISOString()
                },
                toolExecution: toolStats
            };
            
            this.panel.showDebugInfo(stats, 'Statistics');
            
        } catch (error) {
            console.error('[MCPTestApp] Failed to show stats:', error);
            this.panel.addChatMessage('error', `Failed to show stats: ${error.message}`);
        }
    }

    /**
     * Calculate tool execution statistics from conversation history
     */
    calculateToolStats(history) {
        const stats = {
            totalToolCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            toolUsageCount: {},
            averageExecutionTime: 0,
            totalExecutionTime: 0,
            lastToolCall: null
        };

        let totalExecutionTime = 0;
        let executionCount = 0;

        history.forEach(message => {
            if (message.role === 'assistant' && message.metadata?.toolResults) {
                const toolResults = message.metadata.toolResults;
                
                toolResults.forEach(result => {
                    stats.totalToolCalls++;
                    
                    if (result.success) {
                        stats.successfulCalls++;
                    } else {
                        stats.failedCalls++;
                    }
                    
                    // Count tool usage
                    if (!stats.toolUsageCount[result.toolName]) {
                        stats.toolUsageCount[result.toolName] = 0;
                    }
                    stats.toolUsageCount[result.toolName]++;
                    
                    // Execution time tracking
                    if (result.executionTime) {
                        totalExecutionTime += result.executionTime;
                        executionCount++;
                    }
                    
                    // Track last tool call
                    if (!stats.lastToolCall || result.timestamp > stats.lastToolCall.timestamp) {
                        stats.lastToolCall = {
                            toolName: result.toolName,
                            success: result.success,
                            timestamp: result.timestamp
                        };
                    }
                });
            }
        });

        stats.totalExecutionTime = totalExecutionTime;
        stats.averageExecutionTime = executionCount > 0 ? Math.round(totalExecutionTime / executionCount) : 0;

        return stats;
    }

    /**
     * Handle auto-connect checkbox change
     */
    async handleAutoConnectChanged() {
        try {
            const autoConnect = this.panel.getAutoConnect();
            
            this.stateService.state.settings.mcp.autoConnect = autoConnect;
            await this.stateService.settings.saveSettings();
            console.log('[MCPTestApp] Auto-connect saved:', autoConnect, this.stateService.state);
            console.log('[MCPTestApp] Auto-connect setting saved:', autoConnect);
        } catch (error) {
            console.error('[MCPTestApp] Failed to save auto-connect setting:', error);
        }
    }

    /**
     * Handle auto-connect on initialization
     */
    async handleAutoConnect() {
        try {
            const autoConnect = this.stateService.state.settings?.mcp?.autoConnect;
            const mcpUrl = this.stateService.state.settings?.mcp?.serverUrl;
            
            if (autoConnect && mcpUrl) {
                console.log('[MCPTestApp] Auto-connecting to MCP server:', mcpUrl);
                await this.connectToMCP();
            }
        } catch (error) {
            console.error('[MCPTestApp] Auto-connect failed:', error);
        }
    }

    /**
     * Save MCP URL to settings
     */
    async saveMcpUrl(url) {
        try {
            this.stateService.mcp.setMcpServerUrl(url);
            await this.stateService.settings.saveSettings();
            console.log('[MCPTestApp] MCP URL saved to settings');
        } catch (error) {
            console.error('[MCPTestApp] Failed to save MCP URL:', error);
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new MCPTestApp();
    app.initialize();
});
