# CLAUDE.md - State Management System

This file provides guidance for working with the WebWire state management system.

## Directory Structure
```
src/js/state
├── plugins/                # Domain-specific state managers
│   ├── aim-state.js       # AIM-specific state (personas, workspace)
│   ├── conversation-state.js  # Chat threads and message history
│   ├── disk-state.js      # Persistent storage coordination
│   ├── mcp-state.js       # MCP server connections and tool state
│   ├── settings-state.js  # User preferences and AI configuration
│   ├── stash-state.js     # Document stashing functionality
│   └── ui-state.js        # Panel visibility and UI preferences
├── state-container.js     # Core state container with plugin system
├── state-service.js       # High-level state operations and coordination
└── state-validator.js     # State validation and integrity checking
```

## Overview

The state management system provides a plugin-based architecture for managing application state across the WebWire extension. It handles:

- **Domain Separation** - Each feature area has its own state plugin
- **Automatic Persistence** - State changes trigger storage saves
- **Cross-Context Sync** - State synchronized across extension contexts
- **Event Coordination** - State changes emit events for UI updates
- **Type Safety** - Validation and error recovery for state integrity

## Architecture

### State Container (`state-container.js`)

The core container managing the global state object and plugin registration:

```javascript
class StateContainer {
    constructor() {
        this.state = createInitialState(); // Complete app state
        this.plugins = new Map();          // Registered state plugins
    }
    
    registerPlugin(name, plugin) {
        this.plugins.set(name, plugin);
    }
    
    getPlugin(name) {
        return this.plugins.get(name);
    }
}
```

### State Service (`state-service.js`)

High-level coordination layer providing:
- Plugin lifecycle management
- State persistence orchestration
- Cross-plugin communication
- Validation and error handling

```javascript
class StateService {
    constructor(eventBus, storage) {
        this.container = new StateContainer();
        this.eventBus = eventBus;
        this.storage = storage;
        
        // Plugin registration
        this.settings = new SettingsStatePlugin(this);
        this.conversation = new ConversationStatePlugin(this);
        this.mcp = new MCPStatePlugin(this);
        this.ui = new UIStatePlugin(this);
        this.aim = new AIMStatePlugin(this);
        this.stash = new StashStatePlugin(this);
        this.disk = new DiskStatePlugin(this);
    }
}
```

## State Schema

### Complete State Structure

