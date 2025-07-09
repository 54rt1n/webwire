/**
 * WebWire Content Script Constants
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
    SAVE_THREAD_MESSAGE: 'SAVE_THREAD_MESSAGE',
    
    // UI state management
    SAVE_PANEL_VISIBILITY: 'SAVE_PANEL_VISIBILITY',
    GET_WEBWIRE_STATE: 'GET_WEBWIRE_STATE',
    
    // Health check
    PING: 'PING'
};

/**
 * Background Script Message Handlers
 * Actions received FROM the background script
 */
export const BACKGROUND_HANDLERS = {
    // Panel management
    INJECT_WEBWIRE_PANEL: 'INJECT_WEBWIRE_PANEL',
    TOGGLE_WEBWIRE_PANEL: 'TOGGLE_WEBWIRE_PANEL',
    
    // Content extraction
    CAPTURE_PAGE_CONTENT: 'CAPTURE_PAGE_CONTENT',
    
    // State queries
    GET_WEBWIRE_STATE: 'GET_WEBWIRE_STATE',
    
    // Notifications
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    CONVERSATION_UPDATED: 'CONVERSATION_UPDATED',
    
    // Health check
    PING: 'PING'
};

/**
 * Panel Message Actions
 * Actions sent TO the panel via window.postMessage
 */
export const PANEL_ACTIONS = {
    // Chat functionality
    SEND_CHAT_MESSAGE: 'SEND_CHAT_MESSAGE',
    ANALYZE_PAGE_CONTENT: 'ANALYZE_PAGE_CONTENT',
    
    // MCP functionality
    CONNECT_MCP: 'CONNECT_MCP',
    DISCONNECT_MCP: 'DISCONNECT_MCP',
    
    // Data requests
    GET_PAGE_CONTENT: 'GET_PAGE_CONTENT',
    GET_STATE: 'GET_STATE',
    
    // Settings
    SAVE_SETTINGS: 'SAVE_SETTINGS'
};

/**
 * Panel Message Types
 * Message types used for panel communication
 */
export const PANEL_MESSAGE_TYPES = {
    // Panel communication framework
    WEBWIRE_PANEL_MESSAGE: 'WEBWIRE_PANEL_MESSAGE',
    WEBWIRE_PANEL_READY: 'WEBWIRE_PANEL_READY',
    
    // Response types
    PAGE_CONTENT_RESPONSE: 'PAGE_CONTENT_RESPONSE',
    STATE_RESPONSE: 'STATE_RESPONSE',
    SAVE_SETTINGS_RESPONSE: 'SAVE_SETTINGS_RESPONSE',
    
    // Chat message types
    CHAT_MESSAGE: 'CHAT_MESSAGE',
    CHAT_THINKING_START: 'CHAT_THINKING_START',
    CHAT_STREAMING_CHUNK: 'CHAT_STREAMING_CHUNK',
    CHAT_THINKING_COMPLETE: 'CHAT_THINKING_COMPLETE',
    
    // Tool execution
    TOOL_EXECUTION_START: 'TOOL_EXECUTION_START',
    TOOL_EXECUTION_COMPLETE: 'TOOL_EXECUTION_COMPLETE',
    TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
    
    // Status updates
    CONNECTION_STATUS_UPDATE: 'CONNECTION_STATUS_UPDATE',
    CONVERSATION_UPDATED: 'CONVERSATION_UPDATED',
    INITIAL_STATE: 'INITIAL_STATE',
    
    // Error handling
    ERROR: 'ERROR'
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