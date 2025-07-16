# CLAUDE.md - Storage System

This file provides guidance for working with the WebWire storage system.

## Directory Structure
```
src/js/storage
├── adapters/                   # Storage adapters for different data types
│   ├── settings-adapter.js    # Settings persistence with versioning
│   ├── stash-adapter.js       # Document stash storage
│   ├── state-adapter.js       # General state storage with validation
│   ├── storage-adapter.js     # Base storage interface (localStorage/IndexedDB)
│   └── ui-adapter.js          # UI state persistence
└── storage-manager.js         # Factory and container for storage adapters
```

## Overview

The storage system provides specialized adapters for different types of data persistence. The StorageManager creates and configures these adapters, providing a clean interface for state management plugins.

## Storage Manager

The StorageManager acts as a factory, creating specialized adapters:

```javascript
// Creates adapters with clean interface
this.storage = {
    settings: new SettingsAdapter({
        storageKey: 'app-settings',
        version: '1.0.0'
    }, eventBus),
    
    state: new StateAdapter({
        storageKey: 'app-state',
        dbName: 'app-db',
        storeName: 'saves',
        version: '1.0.0',
        maxSize: 5 * 1024 * 1024 // 5MB
    }, new StateValidator(['session']), eventBus),
    
    ui: new UiAdapter({
        storageKey: 'app-ui',
        version: '1.0.0'
    }, eventBus),
    
    stash: new StashAdapter({
        storageKey: 'app-stash',
        version: '1.0.0'
    }, eventBus)
};
```

Each adapter is configured with storage keys, version info, and handles its own persistence logic. The StateAdapter includes a validator for ensuring data integrity.

## Storage Adapters

### SettingsAdapter
- Uses Chrome extension storage when available, localStorage as fallback
- Handles versioning and migration
- Methods: `getAll()`, `setAll()`, `get()`, `set()`, `remove()`, `clear()`

### StorageAdapter (Base)
- Provides low-level localStorage and IndexedDB operations
- Checks storage availability and handles fallbacks
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

1. **Chrome Extension Storage** - Primary for extension contexts
2. **localStorage** - Fallback for compatibility  
3. **IndexedDB** - For large data objects

Each adapter detects available storage and uses the most appropriate backend.

## Usage Pattern

State plugins access storage through their assigned adapters:

```javascript
// Settings plugin uses settings adapter
await this.settingsAdapter.getAll();
await this.settingsAdapter.setAll(settings);

// State plugins coordinate through StorageManager
const storageManager = new StorageManager(eventBus, config);
const adapter = storageManager.storage.settings;
```

The adapters handle the complexity of storage backend selection, versioning, and error recovery while providing simple interfaces to the state management layer.

## StateValidator

The StateValidator class provides basic validation for state objects:

```javascript
const validator = new StateValidator(['session']); // Required fields
validator.validate(state); // Returns true/false
```

It ensures state objects are valid and contain required fields before persistence.

## Important Notes

- StateAdapter automatically detects Chrome extension context and uses chrome.storage.local when available
- All adapters pass eventBus for emitting storage-related events
- Storage keys should be configured via the StorageManager constructor config
- The StateAdapter filters out settings and UI data as those are handled by their respective adapters