# CLAUDE.md - JavaScript Architecture

This file provides guidance for working with the WebWire JavaScript architecture.

## Directory Structure
```
src/js
├── ai/                     # AI provider abstraction and clients
│   ├── abstract-ai-client.js
│   ├── ai-client-factory.js
│   └── providers/
│       ├── aimind-client.js
│       ├── aistudio-client.js
│       ├── featherless-client.js
│       └── openai-client.js
├── browser/                # Browser interaction utilities
│   ├── dom-agent.js        # DOM manipulation agent
│   ├── dom-connector.js    # DOM connection management
│   └── page-utils.js       # Page content extraction
├── client/                 # Main application client logic
│   ├── cmcp-helper.js
│   ├── panel-event-handlers.js
│   └── webwire-client-core.js
├── context/                # Dependency injection and context setup
│   ├── context-factory.js
│   └── context-init.js
├── core/                   # Core framework components
│   ├── app-config.js
│   ├── error-boundary.js
│   ├── event-bus.js
│   ├── event-dispatcher.js
│   └── events.js
├── mcp/                    # Model Context Protocol integration
│   ├── mcp-connector.js
│   ├── tool-formatter.js
│   └── tool-parser.js
├── state/                  # State management system
│   ├── plugins/            # Domain-specific state managers
│   ├── state-container.js
│   ├── state-service.js
│   └── state-validator.js
├── storage/                # Storage abstraction layer
│   ├── adapters/           # Storage adapters
│   └── storage-manager.js
└── utils/                  # Shared utilities
    ├── flatten-data.js
    └── id-generator.js
```

## Overview

The JavaScript architecture provides a sophisticated foundation for the WebWire extension, built around key principles:

- **Modular Design** - Clear separation of concerns across domains
- **Event-Driven Architecture** - Loose coupling via comprehensive event system
- **Plugin-Based State** - Extensible state management with domain plugins
- **Provider Abstraction** - Unified interfaces for AI providers and storage
- **Dependency Injection** - Context-based dependency management
- **Type Safety** - Runtime validation and error boundaries

## Core Architecture Layers

### 1. Core Framework (`core/`)

The foundational layer providing:

#### AppConfig (`app-config.js`)
Hierarchical configuration system with dot-notation access:
```javascript
const config = new AppConfig();
config.set('ai.temperature', 0.8);
config.get('storage.db.state'); // 'WebwireDB'
config.merge({ ai: { models: { chat: 'gpt-4' } } });
```

#### Event System
- **EventBus** (`event-bus.js`) - Domain-scoped event management
- **EventDispatcher** (`event-dispatcher.js`) - Cross-context message routing
- **Events** (`events.js`) - Centralized event type definitions

#### Error Handling
- **ErrorBoundary** (`error-boundary.js`) - Graceful error recovery and logging

### 2. AI Provider System (`ai/`)

Unified AI provider abstraction supporting multiple backends:

#### AbstractAIClient (`abstract-ai-client.js`)
Base interface all providers must implement:
```javascript
class AbstractAIClient {
    async generateResponse(messages, options = {}) {
        throw new Error('Must implement generateResponse');
    }
    
    async streamResponse(messages, options = {}) {
        throw new Error('Must implement streamResponse');
    }
    
    validateConfig() {
        throw new Error('Must implement validateConfig');
    }
}
```

#### AIClientFactory (`ai-client-factory.js`)
Factory for creating provider-specific clients:
```javascript
const client = AIClientFactory.createClient(eventBus, {
    provider: 'openai',
    model: 'gpt-4-turbo',
    api_key: 'sk-...',
    sampler_config: { temperature: 0.7 }
});
```

#### Provider Implementations (`providers/`)
- **OpenAIClient** - OpenAI API integration
- **FeatherlessClient** - Featherless.ai integration  
- **AIStudioClient** - Google AI Studio integration
- **AIMindClient** - AIMind provider integration

### 3. State Management (`state/`)

Plugin-based state architecture with automatic persistence:

#### StateContainer (`state-container.js`)
Core state container with plugin system:
```javascript
const container = new StateContainer();
container.registerPlugin('settings', new SettingsStatePlugin());
container.registerPlugin('conversation', new ConversationStatePlugin());
```

#### StateService (`state-service.js`)
High-level state operations and coordination:
```javascript
const stateService = new StateService(container, storage);
await stateService.initialize();
stateService.state.settings = newSettings;
await stateService.saveState();
```

