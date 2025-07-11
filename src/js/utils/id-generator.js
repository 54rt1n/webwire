/**
 * ID Generator Utility - Provides consistent UUID generation across browsers
 * Handles crypto.randomUUID fallback for older browsers and provides
 * specialized ID generators for different application components.
 */

/**
 * Generate a UUID v4 string with cross-browser compatibility
 * Uses crypto.randomUUID when available, falls back to manual implementation
 * @returns {string} A valid UUID v4 formatted string (e.g., "123e4567-e89b-12d3-a456-426614174000")
 */
export function generateUUID() {
    // Use crypto.randomUUID if available (modern browsers)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    
    // Fallback UUID v4 implementation for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a unique identifier for conversation turns
 * @returns {string} Turn ID with 'turn-' prefix followed by UUID (e.g., "turn-123e4567-...")
 */
export function generateTurnId() {
    return 'turn-' + generateUUID();
}

/**
 * Generate a unique identifier for user sessions
 * @returns {string} Session ID with 'session-' prefix followed by UUID (e.g., "session-123e4567-...")
 */
export function generateSessionId() {
    return 'session-' + generateUUID();
}

/**
 * Generate a unique identifier for event listeners
 * @returns {string} Listener ID with 'listener-' prefix followed by UUID (e.g., "listener-123e4567-...")
 */
export function generateListenerId() {
    return 'listener-' + generateUUID();
}

/**
 * Generate a generic ID with custom prefix for application-specific use cases
 * @param {string} [prefix='id'] - Custom prefix to prepend to the UUID
 * @returns {string} ID with custom prefix followed by UUID (e.g., "myprefix-123e4567-...")
 */
export function generateId(prefix = 'id') {
    return prefix + '-' + generateUUID();
}

/**
 * Generate a raw UUID without any prefix (alias for generateUUID for clarity)
 * @returns {string} Raw UUID string without prefix (e.g., "123e4567-e89b-12d3-a456-426614174000")
 */
export function generateRawUUID({dashes = true} = {}) {
    const uuid = generateUUID();
    if (dashes) {
        return uuid;
    }
    return uuid.replace(/-/g, '');
} 

/**
 * Generate a unique identifier for tool calls
 * @returns {string} Tool call ID with 'tool-' prefix followed by a 9 digit alpha numeric string
 */
export function generateToolCallId() {
    return 'tool-' + generateRawUUID({dashes: false}).slice(0, 9);
}

/**
 * Generate a unique identifier for messages
 * @returns {string} Message ID with 'message-' prefix followed by a 9 digit alpha numeric string
 */
export function generateMessageId() {
    return 'message-' + generateRawUUID({dashes: false}).slice(0, 9);
}