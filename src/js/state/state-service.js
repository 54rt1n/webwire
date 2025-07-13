import { StateValidator } from './state-validator.js';
import { createInitialState } from './state-container.js';

import { AIMStatePlugin } from './plugins/aim-state.js';
import { ConversationStatePlugin } from './plugins/conversation-state.js';
import { DiskStatePlugin } from './plugins/disk-state.js';
import { MCPStatePlugin } from './plugins/mcp-state.js';
import { SettingsStatePlugin } from './plugins/settings-state.js';
import { StashStatePlugin } from './plugins/stash-state.js';
import { UiStatePlugin } from './plugins/ui-state.js';

/**
 * Centralized state management service using a plugin architecture.
 * Manages conversations, settings, MCP connections, UI state, stash storage, and persistence
 * with automatic state validation and event-driven updates.
 * 
 * @example
 * const stateService = new StateService(eventBus, storage, EVENT_CONTEXT.BACKGROUND);
 * stateService.initialize();
 * 
 * // Access plugin functionality
 * stateService.conversation.storeMessage(conversationId, userMsg, aiMsg);
 * stateService.settings.saveToStorage();
 * stateService.mcp.setMcpConnected(true);
 * stateService.stash.append('item', 'key1', 'key2');
 * 
 * // State is automatically persisted and validated
 */
class StateService {
    /**
     * Create a StateService instance with required dependencies
     * @param {Object} eventBus - Event bus instance for inter-component communication
     * @param {Object} storage - Storage adapter for persistence operations
     * @throws {Error} If eventBus or storage are not provided
     */
    constructor(eventBus, storage) {
        if (!eventBus || !storage) {
            throw new Error('Event bus and storage are required');
        }

        this.eventBus = eventBus;
        this.storage = storage;

        // Initialize state with default structure
        this.state = createInitialState();

        // Initialize plugins
        this.disk = new DiskStatePlugin(this);
        this.settings = new SettingsStatePlugin(this);
        this.aim = new AIMStatePlugin(this);
        this.conversation = new ConversationStatePlugin(this);
        this.mcp = new MCPStatePlugin(this);
        this.stash = new StashStatePlugin(this);
        this.ui = new UiStatePlugin(this);

        this.validator = new StateValidator();
    }

    /**
     * Initialize the state service and its plugins
     * Performs any necessary setup operations for the state management system
     */
    initialize() {
        console.log('[StateService]', 'StateService initialized');
    }

    // ==== UTILITY & STATUS METHODS ====

    /**
     * Check if the state is empty or uninitialized
     * @returns {boolean} True if state is empty, false otherwise
     * @deprecated This method currently always returns false and may be removed
     */
    isEmpty() {
        return false;
    }
}

class ContentStateService {
    /**
     * Create a StateService instance with required dependencies
     * @param {Object} initialState - Initial state object
     * @param {Object} eventBus - Event bus instance for inter-component communication
     * @throws {Error} If eventBus or initial state are not provided
     */
    constructor(initialState, eventBus) {
        if (!eventBus || !initialState) {
            throw new Error('Event bus and initial state are required');
        }

        this.eventBus = eventBus;

        // Initialize state with default structure
        this.state = initialState;

        // Initialize plugins
        this.settings = new SettingsStatePlugin(this);
        this.aim = new AIMStatePlugin(this);
        this.conversation = new ConversationStatePlugin(this);
        this.mcp = new MCPStatePlugin(this);
        this.stash = new StashStatePlugin(this);
        this.ui = new UiStatePlugin(this);

        this.validator = new StateValidator();
    }

    /**
     * Initialize the state service and its plugins
     * Performs any necessary setup operations for the state management system
     */
    initialize() {
        console.log('[ContentStateService]', 'ContentStateService initialized');
    }

    /**
     * Set the state
     */
    setState(state) {
        this.state = state;
    }

    // ==== UTILITY & STATUS METHODS ====

    /**
     * Check if the state is empty or uninitialized
     * @returns {boolean} True if state is empty, false otherwise
     * @deprecated This method currently always returns false and may be removed
     */
    isEmpty() {
        return false;
    }
}

export { StateService, ContentStateService }; 