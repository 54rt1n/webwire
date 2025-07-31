// Test fixtures and utilities for state system tests

import { EventBus } from '../../../src/js/core/event-bus.js';
import { createInitialState, createInitialSettingsState, createInitialUiState, createInitialTabState } from '../../../src/js/state/state-container.js';
import { generateSessionId, generateMessageId, generateUUID } from '../../../src/js/utils/id-generator.js';
import { EVENTS } from '../../../src/js/core/events.js';

// Universal mock storage adapter that supports all storage adapter interfaces
export class MockStorageAdapter {
    constructor() {
        this.data = {};
        this.calls = [];
    }

    // For StateAdapter and PromptAdapter (save/load without key)
    async save(state) {
        this.calls.push({ method: 'save', key: state });
        this.data['savedState'] = state;
        return true;
    }

    async load() {
        this.calls.push({ method: 'load' });
        return this.data['savedState'] ?? null;
    }

    // For SettingsAdapter, UiAdapter, StashAdapter, TabAdapter (getAll/setAll)
    async getAll() {
        this.calls.push({ method: 'getAll' });
        return this.data['settings'] || null;
    }

    async setAll(value) {
        this.calls.push({ method: 'setAll', value });
        this.data['settings'] = value;
        return true;
    }

    // Common methods
    async remove(key) {
        this.calls.push({ method: 'remove', key });
        const current = this.data['settings'] || {};
        delete current[key];
        this.data['settings'] = current;
        return true;
    }

    async clear() {
        this.calls.push({ method: 'clear' });
        this.data = {};
        return true;
    }

    // For SettingsAdapter individual key operations
    async get(key, defaultValue = null) {
        this.calls.push({ method: 'get', key, defaultValue });
        const settings = this.data['settings'];
        if (!settings) return defaultValue;
        return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
    }

    async set(key, value) {
        this.calls.push({ method: 'set', key, value });
        const current = this.data['settings'] || {};
        return this.setAll({
            ...current,
            [key]: value
        });
    }

    // For SettingsAdapter exists check
    async exists() {
        this.calls.push({ method: 'exists' });
        const settings = this.data['settings'];
        return settings !== null && typeof settings === 'object';
    }

    // For StashAdapter statistics
    async getStats() {
        this.calls.push({ method: 'getStats' });
        const stashData = this.data['settings'] || {};
        const keys = Object.keys(stashData);
        const totalItems = Object.values(stashData)
            .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

        return {
            keyCount: keys.length,
            totalItems,
            isEmpty: keys.length === 0,
            keys
        };
    }

    // For StateAdapter metadata access
    async getMetadata() {
        this.calls.push({ method: 'getMetadata' });
        const state = this.data['savedState'];
        return state?.metadata || null;
    }

    reset() {
        this.data = {};
        this.calls = [];
    }
}

// Mock event bus with spy functionality
export class MockEventBus extends EventBus {
    constructor(domain = 'test') {
        super({ domain });
        this.emittedEvents = [];
    }

    emit(eventName, data) {
        this.emittedEvents.push({ eventName, data, timestamp: Date.now() });
        return super.emit(eventName, data);
    }

    reset() {
        this.emittedEvents = [];
        this.events.clear();
    }

    getEmittedEvents(eventName = null) {
        if (eventName) {
            return this.emittedEvents.filter(e => e.eventName === eventName);
        }
        return this.emittedEvents;
    }
}

// Base state service mock for plugin testing
export class MockStateService {
    constructor(initialState = null, eventBus = null, storage = null) {
        this.state = initialState || createInitialState();
        // Add showThought and autoThink to aim state to match plugin expectations
        if (this.state.aim && this.state.settings.aim) {
            this.state.aim.showThought = this.state.settings.aim.showThought;
            this.state.aim.autoThink = this.state.settings.aim.autoThink;
        }
        this.eventBus = eventBus || new MockEventBus('test');
        
        // Use provided storage or create storage adapters for each domain
        this.storage = storage || {
            settings: new MockStorageAdapter(),
            state: new MockStorageAdapter(),
            ui: new MockStorageAdapter(),
            stash: new MockStorageAdapter(),
            prompts: new MockStorageAdapter(),
            tab: new MockStorageAdapter(),
        };
        
        // Mock plugins object
        this.plugins = {};
        
        // Add flags to match real StateService
        this.isBackend = true;
        this.isFrontend = false;
    }

