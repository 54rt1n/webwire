import { logger } from '../core/logging.js';

/**
 * StateValidator - Validates the structure and content of game state objects.
 */
export class StateValidator {
    constructor() {
        logger.log(this, 'Initialized.');
    }

    /**
     * Validates a state object.
     * @param {object} state - The state object to validate.
     * @returns {{isValid: boolean, errors: string[]}} - An object containing the validation result and a list of errors.
     */
    validate(state) {
        const errors = [];

        if (!state) {
            errors.push('State is null or undefined.');
            return { isValid: false, errors };
        }

        // Validate session
        if (!state.session || typeof state.session !== 'object') {
            errors.push('Session is missing or not an object.');
        }

        // Validate settings
        if (!state.settings || typeof state.settings !== 'object') {
            errors.push('Settings is missing or not an object.');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Checks if a specific part of the state is valid.
     * @param {object} state - The full state.
     * @param {string} part - The part of the state to check (e.g., 'session', 'settings').
     * @returns {boolean} - True if the part is valid.
     */
    isPartValid(state, part) {
        if (!state || !state[part]) {
            return false;
        }

        switch (part) {
            case 'session':
                return typeof state.session === 'object' && typeof state.session.name === 'string';
            case 'settings':
                return typeof state.settings === 'object' && typeof state.settings.name === 'string';
            default:
                return false; // Assume invalid if not a specific check
        }
    }
} 