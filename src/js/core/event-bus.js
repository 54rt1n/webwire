/**
 * Centralized event system for component communication using the pub/sub pattern.
 * Enables loose coupling between components with priority support, once listeners,
 * and comprehensive error handling.
 * 
 * @example
 * const eventBus = new EventBus();
 * 
 * // Subscribe to events
 * const unsubscribe = eventBus.on('user-message', (data) => {
 *   console.log('Received:', data);
 * });
 * 
 * // Emit events
 * eventBus.emit('user-message', { text: 'Hello' });
 * 
 * // One-time listeners
 * eventBus.once('initialization-complete', () => {
 *   console.log('App initialized');
 * });
 * 
 * // Cleanup
 * unsubscribe();
 */

import { generateListenerId } from '../utils/id-generator.js';

export class EventBus {
    constructor() {
        this.events = new Map();
        this.maxListeners = 100;
        this.debug = false;
        
        console.log('[EventBus]', 'EventBus initialized');
    }

    /**
     * Subscribe to an event with optional priority and configuration
     * @param {string} eventName - The name of the event to listen for
     * @param {Function} callback - Function to call when event is emitted
     * @param {Object} [options={}] - Optional configuration
     * @param {boolean} [options.once=false] - If true, listener will be removed after first execution
     * @param {number} [options.priority=0] - Higher priority listeners execute first
     * @returns {Function} Unsubscribe function to remove this listener
     * @throws {Error} If eventName is not a string or callback is not a function
     */
    on(eventName, callback, options = {}) {
        if (typeof eventName !== 'string' || typeof callback !== 'function') {
            throw new Error('Invalid event name or callback');
        }

        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }

        const listeners = this.events.get(eventName);
        
        // Check max listeners limit
        if (listeners.length >= this.maxListeners) {
            console.warn(`[EventBus] Max listeners (${this.maxListeners}) reached for event: ${eventName}`);
            return () => {}; // Return no-op unsubscribe
        }

        const listener = {
            callback,
            once: options.once || false,
            priority: options.priority || 0,
            id: generateListenerId()
        };

        // Insert based on priority (higher priority first)
        const insertIndex = listeners.findIndex(l => l.priority < listener.priority);
        if (insertIndex === -1) {
            listeners.push(listener);
        } else {
            listeners.splice(insertIndex, 0, listener);
        }

        console.log('[EventBus]', `Subscribed to ${eventName} (ID: ${listener.id}, Priority: ${listener.priority})`);