    // Add plugin
    addPlugin(name, plugin) {
        this.plugins[name] = plugin;
        if (name !== 'disk') { // Avoid circular reference for disk plugin
            this[name] = plugin;
        }
    }

    // Add disk plugin reference for self-referencing calls
    get disk() {
        return this._diskPlugin;
    }

    set disk(plugin) {
        this._diskPlugin = plugin;
        this.plugins.disk = plugin;
    }

    // Helper to update state
    updateState(updates) {
        this.state = { ...this.state, ...updates };
    }

    // Helper to update nested state
    updateNestedState(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.state;
        
        for (const key of keys) {
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }
}

// Factory for creating test states with specific configurations
export class TestStateFactory {
    static createBasicState(overrides = {}) {
        const state = createInitialState();
        return { ...state, ...overrides };
    }

    static createStateWithConversation(conversationData = {}) {
        const state = createInitialState();
        state.conversation = {
            ...state.conversation,
            ...conversationData
        };
        return state;
    }

    static createStateWithSettings(settingsData = {}) {
        const state = createInitialState();
        state.settings = {
            ...state.settings,
            ...settingsData
        };
        return state;
    }

    static createStateWithTab(tabId = 'test-tab', tabData = {}) {
        const state = createInitialState();
        state.tabs[tabId] = {
            ...createInitialTabState(),
            ...tabData
        };
        return state;
    }

    static createStateWithMcp(mcpData = {}) {
        const state = createInitialState();
        state.mcp = {
            ...state.mcp,
            ...mcpData
        };
        return state;
    }

    static createStateWithAim(aimData = {}) {
        const state = createInitialState();
        state.aim = {
            ...state.aim,
            ...aimData
        };
        return state;
    }

    static createStateWithUi(uiData = {}) {
        const state = createInitialState();
        state.ui = {
            ...state.ui,
            ...uiData
        };
        return state;
    }

    static createStateWithStash(stashData = {}) {
        const state = createInitialState();
        state.stash = {
            ...state.stash,
            ...stashData
        };
        return state;
    }

