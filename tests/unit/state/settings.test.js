import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsStatePlugin } from '../../../src/js/state/plugins/settings-state.js';
import { createInitialState } from '../../../src/js/state/state-container.js';
import { MockStorageAdapter, MockEventBus, TestData, StateAssertions, setupTest } from './conftest.js';

describe('SettingsStatePlugin', () => {
    let plugin, stateService, eventBus, storage;

    beforeEach(() => {
        const setup = setupTest();
        stateService = setup.stateService;
        eventBus = setup.eventBus;
        storage = setup.storage;
        
        plugin = new SettingsStatePlugin(stateService);
    });

    describe('constructor', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toStrictEqual(eventBus);
            expect(plugin.settingsAdapter).toStrictEqual(storage.settings);
        });

        it('should handle missing storage adapter', () => {
            const serviceWithoutStorage = {
                state: createInitialState(),
                eventBus,
                storage: null
            };
            
            const pluginWithoutStorage = new SettingsStatePlugin(serviceWithoutStorage);
            expect(pluginWithoutStorage.settingsAdapter).toBeUndefined();
        });
    });

    describe('setSettings', () => {
        it('should set settings in state', () => {
            const testSettings = TestData.createProviderConfig('openai');
            plugin.setSettings(testSettings);

            expect(stateService.state.settings).toEqual(testSettings);
        });

        it('should overwrite existing settings', () => {
            const initialSettings = { test: 'initial' };
            const newSettings = { test: 'new', other: 'value' };
            
            plugin.setSettings(initialSettings);
            plugin.setSettings(newSettings);

            expect(stateService.state.settings).toEqual(newSettings);
        });
    });

    describe('getSettings', () => {
        it('should return current settings', () => {
            const testSettings = TestData.createProviderConfig('openai');
            stateService.state.settings = testSettings;

            const result = plugin.getSettings();
            expect(result).toEqual(testSettings);
        });

        it('should return initial settings when none set', () => {
            const result = plugin.getSettings();
            expect(result).toEqual(stateService.state.settings);
        });
    });

    describe('loadFromStorage', () => {
        it('should load settings from storage adapter', async () => {
            const testSettings = {
                ai: {
                    models: { chat: { provider: 'openai', model: 'gpt-4' } },
                    providers: { openai: { apiKey: 'test-key' } }
                }
            };
            
            // Set up the mock to return test settings
            plugin.settingsAdapter.getAll = async () => testSettings;
            await plugin.loadFromStorage();

            // Should deep merge with initial state, so check the merged values
            expect(stateService.state.settings.ai.models.chat.provider).toBe('openai');
            expect(stateService.state.settings.ai.models.chat.model).toBe('gpt-4');
            expect(stateService.state.settings.ai.providers.openai.apiKey).toBe('test-key');
        });

        it('should handle missing storage adapter gracefully', async () => {
            plugin.settingsAdapter = null;
            const result = await plugin.loadFromStorage();

            expect(result).toEqual({});
        });

        it('should handle storage errors gracefully', async () => {
            plugin.settingsAdapter.getAll = () => { throw new Error('Storage error'); };
            
            const result = await plugin.loadFromStorage();
            expect(result).toEqual({});
            expect(stateService.state.settings).toEqual({});
        });

        it('should preserve existing settings when no storage data', async () => {
            const initialSettings = stateService.state.settings;
            storage.settings.data = {};
            
            const result = await plugin.loadFromStorage();
            expect(result).toEqual(initialSettings);
        });

        it('should deep merge loaded settings with existing state', async () => {
            const existingSettings = {
                ai: {
                    models: { chat: { temperature: 0.8 } },
                    providers: { openai: { apiKey: 'old-key' } }
                },
                ui: { theme: 'dark' }
            };
            
            const loadedSettings = {
                ai: {
                    models: { chat: { provider: 'openai', model: 'gpt-4' } },
                    providers: { openai: { apiKey: 'new-key' } }
                }
            };
            
            stateService.state.settings = existingSettings;
            plugin.settingsAdapter.getAll = async () => loadedSettings;
            
            await plugin.loadFromStorage();

            expect(stateService.state.settings).toEqual({
                ai: {
                    models: { 
                        chat: { 
                            temperature: 0.8,
                            provider: 'openai',
                            model: 'gpt-4'
                        }
                    },
                    providers: { openai: { apiKey: 'new-key' } }
                },
                ui: { theme: 'dark' }
            });
        });
    });

    describe('saveToStorage', () => {
        it('should save settings to storage adapter', async () => {
            const testSettings = TestData.createProviderConfig('openai');
            stateService.state.settings = testSettings;

            await plugin.saveToStorage();

            StateAssertions.assertStorageCalled(plugin.settingsAdapter, 'setAll');
            const setAllCall = plugin.settingsAdapter.calls.find(c => c.method === 'setAll');
            expect(setAllCall.value).toEqual(testSettings);
        });

        it('should handle missing storage adapter gracefully', async () => {
            plugin.settingsAdapter = null;
            await expect(plugin.saveToStorage()).resolves.toBeUndefined();
        });

        it('should propagate storage errors', async () => {
            plugin.settingsAdapter.setAll = async () => { throw new Error('Storage error'); };
            
            await expect(plugin.saveToStorage()).rejects.toThrow('Storage error');
        });

        it('should verify save by reading back', async () => {
            const testSettings = TestData.createProviderConfig('anthropic');
            stateService.state.settings = testSettings;

            await plugin.saveToStorage();

            const getAllCalls = plugin.settingsAdapter.calls.filter(c => c.method === 'getAll');
            expect(getAllCalls).toHaveLength(1);
        });
    });

    describe('patchSettings', () => {
        it('should merge patch into existing settings', () => {
            const existingSettings = {
                ai: {
                    models: { chat: { temperature: 0.8 } },
                    providers: { openai: { apiKey: 'old-key' } }
                },
                ui: { theme: 'dark' }
            };
            
            const patch = {
                ai: {
                    models: { chat: { provider: 'openai', model: 'gpt-4' } },
                    providers: { openai: { apiKey: 'new-key' } }
                }
            };
            
            stateService.state.settings = existingSettings;
            plugin.patchSettings(patch);

            expect(stateService.state.settings).toEqual({
                ai: {
                    models: { 
                        chat: { 
                            temperature: 0.8,
                            provider: 'openai',
                            model: 'gpt-4'
                        }
                    },
                    providers: { openai: { apiKey: 'new-key' } }
                },
                ui: { theme: 'dark' }
            });
        });

        it('should handle empty existing settings', () => {
            stateService.state.settings = null;
            const patch = { ai: { models: { chat: { provider: 'openai' } } } };
            
            plugin.patchSettings(patch);
            expect(stateService.state.settings).toEqual(patch);
        });

        it('should handle empty patch', () => {
            const existingSettings = { test: 'value' };
            stateService.state.settings = existingSettings;
            
            plugin.patchSettings({});
            expect(stateService.state.settings).toEqual(existingSettings);
        });
    });

    describe('deepMerge', () => {
        it('should merge nested objects', () => {
            const target = {
                a: { b: 1, c: 2 },
                d: 3
            };
            const source = {
                a: { b: 10, e: 4 },
                f: 5
            };
            
            const result = plugin.deepMerge(target, source);
            expect(result).toEqual({
                a: { b: 10, c: 2, e: 4 },
                d: 3,
                f: 5
            });
        });

        it('should handle arrays as values', () => {
            const target = { arr: [1, 2, 3] };
            const source = { arr: [4, 5, 6] };
            
            const result = plugin.deepMerge(target, source);
            expect(result).toEqual({ arr: [4, 5, 6] });
        });

        it('should handle null and undefined values', () => {
            const target = { a: 1, b: null };
            const source = { b: 2, c: undefined };
            
            const result = plugin.deepMerge(target, source);
            expect(result).toEqual({ a: 1, b: 2, c: undefined });
        });
    });

    describe('getModelConfig', () => {
        beforeEach(() => {
            stateService.state.settings = {
                ai: {
                    models: {
                        chat: { provider: 'openai', model: 'gpt-4' },
                        thought: { provider: 'anthropic', model: 'claude-3' }
                    },
                    providers: {
                        openai: { apiKey: 'openai-key', endpoint: 'https://api.openai.com' },
                        anthropic: { apiKey: 'anthropic-key' }
                    }
                }
            };
        });

        it('should return model config for chat by default', () => {
            const config = plugin.getModelConfig();
            
            expect(config).toEqual({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'openai-key',
                endpoint: 'https://api.openai.com'
            });
        });

        it('should return model config for specified type', () => {
            const config = plugin.getModelConfig('thought');
            
            expect(config).toEqual({
                provider: 'anthropic',
                model: 'claude-3',
                apiKey: 'anthropic-key'
            });
        });

        it('should fallback to chat for unknown model type', () => {
            const config = plugin.getModelConfig('unknown');
            
            expect(config).toEqual({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'openai-key',
                endpoint: 'https://api.openai.com'
            });
        });

        it('should return null for missing model configuration', () => {
            stateService.state.settings.ai.models.chat = null;
            const config = plugin.getModelConfig();
            
            expect(config).toBeNull();
        });

        it('should return config even with missing provider', () => {
            stateService.state.settings.ai.models.chat = { provider: 'missing', model: 'test' };
            stateService.state.settings.ai.providers = {}; // No providers configured
            const config = plugin.getModelConfig();
            
            // Returns the model config merged with undefined provider (actual behavior)
            expect(config).toEqual({ provider: 'missing', model: 'test' });
        });

        it('should handle missing settings gracefully', () => {
            stateService.state.settings = null;
            const config = plugin.getModelConfig();
            
            expect(config).toBeNull();
        });
    });

    describe('getCurrentModelConfig', () => {
        beforeEach(() => {
            stateService.state.settings = {
                ai: {
                    models: {
                        chat: { provider: 'openai', model: 'gpt-4' },
                        code: { provider: 'anthropic', model: 'claude-3' }
                    },
                    providers: {
                        openai: { apiKey: 'openai-key' },
                        anthropic: { apiKey: 'anthropic-key' }
                    }
                }
            };
            
            // Mock the UI plugin
            stateService.ui = {
                getSelectedModel: () => 'code'
            };
        });

        it('should return config for currently selected model', () => {
            const config = plugin.getCurrentModelConfig();
            
            expect(config).toEqual({
                provider: 'anthropic',
                model: 'claude-3',
                apiKey: 'anthropic-key'
            });
        });

        it('should fallback to chat when no model selected', () => {
            stateService.ui.getSelectedModel = () => null;
            
            const config = plugin.getCurrentModelConfig();
            expect(config.provider).toBe('openai');
        });
    });

    describe('isValid', () => {
        it('should return true for complete valid settings', () => {
            stateService.state.settings = {
                ai: {
                    models: {
                        chat: { provider: 'openai', model: 'gpt-4' }
                    },
                    providers: {
                        openai: { apiKey: 'test-key' }
                    }
                }
            };
            
            expect(plugin.isValid()).toBe(true);
        });

        it('should return false for missing settings', () => {
            stateService.state.settings = null;
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for missing AI configuration', () => {
            stateService.state.settings = {};
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for missing models', () => {
            stateService.state.settings = { ai: { providers: {} } };
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for missing providers', () => {
            stateService.state.settings = { ai: { models: {} } };
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for incomplete chat model', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'openai' } }, // missing model
                    providers: { openai: { apiKey: 'test-key' } }
                }
            };
            
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for missing provider configuration', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'missing', model: 'test' } },
                    providers: {}
                }
            };
            
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for missing API key', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'openai', model: 'gpt-4' } },
                    providers: { openai: {} } // missing apiKey
                }
            };
            
            expect(plugin.isValid()).toBe(false);
        });

        it('should return true for AIMind with complete configuration', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'aimind', model: 'test-model' } },
                    providers: { 
                        aimind: { 
                            apiEndpoint: 'https://api.aimind.com',
                            apiKey: 'test-key' 
                        }
                    }
                }
            };
            
            expect(plugin.isValid()).toBe(true);
        });

        it('should return false for AIMind missing endpoint', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'aimind', model: 'test-model' } },
                    providers: { 
                        aimind: { apiKey: 'test-key' } // missing apiEndpoint
                    }
                }
            };
            
            expect(plugin.isValid()).toBe(false);
        });

        it('should return false for AIMind missing API key', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'aimind', model: 'test-model' } },
                    providers: { 
                        aimind: { apiEndpoint: 'https://api.aimind.com' } // missing apiKey
                    }
                }
            };
            
            expect(plugin.isValid()).toBe(false);
        });
    });

    describe('storage integration', () => {
        it('should load and save settings round-trip', async () => {
            const testSettings = {
                ai: {
                    models: { chat: { provider: 'openai', model: 'gpt-4' } },
                    providers: { openai: { apiKey: 'test-key' } }
                }
            };
            
            stateService.state.settings = testSettings;
            await plugin.saveToStorage();
            
            // Reset state
            stateService.state.settings = {};
            await plugin.loadFromStorage();
            
            expect(stateService.state.settings).toMatchObject(testSettings);
        });

        it('should handle rapid save/load operations', async () => {
            const settings1 = { test: 'value1' };
            const settings2 = { test: 'value2' };
            
            stateService.state.settings = settings1;
            await plugin.saveToStorage();
            
            stateService.state.settings = settings2;
            await plugin.saveToStorage();
            
            stateService.state.settings = {};
            await plugin.loadFromStorage();
            
            expect(stateService.state.settings).toMatchObject(settings2);
        });
    });
});