```javascript
const initialState = {
    // Session Management
    session: {
        sessionId: string,           // Generated session identifier
        streamingInProgress: boolean, // AI streaming state
        created: number,             // Session creation timestamp
        lastSaved: number | null,    // Last save timestamp
        autoSaveEnabled: boolean     // Auto-save preference
    },

    // User Settings and Configuration
    settings: {
        ai: {
            models: {
                chat: {
                    // model: string,        // AI model identifier
                    // provider: string,     // Provider name
                    samplerConfig: {
                        temperature: 0.8,
                        maxTokens: 2048,
                        topP: undefined,
                        minP: 0.05,
                        topK: undefined,
                        frequencyPenalty: undefined,
                        presencePenalty: undefined
                    }
                },
                thought: undefined,      // Thinking model config
                tool: undefined          // Tool execution model config
            },
            providers: {
                featherless: { apiKey: undefined },
                openai: { apiKey: undefined },
                aimind: { 
                    apiEndpoint: undefined,
                    apiKey: undefined 
                },
                google: { apiKey: undefined },
                openrouter: {
                    apiEndpoint: undefined,
                    apiKey: undefined
                },
                groq: { apiKey: undefined },
                anthropic: { apiKey: undefined },
                meta: { apiKey: undefined }
            }
        },
        aim: {
            userName: undefined,         // User display name
            personaName: undefined,      // Active persona
            showThought: false,          // Show AI thinking
            autoThink: false            // Automatic thinking mode
        },
        mcp: {
            serverUrl: undefined,        // MCP server URL
            autoConnect: false,          // Auto-connect on startup
            systemMessage: undefined     // MCP system prompt
        },
        ui: {
            autoInject: false,           // Auto-inject panel
            includePageContent: true     // Include page context
        }
    },

    // AIM-Specific State
    aim: {
        pinnedMessages: [],              // Pinned conversation messages
        activeDocument: undefined,       // Current document context
        workspaceContent: undefined,     // Workspace content
        thoughtContent: undefined,       // Current thought content
        systemMessage: undefined,        // System message override
        location: undefined,             // Current location context
        disableGuidance: false,          // Disable AI guidance
        disablePif: false               // Disable persona if
    },

    // MCP Protocol State
    mcp: {
        systemMessage: undefined,        // MCP system message
        connection: {
            serverUrl: undefined,        // Connected server URL
            sessionId: undefined,        // Connection session ID
            postEndpoint: undefined,     // POST endpoint URL
            isConnected: false,          // Connection status
            isInitialized: false,        // Handshake completed
            lastConnected: undefined,    // Last connection timestamp
            connectionError: undefined   // Connection error message
        },
        tools: [],                       // Available MCP tools (OpenAI format)
        pendingRequests: {}              // Active tool requests (id -> request)
    },

    // Conversation Management
    conversation: {
        history: {},                     // threadId -> message[]
        metadata: {}                     // threadId -> conversation metadata
    },

    // UI State
    ui: {
        panelVisible: false             // Panel visibility state
        // Additional UI state...
    },

    // Document Stash
    stash: {
        // Stashed documents and content
        // Structure defined by stash plugin
    }
};
```

## State Plugins

### 1. Settings State Plugin (`settings-state.js`)

Manages user preferences and AI configuration:

```javascript
class SettingsStatePlugin {
    // Load/save settings from storage
    async loadFromStorage()
    async saveToStorage()
    
    // Settings access
    getSettings()
    setSettings(settings)
    
    // Model configuration
    getModelConfig(type = 'chat') // Returns provider + model config
}
```

**Key Operations:**
- AI provider configuration management
- Model selection and sampler configuration
- User preference persistence
- Runtime settings validation

### 2. Conversation State Plugin (`conversation-state.js`)

Handles chat threads and message history:

```javascript
class ConversationStatePlugin {
    // Message management
    getConversationMessages(threadId)
    storeMessage(threadId, userMessage, assistantMessage, options)
    
    // Thread operations
    createThreadId(userName, personaName)
    getOrCreateCurrentConversation(options)
    setActiveConversation(threadId)
    getActiveConversationId()
    
    // Thread queries
    listConversations(filters)
    getConversationsByPersona(personaName)
    clearConversationHistory(threadId)
}
```

**Message Structure:**
```javascript
{
    messageId: string,               // Unique message identifier
    role: 'user' | 'assistant',     // Message role
    content: string,                 // Message content
    timestamp: number,               // Creation timestamp
    think: string,                   // AI thinking content (assistant only)
    toolResults: [],                 // Tool execution results
    toolCalls: [],                   // Tool calls made
    parseErrors: [],                 // Parsing errors
    url: string,                     // Page URL context
    title: string,                   // Page title context
    model: string,                   // Model used
    saved: boolean                   // Persistence status
}
```

**Conversation Metadata:**
```javascript
{
    threadId: string,                // Thread identifier
    userName: string,                // User name
    personaName: string,             // Persona name
    mood: string,                    // Conversation mood
    location: string,                // Location context
    startTime: number,               // Start timestamp
    endTime: number,                 // End timestamp
    duration: number,                // Duration in ms
    status: 'active' | 'completed' | 'saved' | 'error',
    error: string,                   // Error message
    errorCode: string,               // Error code
    errorType: string                // Error type
}
```

### 3. MCP State Plugin (`mcp-state.js`)

Manages MCP server connections and tool state:

