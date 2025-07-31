import { describe, it, expect, beforeEach } from 'vitest';
import { StateValidator } from '../../../src/js/state/state-validator.js';
import { createInitialState } from '../../../src/js/state/state-container.js';
import { TestStateFactory } from './conftest.js';

describe('StateValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new StateValidator();
    });

    describe('constructor', () => {
        it('should create validator instance', () => {
            expect(validator).toBeInstanceOf(StateValidator);
        });
    });

    describe('validate', () => {
        it('should validate complete valid state', () => {
            const state = createInitialState();
            const result = validator.validate(state);

            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should reject null state', () => {
            const result = validator.validate(null);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('State is null or undefined.');
        });

        it('should reject undefined state', () => {
            const result = validator.validate(undefined);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('State is null or undefined.');
        });

        it('should reject state missing session', () => {
            const state = createInitialState();
            delete state.session;
            const result = validator.validate(state);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Session is missing or not an object.');
        });

        it('should reject state with non-object session', () => {
            const state = createInitialState();
            state.session = 'invalid';
            const result = validator.validate(state);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Session is missing or not an object.');
        });

        it('should reject state missing settings', () => {
            const state = createInitialState();
            delete state.settings;
            const result = validator.validate(state);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Settings is missing or not an object.');
        });

        it('should reject state with non-object settings', () => {
            const state = createInitialState();
            state.settings = 'invalid';
            const result = validator.validate(state);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Settings is missing or not an object.');
        });

        it('should collect multiple errors', () => {
            const state = {
                session: 'invalid',
                settings: null
            };
            const result = validator.validate(state);

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors).toContain('Session is missing or not an object.');
            expect(result.errors).toContain('Settings is missing or not an object.');
        });

        it('should validate state with custom configuration', () => {
            const state = TestStateFactory.createStateWithSettings({
                ai: {
                    models: {
                        chat: {
                            model: 'gpt-4',
                            provider: 'openai'
                        }
                    }
                }
            });
            const result = validator.validate(state);

            expect(result.isValid).toBe(true);
        });
    });

    describe('isPartValid', () => {
        let state;

        beforeEach(() => {
            state = createInitialState();
        });

        it('should return false for missing state', () => {
            expect(validator.isPartValid(null, 'session')).toBe(false);
            expect(validator.isPartValid(undefined, 'session')).toBe(false);
        });

        it('should return false for missing part', () => {
            delete state.session;
            expect(validator.isPartValid(state, 'session')).toBe(false);
        });

        describe('session validation', () => {
            it('should validate valid session', () => {
                state.session.name = 'test-session';
                expect(validator.isPartValid(state, 'session')).toBe(true);
            });

            it('should reject session without name', () => {
                delete state.session.name;
                expect(validator.isPartValid(state, 'session')).toBe(false);
            });

            it('should reject session with non-string name', () => {
                state.session.name = 123;
                expect(validator.isPartValid(state, 'session')).toBe(false);
            });

            it('should reject non-object session', () => {
                state.session = 'invalid';
                expect(validator.isPartValid(state, 'session')).toBe(false);
            });
        });

        describe('settings validation', () => {
            it('should validate valid settings', () => {
                state.settings.name = 'test-settings';
                expect(validator.isPartValid(state, 'settings')).toBe(true);
            });

            it('should reject settings without name', () => {
                delete state.settings.name;
                expect(validator.isPartValid(state, 'settings')).toBe(false);
            });

            it('should reject settings with non-string name', () => {
                state.settings.name = 123;
                expect(validator.isPartValid(state, 'settings')).toBe(false);
            });

            it('should reject non-object settings', () => {
                state.settings = 'invalid';
                expect(validator.isPartValid(state, 'settings')).toBe(false);
            });
        });

        it('should return false for unknown parts', () => {
            expect(validator.isPartValid(state, 'unknown')).toBe(false);
            expect(validator.isPartValid(state, 'conversation')).toBe(false);
            expect(validator.isPartValid(state, 'mcp')).toBe(false);
        });

        it('should handle empty part name', () => {
            expect(validator.isPartValid(state, '')).toBe(false);
        });

        it('should handle null part name', () => {
            expect(validator.isPartValid(state, null)).toBe(false);
        });
    });

    describe('validation consistency', () => {
        it('should have consistent validation between validate and isPartValid for session', () => {
            const state = createInitialState();
            state.session.name = 'test-session';
            
            const fullResult = validator.validate(state);
            const partResult = validator.isPartValid(state, 'session');
            
            expect(fullResult.isValid).toBe(true);
            expect(partResult).toBe(true);
        });

        it('should have consistent validation between validate and isPartValid for settings', () => {
            const state = createInitialState();
            state.settings.name = 'test-settings';
            
            const fullResult = validator.validate(state);
            const partResult = validator.isPartValid(state, 'settings');
            
            expect(fullResult.isValid).toBe(true);
            expect(partResult).toBe(true);
        });

        it('should handle invalid session consistently', () => {
            const state = createInitialState();
            delete state.session;
            
            const fullResult = validator.validate(state);
            const partResult = validator.isPartValid(state, 'session');
            
            expect(fullResult.isValid).toBe(false);
            expect(partResult).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle empty state object', () => {
            const result = validator.validate({});

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Session is missing or not an object.');
            expect(result.errors).toContain('Settings is missing or not an object.');
        });

        it('should handle state with extra properties', () => {
            const state = createInitialState();
            state.session.name = 'test-session';
            state.settings.name = 'test-settings';
            state.extraProperty = 'should not affect validation';
            
            const result = validator.validate(state);
            expect(result.isValid).toBe(true);
        });

        it('should handle deeply nested session object', () => {
            const state = createInitialState();
            state.session = {
                name: 'test-session',
                nested: {
                    deep: {
                        property: 'value'
                    }
                }
            };
            
            expect(validator.isPartValid(state, 'session')).toBe(true);
        });

        it('should handle deeply nested settings object', () => {
            const state = createInitialState();
            state.settings = {
                name: 'test-settings',
                ai: {
                    models: {
                        chat: {
                            model: 'gpt-4',
                            provider: 'openai'
                        }
                    }
                }
            };
            
            expect(validator.isPartValid(state, 'settings')).toBe(true);
        });
    });
});