import { describe, it, expect, beforeEach } from 'vitest';
import { 
    createInitialState, 
    createInitialSettingsState, 
    createInitialUiState, 
    createInitialTabState,
    serializeState,
    deserializeState
} from '../../../src/js/state/state-container.js';
import { 
    TestStateFactory, 
    StateAssertions,
    generateSessionId 
} from './conftest.js';

describe('StateContainer', () => {
    describe('createInitialState', () => {
        it('should create a valid initial state structure', () => {
            const state = createInitialState();
            
            // Verify state shape
            StateAssertions.assertValidStateShape(state);
            
            // Check session
            expect(state.session).toBeDefined();
            expect(state.session.sessionId).toMatch(/^session-/);
            expect(state.session.streamingInProgress).toBe(false);
            expect(state.session.created).toBeGreaterThan(0);
            expect(state.session.lastSaved).toBe(null);
            expect(state.session.autoSaveEnabled).toBe(true);
            
            // Check tabs
            expect(state.tabs).toBeDefined();
            expect(state.tabs.default).toBeDefined();
            
            // Check other domains
            expect(state.settings).toBeDefined();
            expect(state.aim).toBeDefined();
            expect(state.mcp).toBeDefined();
            expect(state.conversation).toBeDefined();
            expect(state.ui).toBeDefined();
            expect(state.stash).toBeDefined();
            expect(state.prompts).toBeDefined();
        });

        it('should create state with custom tabId', () => {
            const tabId = 'custom-tab-123';
            const state = createInitialState(tabId);
            
            expect(state.ui.tabId).toBe(tabId);
        });
    });

    describe('createInitialSettingsState', () => {
        it('should create valid settings structure', () => {
            const settings = createInitialSettingsState();
            
            // Check AI models structure
            expect(settings.ai.models).toBeDefined();
            expect(settings.ai.models.chat).toBeDefined();
            expect(settings.ai.models.chat.model).toBeUndefined();
            expect(settings.ai.models.chat.provider).toBeUndefined();
            expect(settings.ai.models.chat.tokenizer).toBeUndefined();
            expect(settings.ai.models.chat.minimalMode).toBe(false);
            
            // Check sampler config
            const samplerConfig = settings.ai.models.chat.samplerConfig;
            expect(samplerConfig.temperature).toBe(0.8);
            expect(samplerConfig.maxTokens).toBe(2048);
            expect(samplerConfig.maxContentTokens).toBe(16384);
            expect(samplerConfig.minP).toBe(0.05);
            expect(samplerConfig.topP).toBeUndefined();
            expect(samplerConfig.topK).toBeUndefined();
            
            // Check providers
            expect(settings.ai.providers).toBeDefined();
            expect(settings.ai.providers.openai).toBeDefined();
            expect(settings.ai.providers.anthropic).toBeDefined();
            expect(settings.ai.providers.featherless).toBeDefined();
            expect(settings.ai.providers.google).toBeDefined();
            expect(settings.ai.providers.groq).toBeDefined();
            expect(settings.ai.providers.openrouter).toBeDefined();
            expect(settings.ai.providers.aimind).toBeDefined();
            expect(settings.ai.providers.meta).toBeDefined();
            
            // Check AIM settings
            expect(settings.aim).toBeDefined();
            expect(settings.aim.showThought).toBe(false);
            expect(settings.aim.autoThink).toBe(false);
            
            // Check MCP settings
            expect(settings.mcp).toBeDefined();
            expect(settings.mcp.autoConnect).toBe(false);
            
            // Check UI settings
            expect(settings.ui).toBeDefined();
            expect(settings.ui.autoInject).toBe(false);
            expect(settings.ui.voice).toBeDefined();
            expect(settings.ui.voice.rate).toBe(1.0);
            expect(settings.ui.voice.pitch).toBe(1.0);
            expect(settings.ui.voice.volume).toBe(1.0);
            expect(settings.ui.voice.lang).toBe('en-US');
        });
    });

    describe('createInitialUiState', () => {
        it('should create valid UI state', () => {
            const ui = createInitialUiState();
            
            expect(ui.tabId).toBeUndefined();
            expect(ui.panelVisible).toBe(false);
        });

        it('should create UI state with custom tabId', () => {
            const tabId = 'test-tab-456';
            const ui = createInitialUiState(tabId);
            
            expect(ui.tabId).toBe(tabId);
            expect(ui.panelVisible).toBe(false);
        });
    });

    describe('createInitialTabState', () => {
        it('should create valid tab state', () => {
            const tab = createInitialTabState();
            
            expect(tab.trackedThreadId).toBeUndefined();
            expect(tab.selectedModel).toBe('chat');
            expect(tab.includePageContent).toBe(true);
            expect(tab.useMCP).toBe(false);
            expect(tab.useBrowserTools).toBe(false);
            expect(tab.autoExecuteTools).toBe(false);
        });
    });

    describe('serializeState', () => {
        let state;

        beforeEach(() => {
            state = createInitialState();
        });

        it('should serialize state correctly', () => {
            // Add some test data
            state.version = '1.0.0';
            state.mcp.connection.serverUrl = 'http://localhost:3000';
            state.mcp.connection.isConnected = true;
            state.mcp.connection.sessionId = 'test-session';
            state.mcp.tools = [{ name: 'test-tool' }];
            state.mcp.pendingRequests = { '123': { id: 123 } };
            state.conversation.history['thread-1'] = [{ content: 'test' }];
            
            const serialized = serializeState(state);
            
            // Check included fields
            expect(serialized.version).toBe('1.0.0');
            expect(serialized.session).toEqual(state.session);
            expect(serialized.aim).toEqual(state.aim);
            expect(serialized.conversation).toEqual(state.conversation);
            
            // Check MCP serialization
            expect(serialized.mcp.connection.serverUrl).toBe('http://localhost:3000');
            expect(serialized.mcp.connection.isConnected).toBe(false); // Always false on restore
            expect(serialized.mcp.connection.isInitialized).toBe(false); // Always false on restore
            expect(serialized.mcp.connection.sessionId).toBeUndefined(); // Not serialized
            expect(serialized.mcp.connection.connectionError).toBeUndefined(); // Cleared on restore
            expect(serialized.mcp.tools).toEqual([{ name: 'test-tool' }]);
            expect(serialized.mcp.pendingRequests).toEqual({}); // Always empty on restore
            
            // Check excluded fields
            expect(serialized.settings).toBeUndefined(); // Managed separately
            expect(serialized.tabs).toBeUndefined(); // Not serialized
            expect(serialized.ui).toBeUndefined(); // Not serialized
            expect(serialized.stash).toBeUndefined(); // Not serialized
            expect(serialized.prompts).toBeUndefined(); // Not serialized
        });
    });

    describe('deserializeState', () => {
        let currentState;
        let savedData;

        beforeEach(() => {
            currentState = createInitialState();
            savedData = {
                version: '1.0.0',
                session: {
                    sessionId: 'saved-session',
                    streamingInProgress: true,
                    created: 123456,
                    lastSaved: 789012,
                    autoSaveEnabled: false
                },
                aim: {
                    pinnedMessages: ['msg1', 'msg2'],
                    activeDocument: 'doc1'
                },
                mcp: {
                    connection: {
                        serverUrl: 'http://saved-server.com',
                        isConnected: true,
                        isInitialized: true,
                        sessionId: 'old-session',
                        lastConnected: 555555
                    },
                    tools: [{ name: 'saved-tool' }],
                    pendingRequests: { '456': { id: 456 } }
                },
                conversation: {
                    history: {
                        'thread-saved': [{ content: 'saved message' }]
                    },
                    metadata: {
                        'thread-saved': { threadId: 'thread-saved' }
                    }
                }
            };
        });

        it('should deserialize valid save data', () => {
            const result = deserializeState(savedData, currentState);
            
            expect(result.version).toBe('1.0.0');
            expect(result.aim).toEqual(savedData.aim);
            expect(result.conversation).toEqual(savedData.conversation);
            
            // Check MCP restoration
            expect(result.mcp.connection.serverUrl).toBe('http://saved-server.com');
            expect(result.mcp.connection.isConnected).toBe(false); // Forced to false
            expect(result.mcp.connection.isInitialized).toBe(false); // Forced to false
            expect(result.mcp.connection.sessionId).toBeUndefined(); // Cleared
            expect(result.mcp.connection.postEndpoint).toBeUndefined(); // Cleared
            expect(result.mcp.connection.connectionError).toBeUndefined(); // Cleared
            expect(result.mcp.connection.lastConnected).toBe(555555); // Preserved
            expect(result.mcp.tools).toEqual([{ name: 'saved-tool' }]);
            expect(result.mcp.pendingRequests).toEqual({}); // Always empty
        });

        it('should handle null or invalid save data', () => {
            expect(() => deserializeState(null, currentState)).toThrow('Invalid save data');
            expect(() => deserializeState(undefined, currentState)).toThrow('Invalid save data');
            expect(() => deserializeState('invalid', currentState)).toThrow('Invalid save data');
        });

        it('should handle partial save data', () => {
            const partialData = {
                aim: { activeDocument: 'partial-doc' }
            };
            
            const result = deserializeState(partialData, currentState);
            
            // Should merge partial data
            expect(result.aim.activeDocument).toBe('partial-doc');
            
            // Should preserve current state for missing fields
            expect(result.session).toEqual(currentState.session);
            expect(result.settings).toEqual(currentState.settings);
            expect(result.mcp).toEqual(currentState.mcp);
        });

        it('should preserve settings from current state', () => {
            // Modify current state settings
            currentState.settings.ai.providers.openai.apiKey = 'current-key';
            
            // Save data with different settings (should be ignored)
            savedData.settings = {
                ai: {
                    providers: {
                        openai: { apiKey: 'saved-key' }
                    }
                }
            };
            
            const result = deserializeState(savedData, currentState);
            
            // Settings should remain from current state
            expect(result.settings.ai.providers.openai.apiKey).toBe('current-key');
        });
    });

    describe('TestStateFactory integration', () => {
        it('should create states with specific configurations', () => {
            // Test conversation state
            const conversationState = TestStateFactory.createStateWithConversation({
                history: {
                    'thread-1': [{ content: 'test message' }]
                },
                metadata: {
                    'thread-1': { threadId: 'thread-1', status: 'active' }
                }
            });
            
            expect(conversationState.conversation.history['thread-1']).toBeDefined();
            expect(conversationState.conversation.metadata['thread-1'].status).toBe('active');
            
            // Test settings state
            const settingsState = TestStateFactory.createStateWithSettings({
                ai: {
                    providers: {
                        openai: { apiKey: 'test-key' }
                    }
                }
            });
            
            expect(settingsState.settings.ai.providers.openai.apiKey).toBe('test-key');
            
            // Test MCP state
            const mcpState = TestStateFactory.createStateWithMcp({
                connection: {
                    serverUrl: 'http://test-mcp.com',
                    isConnected: true
                },
                tools: [{ name: 'test-tool' }]
            });
            
            expect(mcpState.mcp.connection.serverUrl).toBe('http://test-mcp.com');
            expect(mcpState.mcp.connection.isConnected).toBe(true);
            expect(mcpState.mcp.tools).toHaveLength(1);
        });
    });
});