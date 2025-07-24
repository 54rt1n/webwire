/**
 * Base class for components that bind to EventBus
 * 
 * Automatically manages event listener lifecycle:
 * - Tracks all event subscriptions
 * - Provides cleanup method to unsubscribe all listeners
 * - Prevents memory leaks from untracked event handlers
 * - Uses lazy binding - methods are only bound when actually used as handlers
 * 
 * Usage:
 * ```javascript
 * class MyComponent extends EventBindableComponent {
 *     constructor(eventBus) {
 *         super(eventBus);
 *         // No manual binding needed - handled lazily on registration
 *     }
 *     
 *     setupEventListeners() {
 *         // Use this.on() instead of this.eventBus.on()
 *         // Methods are bound automatically when registered
 *         this.on(EVENTS.SOMETHING, this.handleSomething);
 *         this.onAsync(EVENTS.ASYNC_THING, this.handleAsyncThing);
 *     }
 *     
 *     handleSomething(data) {
 *         // 'this' is correctly bound automatically
 *     }
 * }
 * ```
 */
export class EventBindableComponent {
    constructor(eventBus) {
        if (!eventBus) {
            throw new Error('EventBindableComponent requires an eventBus');
        }
        
        this.eventBus = eventBus;
        this.unsubscribes = [];
        
        // Lazy binding cache - only bind methods when actually used
        this._boundMethods = new Map();
    }
    
    /**
     * Get a bound version of a method, creating it only if needed (lazy binding)
     * This prevents creating unnecessary bound functions for unused methods
     * @param {Function} method - The method to bind
     * @returns {Function} The bound method
     */
    _getBoundMethod(method) {
        // Check if we already have a bound version
        if (!this._boundMethods.has(method)) {
            // Create and cache the bound method only when first requested
            this._boundMethods.set(method, method.bind(this));
        }
        return this._boundMethods.get(method);
    }
    
    /**
     * Subscribe to an event and track the unsubscribe function
     * @param {string} event - Event name
     * @param {Function} handler - Event handler (will be bound lazily if needed)
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        // Lazily bind the handler only when it's actually used
        const boundHandler = this._getBoundMethod(handler);
        const unsubscribe = this.eventBus.on(event, boundHandler);
        this.unsubscribes.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * Subscribe to an async event and track the unsubscribe function
     * @param {string} event - Event name
     * @param {Function} handler - Async event handler (will be bound lazily if needed)
     * @returns {Function} Unsubscribe function
     */
    onAsync(event, handler) {
        // Lazily bind the handler only when it's actually used
        const boundHandler = this._getBoundMethod(handler);
        const unsubscribe = this.eventBus.onAsync(event, boundHandler);
        this.unsubscribes.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * Subscribe to an event that will only fire once
     * @param {string} event - Event name
     * @param {Function} handler - Event handler (will be bound lazily if needed)
     * @returns {Function} Unsubscribe function
     */
    once(event, handler) {
        // Lazily bind the handler only when it's actually used
        const boundHandler = this._getBoundMethod(handler);
        const unsubscribe = this.eventBus.once(event, boundHandler);
        this.unsubscribes.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * Subscribe to an exclusive event (only one handler allowed)
     * @param {string} event - Event name
     * @param {Function} handler - Event handler (will be bound lazily if needed)
     * @returns {Function} Unsubscribe function
     */
    onExclusive(event, handler) {
        // Check if eventBus supports onExclusive
        if (typeof this.eventBus.onExclusive !== 'function') {
            throw new Error('EventBus does not support onExclusive method');
        }
        
        // Lazily bind the handler only when it's actually used
        const boundHandler = this._getBoundMethod(handler);
        const unsubscribe = this.eventBus.onExclusive(event, boundHandler);
        this.unsubscribes.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * Emit an event (passthrough to eventBus)
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        return this.eventBus.emit(event, data);
    }
    
    /**
     * Emit an async event (passthrough to eventBus)
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @returns {Promise<*>} Response from handler
     */
    emitAsync(event, data) {
        return this.eventBus.emitAsync(event, data);
    }
    
    /**
     * Clean up all event listeners
     * Should be called when the component is destroyed
     */
    cleanup() {
        // Unsubscribe all tracked listeners
        for (const unsubscribe of this.unsubscribes) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        
        // Clear the array and bound methods cache
        this.unsubscribes = [];
        this._boundMethods.clear();
    }
    
    /**
     * Destroy the component (alias for cleanup)
     */
    destroy() {
        this.cleanup();
    }
}