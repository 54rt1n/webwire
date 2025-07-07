import { generateUUID } from '../utils/id-generator.js';

/**
 * MCP Connector Module
 * Lightweight module to connect to MCP SSE endpoints and manage tool execution
 * 
 * This implementation is modeled after the official @modelcontextprotocol/sdk
 * and best practices for handling Server-Sent Events in a browser environment.
 */

class MCPConnector {
    constructor(mcpServerUrl, stateService) {
      this.mcpServerUrl = mcpServerUrl;
      this.stateService = stateService;
      this.sessionId = generateUUID(); // Generate a unique session ID for this connection
      this.eventSource = null;
      this.requestId = 0;
      this.connectionTimeout = null;
      this.onOpenBound = this.handleOpen.bind(this);
      this.onMessageBound = this.handleMessage.bind(this);
      this.onErrorBound = this.handleError.bind(this);
      this.onEndpointBound = this.handleEndpoint.bind(this);
      
    }
  
    /**
     * Initialize connection to MCP server
     */
    async initialize() {
      // Initialize state
      this.stateService.mcp.setMcpServerUrl(this.mcpServerUrl);
      this.stateService.mcp.setMcpConnection({ sessionId: this.sessionId });

      if (this.stateService.mcp.isMcpInitialized()) {
        return this.stateService.mcp.getMcpTools();
      }
  
      try {
        console.log('Initializing MCP Connector...');
        
        // Connect to SSE endpoint
        await this.connectSSE();
        
        // Perform MCP handshake
        await this.performHandshake();
        
        // Get available tools
        const tools = await this.fetchTools();
        this.stateService.mcp.setMcpTools(tools);
        
        this.stateService.mcp.setMcpInitialized(true);
        console.log(`MCP Connector initialized with ${tools.length} tools`);
        
        return tools;
      } catch (error) {
        console.error('Failed to initialize MCP connector:', error);
        this.stateService.mcp.setMcpConnectionError(error.message);
        throw error;
      }
    }
  
    /**
     * Connect to SSE endpoint
     */
    async connectSSE() {
      return new Promise((resolve, reject) => {
        this.resolveConnection = resolve;
        this.rejectConnection = reject;

        this.eventSource = this.createEventSource();
        
        // Set timeout for connection
        this.connectionTimeout = setTimeout(() => {
          this.connectionTimeout = null;
          const error = new Error('SSE connection timeout');
          this.stateService.mcp.setMcpConnectionError(error.message);
          reject(error);
        }, 10000);
  
        // Use bound listeners for proper cleanup
        this.eventSource.onopen = this.onOpenBound;
        this.eventSource.onmessage = this.onMessageBound;
        this.eventSource.onerror = this.onErrorBound;
        
        // Listen for the 'endpoint' event to get the POST URL
        this.eventSource.addEventListener('endpoint', this.onEndpointBound);
      });
    }
  
    /**
     * Create the EventSource with the correct URL, including session_id
     */
    createEventSource() {
      const sseUrl = new URL(this.mcpServerUrl);
      sseUrl.searchParams.append('session_id', this.sessionId);
      console.log(`Connecting to SSE endpoint: ${sseUrl}`);
      return new EventSource(sseUrl);
    }
    
    /**
     * Handle connection opening
     */
    handleOpen() {
      console.log('SSE connection established');
      this.stateService.mcp.setMcpConnected(true);
    }
    
