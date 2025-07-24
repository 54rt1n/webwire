# CLAUDE.md - Client Module

This file provides guidance for working with the WebWire client infrastructure that coordinates between content scripts and the chat service.

## Directory Structure
```
src/js/client/
├── cmcp-helper.js             # MCP content fetching utilities
├── content-event-handlers.js  # Content script event handling
├── panel-event-handlers.js    # Panel-specific event handling
└── webwire-client-core.js     # Core client controller
```

## Overview

The client module provides the infrastructure that binds WebWire's content script to the chat service and background processes. It handles:

- **Event Coordination** - Routes events between content, background, and UI components
- **State Synchronization** - Keeps content script state in sync with background
- **MCP Integration** - Provides utilities for fetching content via MCP
- **Service Initialization** - Bootstraps core services and dependencies

## Architecture

### WebWire Client Core (`webwire-client-core.js`)

The main controller that initializes and coordinates all client services:

```javascript
class WebWireClientCore {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.stateService = null;
        this.mcpConnector = null;
        this.aiClient = null;
        this.storage = null;
        this.dispatcher = null;
    }
    
    async initialize(initialState = null) {
        // Initialize context with all dependencies
        const context = await initializeContext(this.eventBus, null, { initialState });
        
        // Extract and store service references
        this.stateService = context.stateService;
        this.storage = context.storage;
        this.aiClient = context.aiClient;
        this.mcpConnector = context.mcpConnector;
        this.dispatcher = context.dispatcher;
    }
}
```

#### Key Responsibilities

1. **Service Initialization** - Creates and wires together all core services
2. **MCP Connection** - Establishes connection to MCP server when needed
3. **Content Fetching** - Provides unified interface for fetching content via MCP

#### Content Fetching

The core provides a unified `fetch` method that handles different URI schemes:

```javascript
async fetch(uri, options = {}) {
    if (uri.startsWith('kb://')) {
        return this.cmcpHelper.fetchKbContent(uri, options);
    } else if (uri.startsWith('fs://')) {
        const path = uri.substring(5); // Remove 'fs://' prefix
        return this.cmcpHelper.fetchFsContent(path, options);
    } else {
        // Assume it's a file path
        return this.cmcpHelper.fetchFsContent(uri, options);
    }
}
```

### Content Event Handlers (`content-event-handlers.js`)

Manages all event handling for the content script context:

```javascript
class ContentEventHandlers {
    constructor(core) {
        this.core = core;
        this.eventBus = core.eventBus;
        this.stateService = core.stateService;
        this.dispatcher = core.dispatcher;
    }
}
```

#### Event Categories

1. **Early-Bind Events** - Available during initialization
   - `CONTENT_ACTIONS.PING` - Health check
   - `CONTENT_ACTIONS.GET_WEBWIRE_STATE` - State query

2. **Stash Events** - Document stashing operations
   - `EVENTS.STASH.ADD` - Add document to stash
   - `EVENTS.STASH.REMOVE` - Remove from stash
   - `EVENTS.STASH.CLEAR` - Clear all stashed items
   - `EVENTS.STASH.SAVE` - Persist stash to storage
   - `EVENTS.STASH.LOAD` - Load stash from storage

3. **Chat Events** - Chat service coordination
   - `EVENTS.CHAT.EXECUTE_TOOL` - Execute MCP tool
   - `EVENTS.CHAT.CANCEL_TOOL` - Cancel tool execution
   - `EVENTS.CHAT.SAVE_MESSAGE` - Save conversation message
   - `EVENTS.CHAT.END_CONVERSATION` - End current conversation
   - `EVENTS.CHAT.UPDATE_SETTINGS` - Update chat settings
   - `EVENTS.CHAT.RESYNC` - Resynchronize state

4. **Thread Management**
   - `EVENTS.CHAT.GET_OR_CREATE_THREAD` - Get or create conversation thread
   - `EVENTS.CHAT.CREATE_NEW_THREAD` - Create fresh thread
   - `EVENTS.CHAT.UPDATE_CONVERSATION` - Update thread state

#### Critical Patterns

**State Synchronization:**
```javascript
async handleResync(data) {
    // Get fresh state from background
    const response = await this.dispatcher.dispatch(
        BACKGROUND_ACTIONS.GET_WEBWIRE_STATE,
        {},
        { target: 'background' }
    );
    
    // Update local state service
    if (response.success && response.result) {
        this.core.stateService.setState(response.result);
    }
}
```

**Thread State Updates:**
```javascript
// CRITICAL: Update local conversation state from background data
if (this.stateService && this.stateService.conversation) {
    this.stateService.conversation.patchConversation({
        threadId: response.result.threadId,
        metadata: response.result.metadata,
        messages: response.result.messages,
        isActive: true  // This is the current active thread
    });
}
```

### Panel Event Handlers (`panel-event-handlers.js`)

Similar to ContentEventHandlers but for panel contexts (MCP panel, options, etc.):

```javascript
class PanelEventHandlers {
    constructor(core) {
        this.core = core;
        this.eventBus = core.eventBus;
        this.stateService = core.stateService;
    }
}
```

Handles the same event categories but in panel contexts where direct Chrome API access is available.

### CMCP Helper (`cmcp-helper.js`)

Utilities for fetching content via MCP (Container-MCP Protocol):

