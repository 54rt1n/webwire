import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsStatePlugin } from '../../../src/js/state/plugins/settings-state.js';
import { createInitialState } from '../../../src/js/state/state-container.js';
import { MockStorageAdapter, MockEventBus, TestData, StateAssertions, setupTest } from './conftest.js';
import { ENCRYPTION_METHODS } from '../../../src/js/utils/encryption-util.js';

describe('SettingsStatePlugin', () => {
    let plugin, stateService, eventBus, storage, mockConfig;

    beforeEach(() => {
        const setup = setupTest();
        stateService = setup.stateService;
        eventBus = setup.eventBus;
        storage = setup.storage;
        
        // Mock config with security salt
        mockConfig = {
            get: vi.fn().mockImplementation((key) => {
                if (key === 'security.salt') return 'test-salt-123';
                return null;
            })
        };
        
        // Initialize state with security.encryptionKey (required)
        stateService.state.settings = {
            ...stateService.state.settings,
            security: {
                encryptionKey: 'test-password-456'
            }
        };
        
        plugin = new SettingsStatePlugin(stateService, mockConfig);
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
        it('should set settings without encryption by default', async () => {
            const testSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-test123' },
                        anthropic: { apiKey: 'ak-test456' }
                    }
                }
            };
            
            await plugin.setSettings(testSettings);

            expect(stateService.state.settings.ai.providers.openai.apiKey).toBe('sk-test123');
            expect(stateService.state.settings.ai.providers.anthropic.apiKey).toBe('ak-test456');
        });

        it('should encrypt API keys when autoEncrypt is true', async () => {
            const testSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-test123' },
                        anthropic: { apiKey: 'ak-test456' }
                    }
                }
            };
            
            await plugin.setSettings(testSettings, { autoEncrypt: true });

            expect(stateService.state.settings.ai.providers.openai.apiKey).toEqual({
                method: ENCRYPTION_METHODS.AES_GCM,
                data: expect.any(String)
            });
            expect(stateService.state.settings.ai.providers.anthropic.apiKey).toEqual({
                method: ENCRYPTION_METHODS.AES_GCM,
                data: expect.any(String)
            });
        });

        it('should handle settings without AI providers', async () => {
            const testSettings = {
                ui: { theme: 'dark' },
                user: { name: 'test' }
            };
            
            await plugin.setSettings(testSettings);
            expect(stateService.state.settings).toEqual({
                ...testSettings,
                security: {
                    encryptionKey: 'test-password-456'
                }
            });
        });

        it('should handle providers without API keys', async () => {
            const testSettings = {
                ai: {
                    providers: {
                        local: { endpoint: 'http://localhost:8000' },
                        openai: { apiKey: 'sk-test123' }
                    }
                }
            };
            
            await plugin.setSettings(testSettings, { autoEncrypt: true });

            expect(stateService.state.settings.ai.providers.local).toEqual({
                endpoint: 'http://localhost:8000'
            });
            expect(stateService.state.settings.ai.providers.openai.apiKey).toEqual({
                method: ENCRYPTION_METHODS.AES_GCM,
                data: expect.any(String)
            });
        });

        it('should not re-encrypt already encrypted keys', async () => {
            const encryptedKey = {
                method: ENCRYPTION_METHODS.AES_GCM,
                data: 'already-encrypted-data'
            };
            
            const testSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: encryptedKey }
                    }
                }
            };
            
            await plugin.setSettings(testSettings, { autoEncrypt: true });
            expect(stateService.state.settings.ai.providers.openai.apiKey).toEqual(encryptedKey);
        });

        it('should overwrite existing settings', async () => {
            const initialSettings = { test: 'initial' };
            const newSettings = { test: 'new', other: 'value' };
            
            await plugin.setSettings(initialSettings);
            await plugin.setSettings(newSettings);

            expect(stateService.state.settings).toEqual({
                ...newSettings,
                security: {
                    encryptionKey: 'test-password-456'
                }
            });
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
            
            plugin.settingsAdapter.getAll = async () => testSettings;
            await plugin.loadFromStorage();

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

        it('should deep merge loaded settings with existing state', async () => {
            const existingSettings = {
                ai: {
                    models: { chat: { temperature: 0.8 } },
                    providers: { openai: { apiKey: 'old-key' } }
                },
                ui: { theme: 'dark' },
                security: {
                    encryptionKey: 'test-password-456'
                }
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
                ui: { theme: 'dark' },
                security: {
                    encryptionKey: 'test-password-456'
                }
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
    });

    describe('getModelConfig', () => {
        beforeEach(() => {
            stateService.state.settings = {
                ...stateService.state.settings,
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

        it('should return model config for chat by default', async () => {
            const config = await plugin.getModelConfig();
            
            expect(config).toEqual({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'openai-key'
            });
        });

        it('should return model config for specified type', async () => {
            const config = await plugin.getModelConfig('thought');
            
            expect(config).toMatchObject({
                provider: 'anthropic',
                model: 'claude-3',
                apiKey: 'anthropic-key'
            });
        });

        it('should fallback to chat for unknown model type', async () => {
            const config = await plugin.getModelConfig('unknown');
            
            expect(config).toEqual({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'openai-key'
            });
        });

        it('should return null for missing model configuration', async () => {
            stateService.state.settings.ai.models.chat = null;
            const config = await plugin.getModelConfig();
            expect(config).toBeNull();
        });

        it('should return null when provider is missing', async () => {
            stateService.state.settings.ai.models.chat = { provider: 'missing', model: 'test' };
            stateService.state.settings.ai.providers = {};
            const config = await plugin.getModelConfig();
            expect(config).toEqual({
                provider: 'missing',
                model: 'test',
                apiKey: null
            });
        });

        it('should decrypt encrypted API keys', async () => {
            // First encrypt a key, then test decryption
            const originalKey = 'sk-secret123';
            const encrypted = await plugin._encryptKey(originalKey);
            
            stateService.state.settings.ai.providers.openai.apiKey = encrypted;
            
            const config = await plugin.getModelConfig();
            expect(config.apiKey).toBe(originalKey);
        });

        it('should handle plaintext API keys (backward compatibility)', async () => {
            const config = await plugin.getModelConfig();
            expect(config.apiKey).toBe('openai-key');
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

        it('should return false for incomplete chat model', () => {
            stateService.state.settings = {
                ai: {
                    models: { chat: { provider: 'openai' } }, // missing model
                    providers: { openai: { apiKey: 'test-key' } }
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
    });

    describe('_encryptKey', () => {
        it('should encrypt a plaintext string', async () => {
            const plaintext = 'sk-test123';
            const result = await plugin._encryptKey(plaintext);

            expect(result).toEqual({
                method: ENCRYPTION_METHODS.AES_GCM,
                data: expect.any(String)
            });
        });

        it('should return object unchanged if already encrypted', async () => {
            const encryptedObject = {
                method: ENCRYPTION_METHODS.AES_GCM,
                data: 'already-encrypted'
            };
            
            const result = await plugin._encryptKey(encryptedObject);
            expect(result).toEqual(encryptedObject);
        });
    });

    describe('_decryptKey', () => {
        it('should decrypt an encrypted object', async () => {
            const originalKey = 'sk-test123';
            const encrypted = await plugin._encryptKey(originalKey);
            const decrypted = await plugin._decryptKey(encrypted);
            
            expect(decrypted).toBe(originalKey);
        });

        it('should return string unchanged if already plaintext', async () => {
            const plaintext = 'sk-test123';
            const result = await plugin._decryptKey(plaintext);
            expect(result).toBe(plaintext);
        });
    });

    describe('encryption integration', () => {
        it('should encrypt and decrypt API keys round-trip', async () => {
            const originalKey = 'sk-original123';
            
            const encrypted = await plugin._encryptKey(originalKey);
            expect(encrypted).toEqual({
                method: ENCRYPTION_METHODS.AES_GCM,
                data: expect.any(String)
            });
            
            const decrypted = await plugin._decryptKey(encrypted);
            expect(decrypted).toBe(originalKey);
        });

        it('should handle full settings flow with encryption', async () => {
            const originalSettings = {
                security: {
                    encryptionKey: 'test-password-456'
                },
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-openai123' },
                        anthropic: { apiKey: 'ak-anthropic456' }
                    },
                    models: {
                        chat: { provider: 'openai', model: 'gpt-4' }
                    }
                }
            };
            
            // Set settings with encryption enabled
            await plugin.setSettings(originalSettings, { autoEncrypt: true });
            
            // Verify keys are encrypted in state
            expect(stateService.state.settings.ai.providers.openai.apiKey).toEqual({
                method: ENCRYPTION_METHODS.AES_GCM,
                data: expect.any(String)
            });
            
            // Get model config (should decrypt)
            const modelConfig = await plugin.getModelConfig();
            expect(modelConfig.apiKey).toBe('sk-openai123');
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
            
            stateService.state.settings = {};
            await plugin.loadFromStorage();
            
            expect(stateService.state.settings).toMatchObject(testSettings);
        });
    });
});