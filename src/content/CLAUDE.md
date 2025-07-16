# CLAUDE.md - Content Script

This file provides guidance for working with the WebWire content script system.

## Directory Structure
```
src/content
├── index.js       # Main content script host
└── debug.js       # Debug utilities
```

## Overview

The content script (`index.js`) acts as a lightweight adapter/host that bridges the Chrome extension APIs with the core WebWire ChatService. It handles:

- Chrome extension API interactions (chrome.runtime, chrome.tabs)
- Event routing between ChatService and background script
- DOM event listeners and UI coordination
- Translation between Chrome APIs and ChatService events

## Architecture

### WebWireContentHost Class

The main class that coordinates all content script functionality:

```javascript
class WebWireContentHost {
    constructor() {
        this.eventBus = new EventBus('content');     // Content-scoped event bus
        this.core = new WebWireClientCore();         // Core infrastructure
        this.chatService = new ChatService();        // Chat functionality
        this.pageUtils = new PageUtils();            // Page content extraction
        this.domAgent = new DOMAgent();              // DOM manipulation
    }
}
```

## Critical Event Integration Patterns

### ⚠️ Background Communication Pattern

**IMPORTANT**: There are two distinct event patterns for communicating with the background script. Understanding this is critical to avoid integration bugs.

#### Pattern 1: Chat Service → Background (via setupChatServiceEvents)

For events that originate from ChatService and need background persistence:

```javascript
// 1. ChatService emits with target background
this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, {
    settings: this.stateService.state.settings
}, { target: EVENT_CONTEXT.BACKGROUND });

// 2. Content script handles in setupChatServiceEvents()
setupChatServiceEvents() {
    this.eventBus.onAsync(EVENTS.CHAT.UPDATE_SETTINGS, this.handleUpdateSettings.bind(this));
}

// 3. Handler dispatches to background
async handleUpdateSettings(data) {
    const response = await this.core.dispatcher.dispatch(
        BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
        data,
        { target: 'background' }
    );
    return response;
}
```

**Examples of this pattern:**
- `EVENTS.CHAT.SAVE_MESSAGE` → `BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE`
- `EVENTS.CHAT.GET_OR_CREATE_THREAD` → `BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD`
- `EVENTS.CHAT.UPDATE_SETTINGS` → `BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS`
- `EVENTS.CHAT.SAVE_PANEL_VISIBILITY` → `BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY`

#### Pattern 2: Direct Dispatch (via handleBackgroundDispatch) *NOTE This pattern is removed*

For events that bypass ChatService and go directly to background: 

```javascript
// 1. Event emitted with outbound dispatch
this.eventBus.emit('dispatch:outbound', { *REMOVED*
    target: 'background',
    event: EVENTS.THREADS.GET_OR_CREATE,
    data: threadData
});

// 2. Content script routes in handleBackgroundDispatch()
async handleBackgroundDispatch(event, data) {
    switch (event) {
        case EVENTS.THREADS.GET_OR_CREATE:
            await this.core.dispatcher.dispatch(action, data, { target: 'background' });
            break;
    }
}
```

**Examples of this pattern:**
- `EVENTS.THREADS.GET_OR_CREATE`
- `EVENTS.UI.SAVE_PANEL_VISIBILITY`

#### ❌ Common Mistake: Event Name Conflicts

**DO NOT** use the same event name for both local notifications and background dispatch:

```javascript
// WRONG - Creates conflicts
this.eventBus.on(EVENTS.CHAT.UPDATE_SETTINGS, localHandler);  // Local listener
this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, data, { target: 'background' }); // Background target
// Result: Local handler intercepts, background never reached
```

**Correct approach**: Use different events or proper async handlers:
```javascript
// RIGHT - Use onAsync for background-targeted events
this.eventBus.onAsync(EVENTS.CHAT.UPDATE_SETTINGS, backgroundHandler); // Background dispatch
this.eventBus.on(EVENTS.CHAT.SETTINGS_CHANGED, localHandler);          // Local notification
```

### Event Flow Architecture

#### Event Bus vs Event Dispatcher

- **EventBus**: Local event coordination within content script context
- **EventDispatcher**: Cross-context communication (content ↔ background ↔ popup)

#### ChatService Event Integration

