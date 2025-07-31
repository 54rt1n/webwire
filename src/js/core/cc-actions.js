/**
 * WebWire Cross-Context Actions
 * 
 * All message action types and constants used for communication between
 * content script, background script, and panel components.
 */

/**
 * Background Script Message Actions
 * Actions sent TO the background script via chrome.runtime.sendMessage
 */
export const BACKGROUND_ACTIONS = {
    // Settings management
    GET_WEBWIRE_SETTINGS: 'GET_WEBWIRE_SETTINGS',
    SAVE_WEBWIRE_SETTINGS: 'SAVE_WEBWIRE_SETTINGS',
    
    // Thread/conversation management
    GET_ACTIVE_THREAD: 'GET_ACTIVE_THREAD',
    GET_OR_CREATE_CURRENT_THREAD: 'GET_OR_CREATE_CURRENT_THREAD',
    END_CONVERSATION: 'END_CONVERSATION',
    SAVE_THREAD_MESSAGE: 'SAVE_THREAD_MESSAGE',
    UPDATE_CONVERSATION: 'UPDATE_CONVERSATION',
    UPDATE_MESSAGE: 'UPDATE_MESSAGE',
    
    // UI state management
    SAVE_PANEL_VISIBILITY: 'SAVE_PANEL_VISIBILITY',
    GET_WEBWIRE_STATE: 'GET_WEBWIRE_STATE',
    SAVE_WEBWIRE_STATE: 'SAVE_WEBWIRE_STATE',
    UPDATE_UI_SETTINGS: 'UPDATE_UI_SETTINGS',
    
    // Extension statistics
    GET_EXTENSION_STATS: 'GET_EXTENSION_STATS',
    
    // Health check
    PING: 'PING',
    
    // Error reporting
    REPORT_ERROR: 'REPORT_ERROR',
    
    // Assistant state management
    GET_ASSISTANT_STATE: 'GET_ASSISTANT_STATE',
    UPDATE_ASSISTANT_VISIBILITY: 'UPDATE_ASSISTANT_VISIBILITY',
    INJECT_CONTENT_SCRIPT: 'INJECT_CONTENT_SCRIPT'
};

/**
 * Content Script Message Actions
 * Actions sent TO content scripts via EventDispatcher
 */
export const CONTENT_ACTIONS = {
    // Panel management
    INJECT_WEBWIRE_PANEL: 'INJECT_WEBWIRE_PANEL',
    TOGGLE_WEBWIRE_PANEL: 'TOGGLE_WEBWIRE_PANEL',
    
    // State queries
    GET_WEBWIRE_STATE: 'GET_WEBWIRE_STATE',
    
    // Notifications
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    CONVERSATION_UPDATED: 'CONVERSATION_UPDATED',
    
    // Health check
    PING: 'PING',
    
    // Assistant visibility control
    HIDE_ASSISTANT: 'HIDE_ASSISTANT',
    SHOW_ASSISTANT: 'SHOW_ASSISTANT',
    GET_PANEL_STATE: 'GET_PANEL_STATE'
};




/**
 * Message Roles
 * Roles used in chat messages
 */
export const MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    ERROR: 'error'
};

/**
 * Keyboard Shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
    TOGGLE_PANEL: {
        ctrlKey: true,
        shiftKey: true,
        key: 'W'
    }
};

/**
 * DOM Ready States
 */
export const DOM_READY_STATES = {
    LOADING: 'loading',
    INTERACTIVE: 'interactive',
    COMPLETE: 'complete'
};