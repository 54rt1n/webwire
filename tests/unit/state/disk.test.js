import { describe, it, expect, beforeEach } from 'vitest';
import { DiskStatePlugin } from '../../../src/js/state/plugins/disk-state.js';
import { createInitialState, serializeState, deserializeState } from '../../../src/js/state/state-container.js';
import { setupTest, TestStateFactory, TestData, StateAssertions, MockStateService } from './conftest.js';

describe('DiskStatePlugin', () => {
    let stateService, plugin;

    beforeEach(() => {
        stateService = new MockStateService();
        plugin = new DiskStatePlugin(stateService);
        // Set up the disk plugin reference for self-referencing
        stateService.disk = plugin;
    });

    describe('Constructor and Basic Operations', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toBe(stateService.eventBus);
            expect(plugin.stateAdapter).toBe(stateService.storage.state);
        });

        it('should have access to state adapter', () => {
            expect(plugin.stateAdapter).toBeDefined();
            expect(plugin.stateAdapter).toBe(stateService.storage.state);
        });
    });

    describe('State Serialization and Deserialization', () => {
        it('should save current state to storage', async () => {
            // Set up test state
            stateService.state.conversation.history['test-thread'] = [
                TestData.createMessage({ content: 'Hello' })
            ];
            stateService.state.aim.thoughtContent = 'Thinking...';
            stateService.state.mcp.connection.isConnected = true;

            await plugin.saveToStorage();

            const savedCalls = plugin.stateAdapter.calls.filter(c => c.method === 'save');
            expect(savedCalls).toHaveLength(1);

            const savedData = savedCalls[0].key; // DiskStatePlugin saves data as first param (key)
            expect(savedData).toHaveProperty('conversation');
            expect(savedData).toHaveProperty('aim');
            expect(savedData).toHaveProperty('mcp');
            expect(savedData).toHaveProperty('timestamp');
            expect(savedData.timestamp).toBeTypeOf('number');
        });

        it('should update last saved timestamp', async () => {
            const beforeSave = stateService.state.session.lastSaved;

            await plugin.saveToStorage();

            expect(stateService.state.session.lastSaved).toBeTypeOf('number');
            expect(stateService.state.session.lastSaved).toBeGreaterThan(beforeSave || 0);
        });

        it('should handle save errors gracefully', async () => {
            // Mock save to throw error
            plugin.stateAdapter.save = async () => {
                throw new Error('Storage error');
            };

            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });

        it('should serialize state correctly', async () => {
            const testState = {
                mcp: { connection: { isConnected: true } },
                aim: { thoughtContent: 'test' },
                conversation: { history: { 'thread1': [] } },
                otherData: 'should be included'
            };

            Object.assign(stateService.state, testState);

            await plugin.saveToStorage();

            const savedCalls = plugin.stateAdapter.calls.filter(c => c.method === 'save');
            const savedData = savedCalls[0].key; // DiskStatePlugin saves data as first param (key)

            // serializeState only saves specific fields and filters MCP connection
            expect(savedData.mcp.connection.serverUrl).toBeUndefined(); // Original connection.serverUrl is undefined
            expect(savedData.mcp.connection.isConnected).toBe(false); // Always false on serialize
            expect(savedData.mcp.connection.isInitialized).toBe(false); // Always false on serialize
            expect(savedData.aim).toStrictEqual(testState.aim);
            expect(savedData.conversation).toStrictEqual(testState.conversation);
            expect(savedData.otherData).toBeUndefined(); // serializeState doesn't save arbitrary fields
        });
    });

    describe('State Loading Operations', () => {
        it('should load state from storage successfully', async () => {
            const savedState = {
                mcp: { 
                    connection: { isConnected: false, serverUrl: 'http://test' },
                    tools: [TestData.createMcpTool()] 
                },
                aim: { thoughtContent: 'loaded thought' },
                conversation: { 
                    history: { 'thread1': [TestData.createMessage()] },
                    metadata: { 'thread1': TestData.createThread() }
                }
            };

            plugin.stateAdapter.data['savedState'] = savedState;
            plugin.stateAdapter.load = async () => savedState;

            const result = await plugin.loadFromStorage();

            expect(result).toBe(true);
            expect(stateService.state.mcp).toMatchObject(savedState.mcp);
            expect(stateService.state.aim).toMatchObject(savedState.aim);
            expect(stateService.state.conversation).toMatchObject(savedState.conversation);
        });

        it('should handle no saved state', async () => {
            plugin.stateAdapter.load = async () => null;

            const result = await plugin.loadFromStorage();

            expect(result).toBe(false);
        });

        it('should update last active time on successful load', async () => {
            const savedState = { mcp: {}, aim: {}, conversation: {} };
            plugin.stateAdapter.load = async () => savedState;

            const beforeLoad = stateService.state.session.lastActive;

            await plugin.loadFromStorage();

            expect(stateService.state.session.lastActive).toBeTypeOf('number');
            expect(stateService.state.session.lastActive).toBeGreaterThan(beforeLoad || 0);
        });
    });

    describe('State Update Operations', () => {
        it('should update state from storage', async () => {
            const savedState = {
                mcp: { 
                    connection: { isConnected: true, serverUrl: 'http://updated' },
                    tools: [TestData.createMcpTool({ name: 'updated_tool' })]
                },
                aim: { thoughtContent: 'updated thought' },
                conversation: { 
                    history: { 'updated-thread': [TestData.createMessage({ content: 'Updated' })] }
                }
            };

            plugin.stateAdapter.load = async () => savedState;

            const result = await plugin.updateFromStorage();

            expect(result).toBe(true);
            // Connection state gets transformed during deserialization
            expect(stateService.state.mcp.connection.serverUrl).toBe(savedState.mcp.connection.serverUrl);
            expect(stateService.state.mcp.tools).toStrictEqual(savedState.mcp.tools);
            expect(stateService.state.aim).toMatchObject(savedState.aim);
            expect(stateService.state.conversation).toMatchObject(savedState.conversation);
        });

        it('should handle no saved state for update', async () => {
            plugin.stateAdapter.load = async () => null;

            const result = await plugin.updateFromStorage();

            expect(result).toBe(false);
        });

        it('should throw error on update failure', async () => {
            plugin.stateAdapter.load = async () => {
                throw new Error('Load failed');
            };

            await expect(plugin.updateFromStorage()).rejects.toThrow('Load failed');
        });

        it('should handle empty saved state for update', async () => {
            plugin.stateAdapter.load = async () => null;

            const result = await plugin.updateFromStorage();
            expect(result).toBe(false);
        });
    });

    describe('Utility Methods', () => {
        it('should convert snake_case to camelCase', () => {
            const snakeData = {
                user_name: 'test',
                persona_name: 'assistant',
                some_other_field: 'value',
                normalfield: 'unchanged'
            };

            const result = plugin.snakeToCamel(snakeData);

            expect(result).toStrictEqual({
                userName: 'test',
                personaName: 'assistant',
                someOtherField: 'value',
                normalfield: 'unchanged'
            });
        });

        it('should update last active time', () => {
            const before = stateService.state.session.lastActive;

            plugin.updateLastActiveTime();

            expect(stateService.state.session.lastActive).toBeTypeOf('number');
            expect(stateService.state.session.lastActive).toBeGreaterThan(before || 0);
        });

        it('should reset state to initial state', () => {
            // Modify state first
            stateService.state.conversation.history['test'] = [];
            stateService.state.aim.thoughtContent = 'modified';

            plugin.resetState();

            const initialState = createInitialState();
            expect(stateService.state).toMatchObject({
                session: expect.objectContaining({
                    sessionId: expect.any(String),
                    streamingInProgress: false,
                    created: expect.any(Number),
                    lastSaved: null,
                    autoSaveEnabled: true
                }),
                settings: expect.any(Object),
                aim: expect.objectContaining(initialState.aim),
                mcp: expect.objectContaining(initialState.mcp),
                conversation: expect.objectContaining(initialState.conversation)
            });
        });
    });

    describe('Deserialization Edge Cases', () => {
        it('should handle malformed save data', async () => {
            const malformedData = { invalid: 'structure' };
            plugin.stateAdapter.load = async () => malformedData;

            const result = await plugin.loadFromStorage();

            // deserializeState can handle partial data, so this may succeed
            expect(result).toBe(true);
        });

        it('should handle deserialize with partial data', async () => {
            const partialData = { 
                aim: { thoughtContent: 'partial' } 
                // Missing other required fields
            };
            plugin.stateAdapter.load = async () => partialData;

            const result = await plugin.loadFromStorage();

            expect(result).toBe(true);
            expect(stateService.state.aim.thoughtContent).toBe('partial');
        });

        it('should call deserialize method directly', () => {
            const testData = {
                mcp: { connection: { isConnected: false } },
                aim: { thoughtContent: 'direct test' },
                conversation: { history: {} }
            };

            const result = plugin.deserialize(testData);

            expect(result).toBe(true);
            expect(stateService.state.aim.thoughtContent).toBe('direct test');
        });

        it('should handle deserialize error', () => {
            // Test with null data which should fail
            const result = plugin.deserialize(null);
            
            // Should return false on error
            expect(result).toBe(false);
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete save/load cycle', async () => {
            // Setup complex state
            const complexState = {
                conversation: {
                    history: {
                        'thread1': [
                            TestData.createMessage({ role: 'user', content: 'Hello' }),
                            TestData.createMessage({ role: 'assistant', content: 'Hi there!' })
                        ]
                    },
                    metadata: {
                        'thread1': TestData.createThread({ status: 'active' })
                    }
                },
                aim: {
                    thoughtContent: 'Complex thought process',
                    showThought: true,
                    autoThink: false
                },
                mcp: {
                    connection: { 
                        isConnected: true, 
                        serverUrl: 'http://test.com',
                        isInitialized: true
                    },
                    tools: [
                        TestData.createMcpTool({ name: 'tool1' }),
                        TestData.createMcpTool({ name: 'tool2' })
                    ]
                }
            };

            Object.assign(stateService.state, complexState);

            // Save state
            await plugin.saveToStorage();

            // Reset state
            plugin.resetState();

            // Load state back
            const result = await plugin.loadFromStorage();

            expect(result).toBe(true);
            expect(stateService.state.conversation.history).toStrictEqual(complexState.conversation.history);
            expect(stateService.state.aim.thoughtContent).toBe(complexState.aim.thoughtContent);
            expect(stateService.state.mcp.tools).toStrictEqual(complexState.mcp.tools);
        });

        it('should handle rapid save/update operations', async () => {
            // First save
            stateService.state.aim.thoughtContent = 'First save';
            await plugin.saveToStorage();

            // Update state
            stateService.state.aim.thoughtContent = 'Second save';
            await plugin.saveToStorage();

            // Load should get latest
            plugin.resetState();
            await plugin.loadFromStorage();

            expect(stateService.state.aim.thoughtContent).toBe('Second save');
        });

        it('should maintain state consistency during operations', async () => {
            const originalSessionId = stateService.state.session.sessionId;

            // Save and load
            await plugin.saveToStorage();
            await plugin.loadFromStorage();

            // Session ID should be preserved
            expect(stateService.state.session.sessionId).toBe(originalSessionId);
            
            // lastActive should have been updated
            expect(stateService.state.session.lastActive).toBeTypeOf('number');
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle storage adapter failures during save', async () => {
            plugin.stateAdapter.save = async () => {
                throw new Error('Disk full');
            };

            // Should not throw, but log error
            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });

        it('should handle storage adapter failures during load', async () => {
            plugin.stateAdapter.load = async () => {
                throw new Error('Corrupted storage');
            };

            await expect(plugin.loadFromStorage()).rejects.toThrow('Corrupted storage');
        });

        it('should handle null/undefined state service', () => {
            expect(() => new DiskStatePlugin(null)).toThrow();
        });

        it('should handle missing state sections gracefully', async () => {
            // State with missing sections
            delete stateService.state.mcp;
            delete stateService.state.aim;

            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });
    });

    describe('State Validation and Integrity', () => {
        it('should preserve state structure after operations', async () => {
            const originalKeys = Object.keys(stateService.state);

            await plugin.saveToStorage();
            await plugin.loadFromStorage();

            const newKeys = Object.keys(stateService.state);
            expect(newKeys).toEqual(expect.arrayContaining(originalKeys));
        });

        it('should handle timestamp management', async () => {
            const beforeSave = Date.now();
            
            await plugin.saveToStorage();

            const savedCalls = plugin.stateAdapter.calls.filter(c => c.method === 'save');
            const savedData = savedCalls[0].key; // DiskStatePlugin saves data as first param (key)

            expect(savedData.timestamp).toBeGreaterThanOrEqual(beforeSave);
            expect(stateService.state.session.lastSaved).toBeGreaterThanOrEqual(beforeSave);
        });

        it('should handle state size limits', async () => {
            // Create large state
            const largeConversation = {};
            for (let i = 0; i < 100; i++) {
                largeConversation[`thread-${i}`] = [
                    TestData.createMessage({ content: 'x'.repeat(1000) })
                ];
            }
            stateService.state.conversation.history = largeConversation;

            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });
    });
});