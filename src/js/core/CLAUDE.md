# CLAUDE.md - Core Framework Module

This file provides comprehensive guidance for working with WebWire's core framework components - the foundational infrastructure that powers the entire extension.

## Directory Structure
```
src/js/core/
├── app-config.js              # Hierarchical configuration system
├── cc-actions.js              # Cross-context action definitions
├── error-boundary.js          # Global error handling and recovery
├── event-bindable-panel.js    # Base class for event-driven components
├── event-bus.js               # Domain-scoped event management
├── event-dispatcher.js        # Cross-context message routing
└── events.js                  # Centralized event type definitions
```

## Overview

The core framework provides essential infrastructure that enables WebWire's sophisticated architecture:

- **Event-Driven Architecture** - Comprehensive event system with domain isolation
- **Memory-Safe Components** - Base class preventing event handler memory leaks
- **Cross-Context Communication** - Seamless messaging between extension contexts
- **Configuration Management** - Flexible hierarchical configuration system
- **Error Resilience** - Graceful error handling and recovery mechanisms

## Core Components

### 1. EventBindableComponent (`event-bindable-panel.js`)

The foundation for all event-driven components in WebWire. This base class solves the critical memory leak issue that occurs when event handlers are bound incorrectly.

#### Key Features:
- **Lazy Binding** - Methods are only bound when actually used as event handlers
- **Automatic Cleanup** - All event listeners tracked and cleaned up on destroy
- **Consistent API** - Provides `on()`, `onAsync()`, `once()`, and `onExclusive()` methods
- **Memory Efficient** - No unnecessary bound functions created

#### Usage Pattern:
```javascript
import { EventBindableComponent } from '../core/event-bindable-panel.js';

class MyComponent extends EventBindableComponent {
    constructor(eventBus) {
        super(eventBus);
        // No manual binding needed - handled lazily on registration
    }
    
    setupEventListeners() {
        // Use this.on() instead of this.eventBus.on()
        // Methods are bound automatically when registered
        this.on(EVENTS.SOMETHING, this.handleSomething);
        this.onAsync(EVENTS.ASYNC_THING, this.handleAsyncThing);
        this.once(EVENTS.ONE_TIME, this.handleOneTime);
        this.onExclusive(EVENTS.EXCLUSIVE, this.handleExclusive);
    }
    
    handleSomething(data) {
        // 'this' is correctly bound automatically
        console.log('Received:', data);
    }
    
    destroy() {
        // Call cleanup() or destroy() to unsubscribe all listeners
        this.cleanup();
    }
}
```

#### Implementation Details:
- Uses a `Map` to cache bound methods (lazy binding)
- `_getBoundMethod()` creates bound functions only when needed
- Tracks all unsubscribe functions in an array
- `cleanup()` method unsubscribes all listeners and clears cache

### 2. EventBus (`event-bus.js`)

A sophisticated pub/sub system with domain isolation, priority handling, and async event support.

#### Key Features:
- **Domain Isolation** - Events scoped to specific contexts
- **Priority System** - Listeners execute in priority order
- **Async Events** - Support for async handlers with response aggregation
- **Once Events** - Auto-unsubscribe after first trigger
- **Exclusive Events** - Only one handler allowed per event
- **Debug Mode** - Comprehensive logging for development

#### Event Types:

**Standard Events:**
```javascript
// Subscribe
const unsubscribe = eventBus.on('event:name', handler);
// NOTE: We would never use a string directly in the actual code, we would always use an event constant

// Emit
eventBus.emit('event:name', data);

// Unsubscribe
unsubscribe();
```

**Async Events:**
```javascript
// Subscribe to async event
eventBus.onAsync('async:event', async (data) => {
    const result = await someAsyncOperation(data);
    return result;
});

// Emit and wait for response
const response = await eventBus.emitAsync('async:event', data);
```

**Once Events:**
```javascript
// Auto-unsubscribes after first emission
eventBus.once('one:time:event', handler);
```

**Exclusive Events:**
```javascript
// Only one handler allowed - replaces any existing
eventBus.onExclusive('exclusive:event', handler);
```

#### Domain Isolation:
```javascript
// Each domain has isolated event space
const chatBus = new EventBus({ domain: 'chat' });
const mcpBus = new EventBus({ domain: 'mcp' });

// Events don't cross domains
chatBus.emit('test'); // Only chat domain listeners receive this
```

### 3. EventDispatcher (`event-dispatcher.js`)

The EventDispatcher is the **bridge** between Chrome's extension messaging APIs and WebWire's EventBus system. It abstracts away all the complexity of cross-context communication, making it feel like local event handling even when messages are crossing extension boundaries.

#### The Architecture Brilliance:

The EventDispatcher solves a fundamental problem in Chrome extensions: different contexts (background, content, popup) are completely isolated JavaScript environments. They can't share objects or call functions directly. The EventDispatcher makes this transparent.

#### How It Actually Works:

1. **Each context has its own EventBus and EventDispatcher**
2. **The EventDispatcher translates between `dispatch()` calls and Chrome messages**
3. **On the receiving end, it translates Chrome messages back to EventBus events**
4. **Your code just uses EventBus - the cross-context magic is invisible**

