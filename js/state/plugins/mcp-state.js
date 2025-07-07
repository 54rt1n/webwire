import { EVENTS } from '../../constants/events.js';

/**
 * Plugin for handling MCP (Model Context Protocol) related state management.
 */
export class MCPStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
    }

    /**
     * Gets the complete MCP state.
     * @returns {Object} The current MCP state
     */
    getMcpState() {
        return this.stateService.state.mcp;
    }

    /**
     * Gets the MCP connection state.
     * @returns {Object} The current connection state
     */
    getMcpConnectionState() {
        return this.stateService.state.mcp.connection;
    }

    /**
     * Checks if MCP is connected.
     * @returns {boolean} True if connected
     */
    isMcpConnected() {
        return this.stateService.state.mcp.connection.isConnected;
    }

    /**
     * Checks if MCP is initialized.
     * @returns {boolean} True if initialized
     */
    isMcpInitialized() {
        return this.stateService.state.mcp.connection.isInitialized;
    }

    /**
     * Sets the MCP server URL.
     * @param {string} serverUrl - The server URL
     */
    setMcpServerUrl(serverUrl) {
        this.stateService.state.settings.mcp.serverUrl = serverUrl;
        console.log(`Set MCP server URL: ${serverUrl}`);
    }

    // Connection Management Methods

    /**
     * Sets MCP connection details.
     * @param {Object} connectionData - { sessionId?, postEndpoint? }
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
     * Sets MCP connection error.
     * @param {string} error - Error message
     */
    setMcpConnectionError(error) {
        this.stateService.state.mcp.connection.connectionError = error;
        this.stateService.state.mcp.connection.isConnected = false;
        this.stateService.state.mcp.connection.isInitialized = false;
        
        console.error(`MCP connection error: ${error}`);
        this.eventBus.emit(EVENTS.MCP.CONNECTION_ERROR, { error });
    }

    /**
     * Clears MCP connection error.
     */
    clearMcpConnectionError() {
        this.stateService.state.mcp.connection.connectionError = undefined;
    }

    /**
     * Sets MCP connected status.
     * @param {boolean} isConnected - Connection status
     */
    setMcpConnected(isConnected) {
        const wasConnected = this.stateService.state.mcp.connection.isConnected;
        this.stateService.state.mcp.connection.isConnected = isConnected;
        this.stateService.state.mcp.connection.serverUrl = this.stateService.state.settings.mcp.serverUrl;
        
        if (isConnected && !wasConnected) {
            this.stateService.state.mcp.connection.lastConnected = Date.now();
            this.clearMcpConnectionError();
            console.log('MCP connected');
            this.eventBus.emit(EVENTS.MCP.CONNECTED, {});
        } else if (!isConnected && wasConnected) {
            this.stateService.state.mcp.connection.isInitialized = false;
            console.log('MCP disconnected');
            this.eventBus.emit(EVENTS.MCP.DISCONNECTED, {});
        }
    }

    /**
     * Sets MCP initialized status.
     * @param {boolean} isInitialized - Initialization status
     */
    setMcpInitialized(isInitialized) {
        const wasInitialized = this.stateService.state.mcp.connection.isInitialized;
        this.stateService.state.mcp.connection.isInitialized = isInitialized;
        
        if (isInitialized && !wasInitialized) {
            console.log('MCP initialized');
            this.eventBus.emit(EVENTS.MCP.INITIALIZED, {});
        }
    }

    // Tools Management Methods

    /**
     * Sets the available MCP tools.
     * @param {Array} tools - Array of tools in OpenAI format
     */
    setMcpTools(tools) {
        this.stateService.state.mcp.tools = tools || [];
        console.log(`Updated MCP tools: ${this.stateService.state.mcp.tools.length} tools available`);
        this.eventBus.emit(EVENTS.MCP.TOOLS_UPDATED, { 
            tools: this.stateService.state.mcp.tools,
            count: this.stateService.state.mcp.tools.length 
        });
    }

    /**
     * Gets the available MCP tools.
     * @returns {Array} Array of tools
     */
    getMcpTools() {
        return this.stateService.state.mcp.tools;
    }

    /**
     * Clears all MCP tools.
     */
    clearMcpTools() {
        this.setMcpTools([]);
    }

    // Request Management Methods

    /**
     * Adds a pending MCP request.
     * @param {number} requestId - Request ID
     * @param {string} method - Request method
     * @param {Object} params - Request parameters
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

        console.log(`Added pending MCP request ${requestId}: ${method}`);
        this.eventBus.emit(EVENTS.MCP.REQUEST_STARTED, { requestId, method, params });
    }

    /**
     * Marks an MCP request as completed.
     * @param {number} requestId - Request ID
     * @param {Object} response - Response data
     */
    completeMcpRequest(requestId, response) {
        const request = this.stateService.state.mcp.pendingRequests[requestId];
        if (request) {
            request.status = 'completed';
            request.response = response;
            
            console.log(`Completed MCP request ${requestId}`);
            this.eventBus.emit(EVENTS.MCP.REQUEST_COMPLETED, { requestId, response });
        }
    }

    /**
     * Marks an MCP request as failed.
     * @param {number} requestId - Request ID
     * @param {string} error - Error message
     */
    failMcpRequest(requestId, error) {
        const request = this.stateService.state.mcp.pendingRequests[requestId];
        if (request) {
            request.status = 'failed';
            request.error = error;
            
            console.error(`Failed MCP request ${requestId}: ${error}`);
            this.eventBus.emit(EVENTS.MCP.REQUEST_FAILED, { requestId, error });
        }
    }

    /**
     * Marks an MCP request as timed out.
     * @param {number} requestId - Request ID
     */
    timeoutMcpRequest(requestId) {
        const request = this.stateService.state.mcp.pendingRequests[requestId];
        if (request) {
            request.status = 'timeout';
            request.error = 'Request timeout';
            
            console.warn(`MCP request ${requestId} timed out`);
            this.eventBus.emit(EVENTS.MCP.REQUEST_TIMEOUT, { requestId });
        }
    }

    /**
     * Removes a pending MCP request.
     * @param {number} requestId - Request ID
     */
    removeMcpPendingRequest(requestId) {
        delete this.stateService.state.mcp.pendingRequests[requestId];
    }

    /**
     * Gets all pending MCP requests.
     * @returns {Object} Map of pending requests
     */
    getMcpPendingRequests() {
        return this.stateService.state.mcp.pendingRequests;
    }

    /**
     * Clears all pending MCP requests.
     */
    clearMcpPendingRequests() {
        this.stateService.state.mcp.pendingRequests = {};
        console.log('Cleared all pending MCP requests');
    }

    /**
     * Gets MCP state summary for debugging.
     * @returns {Object} Summary object
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
     * Sets the MCP system message.
     * @param {string} systemMessage - The system message
     * @param {boolean} setSettings - Whether to set the system message in settings
     */
    setSystemMessage(systemMessage, { setSettings = false } = {}) {
        this.stateService.state.mcp.systemMessage = systemMessage;
        if (setSettings) {
            this.stateService.state.settings.mcp.systemMessage = systemMessage;
        }
    }

    /**
     * Gets the MCP system message.
     * @returns {string} The system message
     */
    getSystemMessage({ getSettings = false } = {}) {
        if (getSettings) {
            return this.stateService.state.settings.mcp.systemMessage;
        }
        return this.stateService.state.mcp.systemMessage || this.stateService.state.settings.mcp.systemMessage;
    }

    /**
     * Has the message been changed?
     * @returns {boolean} True if the message has been changed
     */
    hasSystemMessageChanged() {
        return this.stateService.state.mcp.systemMessage !== this.stateService.state.settings.mcp.systemMessage;
    }

    /**
     * Clears the MCP system message.
     */
    clearSystemMessage() {
        this.stateService.state.mcp.systemMessage = undefined;
        this.stateService.state.settings.mcp.systemMessage = undefined;
    }

} 