    static createStateWithPrompts(prompts = {}) {
        const state = createInitialState();
        state.prompts = prompts;
        return state;
    }
}

// Test data generators
export const TestData = {
    // Generate a test message
    createMessage(overrides = {}) {
        return {
            messageId: generateMessageId(),
            role: 'user',
            content: 'Test message',
            timestamp: Date.now(),
            ...overrides
        };
    },

    // Generate a test conversation thread
    createThread(overrides = {}) {
        const threadId = `thread-${generateUUID()}`;
        return {
            threadId,
            userName: 'Test User',
            personaName: 'Test Persona',
            mood: undefined,
            location: undefined,
            startTime: Date.now(),
            endTime: undefined,
            duration: undefined,
            status: 'active',
            error: undefined,
            errorCode: undefined,
            errorType: undefined,
            ...overrides
        };
    },

    // Generate thread with messages
    createThreadWithMessages(messageCount = 2, threadOverrides = {}, messageOverrides = {}) {
        const thread = TestData.createThread(threadOverrides);
        const messages = [];
        
        for (let i = 0; i < messageCount; i++) {
            messages.push(TestData.createMessage({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Test message ${i + 1}`,
                ...messageOverrides
            }));
        }
        
        return { thread, messages };
    },

    // Generate AI provider config
    createProviderConfig(provider = 'openai', overrides = {}) {
        const configs = {
            openai: {
                provider: 'openai',
                apiKey: 'test-key',
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 4096
            },
            anthropic: {
                provider: 'anthropic',
                apiKey: 'test-key',
                model: 'claude-3-opus',
                temperature: 0.7,
                maxTokens: 4096
            },
            featherless: {
                provider: 'featherless',
                apiKey: 'test-key',
                model: 'llama-2',
                temperature: 0.7,
                maxTokens: 4096
            }
        };

        return {
            ...configs[provider] || configs.openai,
            ...overrides
        };
    },

    // Generate MCP server config
    createMcpServer(overrides = {}) {
        return {
            serverUrl: 'http://localhost:3000',
            sessionId: generateSessionId(),
            postEndpoint: undefined,
            isConnected: true,
            isInitialized: true,
            lastConnected: Date.now(),
            connectionError: undefined,
            ...overrides
        };
    },

    // Generate MCP tool
    createMcpTool(overrides = {}) {
        return {
            name: 'test_tool',
            description: 'A test tool',
            type: 'function',
            function: {
                name: 'test_tool',
                description: 'A test tool function',
                parameters: {
                    type: 'object',
                    properties: {
                        input: {
                            type: 'string',
                            description: 'Input parameter'
                        }
                    },
                    required: ['input']
                }
            },
            ...overrides
        };
    },

    // Generate prompt config
    createPrompt(overrides = {}) {
        return {
            buttonIcon: '>�',
            buttonText: 'Test Prompt',
            systemPrompt: 'You are a test assistant',
            userPrompt: 'Test the system',
            features: {
                pageContent: true,
                mcp: false,
                autoThink: false,
                noBaseSystemPrompt: false,
                browserTools: false,
                autoExecuteTools: false,
            },
            version: 1,
            created: Date.now(),
            updated: Date.now(),
            ...overrides
        };
    }
};

// Assertion helpers
export const StateAssertions = {
    // Assert state shape is valid
    assertValidStateShape(state) {
        const requiredKeys = ['session', 'tabs', 'settings', 'aim', 'mcp', 'conversation', 'ui', 'stash', 'prompts'];
        for (const key of requiredKeys) {
            if (!(key in state)) {
                throw new Error(`State missing required key: ${key}`);
            }
        }
        return true;
    },

    // Assert event was emitted
    assertEventEmitted(eventBus, eventName, predicate = null) {
        const events = eventBus.getEmittedEvents(eventName);
        if (events.length === 0) {
            throw new Error(`Event '${eventName}' was not emitted`);
        }
        
        if (predicate) {
            const found = events.some(e => predicate(e.data));
            if (!found) {
                throw new Error(`Event '${eventName}' was emitted but didn't match predicate`);
            }
        }
        
        return true;
    },

    // Assert storage was called
    assertStorageCalled(storage, method, key = null) {
        const calls = storage.calls.filter(c => c.method === method);
        if (calls.length === 0) {
            throw new Error(`Storage method '${method}' was not called`);
        }
        
        if (key) {
            const found = calls.some(c => c.key === key);
            if (!found) {
                throw new Error(`Storage method '${method}' was not called with key '${key}'`);
            }
        }
        
        return true;
    },

    // Assert conversation state
    assertConversationExists(state, threadId) {
        if (!state.conversation.history[threadId]) {
            throw new Error(`Conversation ${threadId} does not exist`);
        }
        if (!state.conversation.metadata[threadId]) {
            throw new Error(`Conversation metadata for ${threadId} does not exist`);
        }
        return true;
    },

    // Assert MCP connection state
    assertMcpConnected(state) {
        if (!state.mcp.connection.isConnected) {
            throw new Error('MCP is not connected');
        }
        if (!state.mcp.connection.isInitialized) {
            throw new Error('MCP is not initialized');
        }
        return true;
    }
};

// Wait utilities for async operations
export const WaitUtils = {
    // Wait for condition with timeout
    async waitFor(condition, timeout = 1000, interval = 10) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await condition()) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Timeout waiting for condition');
    },

    // Wait for event to be emitted
    async waitForEvent(eventBus, eventName, timeout = 1000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                eventBus.off(eventName, handler);
                reject(new Error(`Timeout waiting for event '${eventName}'`));
            }, timeout);

            const handler = (data) => {
                clearTimeout(timer);
                resolve(data);
            };

            eventBus.once(eventName, handler);
        });
    },

    // Small delay for async operations
    async delay(ms = 0) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Setup and teardown helpers
export function setupTest() {
    const state = createInitialState();
    const eventBus = new MockEventBus();
    const storage = {
        settings: new MockStorageAdapter(),
        state: new MockStorageAdapter(),
        ui: new MockStorageAdapter(),
        stash: new MockStorageAdapter(),
    };
    const stateService = new MockStateService(state, eventBus, storage);
    
    return {
        state,
        eventBus,
        storage,
        stateService,
        cleanup: () => {
            eventBus.reset();
            Object.values(storage).forEach(adapter => adapter.reset());
        }
    };
}

// Export everything for easy access in tests
export default {
    MockStorageAdapter,
    MockEventBus,
    MockStateService,
    TestStateFactory,
    TestData,
    StateAssertions,
    WaitUtils,
    setupTest,
    EVENTS,
    generateSessionId,
    generateMessageId,
    generateUUID
};