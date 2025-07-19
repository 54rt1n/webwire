# Content Script - WebWire Host Adapter

The content script serves as a lightweight host adapter that bridges Chrome extension APIs with the WebWire application architecture. It initializes and coordinates the core WebWire components while handling browser-specific concerns.

## Architecture Overview

The content script implements a clean host/adapter pattern with three main classes:

### 1. **WebWireContentHost** (`index.js`) - Main Coordinator
The primary content script class that orchestrates initialization and provides Chrome extension integration.

**Core Responsibilities:**
- **Component Initialization** - Creates and wires up EventBus, WebWireClientCore, ChatService, PageUtils, and DOMAgent
- **Chrome API Integration** - Handles extension-specific APIs and window/DOM events  
- **Lifecycle Management** - Manages initialization order and dependency injection
- **UI Event Handling** - Keyboard shortcuts and panel injection triggers
- **State Coordination** - Auto-inject settings and panel visibility restoration

**Architecture Pattern:**
```javascript
class WebWireContentHost {
    constructor() {
        // Core infrastructure
        this.eventBus = new EventBus({domain: 'content', debug: true});
        this.core = new WebWireClientCore(this.eventBus);
        this.chatService = new ChatService(this.eventBus);
        
        // Browser interaction utilities
        this.pageUtils = new PageUtils();
        this.domAgent = new DOMAgent(this.eventBus);
        
        // Event handling layers
        this.eventHandlers = new EarlyEventHandlers(this.eventBus, this);
    }
}
```

### 2. **EarlyEventHandlers** (`content-event-handlers.js`) - Bootstrap Events
Handles events needed during initialization before full services are ready.

**Handles:**
- `CONTENT_ACTIONS.PING` - Health check responses
- `CONTENT_ACTIONS.GET_WEBWIRE_STATE` - State queries during startup
- `CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL` - Panel injection requests
- `CONTENT_ACTIONS.TOGGLE_WEBWIRE_PANEL` - Panel toggle requests

### 3. **ContentEventHandlers** (`content-event-handlers.js`) - Main Event Router
Handles cross-context communication after full initialization, routing events between ChatService and background script.

**Primary Patterns:**
- **Stash Operations** - Document stashing and management
- **Settings Management** - AI configuration and UI preferences  
- **Chat Operations** - Message saving, thread management, tool execution
- **Background Dispatch** - Routes events to background script via EventDispatcher

## Current Implementation Analysis

### Initialization Flow

1. **DOM Ready Detection** - Waits for document ready state
2. **Host Creation** - Instantiates WebWireContentHost with early event handlers
3. **Core Initialization** - WebWireClientCore sets up state service, AI client, MCP connector
4. **Event Handler Swap** - Replaces EarlyEventHandlers with full ContentEventHandlers
5. **UI Setup** - Keyboard listeners and injection triggers
6. **ChatService Init** - Initializes chat with core services (AI, MCP, state)
7. **Panel Restoration** - Auto-inject or restore panel visibility if needed

### Event Communication Patterns

#### Pattern 1: Local Event Bus Communication
For communication within the content script context:

```javascript
// ChatService emits to ContentEventHandlers
this.eventBus.emit(EVENTS.STASH.ADD, { uri, content });

// ContentEventHandlers listens and responds
this.eventBus.onAsync(EVENTS.STASH.ADD, this.handleStashAdd.bind(this));
```

#### Pattern 2: Cross-Context EventDispatcher
For communication with background script:

```javascript
// ContentEventHandlers routes to background
const response = await this.dispatcher.dispatch(
    BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
    settingsData,
    { target: 'background' }
);
```

#### Pattern 3: Chrome Extension Messaging
For direct Chrome API communication:

```javascript
// Background script calls content script actions
chrome.tabs.sendMessage(tabId, {
    action: CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL
});
```

### Missing DOM Event Handling

