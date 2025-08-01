import { createInitialState, serializeState, deserializeState } from '../state-container.js';
import { logger } from '../../core/logging.js';

/**
 * Plugin for handling state loading, saving, and serialization
 */
export class DiskStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
        this.stateAdapter = stateService.storage.state;
    }

    /**
     * Save current state
     */
    async saveToStorage() {
        try {
            const { mcp, aim, conversation, ...rest } = this.stateService.state;
            const saveData = serializeState({
                mcp,
                aim,
                conversation,
                ...rest,
            });
            saveData.timestamp = Date.now();

            await this.stateAdapter.save(saveData);
            this.stateService.state.session.lastSaved = Date.now();
            logger.log('StateService::DiskState', 'State saved', saveData, conversation);

        } catch (error) {
            logger.error('StateService::DiskState', 'Save failed:', error);
        }
    }

    /**
     * snake to camel case
     *   Converts the keys of an object from snake_case to camelCase, while preserving the values
     * @param {Object} data - The data to convert
     */
    snakeToCamel(data) {
        return Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
                key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), 
                value
            ])
        );
    }

    /**
     * Load state from storage
     */
    async loadFromStorage() {
        const savedState = await this.stateAdapter.load();
        if (!savedState) {
            logger.log('StateService::DiskState', 'No saved state found');
            return false;
        }

        return this.deserialize(savedState);
    }

    /**
     * Update state from storage
     */
    async updateFromStorage() {
        const savedState = await this.stateAdapter.load();
        if (!savedState) {
            logger.log('StateService::DiskState', 'No saved state found for update');
            return false;
        }

        try {
            if (!savedState) {
                logger.log('StateService::DiskState', 'No data to restore', savedState);
                throw new Error('No data to restore');
            }
            const stateToRestore = {
                mcp: savedState.mcp,
                aim: savedState.aim,
                conversation: savedState.conversation,
            };

            logger.log('StateService::DiskState', 'State to restore:', stateToRestore, savedState);

            return this.deserialize(stateToRestore);
        } catch (error) {
            logger.error('StateService::DiskState', 'Failed to update from storage:', error);
            throw error;
        }
    }

    /**
     * Update last active time
     */
    updateLastActiveTime() {
        this.stateService.state.session.lastActive = Date.now();
    }

    /**
     * Deserialize saved state
     */
    deserialize(saveData) {
        try {
            this.stateService.state = deserializeState(
                saveData, 
                this.stateService.state, 
            );
            this.stateService.disk.updateLastActiveTime();
            logger.log('StateService::DiskState', 'State loaded from save data');
            return true;
        } catch (error) {
            logger.error('StateService::DiskState', 'Failed to load from save:', error);
            return false;
        }
    }

    /**
     * Reset State
     */
    resetState() {
        this.stateService.state = createInitialState();
    }
} 