#### State Plugins (`plugins/`)
Domain-specific state managers:
- **settings-state.js** - User preferences and AI configuration
- **conversation-state.js** - Chat threads and message history
- **mcp-state.js** - MCP server connections and tool state
- **ui-state.js** - Panel visibility and UI preferences
- **aim-state.js** - AIM-specific state (personas, workspace)
- **stash-state.js** - Document stashing functionality
- **disk-state.js** - Persistent storage coordination

### 4. Storage System (`storage/`)

Abstracted storage layer with adapter pattern:

#### StorageManager (`storage-manager.js`)
Coordinates storage operations across adapters:
```javascript
const manager = new StorageManager();
await manager.save('settings', settingsData);
const data = await manager.load('settings');
```

#### Storage Adapters (`adapters/`)
Domain-specific storage handling:
- **storage-adapter.js** - Base storage interface
- **settings-adapter.js** - Settings persistence
- **state-adapter.js** - General state storage
- **ui-adapter.js** - UI state persistence
- **stash-adapter.js** - Document stash storage

### 5. MCP Integration (`mcp/`)

Model Context Protocol implementation:

#### MCPConnector (`mcp-connector.js`)
Server-Sent Events connection to MCP servers:
```javascript
const connector = new MCPConnector('http://localhost:3000');
await connector.initialize(stateService);
const tools = connector.getAvailableTools();
const result = await connector.executeTool('list_files', { path: '/home' });
```

#### Tool Management
- **tool-formatter.js** - Converts MCP tools to OpenAI format
- **tool-parser.js** - Parses and validates tool responses

### 6. Browser Interaction (`browser/`)

Browser and DOM interaction utilities:

#### DOMAgent (`dom-agent.js`)
Handles DOM manipulation and interaction:
```javascript
const agent = new DOMAgent();
agent.click(selector);
agent.type(selector, text);
agent.scroll(element);
```

#### DOMConnector (`dom-connector.js`)
Manages connections between extension and page DOM:
```javascript
const connector = new DOMConnector();
connector.inject();
connector.establish();
```

#### PageUtils (`page-utils.js`)
Utilities for extracting and processing page content:
```javascript
const content = PageUtils.getPageContent();
const metadata = PageUtils.extractMetadata();
const selection = PageUtils.getSelectedText();
```

### 8. Client Core (`client/`)

Main application coordination:

#### WebWireClientCore (`webwire-client-core.js`)
Primary application controller:
```javascript
const core = new WebWireClientCore(eventBus);
await core.initialize();
await core.connect(); // Connect to MCP
const content = await core.fetch('fs:///path/to/file');
```

#### Event Handling
- **panel-event-handlers.js** - Panel-specific event coordination
- **cmcp-helper.js** - MCP communication helpers

### 9. Context System (`context/`)

Dependency injection and application context:

#### ContextInit (`context-init.js`)
Application bootstrap and dependency setup:
```javascript
const context = await initializeContext(eventBus, EVENT_CONTEXT.CONTENT, {config: this.config});
const { stateService, storage, aiClient, mcpConnector } = context;
```

#### ContextFactory (`context-factory.js`)
Context object creation and configuration:
```javascript
const context = ContextFactory.createContext({
    eventBus,
    storage: storageManager,
    stateService: stateService
});
```

### 10. Utilities (`utils/`)

Shared utility functions:
- **id-generator.js** - UUID and session ID generation
- **flatten-data.js** - Data transformation utilities

## Architectural Patterns

### 1. Event-Driven Communication

All components communicate via events rather than direct coupling:

```javascript
// Component A emits event
eventBus.emit('user_message', { content: 'Hello', threadId: '123' });

// Component B handles event
eventBus.on('user_message', async (payload) => {
    const response = await aiClient.generateResponse(payload.content);
    eventBus.emit('ai_response', { response, threadId: payload.threadId });
});
```

### 2. Plugin Architecture

State management uses plugins for extensibility:

```javascript
class CustomStatePlugin {
    constructor(storageAdapter) {
        this.storage = storageAdapter;
        this.state = { customData: {} };
    }
    
    async loadFromStorage() {
        this.state = await this.storage.load() || { customData: {} };
    }
    
    async saveToStorage() {
        await this.storage.save(this.state);
    }
}
```

### 3. Factory Pattern

Providers created via factories for runtime configuration:

```javascript
// Factory selects implementation based on config
const aiClient = AIClientFactory.createClient(eventBus, {
    provider: 'openai', // Could be 'featherless', 'aistudio', etc.
    model: 'gpt-4',
    api_key: process.env.OPENAI_API_KEY
});
```