```javascript
class MCPStatePlugin {
    // Connection management
    getMcpConnectionState()
    isMcpConnected()
    isMcpInitialized()
    setMcpConnection(connectionData)
    setMcpConnectionError(error)
    clearMcpConnectionError()
    
    // Connection lifecycle
    setMcpConnected(isConnected)
    setMcpInitialized(isInitialized)
    disconnectMcp()
    
    // Tool management
    getMcpTools()
    setMcpTools(tools)
    addMcpTool(tool)
    removeMcpTool(toolName)
    clearMcpTools()
    
    // Request tracking
    addPendingRequest(requestId, requestData)
    updatePendingRequest(requestId, updates)
    removePendingRequest(requestId)
    getPendingRequest(requestId)
    getAllPendingRequests()
    clearAllPendingRequests()
}
```

**Connection State:**
```javascript
{
    serverUrl: string,               // MCP server URL
    sessionId: string,               // Connection session
    postEndpoint: string,            // POST endpoint
    isConnected: boolean,            // Connection status
    isInitialized: boolean,          // Handshake complete
    lastConnected: number,           // Last connection time
    connectionError: string          // Error message
}
```

**Tool Format (OpenAI Compatible):**
```javascript
{
    name: string,                    // Tool name
    description: string,             // Tool description
    type: 'function',               // Tool type
    function: {
        name: string,                // Function name
        description: string,         // Function description
        parameters: object           // JSON Schema parameters
    }
}
```

### 4. UI State Plugin (`ui-state.js`)

Manages panel visibility and UI preferences:

```javascript
class UIStatePlugin {
    // UI state access
    getUIState()
    
    // Panel visibility
    isPanelVisible()
    setPanelVisible(visible)
    
    // Storage operations
    async loadFromStorage()
    async saveToStorage()
}
```

### 5. AIM State Plugin (`aim-state.js`)

Handles AIM-specific functionality:

```javascript
class AIMStatePlugin {
    // AIM state management
    getAimState()
    
    // Document management
    getActiveDocument()
    setActiveDocument(document)
    
    // Workspace content
    getWorkspaceContent()
    setWorkspaceContent(content)
    
    // Pinned messages
    getPinnedMessages()
    addPinnedMessage(message)
    removePinnedMessage(messageId)
    
    // Settings
    getPersonaName()
    setPersonaName(name)
    getUserName()
    setUserName(name)
}
```

### 6. Stash State Plugin (`stash-state.js`)

Manages document stashing functionality:

```javascript
class StashStatePlugin {
    // Document stashing
    stashDocument(document)
    unstashDocument(documentId)
    getStashedDocuments()
    
    // Stash management
    clearStash()
    getStashSize()
    
    // Storage operations
    async loadFromStorage()
    async saveToStorage()
}
```

### 7. Disk State Plugin (`disk-state.js`)

Coordinates persistent storage:

```javascript
class DiskStatePlugin {
    // Master storage operations
    async loadFromStorage()          // Load all state from storage
    async saveToStorage()            // Save all state to storage
    
    // Validation and recovery
    validateState()                  // Ensure state integrity
    repairState()                   // Fix corrupted state
}
```

## State Persistence Flow

### 1. State Change Detection
```javascript
// Component modifies state
stateService.state.settings.ai.temperature = 0.9;

// Trigger save
await stateService.settings.saveToStorage();
```

### 2. Storage Coordination
```javascript
// Disk plugin coordinates saves
await stateService.disk.saveToStorage();

// Individual plugins save their domains
await stateService.settings.saveToStorage();
await stateService.conversation.saveToStorage();
await stateService.ui.saveToStorage();
```

### 3. Cross-Context Synchronization
```javascript
// Background script detects Chrome storage change
chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.webwireState) {
        // Reload state in all contexts
        await stateService.disk.loadFromStorage();
        
        // Notify components of state change
        eventBus.emit(EVENTS.STATE.UPDATED, { changes });
    }
});
```

