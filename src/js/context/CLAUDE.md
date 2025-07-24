# CLAUDE.md - Context System

This file provides guidance for working with the WebWire context initialization and dependency injection system.

## Directory Structure
```
src/js/context/
├── context-factory.js    # Creates context-specific service instances
└── context-init.js       # Detects context and initializes services
```

## Overview

The context system provides dependency injection and service initialization tailored to each Chrome extension context. It handles:

- **Context Detection** - Automatically identifies the execution environment
- **Service Creation** - Instantiates only the services needed for each context
- **Configuration Management** - Applies context-specific settings
- **Cross-Context Setup** - Configures EventDispatcher for communication

## Context Types

WebWire operates in five different contexts, each with specific requirements:

### 1. Background Context (`EVENT_CONTEXT.BACKGROUND`)
- **Role**: Central coordinator and state persistence
- **Services**: StateService, StorageManager
- **Special**: Direct Chrome API access, manages all extension state

### 2. Content Context (`EVENT_CONTEXT.CONTENT`)
- **Role**: Injected into web pages, hosts chat interface
- **Services**: ContentStateService, AI Client, MCP Connector
- **Special**: No direct storage access, syncs state from background

### 3. Popup Context (`EVENT_CONTEXT.POPUP`)
- **Role**: Extension popup interface
- **Services**: StateService, StorageManager
- **Special**: Limited UI, quick actions

### 4. Panel Context (`EVENT_CONTEXT.PANEL`)
- **Role**: Full UI panels (options, MCP panel)
- **Services**: StateService, StorageManager, AI Client, MCP Connector
- **Special**: Full Chrome API access, rich UI

### 5. Simple Context (`EVENT_CONTEXT.SIMPLE`)
- **Role**: Minimal contexts, testing
- **Services**: StateService, StorageManager
- **Special**: Basic functionality only

## Context Initialization

### Context Detection (`context-init.js`)

Automatic context detection based on available APIs:

```javascript
function detectContext() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getBackgroundPage) {
        return EVENT_CONTEXT.PANEL;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        return EVENT_CONTEXT.POPUP;
    }
    if (window.location.href.includes('chrome-extension://')) {
        return EVENT_CONTEXT.PANEL;
    }
    if (window.parent !== window) {
        return EVENT_CONTEXT.PANEL;
    }
    return EVENT_CONTEXT.CONTENT;
}
```

### Initialization Flow

```javascript
export async function initializeContext(eventBus, context = null, {initialState = null} = {}) {
    if (context === null) {
        context = detectContext();
    }
    
    // Context-specific service creation
    let results = {};
    switch (context) {
        case EVENT_CONTEXT.BACKGROUND:
            results = await contextFactory(eventBus, context,
                {storage: true, state: true, ai: false, mcp: false},
                {backgroundIsLocal: true, loadSettings: true, loadState: true, loadStash: true, loadUi: true}
            );
            break;
        // ... other contexts
    }
    return results;
}
```

## Context Factory (`context-factory.js`)

Creates and configures services based on context requirements:

### Service Creation Options

```javascript
contextFactory(eventBus, context,
    // What to create
    {
        storage: boolean,      // Create StorageManager
        state: boolean,        // Create StateService (full)
        contentState: boolean, // Create ContentStateService (lightweight)
        ai: boolean,          // Enable AI client creation
        mcp: boolean          // Create MCP connector
    },
    // How to configure
    {
        backgroundIsLocal: boolean,  // Is background in same context?
        loadSettings: boolean,       // Load settings from storage
        loadState: boolean,          // Load state from storage
        loadStash: boolean,          // Load stash from storage
        modelType: string,           // AI model type ('chat', 'tool', etc.)
        initialState: object,        // Initial state object
        readInitialState: boolean    // Query background for initial state
    }
)
```

### Service Dependencies

The factory enforces dependency requirements:

```javascript
// AI/MCP require settings
if ((ai || mcp) && ((!state || !loadSettings) && (!readInitialState && !initialState))) {
    throw new Error('Invalid context configuration: loading settings is required for AI and MCP');
}

// State requires storage
if (state && !storage) {
    throw new Error('Invalid context configuration: storage is required for state');
}
```

### Service Creation Flow