The content script acts as a bridge for ChatService events:

1. **setupChatServiceEvents()**: Handles outbound ChatService requests
   - Uses `onAsync()` to handle background-targeted events
   - Each handler calls `dispatcher.dispatch()` to route to background
   - Returns response back to ChatService

2. **setupHostEventHandlers()**: Handles host-specific events
   - Listens for `dispatch:outbound` from ChatService
   - Routes to `handleBackgroundDispatch()` or `handleHostDispatch()`

#### Background Response Flow

```
Background → EventDispatcher → Content EventBus → ChatService
```

1. Background sends response via EventDispatcher
2. EventDispatcher emits to content EventBus  
3. Content EventBus delivers to ChatService listeners

### Chrome Extension Communication

#### Message Types

The content script handles multiple Chrome message types:

- **BACKGROUND_HANDLERS.SETTINGS_CHANGED**: Settings updated by background
- **BACKGROUND_HANDLERS.CONVERSATION_UPDATED**: Conversation state changed
- **BACKGROUND_HANDLERS.PING**: Health check from background

#### Tab Context Resolution

Messages automatically resolve tab context:
- Content script provides `sender.tab.id`
- Background can target specific tabs
- Active tab used as fallback when needed

### Panel Communication

#### Window PostMessage Events

For panel (iframe) communication:
- **PANEL_ACTIONS.SEND_CHAT_MESSAGE**: User chat input
- **PANEL_ACTIONS.ANALYZE_PAGE_CONTENT**: Page analysis request
- **PANEL_ACTIONS.SAVE_SETTINGS**: Settings persistence
- **PANEL_ACTIONS.GET_STATE**: Initial state request

### Development Guidelines

#### Adding New Background Communications

1. **Identify the pattern**: Does this originate from ChatService or elsewhere?

2. **For ChatService events**:
   ```javascript
   // Add to setupChatServiceEvents()
   this.eventBus.onAsync(EVENTS.CHAT.NEW_EVENT, this.handleNewEvent.bind(this));
   
   // Create handler method
   async handleNewEvent(data) {
       return await this.core.dispatcher.dispatch(
           BACKGROUND_ACTIONS.NEW_ACTION,
           data,
           { target: 'background' }
       );
   }
   ```

3. **For direct dispatch events**:
   ```javascript
   // Add to handleBackgroundDispatch()
   case EVENTS.NEW_NAMESPACE.NEW_EVENT:
       await this.core.dispatcher.dispatch(action, data, { target: 'background' });
       break;
   ```

#### Event Naming Conventions

- **EVENTS.CHAT.*** - ChatService-related events
- **EVENTS.UI.*** - UI state and panel events  
- **EVENTS.THREADS.*** - Conversation/thread events
- **EVENTS.SETTINGS.*** - Settings state events

#### Debugging Background Communication

1. **Check event emission**: Verify `{ target: EVENT_CONTEXT.BACKGROUND }`
2. **Check handler registration**: Ensure `onAsync()` in correct setup method
3. **Check dispatcher call**: Verify correct `BACKGROUND_ACTIONS.*` constant
4. **Check background handler**: Ensure background has matching event listener

### Common Integration Patterns

#### Settings Persistence Pattern

```javascript
// ChatService requests settings save
this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, {
    settings: newSettings
}, { target: EVENT_CONTEXT.BACKGROUND });

// Content script handles and dispatches
async handleUpdateSettings(data) {
    return await this.core.dispatcher.dispatch(
        BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
        data,
        { target: 'background' }
    );
}
```

#### Conversation Management Pattern

```javascript
// ChatService requests thread creation
this.eventBus.emit(EVENTS.CHAT.CREATE_NEW_THREAD, {
    location: pageLocation
}, { target: EVENT_CONTEXT.BACKGROUND });

// Content script handles and dispatches
async handleCreateNewThread(data) {
    const response = await this.core.dispatcher.dispatch(
        BACKGROUND_ACTIONS.CREATE_NEW_THREAD,
        data,
        { target: 'background' }
    );
    
    // Emit response back to ChatService
    this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
        conversation: response.thread
    });
    
    return response;
}
```

This architecture ensures clean separation between Chrome APIs, ChatService logic, and background coordination while maintaining consistent event flow patterns.