import { StateValidator } from './state-validator.js';
import { createInitialState } from './state-container.js';

import { AIMStatePlugin } from './plugins/aim-state.js';
import { ConversationStatePlugin } from './plugins/conversation-state.js';
import { DiskStatePlugin } from './plugins/disk-state.js';
import { MCPStatePlugin } from './plugins/mcp-state.js';
import { SettingsStatePlugin } from './plugins/settings-state.js';
import { UiStatePlugin } from './plugins/ui-state.js';

/**
 * State Service - Centralized state management for Webwire
 * Uses a plugin architecture to manage different aspects of state.
 */
class StateService {
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
        this.ui = new UiStatePlugin(this);

        this.validator = new StateValidator();
    }

    initialize() {
        console.log('[StateService]', 'StateService initialized');
    }

    // ==== UTILITY & STATUS METHODS ====

    /**
     * Check if state is empty
     * @returns {boolean}
     */
    isEmpty() {
        return false;
    }
}

export { StateService }; 