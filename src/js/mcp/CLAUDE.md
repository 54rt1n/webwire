# CLAUDE.md - Model Context Protocol (MCP) Integration

This file provides comprehensive documentation for WebWire's MCP (Model Context Protocol) integration, which enables AI assistants to execute tools and interact with external systems.

## Directory Structure
```
src/js/mcp/
├── mcp-connector.js    # SSE connection and protocol management
├── tool-formatter.js   # Formats MCP tools for AI consumption
└── tool-parser.js      # Extracts tool calls from AI responses
```

## Overview

The MCP module provides a bridge between AI assistants and external tools through the Model Context Protocol. It handles:

- **Server-Sent Events (SSE) Connection** - Real-time bidirectional communication
- **Protocol Handshake** - MCP version negotiation and capability exchange
- **Tool Discovery** - Automatic enumeration of available tools
- **Tool Execution** - Request/response handling with timeout management
- **Format Conversion** - MCP tools to OpenAI function format
- **Response Parsing** - Extract tool calls from AI responses

## Architecture

### Component Interaction

```
AI Assistant
    ↓ (generates response with tool calls)
ToolParser
    ↓ (extracts JSON blocks)
ChatService
    ↓ (executes tools)
MCPConnector
    ↓ (sends via POST)
MCP Server
    ↓ (executes tool)
SSE Response
    ↓ (returns result)
AI Assistant (receives result)
```

### Protocol Flow

1. **Connection Setup** - Establish SSE connection with session ID
2. **Handshake** - Initialize protocol and exchange capabilities
3. **Tool Discovery** - Fetch available tools from server
4. **Tool Execution** - Send requests and receive responses
5. **Connection Management** - Handle reconnection and cleanup

## MCPConnector (mcp-connector.js)

The core component managing MCP server communication.

### Connection Lifecycle

```javascript
// Initialize connection
const connector = new MCPConnector('http://localhost:3000');
await connector.initialize(stateService);

// Execute tools
const result = await connector.executeTool('list_files', {
    path: '/home/user'
});

// Cleanup
connector.disconnect();
```

### SSE Connection Management

#### Connection Setup
```javascript
async connectSSE() {
    return new Promise((resolve, reject) => {
        // Create EventSource with session ID
        const sseUrl = new URL(this.mcpServerUrl);
        sseUrl.searchParams.append('session_id', this.sessionId);
        this.eventSource = new EventSource(sseUrl);
        
        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
            reject(new Error('SSE connection timeout'));
        }, 10000);
        
        // Listen for endpoint event
        this.eventSource.addEventListener('endpoint', this.handleEndpoint);
    });
}
```

#### Event Handling
- **open** - Connection established
- **message** - Response to request received
- **error** - Connection error or failure
- **endpoint** - Custom event with POST endpoint URL

### Protocol Handshake

```javascript
async performHandshake() {
    // Initialize protocol
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
    
    // Send initialized notification
    await this.sendRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    });
}
```

### Tool Discovery

```javascript
async fetchTools() {
    const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'tools/list'
    });
    
    // Convert to OpenAI format
    const tools = response.result.tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || {}
        }
    }));
}
```

### Tool Execution

```javascript
async executeTool(toolName, parameters = {}, options = {}) {
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
    
    // Process response
    const content = response.result.content;
    const firstEntry = content[0];
    
    return {
        ...options,
        ...entry,
        name: toolName,
        success: !response.result.isError,
        executionTime: Date.now() - executionStart
    };
}
```

### Request/Response Correlation

```javascript
async sendRequest(request) {
    return new Promise((resolve, reject) => {
        const requestId = request.id;
        
        // Store pending request
        if (requestId) {
            this.stateService.mcp.addMcpPendingRequest(
                requestId, 
                request.method, 
                request.params
            );
            
            // Set timeout
            setTimeout(() => {
                if (pendingRequests[requestId]) {
                    this.stateService.mcp.timeoutMcpRequest(requestId);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        }
        
        // Send via POST
        fetch(connectionState.postEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
    });
}
```

### Error Handling

- **Connection Errors** - Retry with exponential backoff
- **Timeout Handling** - 30-second default timeout
- **HTTPS Downgrade** - Security check for protocol downgrade
- **Session Management** - Unique session ID per connection

## ToolFormatter (tool-formatter.js)

Formats MCP tools into AI-consumable prompts and descriptions.

### System Prompt Generation

