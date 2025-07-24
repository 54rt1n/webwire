# CLAUDE.md - Storage System

This file provides guidance for working with the WebWire storage system.

## Directory Structure
```
src/js/storage/
├── adapters/                   # Storage adapters for different data types
│   ├── settings-adapter.js    # Settings persistence with versioning
│   ├── stash-adapter.js       # Document stash storage
│   ├── state-adapter.js       # General state storage with validation
│   ├── storage-adapter.js     # Base storage interface (Chrome/localStorage/IndexedDB)
│   └── ui-adapter.js          # UI state persistence
└── storage-manager.js         # Factory and container for storage adapters
```

## Overview

The storage system provides specialized adapters for different types of data persistence. The StorageManager creates and configures these adapters, providing a clean interface for state management plugins. The system prioritizes Chrome extension storage when available, falling back to localStorage and IndexedDB for compatibility.

## Storage Manager

The StorageManager acts as a factory and container for specialized storage adapters:

```javascript
const storageManager = new StorageManager(eventBus, {
    storage: {
        keys: { 
            settings: 'my-app-settings',
            state: 'my-app-state',
            ui: 'my-app-ui',
            stash: 'my-app-stash'
        },
        maxSaveSize: 10 * 1024 * 1024,  // 10MB
        db: { state: 'my-app-db' }
    },
    version: '1.0.0'
});

// Access specialized adapters via clean interface
await storageManager.storage.settings.set('theme', 'dark');
await storageManager.storage.state.save(appState);
const uiState = await storageManager.storage.ui.getAll();
```

Each adapter is automatically configured with:
- Storage keys from config (with sensible defaults)
- Version information for migration support
- Event bus for state change notifications
- Appropriate validation (StateAdapter uses StateValidator)

## Storage Adapters

### SettingsAdapter
- Uses Chrome extension storage when available, localStorage as fallback
- Handles versioning and migration
- Methods: `getAll()`, `setAll()`, `get()`, `set()`, `remove()`, `clear()`

### StorageAdapter (Base)
- Provides low-level storage operations with automatic backend selection
- Prioritizes Chrome extension storage, falls back to localStorage/IndexedDB
- Checks storage availability and handles errors gracefully
- Methods: `get()`, `set()`, `remove()`, `saveToIndexedDB()`, `loadFromIndexedDB()`

### StateAdapter
- General state storage with validation via StateValidator
- Prioritizes Chrome extension storage when available, falls back to localStorage
- Handles size limits (default 5MB) with warnings for oversized state
- Methods: `save()`, `load()`, `clear()`, `exists()`, `getMetadata()`
- Emits events on state save/clear operations
- Filters out settings and UI data before saving (handled by their own adapters)

### UiAdapter  
- Lightweight UI state persistence
- Similar interface to SettingsAdapter but UI-focused

### StashAdapter
- Document stashing functionality
- Handles document storage and retrieval

## Storage Strategy

1. **Chrome Extension Storage** (`chrome.storage.local`) - Primary for extension contexts
   - Unlimited storage for extensions
   - Automatic cross-tab synchronization
   - Persists across browser sessions
2. **localStorage** - Fallback for web contexts
   - 5-10MB limit depending on browser
   - Synchronous API
   - Domain-specific storage
3. **IndexedDB** - For large data objects
   - Larger storage capacity
   - Asynchronous API
   - Structured data storage

Each adapter automatically detects the execution context and uses the most appropriate storage backend.

## Usage Patterns

### Direct Adapter Access

State plugins and services access storage through specialized adapters:

```javascript
// In a state plugin
class SettingsStatePlugin {
    constructor(settingsAdapter) {
        this.settingsAdapter = settingsAdapter;
    }
    
    async loadSettings() {
        const settings = await this.settingsAdapter.getAll();
        return settings || this.getDefaultSettings();
    }
    
    async saveSettings(settings) {
        await this.settingsAdapter.setAll(settings);
    }
}

// In application code
const storageManager = new StorageManager(eventBus, config);
const settings = await storageManager.storage.settings.getAll();
const state = await storageManager.storage.state.load();
```

### Event-Driven Updates

Storage adapters emit events on state changes:

```javascript
// Listen for storage changes
eventBus.on(EVENTS.STATE_SAVED, (data) => {
    console.log('State saved:', data.timestamp);
});

eventBus.on(EVENTS.SETTINGS_UPDATED, (settings) => {
    console.log('Settings changed:', settings);
});
```

The adapters handle the complexity of storage backend selection, versioning, and error recovery while providing simple interfaces to the state management layer.

## StateValidator

The StateValidator class provides basic validation for state objects:

```javascript
const validator = new StateValidator(['session']); // Required fields
validator.validate(state); // Returns true/false
```

It ensures state objects are valid and contain required fields before persistence.

## Important Implementation Notes

### Chrome Extension Context Detection
- All adapters automatically detect Chrome extension context
- When `chrome.storage.local` is available, it becomes the primary storage backend
- This provides unlimited storage and automatic cross-tab synchronization

### Data Separation
- The StateAdapter filters out `settings` and `ui` properties before saving
- These domains are handled by their respective specialized adapters
- This prevents data duplication and ensures single source of truth

### Configuration Best Practices
- Always provide storage keys via StorageManager config for consistency
- Use descriptive key names that include your app name (e.g., 'webwire-settings')
- Configure appropriate maxSize limits for StateAdapter based on your needs

### Error Handling
- All adapters handle storage failures gracefully with fallback mechanisms
- Failed operations are logged but don't crash the application
- Consider implementing retry logic for critical operations

### Event Bus Integration
- All adapters require an eventBus instance for emitting storage events
- This enables reactive UI updates and cross-component synchronization
- Events are emitted for save, load, clear, and error operations