### 4. Abstract Base Classes

Ensure consistent interfaces across implementations:

```javascript
class ConcreteAIClient extends AbstractAIClient {
    async generateResponse(messages, options = {}) {
        // Provider-specific implementation
        return await this.provider.chat(messages, options);
    }
}
```

### 5. Dependency Injection

Context system manages dependencies:

```javascript
// Dependencies injected at context creation
const context = await initializeContext(eventBus, mycontext, {config: this.config});
const { stateService, storage, aiClient } = context;

// Components receive dependencies, not create them
const chatService = new ChatService(eventBus);
await chatService.initialize(aiClient, mcpConnector, stateService);
```

## Cross-Context Communication

### Extension Context Boundaries

The architecture spans multiple Chrome extension contexts:

1. **Background Script** - Service worker coordination
2. **Content Scripts** - Page interaction
3. **Popup** - Quick access interface  
4. **Options** - Settings configuration
5. **Panels** - Full application interface

### Event Dispatcher Pattern

EventDispatcher routes messages across contexts:

```javascript
// In content script
dispatcher.dispatch({
    target: 'background',
    action: 'SAVE_SETTINGS',
    data: { ai: { temperature: 0.8 } }
});

// In background script  
dispatcher.on('SAVE_SETTINGS', async (data) => {
    await stateService.updateSettings(data);
});
```

### State Synchronization

State changes propagate across contexts:

1. **State Change** - Component modifies state
2. **Storage Update** - State persisted to Chrome storage
3. **Change Detection** - Background script detects storage change
4. **Broadcast** - All contexts notified of update
5. **State Reload** - Contexts reload affected state

## Development Patterns

### Adding New AI Providers

1. **Extend Abstract Base**:
```javascript
class NewProviderClient extends AbstractAIClient {
    async generateResponse(messages, options = {}) {
        // Implementation
    }
}
```

2. **Register in Factory**:
```javascript
// In ai-client-factory.js
case 'newprovider':
    client = new NewProviderClient(eventBus, modelConfig);
    break;
```

3. **Add Configuration Schema**:
```javascript
// In settings state plugin
providers: {
    newprovider: {
        apiKey: undefined,
        endpoint: undefined
    }
}
```

### Adding New State Domains

1. **Create State Plugin**:
```javascript
class NewStatePlugin {
    constructor(storageAdapter) {
        this.storage = storageAdapter;
        this.state = { /* initial state */ };
    }
    
    async loadFromStorage() { /* implementation */ }
    async saveToStorage() { /* implementation */ }
}
```

2. **Register Plugin**:
```javascript
// In state service initialization
stateService.registerPlugin('newdomain', new NewStatePlugin(adapter));
```

3. **Create Storage Adapter** (if needed):
```javascript
class NewStorageAdapter extends StorageAdapter {
    async save(data) { /* implementation */ }
    async load() { /* implementation */ }
}
```

### Adding New Event Types

1. **Define in Events**:
```javascript
// In events.js
export const EVENT_TYPES = {
    NEW_EVENT: 'new_event'
};
```

2. **Emit Events**:
```javascript
eventBus.emit(EVENT_TYPES.NEW_EVENT, payload);
```

3. **Handle Events**:
```javascript
eventBus.on(EVENT_TYPES.NEW_EVENT, handler);
```

## Testing Strategies

### Unit Testing
- Test individual components in isolation
- Mock dependencies via dependency injection
- Validate event emission and handling
- Test state plugin persistence

### Integration Testing  
- Test component interaction via events
- Validate cross-context communication
- Test state synchronization
- Verify AI provider integration

### Architecture Testing
- Verify dependency injection works correctly
- Test plugin registration and lifecycle
- Validate event system isolation
- Check error boundary behavior

## Performance Considerations

### Event System
- Use event namespacing to avoid conflicts
- Implement event debouncing for high-frequency events
- Clean up event listeners to prevent memory leaks

### State Management
- Lazy load state plugins
- Use incremental state updates
- Implement state diffing for efficiency
- Cache frequently accessed state

### Storage
- Batch storage operations when possible
- Use compression for large state objects
- Implement storage quotas and cleanup
- Handle storage failures gracefully

### AI Integration
- Implement request pooling and rate limiting
- Cache responses when appropriate
- Handle streaming efficiently
- Provide fallback mechanisms