```javascript
static generateSystemPrompt(tools = []) {
    const genericHeader = `You are a helpful assistant that can use MCP tools...
    
TOOL CALLING INSTRUCTIONS:
When you need to use a tool, respond with a JSON code block:
\`\`\`json
{
    "name": "tool_name",
    "parameters": {
        "param1": "value1"
    }
}
\`\`\``;
    
    const toolDescriptions = this.generateToolDescriptions(tools);
    return `${genericHeader}\n\nAVAILABLE TOOLS:\n${toolDescriptions}`;
}
```

### Tool Description Formatting

```javascript
static generateToolDescriptions(tools = []) {
    return tools.map(tool => {
        const func = tool.function;
        let description = `• ${func.name}: ${func.description}`;
        
        // Add parameter details
        if (func.parameters?.properties) {
            const params = Object.entries(func.parameters.properties)
                .map(([name, schema]) => {
                    const required = func.parameters.required?.includes(name) 
                        ? ' (required)' : ' (optional)';
                    const type = this.formatParameterType(schema);
                    return `    - ${name}${type}${required}`;
                }).join('\n');
            
            description += '\n' + params;
        }
        
        return description;
    }).join('\n\n');
}
```

### User Context Header

```javascript
static generateUserHeader(tools = [], toolResults = []) {
    let header = '';
    
    // Show previous tool results
    if (toolResults.length > 0) {
        header += "PREVIOUS TOOL RESULTS:\n";
        toolResults.forEach((result, index) => {
            const success = result.success ? '✓' : '✗';
            header += `${index + 1}. ${success} ${result.name}`;
            if (result.executionTime) {
                header += ` (${result.executionTime}ms)`;
            }
        });
    }
    
    // List available tools
    const functionNames = tools.map(t => t.function.name).join(', ');
    header += `Available tools: ${functionNames}`;
    
    return header;
}
```

### Tool Validation

```javascript
static validateToolsFormat(tools) {
    const result = { valid: true, errors: [], warnings: [] };
    
    tools.forEach((tool, index) => {
        // Check structure
        if (!tool.type || tool.type !== 'function') {
            result.warnings.push(`Tool ${index}: invalid type`);
        }
        
        // Validate function object
        if (!tool.function?.name) {
            result.valid = false;
            result.errors.push(`Tool ${index}: missing name`);
        }
    });
    
    return result;
}
```

## ToolParser (tool-parser.js)

Extracts and validates tool calls from AI responses.

### Response Parsing

```javascript
const parser = new ToolParser();

// Parse AI response
const result = parser.parseResponse(aiResponse);
if (result.success) {
    for (const toolCall of result.toolCalls) {
        console.log(`Tool: ${toolCall.name}`, toolCall.parameters);
    }
}
```

### Key Features

#### Thinking Block Filtering
```javascript
filterThinkingBlocks(response) {
    // Remove <think>...</think> blocks
    let filtered = response.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    // Handle unclosed thinking tags
    const unclosedMatch = filtered.match(/<think>/i);
    if (unclosedMatch) {
        filtered = filtered.substring(0, unclosedMatch.index);
    }
    
    return filtered;
}
```

#### Multiple Tool Call Support
```javascript
extractAllToolCalls(response) {
    const result = { toolCalls: [], errors: [] };
    
    // Find all JSON code blocks
    const jsonBlocks = this.extractCodeBlocks(response)
        .filter(block => block.language === 'json');
    
    // Parse each block
    for (const block of jsonBlocks) {
        try {
            const parsed = JSON.parse(block.content);
            parsed.callId = generateToolCallId();
            
            if (this.validateToolCall(parsed).valid) {
                result.toolCalls.push(parsed);
            }
        } catch (error) {
            result.errors.push(`Parse error: ${error.message}`);
        }
    }
    
    return result;
}
```

#### Fuzzy Field Matching
```javascript
applyFuzzyMatching(toolCall) {
    // Handle variations in field names
    if (keys.length === 2) {
        // Find string field (tool name) and object field (parameters)
        for (const key of keys) {
            if (typeof toolCall[key] === 'string') {
                toolCall.name = toolCall[key];
            } else if (typeof toolCall[key] === 'object') {
                toolCall.parameters = toolCall[key];
            }
        }
    }
}
```

#### JSON Preprocessing
```javascript
preprocessJsonString(jsonString) {
    // Fix common JSON issues from AI responses
    // - Escape unescaped control characters
    // - Handle newlines in strings
    // - Fix quote escaping issues
}
```

## Integration with Chat System

### Tool Execution Flow

1. **AI generates response** with tool calls in JSON blocks
2. **ToolParser extracts** tool calls from response
3. **ChatService validates** tools against available list
4. **MCPConnector executes** each tool via MCP server
5. **Results formatted** and passed back to AI

### Example Integration

```javascript
// In ChatService
async handleToolCalls(response) {
    // Parse tool calls
    const parseResult = this.toolParser.parseResponse(response);
    
    if (parseResult.toolCalls.length > 0) {
        // Execute each tool
        for (const toolCall of parseResult.toolCalls) {
            const result = await this.mcpConnector.executeTool(
                toolCall.name,
                toolCall.parameters
            );
            
            // Store result for next AI turn
            this.toolResults.push(result);
        }
    }
}
```

## State Management Integration

### MCP State Plugin

The MCP state is managed through the state service:

```javascript
// Connection state
stateService.mcp.setMcpConnection({
    sessionId: 'uuid',
    postEndpoint: 'http://localhost:3000/message'
});

