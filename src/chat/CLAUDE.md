# CLAUDE.md - Chat Panel System

This file provides guidance for working with the WebWire chat panel system.

## Directory Structure
```
src/chat
├── chat-constants.js    # Constants and configuration
├── chat-panel.js        # UI management and interactions
├── chat-renderer.js     # HTML generation and DOM manipulation
├── chat-service.js      # Core chat logic and AI integration
├── chat.css            # Chat styling
├── message-utils.js     # Message formatting utilities
└── page-utils.js       # Page content extraction and context building
```

## Overview

The chat system is a sophisticated multi-layer architecture providing AI-powered conversations with web page analysis, tool integration, and rich UI interactions. It follows a clear separation of concerns with service logic, UI management, and rendering layers.

## Architecture Flow

```
User Input → ChatPanel → ChatService → AI Client → Response
                ↓           ↓            ↓
           ChatRenderer ← EventBus → MCP Tools
                ↓           ↓
           DOM Updates → State Service → Storage
```

## Core Components

### 1. ChatService (`chat-service.js`)

The central orchestration layer handling:
- AI client integration and streaming responses
- MCP tool execution and coordination
- Message processing and conversation management
- Page content extraction and context building
- Event coordination between components

#### Key Responsibilities:
```javascript
class ChatService {
    // Core chat operations
    handleUserMessage()         // Process user input with AI
    handleReparseMessage()      // Reparse with tool execution
    handlePageAnalysisRequest() // Analyze current page
    
    // Tool integration
    parseToolsFromResponse()    // Extract tool calls from AI
    handleExecuteToolCall()     // Execute MCP tools
    handleToolResult()          // Process tool responses
    
    // Context building
    buildPageContext()          // Extract page content
    buildStashContext()         // Include stashed documents
    
    // Streaming support
    addThinkingMessage()        // Start streaming message
    handleStreamingChunk()      // Update streaming content
    finalizeStreamingMessage()  // Complete streaming
}
```

#### Message Processing Flow:
1. **Input Processing** - Validates and prepares user message
2. **Context Building** - Extracts page content, stash content, system prompts
3. **AI Request** - Sends to configured AI provider with streaming
4. **Tool Execution** - Parses and executes any tool calls
5. **Response Handling** - Updates UI with final response
6. **State Persistence** - Saves conversation to storage

### 2. ChatPanel (`chat-panel.js`)

UI management layer handling:
- DOM element lifecycle and event binding
- User interaction processing
- Message display coordination
- Panel visibility and state management

#### Key Responsibilities:
```javascript
class WebChatPanel {
    // Lifecycle management
    initialize()           // Setup DOM and event listeners
    destroy()             // Cleanup and removal
    
    // Message display
    displayMessage()       // Show user/assistant messages
    displayThinkingMessage() // Show streaming placeholder
    updateStreamingMessage() // Update streaming content
    finalizeThinkingMessage() // Convert to final message
    
    // UI state management
    show() / hide() / toggle() // Panel visibility
    updateConnectionStatus()   // AI/MCP connection indicators
    updateSendButton()        // Input validation state
    
    // User interactions
    handleSendMessage()       // Process user input
    handlePageAnalysisRequest() // Request page analysis
    handleNewConversationRequest() // Start new thread
}
```

#### Event Listeners:
- **Input Events** - Message sending, auto-resize, validation
- **Action Events** - New conversation, page analysis, replay
- **Visibility Events** - Show/hide panel
- **Tool Events** - Tool button clicks and execution

### 3. ChatRenderer (`chat-renderer.js`)

Pure HTML generation layer providing:
- Template-based HTML generation
- Message formatting and escaping
- Tool result visualization
- Streaming content updates

#### Key Responsibilities:
```javascript
class ChatUIRenderer {
    // Container generation
    createContainerHTML()     // Complete panel structure
    createPanelHTML()        // Main panel layout
    createHeaderHTML()       // Header with controls
    createInputContainerHTML() // Input area
    
    // Message rendering
    createMessageElement()    // Message DOM elements
    createMessageHTML()      // Message HTML templates
    createToolMessagesHTML() // Tool execution results
    
    // Content formatting
    escapeAndFormatContent() // Safe HTML with formatting
    updateStreamingContent() // Real-time content updates
    createFinalizedMessageHTML() // Complete message layout
}
```

#### HTML Template System:
- **Escape-first** - All content HTML-escaped by default
- **Template strings** - Complex HTML built with template literals
- **Modular generation** - Separate functions for each UI component
- **Tool visualization** - Specialized rendering for tool results

### 4. PageUtils (`page-utils.js`)

Sophisticated page content extraction providing:
- Comprehensive content analysis
- Context building for AI
- Structured data extraction

#### Page Content Extraction:
```javascript
class PageContentExtractor {
    extractPageContent()    // Complete page analysis
    extractTextContent()    // Clean text extraction
    extractHeadings()       // Heading hierarchy
    extractLinks()          // Meaningful links
    extractImages()         // Images with alt text
    extractMetadata()       // Page metadata
    extractForms()          // Form structure
}
```

#### Context Building:
```javascript
class ContextBuilder {
    buildPageAnalysisRequest()     // Analysis request format
    buildChatMessageWithContext()  // Enhanced message context
    buildWorkspaceContent()        // Workspace metadata
    buildStructuredContext()       // AI-ready context object
}
```