    /**
     * Handle incoming SSE messages (for responses to requests)
     */
    handleMessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.id) {
          const pendingRequests = this.stateService.mcp.getMcpPendingRequests();
          if (pendingRequests[data.id]) {
            // Complete the request in state
            this.stateService.mcp.completeMcpRequest(data.id, data);
            
            // Resolve the promise if it exists
            const request = pendingRequests[data.id];
            if (request.resolve) {
              request.resolve(data);
            }
            
            // Clean up
            this.stateService.mcp.removeMcpPendingRequest(data.id);
          }
        }
      } catch (error) {
        console.warn('Error parsing SSE message:', error);
      }
    }
    
    /**
     * Handle SSE errors
     */
    handleError(error) {
      console.error('SSE error:', error);
      this.stateService.mcp.setMcpConnected(false);

      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      if (!this.stateService.mcp.isMcpInitialized() && this.rejectConnection) {
        this.stateService.mcp.setMcpConnectionError(error.message || 'SSE connection error');
        this.rejectConnection(error);
      }
      // Clean up promise handlers
      this.resolveConnection = null;
      this.rejectConnection = null;
    }

    /**
     * Handle the 'endpoint' event from the server
     */
    handleEndpoint(event) {
      console.log('Received "endpoint" event with data:', event.data);

      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      try {
        let endpointPath;
        try {
          const sessionData = JSON.parse(event.data);
          endpointPath = sessionData.postEndpoint;
        } catch (e) {
          console.warn('Could not parse endpoint data as JSON, treating as a raw path.');
          if (typeof event.data === 'string') {
            endpointPath = event.data;
          }
        }

        let postEndpoint;
        if (endpointPath) {
          const serverOrigin = new URL(this.mcpServerUrl).origin;
          postEndpoint = new URL(endpointPath, serverOrigin).href;
        } else {
          postEndpoint = this.mcpServerUrl.replace('/sse', '/message');
          console.warn(`Could not determine postEndpoint from data. Using fallback: ${postEndpoint}`);
        }

        this.stateService.mcp.setMcpConnection({ postEndpoint });
        console.log(`MCP session established. POST endpoint: ${postEndpoint}`);
        
        if (this.resolveConnection) {
          this.resolveConnection();
        }
      } catch (error) {
        console.error('Error handling endpoint event:', error);
        this.stateService.mcp.setMcpConnectionError(error.message);
        if (this.rejectConnection) {
          this.rejectConnection(error);
        }
      } finally {
        // Clean up promise handlers
        this.resolveConnection = null;
        this.rejectConnection = null;
      }
    }
  
    /**
     * Perform MCP protocol handshake
     */
    async performHandshake() {
      // Initialize
      const initResponse = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'chatpanel-mcp', version: '1.0.0' }
        }
      });
  
      if (initResponse.error) {
        throw new Error(`MCP init failed: ${initResponse.error.message}`);
      }
  
      // Send initialized notification
      await this.sendRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
    }
  
    /**
     * Fetch available tools from MCP server
     */
    async fetchTools() {
      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'tools/list'
      });
  
      if (response.error) {
        throw new Error(`Failed to list tools: ${response.error.message}`);
      }
  
      // Convert MCP tools to OpenAI tools format
      const tools = (response.result?.tools || []).map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {}
        }
      }));
  
      return tools;
    }
  
    /**
     * Execute a tool call
     */
    async executeTool(toolName, parameters = {}) {
      const executionStart = Date.now();
      
      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      });
  
      if (response.error) {
        throw new Error(`Tool execution failed: ${response.error.message}`);
      }
      // Content should be a json string
      const content = response.result.content;
      if (content.length === 0) {
        return {
          success: false,
          error: 'No content returned from tool execution'
        };
      }

      console.log('[MCPConnector] Tool execution response:', response);


      let isError = false;
      if (response.result.isError) {
        isError = true;
      }

      const firstEntry = content[0];
      let entry = '';
      if (firstEntry['type'] === 'text') {
          entry = firstEntry['text'];
          if (!isError) {
            entry = JSON.parse(entry);
          } else {
            entry = {
              error: entry
            }
          }
      } else {
          entry = firstEntry;
      }
      entry.success = !isError;
      entry.executionTime = Date.now() - executionStart;

      return entry;
    }
  
    /**
     * Send request to MCP server
     */
    async sendRequest(request) {
      const connectionState = this.stateService.mcp.getMcpConnectionState();
      if (!connectionState.postEndpoint) {
        throw new Error('MCP server not connected');
      }
  
      return new Promise((resolve, reject) => {
        const requestId = request.id;
        
        // Store pending request if it has an ID
        if (requestId) {
          this.stateService.mcp.addMcpPendingRequest(requestId, request.method, request.params);
          
          // Store resolve/reject functions on the request object for later use
          const pendingRequests = this.stateService.mcp.getMcpPendingRequests();
          pendingRequests[requestId].resolve = resolve;
          pendingRequests[requestId].reject = reject;
          
          // Timeout after 30 seconds
          setTimeout(() => {
            const currentRequests = this.stateService.mcp.getMcpPendingRequests();
            if (currentRequests[requestId]) {
              this.stateService.mcp.timeoutMcpRequest(requestId);
              this.stateService.mcp.removeMcpPendingRequest(requestId);
              reject(new Error('Request timeout'));
            }
          }, 30000);
        }
  
        // Send request
        fetch(connectionState.postEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        }).then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // For notifications (no ID), resolve immediately
          if (!requestId) {
            resolve({ success: true });
          }
        }).catch(error => {
          if (requestId) {
            const currentRequests = this.stateService.mcp.getMcpPendingRequests();
            if (currentRequests[requestId]) {
              this.stateService.mcp.failMcpRequest(requestId, error.message);
              this.stateService.mcp.removeMcpPendingRequest(requestId);
            }
          }
          if (!requestId) {
            reject(error);
          }
        });
      });
    }
  
    /**
     * Get next request ID
     */
    getNextId() {
      return ++this.requestId;
    }
  
    /**
     * Disconnect and clean up all resources
     */
    disconnect() {
      if (this.eventSource) {
        // Remove all listeners before closing to prevent memory leaks and race conditions
        this.eventSource.removeEventListener('endpoint', this.onEndpointBound);
        this.eventSource.onopen = null;
        this.eventSource.onmessage = null;
        this.eventSource.onerror = null;
        
        // Close the connection
        this.eventSource.close();
        this.eventSource = null;
        console.log('MCP connection closed and listeners removed.');
      }
      
      // Update state
      this.stateService.mcp.setMcpConnected(false);
      this.stateService.mcp.setMcpInitialized(false);
      this.stateService.mcp.clearMcpTools();
      this.stateService.mcp.clearMcpPendingRequests();
    }
  }
  
  export default MCPConnector;