// Tool management
stateService.mcp.setMcpTools(tools);
stateService.mcp.getMcpTools();

// Request tracking
stateService.mcp.addMcpPendingRequest(id, method, params);
stateService.mcp.completeMcpRequest(id, response);
stateService.mcp.timeoutMcpRequest(id);
```

## Security Considerations

### HTTPS Downgrade Protection
```javascript
if (this.stateService.mcp.isHTTPSDowngrade()) {
    throw new Error('MCP server security downgrade.');
}
```

### Session Isolation
- Unique session ID per connection
- Sessions not shared between tabs
- Clean session termination on disconnect

### Input Validation
- Tool parameters validated before execution
- JSON parsing with error recovery
- Timeout protection on all requests

## Error Handling Patterns

### Connection Recovery
```javascript
handleError(event) {
    // Log error
    console.error('[MCPConnector] SSE error');
    
    // Update state
    this.stateService.mcp.setMcpConnected(false);
    
    // Clean up resources
    if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
    }
    
    // Reject pending connection
    if (this.rejectConnection) {
        this.rejectConnection(new Error('SSE connection error'));
    }
}
```

### Request Timeout
```javascript
setTimeout(() => {
    if (pendingRequests[requestId]) {
        // Mark as timed out
        this.stateService.mcp.timeoutMcpRequest(requestId);
        
        // Reject promise
        reject(new Error('Request timeout'));
        
        // Clean up
        this.stateService.mcp.removeMcpPendingRequest(requestId);
    }
}, 30000);
```

## Performance Optimization

### Connection Pooling
- Single SSE connection per MCP server
- Reuse connection for multiple requests
- Automatic cleanup on idle timeout

### Request Batching
- Queue multiple tool calls
- Execute in parallel when possible
- Aggregate results for AI

### Memory Management
- Clean up event listeners on disconnect
- Remove completed requests from tracking
- Limit pending request queue size

## Debugging and Monitoring

### Debug Logging
```javascript
console.log('[MCPConnector] SSE connection established');
console.log('[ToolParser] Found', jsonBlocks.length, 'JSON blocks');
console.log('[ToolFormatter] Generated system prompt');
```

### State Inspection
```javascript
// Check connection status
const isConnected = stateService.mcp.isMcpConnected();
const isInitialized = stateService.mcp.isMcpInitialized();

// View pending requests
const pending = stateService.mcp.getMcpPendingRequests();

// Get available tools
const tools = stateService.mcp.getMcpTools();
```

## Extension Points

### Custom Tool Formatters
```javascript
class CustomToolFormatter extends ToolFormatter {
    static generateSystemPrompt(tools) {
        // Custom prompt generation
    }
}
```

### Protocol Extensions
```javascript
// Add custom protocol methods
async customMethod(params) {
    return await this.sendRequest({
        jsonrpc: '2.0',
        id: this.getNextId(),
        method: 'custom/method',
        params: params
    });
}
```

### Response Processors
```javascript
// Custom response processing
processToolResponse(response) {
    // Transform response format
    // Add metadata
    // Validate output
}
```

## Best Practices

### Tool Design
- Clear, descriptive tool names
- Comprehensive parameter schemas
- Helpful error messages
- Fast execution times

### Error Messages
- Include tool name in errors
- Provide actionable feedback
- Log full error context
- Suggest alternatives

### Connection Management
- Initialize once per session
- Handle reconnection gracefully
- Clean disconnect on unload
- Monitor connection health