1. **Event Infrastructure**
```javascript
results.eventBus = eventBus;
results.dispatcher = new EventDispatcher(context, results.eventBus, {backgroundIsLocal});
results.errorBoundary = new EventErrorBoundary(results.dispatcher);
```

2. **Initial State (Content Context)**
```javascript
if (readInitialState) {
    const response = await results.dispatcher.dispatch(
        'GET_WEBWIRE_STATE', 
        {}, 
        { target: 'background' }
    );
    initialState = {
        ...createInitialState(),
        ...(response.result || {})
    };
}
```

3. **Storage (If Needed)**
```javascript
if (storage) {
    results.storage = new StorageManager(results.eventBus);
}
```

4. **State Service**
```javascript
if (state) {
    results.stateService = new StateService(results.eventBus, results.storage.storage);
    // Load requested data
    if (loadSettings) await results.stateService.settings.loadFromStorage();
    if (loadState) await results.stateService.disk.loadFromStorage();
    if (loadStash) await results.stateService.stash.loadFromStorage();
} else if (contentState) {
    // Lightweight state for content scripts
    results.stateService = new ContentStateService(initialState, results.eventBus);
}
```

5. **MCP Connector (If Enabled)**
```javascript
if (mcp) {
    const serverUrl = results.stateService.state.settings?.mcp?.serverUrl;
    if (serverUrl) {
        results.mcpConnector = new MCPConnector(serverUrl);
    }
}
```

## Context-Specific Configurations

### Background Context
```javascript
{storage: true, state: true, ai: false, mcp: false},
{backgroundIsLocal: true, loadSettings: true, loadState: true, loadStash: true, loadUi: true}
```
- Full state management
- All storage operations
- No AI/MCP (handled by other contexts)

### Content Context
```javascript
{storage: false, contentState: true, ai: true, mcp: true},
{backgroundIsLocal: false, modelType: 'chat', readInitialState: true}
```
- Lightweight ContentStateService
- No direct storage access
- AI and MCP for chat functionality
- Initial state from background

### Panel Context
```javascript
{storage: true, state: true, ai: true, mcp: true},
{backgroundIsLocal: true, loadSettings: true, loadState: true, loadStash: true, modelType: 'chat'}
```
- Full functionality
- Direct storage access
- AI and MCP capabilities

## State Service Variants

### Full StateService
Used in contexts with storage access:
- Includes disk plugin for persistence
- Direct storage adapter access
- Full plugin suite

### ContentStateService
Lightweight variant for content scripts:
- No storage adapters
- State synchronized from background
- Same plugin interface
- setState method for bulk updates

## Usage Patterns

### In Content Script
```javascript
// Initialize with state from background
const context = await initializeContext(eventBus, EVENT_CONTEXT.CONTENT);
const { stateService, mcpConnector, dispatcher } = context;

// State is already loaded from background
const settings = stateService.state.settings;
```

### In Background Script
```javascript
// Initialize with full storage access
const context = await initializeContext(eventBus, EVENT_CONTEXT.BACKGROUND);
const { stateService, storage } = context;

// Load persisted data
await stateService.disk.loadFromStorage();
```

### In Panel/Options
```javascript
// Initialize with all capabilities
const context = await initializeContext(eventBus, EVENT_CONTEXT.PANEL);
const { stateService, storage, mcpConnector } = context;
```

## Important Implementation Notes

### AI Client Creation
AI clients are no longer created by the context factory. Instead, they are created lazily by ChatService when needed:
```javascript
// AI client creation removed - now handled lazily by ChatService.getAiClient()
```

### Content Script State Sync
Content scripts must query background for initial state:
```javascript
if (readInitialState) {
    const response = await results.dispatcher.dispatch(
        'GET_WEBWIRE_STATE', 
        {}, 
        { target: 'background' }
    );
    // Merge with default state
}
```

### Service Availability
Not all services are available in all contexts:
- Storage: Only in contexts with Chrome API access
- Full StateService: Only with storage access
- AI/MCP: Only when explicitly enabled and settings loaded

### Error Handling
The factory validates configurations and throws descriptive errors:
- Missing dependencies
- Invalid combinations
- Required initial state

### Background Detection
The `backgroundIsLocal` flag determines EventDispatcher routing:
- `true`: Background runs in same context (popup, panel)
- `false`: Background is separate (content script)