#### The Communication Flow:

When content script calls:
```javascript
// In content script
const response = await dispatcher.dispatch(
    BACKGROUND_ACTIONS.SAVE_SETTINGS,
    { temperature: 0.8 },
    { target: 'background' }
);
```

Here's what REALLY happens:

1. **Content's EventDispatcher** sees `target: 'background'` and creates a Chrome message:
   ```javascript
   chrome.runtime.sendMessage({
       type: 'CROSS_CONTEXT_EVENT',
       event: BACKGROUND_ACTIONS.SAVE_SETTINGS,
       data: { temperature: 0.8 },
       source: 'content'
   });
   ```

2. **Background's EventDispatcher** receives this in its Chrome message handler:
   ```javascript
   // In background's setupChromeMessageHandler()
   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
       if (message.type === 'CROSS_CONTEXT_EVENT') {
           this.handleCrossContextEvent(message, sender, sendResponse);
       }
   });
   ```

3. **Background's EventDispatcher** emits on its local EventBus:
   ```javascript
   // In handleCrossContextEvent
   const result = await this.eventBus.emitAsync(message.event, message.data, {
       source: message.source,
       sender
   });
   ```

4. **Background's actual handler** (registered on EventBus) processes it:
   ```javascript
   // In background script
   this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_SETTINGS, async (data) => {
       await this.saveSettings(data);
       return { success: true };
   });
   ```

5. **Response flows back** through the same path in reverse

#### Key Implementation Details:

- **Async Preservation**: EventBus's async handlers work seamlessly across contexts
- **Request Tracking**: Each request gets a unique ID to match responses
- **Return Value Propagation**: Handler return values flow back to the caller
- **Error Propagation**: Exceptions in handlers propagate back as rejected promises
- **Timeout Handling**: Pending requests timeout after 5-30 seconds
- **Retry Logic**: Failed messages retry with exponential backoff
- **PostMessage for Panels**: Injected panels use postMessage instead of Chrome APIs
- **Context Auto-Detection**: Automatically determines which context it's running in

#### The Real Magic - You Never See It:

In your code, you just write:
```javascript
// Background script - just register on eventBus
this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_SETTINGS, this.handleSaveSettings);

// Content script - just dispatch
await dispatcher.dispatch(BACKGROUND_ACTIONS.SAVE_SETTINGS, data, { target: 'background' });
```

The EventDispatcher handles ALL the complexity of Chrome's messaging, request/response correlation, timeouts, retries, and error handling. Your code stays clean and focused on business logic.
```

### 4. Events (`events.js`)

Centralized event definitions ensuring consistency across the codebase.

#### Event Naming Convention:
```javascript
export const EVENTS = {
    // Domain-based organization
    CHAT: {
        SEND_MESSAGE: 'chat:send-message',
        ANALYZE_PAGE: 'chat:analyze-page',
        TOOL_RESULT: 'chat:tool-result'
    },
    
    MCP: {
        CONNECTED: 'mcp:connected',
        DISCONNECTED: 'mcp:disconnected',
        TOOLS_UPDATED: 'mcp:tools-updated'
    },
    
    UI: {
        PANEL_SHOWN: 'ui:panel-shown',
        PANEL_HIDDEN: 'ui:panel-hidden',
        SETTINGS_OPENED: 'ui:settings-opened'
    }
};
```

#### Usage:
```javascript
// Always use constants, never strings
this.on(EVENTS.CHAT.SEND_MESSAGE, this.handleMessage);  // ✓ Good
this.on('chat:send-message', this.handleMessage);       // ✗ Bad
```

### 5. Cross-Context Actions (`cc-actions.js`)

Defines action types for cross-context communication, ensuring consistency in message passing.

#### Action Categories:

**Background Actions:**
```javascript
export const BACKGROUND_ACTIONS = {
    SAVE_WEBWIRE_SETTINGS: 'SAVE_WEBWIRE_SETTINGS',
    SAVE_THREAD_MESSAGE: 'SAVE_THREAD_MESSAGE',
    GET_WEBWIRE_STATE: 'GET_WEBWIRE_STATE',
    CREATE_NEW_THREAD: 'CREATE_NEW_THREAD'
};
```

**Content Actions:**
```javascript
export const CONTENT_ACTIONS = {
    INJECT_WEBWIRE_PANEL: 'INJECT_WEBWIRE_PANEL',
    TOGGLE_WEBWIRE_PANEL: 'TOGGLE_WEBWIRE_PANEL',
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    CONVERSATION_UPDATED: 'CONVERSATION_UPDATED'
};
```

### 6. ErrorBoundary (`error-boundary.js`)

Global error handling ensuring the extension remains stable even when components fail.

#### Features:
- **Component Isolation** - Errors don't cascade to crash the extension
- **Error Logging** - Comprehensive error information captured
- **Recovery Actions** - Automatic recovery attempts
- **User Notification** - Graceful error messages to users

#### Usage:
```javascript
// Wrap risky operations
ErrorBoundary.wrap(async () => {
    await riskyOperation();
}, {
    fallback: defaultValue,
    onError: (error) => console.error('Operation failed:', error)
});

