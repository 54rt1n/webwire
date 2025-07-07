/**
 * ID Generator Utility - Provides consistent UUID generation across browsers
 * Handles crypto.randomUUID fallback for older browsers
 */

/**
 * Generate a UUID v4 string
 * @returns {string} UUID v4 formatted string
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
 * Generate a turn ID
 * @returns {string} Turn ID with 'turn-' prefix
 */
export function generateTurnId() {
    return 'turn-' + generateUUID();
}

/**
 * Generate a session ID
 * @returns {string} Session ID with 'session-' prefix
 */
export function generateSessionId() {
    return 'session-' + generateUUID();
}

/**
 * Generate a listener ID
 * @returns {string} Listener ID with 'listener-' prefix
 */
export function generateListenerId() {
    return 'listener-' + generateUUID();
}

/**
 * Generate a generic ID with custom prefix
 * @param {string} prefix - Prefix for the ID
 * @returns {string} ID with custom prefix
 */
export function generateId(prefix = 'id') {
    return prefix + '-' + generateUUID();
}

/**
 * Generate just the UUID without any prefix
 * @returns {string} Raw UUID string
 */
export function generateRawUUID() {
    return generateUUID();
} 