**Current Gap:** DOM events (`EVENTS.DOM.EXECUTE`, `EVENTS.DOM.OPERATION_COMPLETE`) are defined but NOT handled by ContentEventHandlers. The DOMAgent exists but the bridge to connect DOMConnector events to DOMAgent execution is missing.

**Expected Pattern (Not Implemented):**
```javascript
// Should be in ContentEventHandlers but is missing:
this.eventBus.on(EVENTS.DOM.EXECUTE, async (data) => {
    const { operationId, toolName, parameters } = data;
    const result = await this.domAgent.executeTool(toolName, parameters);
    this.eventBus.emit(EVENTS.DOM.OPERATION_COMPLETE, { operationId, result });
});
```

## Event Handler Responsibilities

### EarlyEventHandlers (Bootstrap Phase)

**Purpose:** Handle essential events during initialization when services may not be ready.

**Events:**
- `CONTENT_ACTIONS.PING` → `handlePing()` - Returns health status
- `CONTENT_ACTIONS.GET_WEBWIRE_STATE` → `handleGetWebwireState()` - Returns current state
- `CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL` → `handleInjectPanel()` - Triggers panel injection
- `CONTENT_ACTIONS.TOGGLE_WEBWIRE_PANEL` → `handleTogglePanel()` - Toggles panel visibility

### ContentEventHandlers (Main Phase)

**Purpose:** Route events between ChatService and external contexts (background, other tabs).

#### Stash Management
- `EVENTS.STASH.ADD` → Background storage via `BACKGROUND_ACTIONS.SAVE_STASH`
- `EVENTS.STASH.REMOVE` → Background storage operations
- `EVENTS.STASH.SAVE` → Persist stash to background
- `EVENTS.STASH.LOAD` → Load stash from background

#### Settings & UI State
- `EVENTS.CHAT.UPDATE_SETTINGS` → `BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS`
- `EVENTS.CHAT.SAVE_PANEL_VISIBILITY` → `BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY`

#### Chat & Conversation Management  
- `EVENTS.CHAT.SAVE_MESSAGE` → `BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE`
- `EVENTS.CHAT.GET_OR_CREATE_THREAD` → `BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD`
- `EVENTS.CHAT.END_CONVERSATION` → `BACKGROUND_ACTIONS.END_CONVERSATION`

#### Tool Execution
- `EVENTS.CHAT.EXECUTE_TOOL` → MCP connector tool execution
- `EVENTS.CHAT.CANCEL_TOOL` → Tool cancellation handling

## Component Integration

### WebWireClientCore Integration
The content host delegates infrastructure concerns to WebWireClientCore:

```javascript
// Core provides initialized services
await this.core.initialize();
const { stateService, aiClient, mcpConnector, dispatcher } = this.core;

// ChatService receives these services
await this.chatService.initialize(aiClient, mcpConnector, stateService);
```

### ChatService Integration
ChatService operates independently but communicates via events:

```javascript
// ChatService emits events, ContentEventHandlers routes them
this.chatService → EventBus → ContentEventHandlers → Background Script
```

### Browser API Integration
Host handles Chrome-specific concerns:

```javascript
// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'w') {
        this.chatService.togglePanel();
    }
});

// Extension injection triggers
document.addEventListener('webwire-inject', () => {
    this.injectPanel();
});
```

## State Management

### Auto-Inject Logic
```javascript
const shouldInject = await this.shouldAutoInject();
const shouldShowPanel = this.core.stateService.ui?.panelVisible || false;

if (shouldInject || shouldShowPanel) {
    await this.injectPanel();
    if (shouldShowPanel) {
        this.chatService.showPanel();
    }
}
```

### Initial State Coordination
```javascript
const state = {
    currentThread: stateService.conversation.getActiveThread(),
    mcpConnected: stateService.mcp.isMcpConnected(),
    aiClientConfigured: !!this.core.aiClient,
    includePageContent: stateService.ui.getIncludePageContent(),
    useMCP: stateService.ui.getUseMCP(),
    useBrowserTools: stateService.ui.getUseBrowserTools(),
    autoExecuteTools: stateService.ui.getAutoExecuteTools()
};

await this.chatService.sendInitialState(state);
```