### 5. MessageUtils (`message-utils.js`)

Utility functions for:
- Message formatting and validation
- Tool call and result correlation
- Content transformation

## Chat Panel Workflow

### 1. Initialization
```javascript
// Panel creation and setup
const panel = new WebChatPanel(eventBus);
await panel.initialize();

// Service initialization
const service = new ChatService(eventBus);
await service.initialize(aiClient, mcpConnector, stateService);
```

### 2. User Message Flow
```
User types message → ChatPanel.handleSendMessage()
    ↓
Emit 'user_message' event → ChatService.handleUserMessage()
    ↓
Build context (page content, stash, system prompts)
    ↓
Send to AI client with streaming
    ↓
Parse tool calls from response
    ↓
Execute tools via MCP connector
    ↓
Finalize message with tool results
    ↓
Update UI via ChatPanel.displayMessage()
    ↓
Save to conversation state
```

### 3. Page Analysis Flow
```
User clicks analyze → ChatPanel.handlePageAnalysisRequest()
    ↓
PageUtils.buildAnalysisRequest() extracts page content
    ↓
Generate synthetic analysis message
    ↓
Process through standard message flow
```

### 4. Tool Execution Flow
```
AI response contains tool calls → ChatService.parseToolsFromResponse()
    ↓
Extract tool definitions and parameters
    ↓
Emit 'execute_tool_call' → MCPConnector.executeTool()
    ↓
Send tool request to MCP server
    ↓
Receive tool result → ChatService.handleToolResult()
    ↓
Update message with tool output
    ↓
Continue AI conversation with tool results
```

### 5. Streaming Message Flow
```
Start AI request → ChatService.addThinkingMessage()
    ↓
Create streaming placeholder → ChatPanel.displayThinkingMessage()
    ↓
Receive chunks → ChatService.handleStreamingChunk()
    ↓
Update content → ChatPanel.updateStreamingMessage()
    ↓
Complete response → ChatService.finalizeStreamingMessage()
    ↓
Replace with final message → ChatPanel.finalizeThinkingMessage()
```

## Event System Integration

### Events Emitted by ChatService:
- `user_message` - User input processing
- `execute_tool_call` - Tool execution request
- `conversation_updated` - Conversation state changed
- `new_conversation` - Create new thread
- `outbound_dispatch` - Cross-context communication

### Events Handled by ChatService:
- `user_message` - Process user input
- `page_analysis_request` - Analyze current page
- `reparse_message` - Reparse with tools
- `tool_result` - Tool execution result
- `settings_refresh` - Settings updated
- `mcp_status_update` - MCP connection changed

## State Integration

### Conversation State:
```javascript
// Thread management
const threadId = stateService.conversation.createThreadId();
stateService.conversation.storeMessage(threadId, userMessage, assistantMessage);

// Message retrieval
const messages = stateService.conversation.getConversationMessages(threadId);
const activeThread = stateService.conversation.getActiveConversationId();
```

### Settings Integration:
```javascript
// AI configuration
const aiSettings = stateService.state.settings.ai;
const modelConfig = aiSettings.models.chat;

// UI preferences
const uiSettings = stateService.state.settings.ui;
const includePageContent = uiSettings.includePageContent;
```

## Tool Integration Patterns

### Tool Call Parsing:
```javascript
// Extract tool calls from AI response
const toolCalls = ToolParser.parseResponse(response);

// Execute each tool
for (const toolCall of toolCalls) {
    const result = await mcpConnector.executeTool(
        toolCall.function.name,
        toolCall.function.arguments
    );
}
```

### Tool Result Display:
```javascript
// Update UI with tool results
chatPanel.updateToolResult(callId, {
    status: 'success',
    result: toolOutput,
    timestamp: Date.now()
});
```

## Styling System (`chat.css`)

Comprehensive CSS providing:
- Panel layout and positioning
- Message styling and threading
- Tool result visualization
- Responsive design
- Animation and transitions

## Development Patterns

### Adding New Message Types:
1. Define message structure in constants
2. Add rendering logic to ChatRenderer
3. Handle in ChatService event system
4. Update UI in ChatPanel
5. Add state persistence if needed

### Adding New Tool Visualizations:
1. Extend ChatRenderer.createToolMessageHTML()
2. Add CSS styling for tool type
3. Handle tool-specific formatting
4. Add interactive elements if needed

### Extending Page Content Extraction:
1. Add extraction method to PageContentExtractor
2. Update context building in ContextBuilder
3. Handle in ChatService.buildPageContext()
4. Test with various page types

### Adding New Chat Features:
1. Add UI elements in ChatRenderer
2. Handle user interactions in ChatPanel
3. Implement logic in ChatService
4. Integrate with state system
5. Add event coordination

## Testing Considerations

### Unit Testing:
- PageUtils extraction accuracy
- Message formatting and escaping
- Tool call parsing
- Context building logic

### Integration Testing:
- Full message flow end-to-end
- Tool execution with MCP
- State persistence and restoration
- Cross-context communication

### UI Testing:
- Panel interactions and state
- Streaming message updates
- Tool result visualization
- Responsive layout behavior