## Event Integration

### State Change Events

State plugins emit events when state changes:

```javascript
// Conversation updated
this.eventBus.emit(EVENTS.CONVERSATION.UPDATED, { threadId });

// Settings changed  
this.eventBus.emit(EVENTS.SETTINGS.UPDATED, { section: 'ai' });

// MCP connection status changed
this.eventBus.emit(EVENTS.MCP.CONNECTION_STATUS_CHANGED, { 
    isConnected, 
    serverUrl 
});
```

### Cross-Plugin Communication

Plugins can listen to events from other plugins:

```javascript
// UI plugin listens for conversation changes
this.eventBus.on(EVENTS.CONVERSATION.UPDATED, (payload) => {
    this.updateConversationDisplay(payload.threadId);
});

// Settings plugin listens for MCP status
this.eventBus.on(EVENTS.MCP.CONNECTION_STATUS_CHANGED, (payload) => {
    this.updateMcpSettings(payload);
});
```

## Development Patterns

### Adding New State Domains

1. **Create State Plugin:**
```javascript
class NewStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.storage = stateService.storage.newDomain;
    }
    
    async loadFromStorage() {
        // Load domain state from storage
    }
    
    async saveToStorage() {
        // Save domain state to storage
    }
}
```

2. **Register in State Service:**
```javascript
// In StateService constructor
this.newDomain = new NewStatePlugin(this);
```

3. **Add to Initial State:**
```javascript
// In state-container.js createInitialState()
newDomain: {
    // Initial state structure
}
```

4. **Create Storage Adapter:**
```javascript
// In storage adapters
class NewDomainAdapter extends StorageAdapter {
    // Implementation
}
```

### State Validation Patterns

```javascript
// In state plugin
validateState() {
    if (!this.stateService.state.newDomain) {
        this.stateService.state.newDomain = this.getDefaultState();
    }
    
    // Validate required fields
    this.ensureRequiredFields();
}

getDefaultState() {
    return {
        // Default state structure
    };
}
```

### Event-Driven State Updates

```javascript
// Listen for external events
this.eventBus.on(EVENTS.EXTERNAL.SOME_EVENT, (payload) => {
    // Update state based on event
    this.updateStateFromEvent(payload);
    
    // Save if needed
    this.saveToStorage();
    
    // Emit state change event
    this.eventBus.emit(EVENTS.STATE.DOMAIN_UPDATED, {
        domain: 'newDomain',
        changes: payload
    });
});
```

## Testing State Management

### Unit Testing State Plugins

```javascript
// Mock state service
const mockStateService = {
    state: createInitialState(),
    eventBus: new EventBus(),
    storage: mockStorage
};

// Test plugin
const plugin = new SettingsStatePlugin(mockStateService);
await plugin.loadFromStorage();

// Verify state
expect(plugin.getSettings()).toEqual(expectedSettings);
```

### Integration Testing State Flow

```javascript
// Test full state lifecycle
const stateService = new StateService(eventBus, storage);
await stateService.initialize();

// Modify state
stateService.state.settings.ai.temperature = 0.9;
await stateService.settings.saveToStorage();

// Verify persistence
const newStateService = new StateService(eventBus, storage);
await newStateService.initialize();
expect(newStateService.state.settings.ai.temperature).toBe(0.9);
```

## Performance Considerations

### Efficient State Updates

- Use specific plugin save methods rather than full state saves
- Batch related state changes before saving
- Implement debouncing for high-frequency updates
- Use state diffing to minimize storage operations

### Memory Management

- Clean up old conversation threads periodically
- Implement stash size limits
- Clear completed MCP requests
- Monitor state object size and prune when necessary

### Storage Optimization

- Compress large state objects before storage
- Use incremental saves for large domains
- Implement storage quotas and cleanup
- Handle storage failures gracefully