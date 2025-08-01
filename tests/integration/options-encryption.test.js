import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsStatePlugin } from '../../src/js/state/plugins/settings-state.js';
import { createInitialSettingsState } from '../../src/js/state/state-container.js';
import { AppConfig } from '../../src/js/core/app-config.js';
import { EventBus } from '../../src/js/core/event-bus.js';

/**
 * Integration tests for Options page encryption flow
 * Tests the complete flow: StateService -> Storage with encryption
 * We skip the DOM-based OptionsPanel since that would require full browser environment
 */

// Mock Storage Adapter (only thing we need to mock)
class MockStorageAdapter {
    constructor() { 
        this.data = {}; 
    }
    
    async getAll() { 
        return { ...this.data }; 
    }
    
    async setAll(data) { 
        this.data = { ...data }; 
    }
}

// Real StateService with mock storage
class TestStateService {
    constructor() {
        this.eventBus = new EventBus();
        this.storage = { settings: new MockStorageAdapter() };
        this.state = { settings: createInitialSettingsState() };
        
        // Add security config for encryption
        this.state.settings.security = { encryptionKey: 'test-password-123' };
        
        const config = new AppConfig({
            security: { salt: 'test-salt-456' }
        });
        
        // Use real SettingsStatePlugin
        this.settings = new SettingsStatePlugin(this, config);
    }
}

describe('Options Page Encryption Integration', () => {
    let stateService;

    beforeEach(() => {
        // Create real StateService with mock storage
        stateService = new TestStateService();
    });

    describe('Complete Encryption Flow', () => {
        it('should encrypt API keys when saving with autoEncrypt: true', async () => {
            // Arrange: Create test settings with plaintext API keys
            const testSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-test123456789' },
                        anthropic: { apiKey: 'ant-test987654321' },
                        featherless: { apiKey: 'fl-testabc123' }
                    },
                    models: {
                        chat: {
                            model: 'gpt-4',
                            provider: 'openai'
                        }
                    }
                },
                aim: {
                    userName: 'TestUser',
                    personaName: 'TestBot'
                },
                ui: { autoInject: true },
                crashReportingEnabled: false
            };

            // Act: Save settings with encryption enabled
            await stateService.settings.setSettings(testSettings, { autoEncrypt: true });
            await stateService.settings.saveToStorage();

            // Assert: Verify that API keys are encrypted in storage
            const storageData = await stateService.storage.settings.getAll();
            
            const openaiKey = storageData.ai?.providers?.openai?.apiKey;
            const anthropicKey = storageData.ai?.providers?.anthropic?.apiKey;
            const featherlessKey = storageData.ai?.providers?.featherless?.apiKey;

            expect(openaiKey).toEqual({
                method: 'AES-GCM',
                data: expect.any(String)
            });
            
            expect(anthropicKey).toEqual({
                method: 'AES-GCM', 
                data: expect.any(String)
            });
            
            expect(featherlessKey).toEqual({
                method: 'AES-GCM',
                data: expect.any(String)
            });
        });

        it('should decrypt API keys correctly in getModelConfig()', async () => {
            // Arrange: Save encrypted settings
            const testSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-test123456789' }
                    },
                    models: {
                        chat: {
                            model: 'gpt-4',
                            provider: 'openai'
                        }
                    }
                }
            };

            await stateService.settings.setSettings(testSettings, { autoEncrypt: true });
            await stateService.settings.saveToStorage();

            // Act: Load settings and get model config
            await stateService.settings.loadFromStorage();
            // Restore security config that's needed for decryption (in real app this comes from initial state)
            stateService.state.settings.security = { encryptionKey: 'test-password-123' };
            
            const modelConfig = await stateService.settings.getModelConfig('chat');

            // Assert: API key should be decrypted
            expect(modelConfig).toBeDefined();
            expect(modelConfig.apiKey).toBe('sk-test123456789');
        });

        it('should handle mixed encrypted and plaintext keys', async () => {
            // Arrange: Settings with both encrypted and plaintext keys
            const mixedSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-plaintext-key' },
                        anthropic: { 
                            apiKey: {
                                method: 'AES-GCM',
                                data: 'already-encrypted-data'
                            }
                        }
                    }
                }
            };

            // Act: Save with autoEncrypt - should only encrypt the plaintext key
            await stateService.settings.setSettings(mixedSettings, { autoEncrypt: true });
            await stateService.settings.saveToStorage();

            // Assert: Check storage data
            const storageData = await stateService.storage.settings.getAll();
            
            // Both should now be encrypted objects
            expect(storageData.ai.providers.openai.apiKey).toEqual({
                method: 'AES-GCM',
                data: expect.any(String)
            });
            
            expect(storageData.ai.providers.anthropic.apiKey).toEqual({
                method: 'AES-GCM', 
                data: 'already-encrypted-data' // Unchanged since already encrypted
            });
        });

        it('should handle settings with no API keys gracefully', async () => {
            // Arrange: Settings without API keys
            const settingsWithoutKeys = {
                ai: {
                    providers: {
                        openai: {},
                        anthropic: { apiEndpoint: 'https://api.anthropic.com' }
                    },
                    models: {
                        chat: { model: 'gpt-4', provider: 'openai' }
                    }
                }
            };

            // Act: Save with autoEncrypt
            await stateService.settings.setSettings(settingsWithoutKeys, { autoEncrypt: true });
            await stateService.settings.saveToStorage();

            // Assert: Should not throw and should save properly
            const storageData = await stateService.storage.settings.getAll();
            expect(storageData.ai.providers.openai.apiKey).toBeUndefined();
            expect(storageData.ai.providers.anthropic.apiEndpoint).toBe('https://api.anthropic.com');
        });

        it('should complete full round-trip encryption flow', async () => {
            // Arrange: Original plaintext settings
            const originalSettings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'sk-original123' },
                        anthropic: { apiKey: 'ant-original456' }
                    },
                    models: {
                        chat: { model: 'gpt-4', provider: 'openai' }
                    }
                }
            };

            // Act 1: Save with encryption (simulating OptionsApp.saveAllSettings)
            await stateService.settings.setSettings(originalSettings, { autoEncrypt: true });
            await stateService.settings.saveToStorage();

            // Act 2: Load back from storage (simulating page reload)
            await stateService.settings.loadFromStorage();
            // Restore security config (in real app this comes from initial state)
            stateService.state.settings.security = { encryptionKey: 'test-password-123' };

            // Act 3: Verify encrypted storage but decrypted access
            const storageData = await stateService.storage.settings.getAll();
            expect(typeof storageData.ai.providers.openai.apiKey).toBe('object');
            expect(storageData.ai.providers.openai.apiKey.method).toBe('AES-GCM');

            // Act 4: Verify model config decryption works
            const modelConfig = await stateService.settings.getModelConfig('chat');
            expect(modelConfig.apiKey).toBe('sk-original123');

            // Act 5: Save again with encryption (simulating user saving again)
            const currentSettings = stateService.settings.getSettings();
            await stateService.settings.setSettings(currentSettings, { autoEncrypt: true });
            await stateService.settings.saveToStorage();

            // Act 6: Verify still works after multiple encryption cycles
            const finalModelConfig = await stateService.settings.getModelConfig('chat');
            expect(finalModelConfig.apiKey).toBe('sk-original123');
        });
    });
});