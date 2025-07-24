# CLAUDE.md - Core Event System Usage Guide

This guide explains how to use WebWire's two-level event system for communication within and across Chrome extension contexts.

## Directory Structure
```
src/js/core/
├── cc-actions.js        # Cross-context action constants
├── error-boundary.js    # Error handling and recovery
├── event-bus.js        # Same-context pub/sub event system
├── event-dispatcher.js  # Cross-context message routing
└── events.js           # Event type definitions
```

## Quick Start

### 1. Define Your Events

Always define events in `events.js` to avoid string pollution:

```javascript
// In events.js
export const EVENTS = {
    // ... existing events ...
    
    // Add your new domain
    MYNEWFEATURE: {
        DATA_LOADED: 'mynewfeature:data_loaded',
        ACTION_TRIGGERED: 'mynewfeature:action_triggered',
        STATE_UPDATED: 'mynewfeature:state_updated'
    }
};
```

For cross-context actions, add to `cc-actions.js`:

```javascript
// In cc-actions.js
export const BACKGROUND_ACTIONS = {
    // ... existing actions ...
    
    // Add your new actions
    SAVE_MY_DATA: 'SAVE_MY_DATA',
    FETCH_MY_DATA: 'FETCH_MY_DATA'
};
```

### 2. Service Pattern with setupEventListeners()

The standard pattern in WebWire:

```javascript
class MyService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        // Initialize other properties
    }
    
    // Standard method name for setting up listeners
    setupEventListeners() {
        // PROBLEM: This creates memory leaks!
        // Each .bind(this) creates a NEW function reference
        this.eventBus.on(EVENTS.SOMETHING, this.handleSomething.bind(this));
        
        // We can't unsubscribe later because we lost the reference!
    }
    
    handleSomething(data) {
        // Handle the event
    }
}
```

### 3. Proper Memory Management Pattern

To fix the memory leak issue:

```javascript
class MyService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        
        // Bind methods ONCE in constructor
        this.handleSomething = this.handleSomething.bind(this);
        this.handleAnother = this.handleAnother.bind(this);
        
        // Track unsubscribe functions
        this.unsubscribes = [];
    }
    
    setupEventListeners() {
        // Now we can properly unsubscribe later
        this.unsubscribes.push(
            this.eventBus.on(EVENTS.SOMETHING, this.handleSomething),
            this.eventBus.on(EVENTS.ANOTHER, this.handleAnother)
        );
    }
    
    handleSomething(data) {
        // Implementation
    }
    
    handleAnother(data) {
        // Implementation
    }
    
    cleanup() {
        // Properly clean up all listeners
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes = [];
    }
}
```

### 4. Async Event Patterns (onAsync/emitAsync)

For request/response patterns within the same context:

```javascript
// In background service - handle with onAsync
this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_MY_DATA, async (data, { notify, error }) => {
    try {
        const result = await this.saveToStorage(data);
        notify(result);  // This resolves the caller's promise
    } catch (err) {
        error(err);      // This rejects the caller's promise
    }
});

// In content script - call with emitAsync
try {
    const result = await this.eventBus.emitAsync(BACKGROUND_ACTIONS.SAVE_MY_DATA, myData);
    console.log('Saved:', result);
} catch (err) {
    console.error('Save failed:', err);
}
```

### 5. Cross-Context Communication (EventDispatcher)

The key pattern: **dispatcher.dispatch() returns a Promise!**

```javascript
// In content script - send to background
async function saveToBackground(data) {
    try {
        const response = await this.dispatcher.dispatch(
            BACKGROUND_ACTIONS.SAVE_MY_DATA,
            data,
            { target: EVENT_CONTEXT.BACKGROUND, timeout: 5000 }
        );
        
        // response has shape: { success: boolean, result?: any, error?: string }
        if (response.success) {
            return response.result;
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Dispatch failed:', error);
        throw error;
    }
}

// In background - handle with onAsync to send response back
this.eventBus.onAsync(BACKGROUND_ACTIONS.SAVE_MY_DATA, async (data, { notify, error }) => {
    try {
        const saved = await this.storage.save(data);
        notify({ success: true, result: saved });
    } catch (err) {
        error({ success: false, error: err.message });
    }
});
```

## Core Architecture Patterns

### Service Initialization Flow

The typical WebWire service follows this pattern:

