// js/core/events.js
export const EVENT_TYPES = {
  // Local events (within context)
  LOCAL: {
    AI_STREAM_CHUNK: 'local:ai:stream_chunk',
    MCP_TOOL_EXECUTED: 'local:mcp:tool_executed',
  },
  
  // Cross-context events (background ↔ content ↔ popup)
  GLOBAL: {
    PANEL_TOGGLE: 'global:ui:panel_toggle',
    STATE_SYNC: 'global:state:sync',
    PAGE_ANALYZE: 'global:ai:page_analyze',
  },
  
  // Panel events (content ↔ injected panel)
  PANEL: {
    CHAT_MESSAGE: 'panel:chat:message',
    TOOL_CALL: 'panel:mcp:tool_call',
  }
};

// Legacy events
export const EVENTS = {
    AI: {
        STREAM_CHUNK: 'ai:stream_chunk',
        STREAM_COMPLETED: 'ai:stream_completed',
        STREAM_ERROR: 'ai:stream_error',
        STREAM_STARTED: 'ai:stream_started',
        STREAM_STOPPED: 'ai:stream_stopped',
        STREAM_PAUSED: 'ai:stream_paused',
        STREAM_RESUMED: 'ai:stream_resumed',
    },
    SETTINGS: {
        CHANGED: 'settings:changed',
        CLEARED: 'settings:cleared'
    },
    STATE: {
        SAVED: 'state:saved',
        LOADED: 'state:loaded',
        CLEARED: 'state:cleared'
    },
    CONVERSATION: {
        UPDATED: 'conversation:updated',
        DELETED: 'conversation:deleted',
        STATUS_UPDATED: 'conversation:status_updated'
    },
    AIM: {
        THOUGHT_TOGGLED: 'aim:thought_toggled',
        AUTO_THINK_TOGGLED: 'aim:auto_think_toggled',
        THOUGHT_CONTENT_CHANGED: 'aim:thought_content_changed',
        THOUGHT_CLEARED: 'aim:thought_cleared'
    },
    MCP: {
        CONNECTING: 'mcp:connecting',
        CONNECTED: 'mcp:connected',
        DISCONNECTED: 'mcp:disconnected',
        CONNECTION_ERROR: 'mcp:connection_error',
        INITIALIZED: 'mcp:initialized',
        TOOLS_UPDATED: 'mcp:tools_updated',
        REQUEST_STARTED: 'mcp:request_started',
        REQUEST_COMPLETED: 'mcp:request_completed',
        REQUEST_FAILED: 'mcp:request_failed',
        REQUEST_TIMEOUT: 'mcp:request_timeout'
    },
    ERROR: {
        CRITICAL: 'error:critical',
        KEY_NOT_SET: 'error:key_not_set'
    },
    UI: {
        CHANGED: 'ui:changed'
    }
}; 

// Event payload schemas
export const EVENT_SCHEMAS = {
  [EVENT_TYPES.GLOBAL.STATE_SYNC]: {
    type: 'object',
    properties: {
      stateType: { enum: ['mcp', 'conversation', 'settings'] },
      data: { type: 'object' },
      timestamp: { type: 'number' }
    }
  }
};

export const EVENT_CONTEXT = {
  LOCAL: 'local',
  BACKGROUND: 'background',
  CONTENT: 'content',
  POPUP: 'popup',
  PANEL: 'panel'
}