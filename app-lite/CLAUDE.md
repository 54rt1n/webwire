# WebWire App-Lite: Understanding Your Place in the Universe

## THE BIG PICTURE: What WebWire App-Lite Actually Is

WebWire App-Lite is the **simplified, lightweight version** of a sophisticated Chrome extension for AI-powered web page analysis. You are NOT a standalone application - you are a **thin interface layer** that sits on top of the main WebWire architecture located in `src/`.

### Your Relationship to the Main WebWire System

**YOU ARE A WRAPPER, NOT A REPLACEMENT**

```
WebWire Architecture (src/):
├── Sophisticated event system (EventBus + EventDispatcher)
├── Plugin-based state management (StateService + plugins)
├── Cross-context communication infrastructure
├── AI provider abstraction layer
├── MCP tool integration system
├── Storage management with Chrome APIs
└── Complete chat interface with streaming

App-Lite (YOU):
├── background.js     → Thin wrapper calling src/ background
├── content.js        → Thin wrapper calling src/ content
├── popup/            → Simple UI calling src/ via EventDispatcher
├── options/          → Simple UI calling src/ via EventDispatcher
└── guide/            → Documentation interface
```

## CRITICAL ARCHITECTURAL UNDERSTANDING

### 1. You Import and Use the Main System

**Every app-lite component should import from `src/` and use the established infrastructure:**

```javascript
// CORRECT - Use the sophisticated WebWire infrastructure
import { EventDispatcher } from '../src/js/core/event-dispatcher.js';
import { EVENTS } from '../src/js/core/events.js';
import { WebWireClientCore } from '../src/js/client/webwire-client-core.js';

// WRONG - Raw Chrome messaging bypassing all infrastructure
chrome.runtime.sendMessage({ action: 'DO_SOMETHING' });
```

### 2. Cross-Context Communication Rules

**NEVER use raw Chrome messaging!** Always use the EventDispatcher system:

```javascript
// Initialize EventDispatcher in your component
this.dispatcher = new EventDispatcher('popup'); // or 'options', etc.

// Communicate with background (which has full state access)
const result = await this.dispatcher.dispatch(
  BACKGROUND_ACTIONS.GET_EXTENSION_STATS,
  {},
  { target: 'background' }
);
```

### 3. State Management Reality

**You DO NOT manage state directly.** The background script has the full StateService with all plugins:
- ConversationState (holds all chat history)
- SettingsState (AI providers, preferences)
- UIState (panel visibility, etc.)
- MCPState (tool connections)

Your job: **Request data from background, display it, send user actions back**

### 4. Storage Access Pattern

**You cannot access Chrome storage directly in popup/options!** Must go through background:

```javascript
// WRONG - Direct storage access from popup
const data = await chrome.storage.local.get(['conversations']);

// CORRECT - Request through EventDispatcher
const stats = await this.dispatcher.dispatch(
  BACKGROUND_ACTIONS.GET_EXTENSION_STATS,
  {},
  { target: 'background' }
);
```

## WEBPACK BUILD SYSTEM REALITY

**This is NOT a simple file copy system!** The app-lite directory structure is transformed by webpack.

### Build Process
1. **Entry Points**: Webpack creates separate bundles:
   - `app-lite/popup/index.js` → `dist-lite/popup.js`
   - `app-lite/options/index.js` → `dist-lite/options.js`
   - `app-lite/guide/index.js` → `dist-lite/guide.js`

2. **HTML Flattening**: HtmlWebpackPlugin flattens structure:
   - `app-lite/popup/index.html` → `dist-lite/popup.html` (NOT popup/index.html!)
   - `app-lite/guide/index.html` → `dist-lite/guide.html`

3. **File References**: In built extension, all HTML is at root:
   - `chrome.runtime.getURL('guide.html')` ✓
   - `chrome.runtime.getURL('guide/index.html')` ✗

## YOUR RESPONSIBILITIES AS APP-LITE

### What You Should Do:
✅ Provide simple, focused UI interfaces
✅ Initialize EventDispatcher for communication
✅ Request data from background via established events
✅ Display status/data received from main system
✅ Send user actions back to background for processing
✅ Handle UI state and loading indicators

### What You Should NOT Do:
❌ Bypass the WebWire infrastructure with raw Chrome messages
❌ Try to manage state directly
❌ Implement AI logic (that's in src/)
❌ Access Chrome storage directly
❌ Duplicate functionality that exists in src/
❌ Create your own event systems

## INTEGRATION PATTERNS

### Popup Component Pattern:
```javascript
import { EventDispatcher } from '../src/js/core/event-dispatcher.js';
import { BACKGROUND_ACTIONS } from '../src/js/core/cc-actions.js';

class WebWirePopup {
  constructor() {
    this.dispatcher = new EventDispatcher('popup');
  }
  
  async initialize() {
    // Get data from background
    const stats = await this.dispatcher.dispatch(
      BACKGROUND_ACTIONS.GET_EXTENSION_STATS,
      {},
      { target: 'background' }
    );
    this.updateUI(stats);
  }
}
```

### Options Component Pattern:
```javascript
import { EventDispatcher } from '../src/js/core/event-dispatcher.js';
import { BACKGROUND_ACTIONS } from '../src/js/core/cc-actions.js';

class WebWireOptions {
  constructor() {
    this.dispatcher = new EventDispatcher('options');
  }
  
  async saveSettings(settings) {
    // Send to background for processing
    await this.dispatcher.dispatch(
      BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
      settings,
      { target: 'background' }
    );
  }
}
```

## REMEMBER: You Are Not The Main App

You are a **simplified interface** built on top of a sophisticated system. Your job is to provide easy access to the power of the main WebWire architecture, not to reimplement it. 

**Embrace your role as the lightweight frontend to a powerful backend system.**