```javascript
class CMCPHelper {
    constructor(mcpConnector) {
        this.mcpConnector = mcpConnector;
    }
    
    // Fetch knowledge base content
    async fetchKbContent(uri, options = {})
    
    // Fetch filesystem content
    async fetchFsContent(path, options = {})
    
    // Auto-detect and fetch any URI
    async fetch(uri, options = {})
}
```

#### URI Schemes

1. **Knowledge Base**: `kb://document-path`
   - Uses `kb_read` MCP tool
   - Supports metadata inclusion

2. **Filesystem**: `fs:///absolute/path` or plain paths
   - Uses `fs_read` MCP tool
   - Configurable encoding

## Integration with Content Script

The client module is used by the content script (`src/content/index.js`):

```javascript
class WebWireContentHost {
    constructor() {
        // Create core infrastructure
        this.core = new WebWireClientCore(this.eventBus);
        
        // Create chat service
        this.chatService = new ChatService(this.eventBus);
        
        // Set up event handlers
        this.eventHandlers = new ContentEventHandlers(this.core);
        this.eventHandlers.setupEventListeners();
    }
}
```

## Event Flow Patterns

### Background → Content Communication

1. **Settings Update**
```javascript
// Background notifies of settings change
dispatcher.dispatch(CONTENT_ACTIONS.SETTINGS_CHANGED, { settings });

// Content handler updates local state
async handleSettingsChanged(data) {
    this.currentSettings = data.settings;
    await this.handleResync({});
    this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, { settings });
}
```

2. **Conversation Update**
```javascript
// Background notifies of conversation update
dispatcher.dispatch(CONTENT_ACTIONS.CONVERSATION_UPDATED, { conversation });

// Content syncs local state and notifies UI
async handleConversationUpdated(data) {
    this.stateService.conversation.patchConversation(data.conversation);
    this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, { conversation });
}
```

### Content → Background Communication

All content-to-background communication uses the EventDispatcher:

```javascript
const response = await this.dispatcher.dispatch(
    BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE,
    data,
    { target: 'background' }
);
```

Common background actions:
- `SAVE_WEBWIRE_SETTINGS` - Persist settings
- `SAVE_THREAD_MESSAGE` - Save conversation message
- `SAVE_CONVERSATION` - Save entire conversation
- `END_CONVERSATION` - Mark conversation complete
- `GET_WEBWIRE_STATE` - Query current state
- `CREATE_NEW_THREAD` - Start new conversation

## State Management

### Local State Service

The content script maintains a local state service that mirrors background state:

```javascript
// State is initialized from background
const context = await initializeContext(this.eventBus, null, { initialState });

// State updates are synchronized via events
this.stateService.conversation.patchConversation(conversationData);
```

### State Synchronization

Critical principle: **Background is the source of truth**

1. Content script queries background for initial state
2. Background notifies content of state changes
3. Content updates local state to match
4. UI components read from local state for performance

## Error Handling

### Service Availability

Handlers check service availability before operations:

```javascript
if (!this.stateService || !this.stateService.stash) {
    console.error('[ContentEventHandlers] No stash service available');
    return;
}
```

### Early-Bind Safety

Early-bind handlers must handle missing services gracefully:

```javascript
async handleGetWebwireState(data) {
    try {
        const servicesReady = this.core && this.core.stateService;
        return {
            success: true,
            state: { servicesReady }
        };
    } catch (error) {
        return {
            success: true,
            state: { servicesReady: false }
        };
    }
}
```

### Async Error Handling

All async operations use try-catch with proper error responses:

```javascript
try {
    const response = await this.dispatcher.dispatch(action, data, options);
    return response;
} catch (error) {
    console.error('[ContentEventHandlers] Operation failed:', error);
    return { success: false, error: error.message };
}
```

## Development Patterns

### Adding New Event Handlers

1. **Define Event Type** in `src/js/core/events.js`
2. **Add Handler Method** to appropriate handler class
3. **Register Handler** in `setupEventListeners()`
4. **Handle Errors** with try-catch and proper responses

### Cross-Context Communication

Always use EventDispatcher for cross-context messaging:

```javascript
// Bad - Direct Chrome API
chrome.runtime.sendMessage({ /* ... */ });

// Good - EventDispatcher
await this.dispatcher.dispatch(ACTION, data, { target: 'background' });
```

### State Updates

Always sync state changes through proper channels:

```javascript
// Bad - Direct state modification
this.stateService.state.settings = newSettings;

// Good - Dispatch to background
await this.dispatcher.dispatch(
    BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
    newSettings,
    { target: 'background' }
);
```

## Important Implementation Notes

### Two-Level Event System

The client uses two event systems:
1. **EventBus** - For same-context events
2. **EventDispatcher** - For cross-context events

### Critical State Sync Points

1. **Thread Creation** - Must sync new thread from background
2. **Conversation Updates** - Must patch local state
3. **Settings Changes** - Requires full resync
4. **Tool Results** - Update local state before saving

### Service Dependencies

- WebWireClientCore depends on context initialization
- Event handlers depend on core services
- CMCP Helper requires active MCP connector
- All services require eventBus for coordination

### Performance Considerations

- Local state reduces background queries
- Batch operations when possible
- Use early-bind for initialization events
- Minimize cross-context messaging