## Debug Infrastructure

### Global Debug Access
The content script exposes debug methods globally:

```javascript
// Available in browser console
window.webwire.debug()           // Get current state
window.webwire.forceInject()     // Force panel injection
window.webwire.getPageInfo()     // Extract page content
window.webwire.debugEventSystem() // Test event system
```

### Debug Methods (`debug.js`)
- **System State** - `debug()` returns comprehensive status
- **Panel Control** - `forceInject()`, `forceToggle()` for testing
- **Page Analysis** - `getPageInfo()` extracts current page data
- **Event Testing** - `debugEventSystem()` provides event test utilities
- **Persistence Testing** - `debugPanelPersistence()` tests state saving

## Development Guidelines

### Adding New Event Handlers

1. **Determine Handler Type:**
   - Early events (bootstrap/health) → EarlyEventHandlers  
   - Cross-context routing → ContentEventHandlers

2. **Add Event Listener:**
```javascript
// In ContentEventHandlers.setupEventListeners()
this.eventBus.onAsync(EVENTS.NEW.EVENT, this.handleNewEvent.bind(this));
```

3. **Implement Handler:**
```javascript
async handleNewEvent(data) {
    // For background routing:
    return await this.dispatcher.dispatch(
        BACKGROUND_ACTIONS.NEW_ACTION,
        data,
        { target: 'background' }
    );
    
    // For local processing:
    this.stateService.updateSomething(data);
    this.eventBus.emit(EVENTS.NEW.RESPONSE, result);
}
```

### Adding Missing DOM Event Handling

The DOM event bridge needs to be implemented in ContentEventHandlers:

```javascript
setupDOMEventHandlers() {
    // Handle DOM operations from DOMConnector
    this.eventBus.on(EVENTS.DOM.EXECUTE, async (data) => {
        try {
            const { operationId, toolName, parameters } = data;
            const result = await this.domAgent.executeTool(toolName, parameters);
            this.eventBus.emit(EVENTS.DOM.OPERATION_COMPLETE, { operationId, result });
        } catch (error) {
            this.eventBus.emit(EVENTS.DOM.OPERATION_ERROR, { 
                operationId: data.operationId, 
                error: error.message 
            });
        }
    });
}
```

### Error Handling Patterns

Use consistent error handling across event handlers:

```javascript
async handleSomeEvent(data) {
    try {
        const result = await this.dispatcher.dispatch(action, data, options);
        return result;
    } catch (error) {
        console.error(`[ContentEventHandlers] Failed to handle ${action}:`, error);
        throw error; // Re-throw for caller handling
    }
}
```

### State Service Access

Access state through the core services:

```javascript
// Access state plugins
const thread = this.core.stateService.conversation.getActiveThread();
const isConnected = this.core.stateService.mcp.isMcpConnected();
const settings = this.core.stateService.settings.getAISettings();

// Trigger state persistence
await this.dispatcher.dispatch(BACKGROUND_ACTIONS.SAVE_STATE, data, { target: 'background' });
```

## Architecture Benefits

### Clean Separation
- **Host Concerns** - Chrome APIs, DOM events, initialization
- **Application Logic** - ChatService handles chat functionality  
- **Infrastructure** - WebWireClientCore provides shared services
- **Communication** - Event handlers route between contexts

### Testability
- Event-driven architecture enables easy mocking
- Clear component boundaries facilitate unit testing
- Debug infrastructure provides runtime inspection

### Maintainability  
- Single responsibility per class
- Consistent event handling patterns
- Clear initialization flow
- Centralized error handling

The content script successfully implements a clean adapter pattern that isolates Chrome extension concerns while providing a robust foundation for the WebWire application architecture.