// Global error handler
window.addEventListener('error', ErrorBoundary.handleError);
window.addEventListener('unhandledrejection', ErrorBoundary.handleRejection);
```

## Architectural Patterns

### Event-Driven Communication

WebWire uses events as the primary communication mechanism between components:

1. **Loose Coupling** - Components don't directly reference each other
2. **Domain Isolation** - Events scoped to specific functional areas
3. **Async Support** - Built-in support for async operations
4. **Memory Safety** - Automatic cleanup prevents leaks

### Cross-Context Messaging

Chrome extensions have isolated JavaScript contexts. WebWire bridges these:

1. **Background Script** - Central coordinator (service worker)
2. **Content Scripts** - Run in web pages
3. **Extension Pages** - Popup, options, panels
4. **Message Routing** - EventDispatcher handles routing

### State Synchronization

State changes propagate across contexts:

```
Component → State Change → Storage Update → Background Detection → Broadcast → All Contexts Update
```

## Common Patterns and Solutions

### 1. Creating Event-Driven Components

Always extend EventBindableComponent for components with event handlers:

```javascript
class MyService extends EventBindableComponent {
    constructor(eventBus, dependencies) {
        super(eventBus);
        this.deps = dependencies;
    }
    
    // This would be run by an initialize method
    setupEventListeners() {
        this.on(EVENTS.SOMETHING, this.handleSomething);
        this.onAsync(EVENTS.ASYNC_OP, this.handleAsync);
    }
    
    handleSomething(data) {
        // Method is auto-bound, 'this' works correctly
        this.deps.doSomething(data);
    }
    
    async handleAsync(data) {
        const result = await this.deps.asyncOperation(data);
        return { success: true, result };
    }
}
```

### 2. Cross-Context Communication with Async Preservation

The EventDispatcher brilliantly preserves EventBus's async capabilities across context boundaries:

```javascript
// In content script - dispatch returns a Promise!
class ContentService {
    async saveData(data) {
        // This is ASYNC across contexts!
        const response = await this.dispatcher.dispatch(
            BACKGROUND_ACTIONS.SAVE_DATA,
            data,
            { target: 'background' }
        );
        
        // The response is the actual return value from the background handler
        if (!response.success) {
            throw new Error(response.error);
        }
        
        return response.result;
    }
}

// In background script - handler can be async and return values!
class BackgroundService {
    constructor() {
        // Register on EventBus, NOT dispatcher
        this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_DATA, this.handleSaveData);
    }
    
    async handleSaveData(data) {
        try {
            await chrome.storage.local.set(data);
            const savedData = await this.processData(data);
            
            // This return value goes ALL THE WAY BACK to content script!
            return { success: true, savedData };
        } catch (error) {
            // Errors propagate back too!
            return { success: false, error: error.message };
        }
    }
}
```

The magic: EventDispatcher makes async cross-context calls feel exactly like local async EventBus calls!
```

### 3. Event Namespacing

Use consistent namespacing for events:

```javascript
// Good - Clear domain and action
EVENTS.CHAT.SEND_MESSAGE
EVENTS.MCP.TOOL_EXECUTED
EVENTS.UI.PANEL_TOGGLED

// Bad - No clear structure
'message-sent'
'tool-done'
'toggle'
```

### 4. Handling Async Events

For operations that need responses:

```javascript
// Subscriber
this.onAsync(EVENTS.DATA.FETCH, async (request) => {
    const data = await fetchData(request.id);
    return { success: true, data };
});

// Emitter
const response = await this.emitAsync(EVENTS.DATA.FETCH, { id: 123 });
if (response.success) {
    console.log('Data:', response.data);
}
```

## Performance Considerations

### 1. Event Bus Optimization
- Use domain isolation to reduce event routing overhead
- Clean up listeners when components unmount
- Use `once()` for one-time events
- Avoid deep object cloning in high-frequency events

### 2. Memory Management
- EventBindableComponent prevents handler leaks
- Lazy binding reduces memory footprint
- Proper cleanup in component lifecycle
- Weak references for temporary handlers

### 3. Cross-Context Messaging
- Minimize message size (Chrome has limits)
- Batch related operations when possible
- Use streaming for large data transfers
- Cache frequently accessed cross-context data

## Best Practices

### 1. Always Use EventBindableComponent
- For any class with event handlers
- Prevents memory leaks automatically
- Provides consistent API
- Enables proper cleanup

### 2. Event Naming
- Use constants from events.js
- Follow domain:action pattern
- Be specific and descriptive
- Avoid generic names

### 3. Error Handling
- Wrap async operations in try-catch
- Return error states in cross-context responses
- Use ErrorBoundary for critical paths
- Log errors with context

### 4. Component Lifecycle
- Set up listeners in constructor or init
- Clean up in destroy/cleanup methods
- Avoid setting up listeners multiple times
- Test cleanup thoroughly

### 5. Cross-Context Guidelines
- Validate data at context boundaries
- Handle timeout scenarios
- Provide meaningful error messages
- Document expected response formats