1. **Constructor** - Store eventBus, bind methods
2. **setupEventListeners()** - Register event handlers  
3. **initialize()** - Async setup, connect to services
4. **cleanup()** - Unsubscribe and clean up

### Event Handler Organization

Group handlers by functionality:

```javascript
setupEventListeners() {
    // Chat events
    this.eventBus.on(EVENTS.CHAT.SEND_MESSAGE, this.handleUserMessage);
    this.eventBus.on(EVENTS.CHAT.ANALYZE_PAGE, this.handlePageAnalysisRequest);
    
    // MCP events
    this.eventBus.on(EVENTS.MCP.CONNECTED, this.handleMCPStatusUpdate);
    this.eventBus.on(EVENTS.MCP.TOOLS_UPDATED, this.handleMCPStatusUpdate);
    
    // State events
    this.eventBus.on(EVENTS.STATE.SAVED, this.handleStateSaved);
    this.eventBus.on(EVENTS.STATE.LOADED, this.handleStateLoaded);
}
```

### Cross-Context Response Pattern

Background services typically respond to requests:

```javascript
// In background/webwire-background.js
this.eventBus.onAsync(BACKGROUND_ACTIONS.GET_WEBWIRE_STATE, async (data, { notify }) => {
    const state = await this.stateService.getState();
    notify({ success: true, result: state });
});

// In content script
const response = await dispatcher.dispatch(
    BACKGROUND_ACTIONS.GET_WEBWIRE_STATE,
    {},
    { target: EVENT_CONTEXT.BACKGROUND }
);

if (response.success) {
    this.setState(response.result);
}
```

## Event Naming Conventions

- **Domain namespacing**: `domain:action` (e.g., `chat:send-message`)
- **Action constants**: `UPPERCASE_WITH_UNDERSCORES`
- **Event constants**: Nested object structure by domain

## Context Types

- `LOCAL` - Same JavaScript context (don't specify target)
- `BACKGROUND` - Background service worker
- `CONTENT` - Content scripts in tabs
- `POPUP` - Extension popup
- `PANEL` - Injected panels/iframes

## Common Pitfalls and Solutions

### 1. Memory Leak from .bind(this)
❌ **Problem:**
```javascript
this.eventBus.on(EVENT, this.handler.bind(this)); // Can't unsubscribe!
```

✅ **Solution:**
```javascript
// Bind once in constructor
this.handler = this.handler.bind(this);
// Then use in setupEventListeners
this.unsubscribe = this.eventBus.on(EVENT, this.handler);
```

### 2. Forgetting notify/error in onAsync
❌ **Wrong:**
```javascript
this.eventBus.onAsync(EVENT, async (data) => {
    return await doWork(data);  // This doesn't work!
});
```

✅ **Right:**
```javascript
this.eventBus.onAsync(EVENT, async (data, { notify, error }) => {
    try {
        const result = await doWork(data);
        notify(result);  // Must call notify!
    } catch (err) {
        error(err);      // Must call error!
    }
});
```

### 3. Not Checking Response Success
❌ **Wrong:**
```javascript
const response = await dispatcher.dispatch(ACTION, data, options);
return response; // Might have success: false!
```

✅ **Right:**
```javascript
const response = await dispatcher.dispatch(ACTION, data, options);
if (response.success) {
    return response.result;
} else {
    throw new Error(response.error || 'Operation failed');
}
```

## Debugging Tips

### Enable EventBus Debug Mode
```javascript
const eventBus = new EventBus({ domain: 'mydomain', debug: true });
```

### Monitor Background Script Console
All cross-context messages flow through the background script, so check its console for:
- CROSS_CONTEXT_EVENT messages
- Event dispatch logs
- Error messages

### Check for Orphaned Listeners
```javascript
console.log('Total listeners:', eventBus.getTotalListeners());
console.log('Events with listeners:', eventBus.getEventNames());
```

## Summary

1. **Always use constants** from `events.js` and `cc-actions.js`
2. **Bind methods once** in constructor to avoid memory leaks
3. **Use setupEventListeners()** as the standard method name
4. **dispatcher.dispatch()** returns a Promise for cross-context calls
5. **Use onAsync** with notify/error for handling async requests
6. **Check response.success** when handling dispatcher responses
7. **Track unsubscribe functions** for proper cleanup