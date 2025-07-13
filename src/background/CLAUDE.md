# CLAUDE.md - Background Script

This file provides guidance for working with the WebWire background script system.

## Directory Structure
```
src/background
└── webwire-background.js
```

## Overview

The background script (`webwire-background.js`) is the central coordination hub for the WebWire Chrome extension. As a Manifest V3 service worker, it manages:

- Extension lifecycle and global state
- Cross-tab communication and state synchronization  
- Message routing between all extension contexts
- Chrome extension API interactions
- Persistent storage coordination

## Architecture

### WebWireBackground Class

The main class that orchestrates all extension functionality:

```javascript
class WebWireBackground {
    constructor() {
        this.activeTabs = new Map();           // Tab tracking
        this.eventBus = new EventBus();        // Domain-scoped events
        this.extensionSettings = {};           // Extension-level settings
        this.dispatcher = null;                // Event dispatcher
        this.stateService = null;              // State management
        this.storage = null;                   // Storage system
    }
}
```

### Initialization Flow

1. **Context Setup** - Initializes event bus, dispatcher, state service, storage
2. **Settings Load** - Loads extension settings from Chrome storage
3. **State Load** - Loads WebWire application state from storage
4. **Event Listeners** - Sets up Chrome extension event handlers

### Message Routing System

The background script acts as a message router handling:

#### Incoming Message Types:
- `GET_WEBWIRE_SETTINGS` - Returns current settings
- `SAVE_WEBWIRE_SETTINGS` - Persists settings changes
- `SAVE_WEBWIRE_STATE` - Persists application state
- `INJECT_WEBWIRE_PANEL` - Injects chat panel into tab
- `GET_WEBWIRE_STATE` - Returns current application state
- `WEBWIRE_PANEL_MESSAGE` - Routes panel messages
- `CAPTURE_PAGE_CONTENT` - Extracts page content
- `TOGGLE_WEBWIRE_PANEL` - Shows/hides panel
- `SETTINGS_UPDATED` - Handles settings change notifications
- `PING` - Health check from other contexts

#### Thread Management:
- `GET_THREAD` - Retrieves conversation thread
- `SAVE_THREAD_MESSAGE` - Persists conversation message
- `CREATE_THREAD` - Creates new conversation
- `LIST_THREADS` - Lists all conversations
- `DELETE_THREAD` - Removes conversation
- `GET_ACTIVE_THREAD` - Returns active conversation
- `SET_ACTIVE_THREAD` - Sets active conversation
- `GET_OR_CREATE_CURRENT_THREAD` - Gets or creates current thread

#### Panel State:
- `SAVE_PANEL_VISIBILITY` - Persists panel visibility state

### Tab ID Resolution

Sophisticated tab context resolution with priority order:
1. Explicit `tabId` in message payload (highest priority)
2. `sender.tab.id` when available (content script context)
3. Active tab when message needs one or comes from non-tab context

### State Management Integration

The background script integrates with the state system:

```javascript
// State loading
await this.stateService.settings.loadFromStorage();
await this.stateService.ui.loadFromStorage();
await this.stateService.disk.loadFromStorage();

// State saving
await this.stateService.settings.saveToStorage();
await this.stateService.ui.saveToStorage();
await this.stateService.disk.saveToStorage();
```

### Cross-Tab Communication

#### Settings Synchronization:
- Listens for Chrome storage changes
- Reloads state when settings change
- Notifies all tabs of settings updates
- Handles fallback trigger mechanism

#### Conversation Synchronization:
- Broadcasts conversation updates to all tabs
- Maintains conversation state consistency
- Handles active thread coordination

### Content Script Management

#### Injection Strategy:
1. **Ping Test** - Checks if content script is responsive
2. **Conditional Injection** - Injects only if needed
3. **Wait for Ready** - Uses exponential backoff to wait for initialization
4. **Panel Injection** - Injects chat panel after content script ready

#### Communication:
- **sendToContentScript()** - Standard messaging with error handling
- **sendToContentScriptSilent()** - Silent messaging for broadcast operations
- **pingContentScript()** - Health check with timeout
- **waitForContentScript()** - Retry logic with exponential backoff

### Chrome Extension Event Handling

#### Action Events:
- Icon clicks trigger panel toggle
- Keyboard shortcuts (Ctrl+Shift+W) handled
- Context menu actions routed

#### Tab Events:
- Tab updates tracked for auto-injection
- Tab state maintained in activeTabs Map
- URL and title changes monitored

#### Installation Events:
- First install opens options page
- Update events handled for migration

#### Storage Events:
- Chrome storage changes monitored
- State synchronization triggered
- Settings reload coordinated

### Error Handling

#### Message Error Recovery:
- Async message handling with try/catch
- Graceful degradation when content scripts unavailable
- Retry logic for transient failures

#### State Error Recovery:
- Fallback to default state when load fails
- Error logging without breaking functionality
- Recovery mechanisms for corrupted state

### Background Script Communication Patterns

#### Request/Response Pattern:
```javascript
// Async handler with sendResponse
async handleMessage(message, sender, sendResponse) {
    try {
        const result = await this.processMessage(message);
        sendResponse({ success: true, data: result });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    return true; // Keep channel open for async response
}
```

#### Broadcast Pattern:
```javascript
// Notify all valid tabs
const notifications = validTabs.map(async (tab) => {
    try {
        await this.sendToContentScriptSilent(tab.id, message);
        return { success: true, tabId: tab.id };
    } catch (error) {
        return { success: false, tabId: tab.id, error: error.message };
    }
});
```

### Development Considerations

#### Chrome Manifest V3 Constraints:
- Service worker lifecycle (no persistent background)
- Limited storage APIs
- Async-only messaging
- CSP restrictions

#### Performance Optimizations:
- Tab filtering for valid injection targets
- Silent messaging for broadcasts
- Exponential backoff for retries
- Efficient state synchronization

#### Debugging Support:
- Comprehensive logging with context
- Debug statistics via getStats()
- Global webwireBackground export for console access

### Common Operations

#### Adding New Message Types:
1. Add case to handleMessage() switch
2. Implement handler method
3. Add error handling
4. Update message routing documentation

#### State Synchronization:
1. Listen for storage changes
2. Reload affected state plugins
3. Broadcast updates to tabs
4. Handle cleanup of trigger mechanisms

#### Content Script Coordination:
1. Check content script availability
2. Inject if necessary
3. Wait for ready state
4. Send target message
5. Handle errors gracefully