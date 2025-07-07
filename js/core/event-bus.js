/**
 * Event Bus - Centralized event system for component communication
 * Implements pub/sub pattern for loose coupling between components
 */

import { generateListenerId } from '../utils/id-generator.js';
import { EVENTS } from '../constants/events.js';

export class EventBus {
    constructor() {
        this.events = new Map();
        this.maxListeners = 100;
        this.debug = false;
        
        console.log('[EventBus]', 'EventBus initialized');
    }

    /**
     * Subscribe to an event
     * @param {string} eventName 
     * @param {Function} callback 
     * @param {Object} options - Optional configuration
     * @returns {Function} Unsubscribe function
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
     * Subscribe to an event exclusively
     *   This will remove all other listeners for the event
     * @param {string} eventName    
     * @param {Function} callback 
     * @param {Object} options 
     * @returns {Function} Unsubscribe function
     */
    onExclusive(eventName, callback, options = {}) {
        // Remove all existing listeners for this event
        this.removeAllListeners(eventName);
        
        // Add the new exclusive listener
        return this.on(eventName, callback, options);
    }

    /**
     * Subscribe to an event once
     * @param {string} eventName 
     * @param {Function} callback 
     * @param {Object} options 
     * @returns {Function} Unsubscribe function
     */
    once(eventName, callback, options = {}) {
        return this.on(eventName, callback, { ...options, once: true });
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventName 
     * @param {string|Function} listenerIdOrCallback 
     * @returns {boolean} Success status
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
     * Emit an event to all subscribers
     * @param {string} eventName 
     * @param {Object} [message] - Optional message to pass to listeners
     * @param {Object} [options] - Optional configuration
     * @param {Function} [options.notify] - Optional callback function that receives (response, error)
     * @param {...any} args - Arguments to pass to listeners
     * @returns {boolean} True if event had listeners
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
     * Asynchronously emit an event with the notify, error pattern 
     */
    async emitAsync(eventName, message, { ...options } = {}, ...args) {
        return new Promise((resolve, reject) => {
            this.emit(eventName, message, { notify: resolve, error: reject, ...options }, ...args);
        });
    }

    /**
     * Emit error event for listener failures
     * @param {string} originalEvent 
     * @param {Error} error 
     * @param {Object} listener 
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
     * Remove all listeners for an event
     * @param {string} eventName 
     * @returns {number} Number of listeners removed
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
     * Get all event names that have listeners
     * @returns {Array<string>}
     */
    getEventNames() {
        return Array.from(this.events.keys());
    }

    /**
     * Get listener count for an event
     * @param {string} eventName 
     * @returns {number}
     */
    listenerCount(eventName) {
        const listeners = this.events.get(eventName);
        return listeners ? listeners.length : 0;
    }

    /**
     * Get all listeners for an event
     * @param {string} eventName 
     * @returns {Array<Object>}
     */
    getListeners(eventName) {
        const listeners = this.events.get(eventName);
        return listeners ? [...listeners] : [];
    }

    /**
     * Check if an event has listeners
     * @param {string} eventName 
     * @returns {boolean}
     */
    hasListeners(eventName) {
        return this.listenerCount(eventName) > 0;
    }

    /**
     * Set maximum number of listeners per event
     * @param {number} max 
     */
    setMaxListeners(max) {
        if (typeof max !== 'number' || max < 0) {
            throw new Error('Max listeners must be a non-negative number');
        }
        this.maxListeners = max;
        console.log('[EventBus]', `Max listeners set to ${max}`);
    }

    /**
     * Enable or disable debug logging
     * @param {boolean} enabled 
     */
    setDebug(enabled) {
        this.debug = !!enabled;
        console.log('[EventBus]', `Debug logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get total number of listeners
     * @returns {number}
     */
    getTotalListeners() {
        let totalListeners = 0;
        for (const [eventName, listeners] of this.events) {
            totalListeners += listeners.length;
        }

        return totalListeners;
    }

    /**
     * Cleanup and destroy event bus
     */
    destroy() {
        this.removeAllListeners();
        console.log('[EventBus]', `EventBus destroyed. Had ${this.getTotalListeners()} listeners across ${this.events.size} events.`);
    }

    getEventHistory() {
        return [...this.history];
    }
}

/**
 * Global event bus instance for the application
 */
export const globalEventBus = new EventBus();
globalEventBus.setDebug(true); // Enable debug logging
