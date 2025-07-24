// js/core/events.js
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
        CHANGE: 'settings:change',
        CHANGED: 'settings:changed',
        CLEARED: 'settings:cleared',
        UPDATED: 'SETTINGS_UPDATED'
    },
    STATE: {
        SAVED: 'state:saved',
        LOADED: 'state:loaded',
        CLEARED: 'state:cleared'
    },
    CONVERSATION: {
        UPDATED: 'conversation:updated',
        DELETED: 'conversation:deleted',
        STATUS_UPDATED: 'conversation:status_updated',
        ACTIVATED: 'conversation:activated',
        HARD_RESET: 'conversation:hard_reset'
    },
    CHAT: {
        ANALYZE_PAGE: 'chat:analyze-page',
        CONVERSATION_LOADED: 'chat:conversation-loaded',
        CONVERSATION_UPDATED: 'chat:conversation-updated',
        CREATE_NEW_THREAD: 'chat:create-new-thread',
        END_CONVERSATION: 'chat:end-conversation',
        GET_OR_CREATE_THREAD: 'chat:get-or-create-thread',
        INJECT_PANEL: 'chat:inject-panel',
        REPLAY_LAST_TURN: 'chat:replay-last-turn',
        REPARSE_MESSAGE: 'chat:reparse-message',
        RESYNC: 'chat:resync',
        SAVE_MESSAGE: 'chat:save-message',
        SAVE_PANEL_VISIBILITY: 'chat:save-panel-visibility',
        SEND_MESSAGE: 'chat:send-message',
        START_NEW_CONVERSATION: 'chat:start-new-conversation',
        UPDATE_SETTINGS: 'chat:update-settings',
        TOGGLE_UI_SETTING: 'chat:toggle-ui-setting',
        EXECUTE_TOOL: 'chat:execute-tool',
        CANCEL_TOOL: 'chat:cancel-tool',
        TOOL_RESULT: 'chat:tool-result',
        CANCEL_STREAM: 'chat:cancel-stream',
        COPY_MESSAGE: 'chat:copy-message',
        UPDATE_CONVERSATION: 'chat:update-conversation'
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
        CONNECTION_CHANGED: 'mcp:connection-changed',
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
        CHANGED: 'ui:changed',
        SAVE_PANEL_VISIBILITY: 'ui:save-panel-visibility',
        INJECT_PANEL: 'ui:inject-panel',
        THREAD_SAVED: 'ui:thread-saved'
    },
    THREADS: {
        GET_OR_CREATE: 'threads:get-or-create',
        SAVE_MESSAGE: 'threads:save-message'
    },
    STASH: {
        ADD: 'stash:add',
        REMOVE: 'stash:remove',
        CLEAR: 'stash:clear',
        CLEAR_ALL: 'stash:clear-all',
        SAVE: 'stash:save',
        LOAD: 'stash:load',
        UPDATED: 'stash:updated',
        CLEARED: 'stash:cleared',
        LOADED: 'stash:loaded',
        SAVED: 'stash:saved'
    },
    DOM: {
        EXECUTE: 'dom:execute',
        NAVIGATE: 'dom:navigate',
        CLICK: 'dom:click',
        FORM_FILL: 'dom:form_fill',
        SCROLL: 'dom:scroll',
        OPERATION_COMPLETE: 'dom:operation_complete',
        OPERATION_ERROR: 'dom:operation_error'
    }
}; 

export const EVENT_CONTEXT = {
  LOCAL: 'local',
  BACKGROUND: 'background',
  CONTENT: 'content',
  POPUP: 'popup',
  PANEL: 'panel',
  SIMPLE: 'simple'
}