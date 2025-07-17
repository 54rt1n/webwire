import { EVENTS, EVENT_CONTEXT } from '../../core/events.js';

/**
 * MCP State Plugin - Manages Model Context Protocol related state
 * Handles connection state, tool management, request tracking, and system messages
 * for MCP server communication within the state management system.
 */
export class MCPStatePlugin {
    /**
     * Create an MCP State Plugin instance
     * @param {Object} stateService - The parent state service instance
     */
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
    }

    /**
     * Get the complete MCP state object
     * @returns {Object} The current MCP state containing connection, tools, and requests
     */
    getMcpState() {
        return this.stateService.state.mcp;
    }

    /**
     * Get the MCP connection state object
     * @returns {Object} The current connection state with status and connection details
     */
    getMcpConnectionState() {
        return this.stateService.state.mcp.connection;
    }

    /**
     * Check if MCP is currently connected to a server
     * @returns {boolean} True if connected, false otherwise
     */
    isMcpConnected() {
        return this.stateService.state.mcp.connection.isConnected;
    }

    /**
     * Check if MCP has completed initialization (handshake and tool fetching)
     * @returns {boolean} True if initialized, false otherwise
     */
    isMcpInitialized() {
        return this.stateService.state.mcp.connection.isInitialized;
    }

    /**
     * Get the MCP server URL
     * @returns {string} The MCP server URL
     */
    getMcpServerUrl() {
        return this.stateService.state.settings.mcp.serverUrl;
    }

    /**
     * Set the MCP server URL in settings
     * @param {string} serverUrl - The MCP server URL to connect to
     */
    setMcpServerUrl(serverUrl) {
        this.stateService.state.settings.mcp.serverUrl = serverUrl;
        console.log(`[StateService::MCPState] Set MCP server URL: ${serverUrl}`);
    }

    // Connection Management Methods

    /**
     * Update MCP connection details with new information
     * @param {Object} connectionData - Connection data to update
     * @param {string} [connectionData.serverUrl] - Server URL to set
     * @param {string} [connectionData.sessionId] - Session ID for this connection
     * @param {string} [connectionData.postEndpoint] - POST endpoint URL for requests
     */
    setMcpConnection(connectionData) {
        const connection = this.stateService.state.mcp.connection;

        if (connectionData.serverUrl !== undefined) {
            this.stateService.state.settings.mcp.serverUrl = connectionData.serverUrl;
        }
        
        if (connectionData.sessionId !== undefined) {
            connection.sessionId = connectionData.sessionId;
        }
        if (connectionData.postEndpoint !== undefined) {
            connection.postEndpoint = connectionData.postEndpoint;
        }

        console.log('Updated MCP connection data');
    }

    /**
     * Set an MCP connection error and update connection state
     * @param {string} error - Error message describing the connection failure
     */
    setMcpConnectionError(error) {
        this.stateService.state.mcp.connection.connectionError = error;
        this.stateService.state.mcp.connection.isConnected = false;
        this.stateService.state.mcp.connection.isInitialized = false;
        
        console.error(`[StateService::MCPState] MCP connection error: ${error}`);
        this.eventBus.emit(EVENTS.MCP.CONNECTION_ERROR, { error });
    }

    /**
     * Clear any existing MCP connection error
     */
    clearMcpConnectionError() {
        this.stateService.state.mcp.connection.connectionError = undefined;
    }

    /**
     * Set the MCP connection status and emit appropriate events
     * @param {boolean} isConnected - Whether MCP is currently connected
     */
    setMcpConnected(isConnected) {
        const wasConnected = this.stateService.state.mcp.connection.isConnected;
        this.stateService.state.mcp.connection.isConnected = isConnected;
        this.stateService.state.mcp.connection.serverUrl = this.stateService.state.settings.mcp.serverUrl;
        
        if (isConnected && !wasConnected) {
            this.stateService.state.mcp.connection.lastConnected = Date.now();
            this.clearMcpConnectionError();
            console.log('[StateService::MCPState] MCP connected');
            this.eventBus.emit(EVENTS.MCP.CONNECTED, {}, { source: 'set-mcp-connected'});
        } else if (!isConnected && wasConnected) {
            this.stateService.state.mcp.connection.isInitialized = false;
            console.log('[StateService::MCPState] MCP disconnected');
            this.eventBus.emit(EVENTS.MCP.DISCONNECTED, {}, { source: 'set-mcp-disconnected'});
        }
    }

    /**
     * Set the MCP initialization status and emit events
     * @param {boolean} isInitialized - Whether MCP has completed initialization
     */
    setMcpInitialized(isInitialized) {
        const wasInitialized = this.stateService.state.mcp.connection.isInitialized;
        this.stateService.state.mcp.connection.isInitialized = isInitialized;
        
        if (isInitialized && !wasInitialized) {
            console.log('[StateService::MCPState] MCP initialized');
            this.eventBus.emit(EVENTS.MCP.INITIALIZED, {}, { source: 'set-mcp-initialized'});
        }
    }

    // Tools Management Methods

    /**
     * Set the available MCP tools and emit update events
     * @param {Array<Object>} tools - Array of tool definitions in OpenAI format
     */
    setMcpTools(tools) {
        this.stateService.state.mcp.tools = tools || [];
        console.log(`[StateService::MCPState] Updated MCP tools: ${this.stateService.state.mcp.tools.length} tools available`);
        this.eventBus.emit(EVENTS.MCP.TOOLS_UPDATED, { 
            tools: this.stateService.state.mcp.tools,
            count: this.stateService.state.mcp.tools.length 
        }, { source: 'set-mcp-tools'});
    }

    /**
     * Get the currently available MCP tools
     * @returns {Array<Object>} Array of tool definitions
     */
    getMcpTools() {
        return this.stateService.state.mcp.tools;
    }

    /**
     * Clear all MCP tools from state
     */
    clearMcpTools() {
        this.setMcpTools([]);
    }

    /**
     * Is the tool available?
     * @param {string} toolName - Name of the tool
     * @returns {boolean} True if the tool is available
     */
    isTool(toolName) {
      return this.stateService.state.mcp.tools.some(tool => tool.name === toolName);
    }

    // Request Management Methods

    /**
     * Add a pending MCP request to track its lifecycle
     * @param {number} requestId - Unique identifier for the request
     * @param {string} method - MCP method name being called
     * @param {Object} [params={}] - Parameters passed to the method
     */
    addMcpPendingRequest(requestId, method, params = {}) {
        this.stateService.state.mcp.pendingRequests[requestId] = {
            id: requestId,
            method,
            params,
            timestamp: Date.now(),
            status: 'pending',
            response: undefined,
            error: undefined,
        };

        console.log(`[StateService::MCPState] Added pending MCP request ${requestId}: ${method}`);
        this.eventBus.emit(EVENTS.MCP.REQUEST_STARTED, { requestId, method, params }, { source: 'add-mcp-pending-request'});
    }

    /**
     * Mark an MCP request as completed with response data
     * @param {number} requestId - The request ID to complete
     * @param {Object} response - The response data from the server
     */
    completeMcpRequest(requestId, response) {
        const request = this.stateService.state.mcp.pendingRequests[requestId];
        if (request) {
            request.status = 'completed';
            request.response = response;
            
            console.log(`[StateService::MCPState] Completed MCP request ${requestId}`);
            this.eventBus.emit(EVENTS.MCP.REQUEST_COMPLETED, { requestId, response }, { source: 'complete-mcp-request'});
        }
    }

    /**
     * Mark an MCP request as failed with error information
     * @param {number} requestId - The request ID that failed
     * @param {string} error - Error message describing the failure
     */
    failMcpRequest(requestId, error) {
        const request = this.stateService.state.mcp.pendingRequests[requestId];
        if (request) {
            request.status = 'failed';
            request.error = error;
            
            console.error(`[StateService::MCPState] Failed MCP request ${requestId}: ${error}`);
            this.eventBus.emit(EVENTS.MCP.REQUEST_FAILED, { requestId, error }, { source: 'fail-mcp-request'});
        }
    }

    /**
     * Mark an MCP request as timed out
     * @param {number} requestId - The request ID that timed out
     */
    timeoutMcpRequest(requestId) {
        const request = this.stateService.state.mcp.pendingRequests[requestId];
        if (request) {
            request.status = 'timeout';
            request.error = 'Request timeout';
            
            console.warn(`[StateService::MCPState] MCP request ${requestId} timed out`);
            this.eventBus.emit(EVENTS.MCP.REQUEST_TIMEOUT, { requestId }, { source: 'timeout-mcp-request'});
        }
    }

    /**
     * Remove a pending MCP request from tracking
     * @param {number} requestId - The request ID to remove
     */
    removeMcpPendingRequest(requestId) {
        delete this.stateService.state.mcp.pendingRequests[requestId];
    }

    /**
     * Get all currently pending MCP requests
     * @returns {Object} Map of request IDs to request objects
     */
    getMcpPendingRequests() {
        return this.stateService.state.mcp.pendingRequests;
    }

    /**
     * Clear all pending MCP requests
     */
    clearMcpPendingRequests() {
        this.stateService.state.mcp.pendingRequests = {};
        console.log('[StateService::MCPState] Cleared all pending MCP requests');
    }

    /**
     * Get a summary of MCP state for debugging and status display
     * @returns {Object} Summary object containing connection status, tool count, and request counts
     */
    getMcpSummary() {
        const mcp = this.stateService.state.mcp;
        return {
            isConnected: mcp.connection.isConnected,
            isInitialized: mcp.connection.isInitialized,
            serverUrl: mcp.connection.serverUrl,
            toolsCount: mcp.tools.length,
            pendingRequestsCount: Object.keys(mcp.pendingRequests).length,
            lastConnected: mcp.connection.lastConnected,
            hasError: Boolean(mcp.connection.connectionError),
        };
    }

    /**
     * Set the MCP system message for tool usage
     * @param {string} systemMessage - The system message to set
     * @param {Object} [options={}] - Additional options
     * @param {boolean} [options.setSettings=false] - Whether to also save to persistent settings
     */
    setSystemMessage(systemMessage, { setSettings = false } = {}) {
        this.stateService.state.mcp.systemMessage = systemMessage;
        if (setSettings) {
            this.stateService.state.settings.mcp.systemMessage = systemMessage;
        }
    }

    /**
     * Get the current MCP system message
     * @param {Object} [options={}] - Options for retrieval
     * @param {boolean} [options.getSettings=false] - Whether to get from persistent settings instead
     * @returns {string} The current system message
     */
    getSystemMessage({ getSettings = false } = {}) {
        if (getSettings) {
            return this.stateService.state.settings.mcp.systemMessage;
        }
        return this.stateService.state.mcp.systemMessage || this.stateService.state.settings.mcp.systemMessage;
    }

    /**
     * Check if the system message has been modified from the saved version
     * @returns {boolean} True if the message has unsaved changes
     */
    hasSystemMessageChanged() {
        return this.stateService.state.mcp.systemMessage !== this.stateService.state.settings.mcp.systemMessage;
    }

    /**
     * Clear the MCP system message
     */
    clearSystemMessage() {
        this.stateService.state.mcp.systemMessage = undefined;
        this.stateService.state.settings.mcp.systemMessage = undefined;
    }
} 