        // Return unsubscribe function
        return () => this.off(eventName, listener.id);
    }

    /**
     * Subscribe to an event exclusively, removing all other listeners for that event
     * This will remove all existing listeners for the event before adding the new one
     * @param {string} eventName - The name of the event to listen for
     * @param {Function} callback - Function to call when event is emitted
     * @param {Object} [options={}] - Optional configuration (same as on() method)
     * @returns {Function} Unsubscribe function to remove this listener
     * @throws {Error} If eventName is not a string or callback is not a function
     */
    onExclusive(eventName, callback, options = {}) {
        // Remove all existing listeners for this event
        this.removeAllListeners(eventName);
        
        // Add the new exclusive listener
        return this.on(eventName, callback, options);
    }

    /**
     * Subscribe to an event that will only fire once
     * @param {string} eventName - The name of the event to listen for
     * @param {Function} callback - Function to call when event is emitted
     * @param {Object} [options={}] - Optional configuration (priority, etc.)
     * @returns {Function} Unsubscribe function to remove this listener
     * @throws {Error} If eventName is not a string or callback is not a function
     */
    once(eventName, callback, options = {}) {
        return this.on(eventName, callback, { ...options, once: true });
    }

    /**
     * Unsubscribe from an event by listener ID or callback function
     * @param {string} eventName - The name of the event to unsubscribe from
     * @param {string|Function} listenerIdOrCallback - Listener ID or original callback function
     * @returns {boolean} True if a listener was removed, false otherwise
     */
    off(eventName, listenerIdOrCallback) {
        const listeners = this.events.get(eventName);
        if (!listeners) return false;

        let index = -1;
        
        if (typeof listenerIdOrCallback === 'string') {
            // Find by listener ID
            index = listeners.findIndex(l => l.id === listenerIdOrCallback);
        } else if (typeof listenerIdOrCallback === 'function') {
            // Find by callback function
            index = listeners.findIndex(l => l.callback === listenerIdOrCallback);
        }

        if (index !== -1) {
            const removed = listeners.splice(index, 1)[0];
            console.log('[EventBus]', `Unsubscribed from ${eventName} (ID: ${removed.id})`);
            
            // Clean up empty event arrays
            if (listeners.length === 0) {
                this.events.delete(eventName);
            }
            
            return true;
        }

        return false;
    }

    /**
     * Emit an event to all subscribers with optional message and configuration
     * @param {string} eventName - The name of the event to emit
     * @param {*} [message] - Optional message to pass to listeners
     * @param {Object} [options] - Optional configuration
     * @param {Function} [options.notify] - Optional callback function that receives (response, error)
     * @param {...*} args - Additional arguments to pass to listeners
     * @returns {boolean} True if event had listeners, false otherwise
     */
    emit(eventName, message, options, ...args) {
        const listeners = this.events.get(eventName);
        if (!listeners || listeners.length === 0) {
            console.log('[EventBus]', `No listeners for event: ${eventName}`, message, options, args);
            if (eventName === undefined) {
                console.log('[EventBus]', 'Event name is undefined', message, options, args);
                // Get the call stack
                const callStack = new Error().stack;
                console.log('[EventBus]', 'Call stack:', callStack);
            }
            return false;
        }

        console.log('[EventBus]', `Emitting ${eventName} to ${listeners.length} listeners`);

        // Create a copy to avoid issues if listeners modify the array
        const listenersToCall = [...listeners];
        const onceListeners = [];

        for (const listener of listenersToCall) {
            try {
                // Call the listener
                listener.callback(message, options, ...args);
                
                // Mark once listeners for removal
                if (listener.once) {
                    onceListeners.push(listener.id);
                }
                
            } catch (error) {
                console.error(`[EventBus] Error in listener for ${eventName}:`, error);
                
                // Emit error event
                this.emitError(eventName, error, listener);
            }
        }

        // Remove once listeners
        for (const listenerId of onceListeners) {
            this.off(eventName, listenerId);
        }

        return true;
    }

    /**
     * Asynchronously emit an event and wait for a response using notify/error pattern
     * @param {string} eventName - The name of the event to emit
     * @param {*} [message] - Optional message to pass to listeners
     * @param {Object} [options={}] - Optional configuration
     * @param {...*} args - Additional arguments to pass to listeners
     * @returns {Promise<*>} Promise that resolves with the response or rejects with error
     */
    async emitAsync(eventName, message, { ...options } = {}, ...args) {
        return new Promise((resolve, reject) => {
            this.emit(eventName, message, { notify: resolve, error: reject, ...options }, ...args);
        });
    }

    /**
     * Emit an error event for listener failures to prevent infinite recursion
     * @param {string} originalEvent - The original event name that failed
     * @param {Error} error - The error that occurred
     * @param {Object} listener - The listener object that failed
     */
    emitError(originalEvent, error, listener) {
        // Prevent infinite recursion by not emitting error events for error event failures
        if (originalEvent === 'listenerError') return;

        this.emit('listenerError', {
            originalEvent,
            error,
            listenerId: listener.id,
            timestamp: Date.now()
        });
    }

    /**
     * Remove all listeners for a specific event
     * @param {string} eventName - The name of the event to clear
     * @returns {number} Number of listeners that were removed
     */
    removeAllListeners(eventName) {
        if (eventName) {
            const listeners = this.events.get(eventName);
            if (listeners) {
                const count = listeners.length;
                this.events.delete(eventName);
                console.log('[EventBus]', `Removed all ${count} listeners for ${eventName}`);
                return count;
            }
            return 0;
        } else {
            // Remove all listeners for all events
            const totalCount = Array.from(this.events.values())
                .reduce((sum, listeners) => sum + listeners.length, 0);
            this.events.clear();
            console.log('[EventBus]', `Removed all ${totalCount} listeners for all events`);
            return totalCount;
        }
    }

    /**
     * Get all event names that currently have listeners
     * @returns {string[]} Array of event names
     */
    getEventNames() {
        return Array.from(this.events.keys());
    }

    /**
     * Get the number of listeners for a specific event
     * @param {string} eventName - The name of the event
     * @returns {number} Number of listeners for the event
     */
    listenerCount(eventName) {
        const listeners = this.events.get(eventName);
        return listeners ? listeners.length : 0;
    }

    /**
     * Get all listeners for a specific event
     * @param {string} eventName - The name of the event
     * @returns {Object[]} Array of listener objects
     */
    getListeners(eventName) {
        const listeners = this.events.get(eventName);
        return listeners ? [...listeners] : [];
    }

    /**
     * Check if an event has any listeners
     * @param {string} eventName - The name of the event to check
     * @returns {boolean} True if the event has listeners, false otherwise
     */
    hasListeners(eventName) {
        return this.listenerCount(eventName) > 0;
    }

    /**
     * Set the maximum number of listeners allowed per event
     * @param {number} max - Maximum number of listeners (must be positive)
     * @throws {Error} If max is not a positive number
     */
    setMaxListeners(max) {
        if (typeof max !== 'number' || max < 0) {
            throw new Error('Max listeners must be a non-negative number');
        }
        this.maxListeners = max;
        console.log('[EventBus]', `Max listeners set to ${max}`);
    }

    /**
     * Enable or disable debug logging for the event bus
     * @param {boolean} enabled - Whether to enable debug logging
     */
    setDebug(enabled) {
        this.debug = !!enabled;
        console.log('[EventBus]', `Debug logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get the total number of listeners across all events
     * @returns {number} Total number of registered listeners
     */
    getTotalListeners() {
        let totalListeners = 0;
        for (const [eventName, listeners] of this.events) {
            totalListeners += listeners.length;
        }

        return totalListeners;
    }

    /**
     * Clean up and destroy the event bus, removing all listeners
     */
    destroy() {
        this.removeAllListeners();
        console.log('[EventBus]', `EventBus destroyed. Had ${this.getTotalListeners()} listeners across ${this.events.size} events.`);
    }

    /**
     * Get the event history (if tracking is enabled)
     * @returns {Array} Array of historical events
     */
    getEventHistory() {
        return [...this.history];
    }
}

/**
 * Global event bus instance for the application
 */
export const globalEventBus = new EventBus();
globalEventBus.setDebug(true); // Enable debug logging
