import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateService } from '../../../src/js/state/state-service.js';
import { ConversationStatePlugin } from '../../../src/js/state/plugins/conversation-state.js';
import { EVENTS } from '../../../src/js/core/events.js';
import { 
    MockEventBus,
    MockStorageAdapter,
    TestData,
    StateAssertions
} from './conftest.js';

describe('ConversationStatePlugin', () => {
    let stateService;
    let plugin;
    let eventBus;
    let storage;
    let mockConfig;

    beforeEach(() => {
        eventBus = new MockEventBus('test');
        storage = {
            settings: new MockStorageAdapter(),
            state: new MockStorageAdapter(),
            ui: new MockStorageAdapter(),
            stash: new MockStorageAdapter(),
        };
        
        // Mock config with security salt
        mockConfig = {
            get: vi.fn().mockImplementation((key) => {
                if (key === 'security.salt') return 'test-salt-123';
                return null;
            })
        };
        
        // Create real state service
        stateService = new StateService(eventBus, storage, mockConfig);
        stateService.initialize();
        
        // Get the conversation plugin
        plugin = stateService.conversation;
    });

    describe('initialization', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toBe(eventBus);
        });

        it('should have access to other plugins', () => {
            expect(stateService.settings).toBeDefined();
            expect(stateService.ui).toBeDefined();
            expect(stateService.mcp).toBeDefined();
            expect(stateService.aim).toBeDefined();
        });
    });

    describe('_safeConversationState', () => {
        it('should create conversation state if missing', () => {
            delete stateService.state.conversation;
            
            const result = plugin._safeConversationState();
            
            expect(result).toBeDefined();
            expect(result.history).toEqual({});
            expect(result.metadata).toEqual({});
        });

        it('should force reset conversation state when force=true', () => {
            stateService.state.conversation = {
                history: { 'thread-1': [] },
                metadata: { 'thread-1': {} }
            };
            
            const result = plugin._safeConversationState({ force: true });
            
            expect(result.history).toEqual({});
            expect(result.metadata).toEqual({});
        });
    });

    describe('getConversationMessages', () => {
        it('should return messages for existing thread', () => {
            const messages = [
                TestData.createMessage({ content: 'Hello' }),
                TestData.createMessage({ role: 'assistant', content: 'Hi there' })
            ];
            stateService.state.conversation.history['thread-1'] = messages;
            
            const result = plugin.getConversationMessages('thread-1');
            
            expect(result).toEqual(messages);
        });

        it('should return empty array for non-existent thread', () => {
            const result = plugin.getConversationMessages('non-existent');
            
            expect(result).toEqual([]);
        });
    });

    describe('storePartialUserMessage', () => {
        const threadId = 'thread-1';
        const userMessage = {
            content: 'Test user message',
            url: 'https://example.com',
            title: 'Example Page'
        };

        it('should store user message and create metadata', () => {
            plugin.storePartialUserMessage(threadId, userMessage, {
                userName: 'John',
                personaName: 'Assistant',
                mood: 'helpful',
                pageUrl: 'home'
            });
            
            // Check message was stored
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(1);
            expect(messages[0].role).toBe('user');
            expect(messages[0].content).toBe('Test user message');
            expect(messages[0].url).toBe('https://example.com');
            expect(messages[0].title).toBe('Example Page');
            expect(messages[0].messageId).toMatch(/^message-/);
            expect(messages[0].timestamp).toBeGreaterThan(0);
            
            // Check metadata was created
            const metadata = stateService.state.conversation.metadata[threadId];
            expect(metadata).toBeDefined();
            expect(metadata.threadId).toBe(threadId);
            expect(metadata.userName).toBe('John');
            expect(metadata.personaName).toBe('Assistant');
            expect(metadata.mood).toBe('helpful');
            expect(metadata.pageUrl).toBe('home');
            expect(metadata.status).toBe('active');
            expect(metadata.startTime).toBe(messages[0].timestamp);
            
            // Check event was emitted
            StateAssertions.assertEventEmitted(eventBus, EVENTS.CONVERSATION.UPDATED, 
                data => data.threadId === threadId);
        });

        it('should append to existing thread', () => {
            // Add initial message
            plugin.storePartialUserMessage(threadId, { content: 'First message' });
            
            // Add second message
            plugin.storePartialUserMessage(threadId, { content: 'Second message' });
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(2);
            expect(messages[0].content).toBe('First message');
            expect(messages[1].content).toBe('Second message');
        });

        it('should use custom timestamp if provided', () => {
            const customTimestamp = 123456789;
            
            plugin.storePartialUserMessage(threadId, userMessage, {
                timestamp: customTimestamp
            });
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages[0].timestamp).toBe(customTimestamp);
        });

        it('should get tabId from UI state', () => {
            // Set a specific tab ID in UI state
            stateService.state.ui.tabId = 'test-tab-123';
            
            plugin.storePartialUserMessage(threadId, userMessage);
            
            const metadata = stateService.state.conversation.metadata[threadId];
            expect(metadata.tabId).toBe('test-tab-123');
        });
    });

    describe('storeAssistantMessage', () => {
        const threadId = 'thread-1';
        const assistantMessage = {
            content: 'Test assistant response',
            think: 'I should help the user',
            model: 'gpt-4'
        };

        beforeEach(() => {
            // First store a user message to create thread
            plugin.storePartialUserMessage(threadId, { content: 'User question' });
            eventBus.reset(); // Clear events from setup
        });

        it('should store assistant message with all fields', () => {
            const toolResults = [{ tool: 'search', result: 'data' }];
            const toolCalls = [{ name: 'search', arguments: {} }];
            const parseErrors = ['error1'];
            
            plugin.storeAssistantMessage(threadId, assistantMessage, {
                toolResults,
                toolCalls,
                parseErrors
            });
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(2);
            
            const assistant = messages[1];
            expect(assistant.role).toBe('assistant');
            expect(assistant.content).toBe('Test assistant response');
            expect(assistant.think).toBe('I should help the user');
            expect(assistant.model).toBe('gpt-4');
            expect(assistant.toolResults).toEqual(toolResults);
            expect(assistant.toolCalls).toEqual(toolCalls);
            expect(assistant.parseErrors).toEqual(parseErrors);
            expect(assistant.messageId).toMatch(/^message-/);
            
            // Check event
            StateAssertions.assertEventEmitted(eventBus, EVENTS.CONVERSATION.UPDATED);
        });

        it('should update conversation metadata', () => {
            const timestamp = Date.now();
            
            plugin.storeAssistantMessage(threadId, assistantMessage, { timestamp });
            
            const metadata = stateService.state.conversation.metadata[threadId];
            expect(metadata.endTime).toBe(timestamp);
            expect(metadata.duration).toBe(timestamp - metadata.startTime);
        });

        it('should handle empty assistant message', () => {
            plugin.storeAssistantMessage(threadId, { content: '' });
            
            // Should not add empty message
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(1); // Only user message
        });

        it('should create thread if it doesn\'t exist', () => {
            const newThreadId = 'new-thread';
            
            plugin.storeAssistantMessage(newThreadId, assistantMessage);
            
            expect(stateService.state.conversation.history[newThreadId]).toBeDefined();
            expect(stateService.state.conversation.history[newThreadId]).toHaveLength(1);
        });

        it('should apply crossApply properties to stored message', () => {
            const crossApply = {
                status: 'error',
                error: true,
                customField: 'test-value'
            };
            
            plugin.storeAssistantMessage(threadId, assistantMessage, {}, crossApply);
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(2);
            
            const assistant = messages[1];
            expect(assistant.status).toBe('error');
            expect(assistant.error).toBe(true);
            expect(assistant.customField).toBe('test-value');
            expect(assistant.content).toBe('Test assistant response'); // Original content preserved
            expect(assistant.role).toBe('assistant'); // Original role preserved
        });

        it('should store error message exactly like chat-service does', () => {
            // This simulates exactly what chat-service.js does for error handling
            const errorMessage = {
                messageId: 'test-message-id',
                role: 'assistant',
                content: 'HTTP 400: Maximum context length exceeded',
                status: 'error',  // Added by chat-service before calling storeAssistantMessage
                timestamp: Date.now(),
                model: 'gpt-4'
            };
            
            const crossApplyOptions = {
                error: true,
                status: 'error'
            };
            
            plugin.storeAssistantMessage(threadId, errorMessage, {}, crossApplyOptions);
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(2);
            
            const storedMessage = messages[1];
            console.log('Stored message:', storedMessage);
            
            // The stored message should have status from both assistantMessage AND crossApply
            expect(storedMessage.status).toBe('error');
            expect(storedMessage.error).toBe(true);
            expect(storedMessage.role).toBe('assistant');
            expect(storedMessage.content).toBe('HTTP 400: Maximum context length exceeded');
            expect(storedMessage.messageId).toBe('test-message-id');
        });
    });

    describe('storeMessage', () => {
        const threadId = 'thread-1';
        const userMsg = { content: 'User message' };
        const assistantMsg = { content: 'Assistant response', think: 'Thinking...' };

        it('should store both messages in one call', () => {
            plugin.storeMessage(threadId, userMsg, assistantMsg, {
                userName: 'Alice',
                personaName: 'Helper',
                toolResults: [{ result: 'data' }]
            });
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(2);
            
            // Check user message
            expect(messages[0].role).toBe('user');
            expect(messages[0].content).toBe('User message');
            
            // Check assistant message
            expect(messages[1].role).toBe('assistant');
            expect(messages[1].content).toBe('Assistant response');
            expect(messages[1].think).toBe('Thinking...');
            expect(messages[1].toolResults).toEqual([{ result: 'data' }]);
            expect(messages[1].timestamp).toBeGreaterThan(messages[0].timestamp);
            
            // Check metadata
            const metadata = stateService.state.conversation.metadata[threadId];
            expect(metadata.userName).toBe('Alice');
            expect(metadata.personaName).toBe('Helper');
            
            // Check event
            StateAssertions.assertEventEmitted(eventBus, EVENTS.CONVERSATION.UPDATED);
        });

        it('should handle missing assistant message', () => {
            plugin.storeMessage(threadId, userMsg, null);
            
            const messages = stateService.state.conversation.history[threadId];
            expect(messages).toHaveLength(1); // Only user message
        });

        it('should update location in existing metadata', () => {
            // Create initial thread
            plugin.storeMessage(threadId, userMsg, assistantMsg, {
                location: 'office'
            });
            
            // Store another message with different location
            plugin.storeMessage(threadId, 
                { content: 'Another question' }, 
                { content: 'Another answer' },
                { pageUrl: 'home' }
            );
            
            const metadata = stateService.state.conversation.metadata[threadId];
            expect(metadata.pageUrl).toBe('home');
        });
    });

    describe('thread management methods', () => {
        beforeEach(() => {
            // Set up test data
            const { thread: thread1, messages: messages1 } = TestData.createThreadWithMessages(2, {
                threadId: 'thread-1',
                personaName: 'Assistant',
                status: 'active'
            });
            
            const { thread: thread2, messages: messages2 } = TestData.createThreadWithMessages(3, {
                threadId: 'thread-2',
                personaName: 'Helper',
                status: 'completed'
            });
            
            stateService.state.conversation.history['thread-1'] = messages1;
            stateService.state.conversation.metadata['thread-1'] = thread1;
            stateService.state.conversation.history['thread-2'] = messages2;
            stateService.state.conversation.metadata['thread-2'] = thread2;
        });

        describe('getConversation', () => {
            it('should return conversation with messages and metadata', () => {
                const result = plugin.getConversation('thread-1');
                
                expect(result.threadId).toBe('thread-1');
                expect(result.messages).toHaveLength(2);
                expect(result.metadata.personaName).toBe('Assistant');
            });
        });

        describe('getConversationMetadata', () => {
            it('should return metadata for thread', () => {
                const result = plugin.getConversationMetadata('thread-2');
                
                expect(result.threadId).toBe('thread-2');
                expect(result.personaName).toBe('Helper');
                expect(result.status).toBe('completed');
            });
        });

        describe('updateConversation', () => {
            it('should update messages and metadata', () => {
                const newMessages = [TestData.createMessage({ content: 'New message' })];
                const newMetadata = { ...stateService.state.conversation.metadata['thread-1'], status: 'completed' };
                
                const result = plugin.updateConversation('thread-1', newMessages, newMetadata);
                
                expect(result).toBe(true);
                expect(stateService.state.conversation.history['thread-1']).toEqual(newMessages);
                expect(stateService.state.conversation.metadata['thread-1'].status).toBe('completed');
            });
        });

        describe('clearConversationHistory', () => {
            it('should clear history and metadata for thread', () => {
                const result = plugin.clearConversationHistory('thread-1');
                
                expect(result).toBe(true);
                expect(stateService.state.conversation.history['thread-1']).toBeUndefined();
                expect(stateService.state.conversation.metadata['thread-1']).toBeUndefined();
                
                // Check event
                StateAssertions.assertEventEmitted(eventBus, EVENTS.CONVERSATION.DELETED,
                    data => data.threadId === 'thread-1');
            });

            it('should return false for non-existent thread', () => {
                const result = plugin.clearConversationHistory('non-existent');
                
                expect(result).toBe(false);
            });
        });
    });

    describe('additional conversation methods from actual implementation', () => {
        it('should create thread ID', () => {
            const threadId = plugin.createThreadId('Alice', 'Assistant');
            expect(threadId).toContain('Alice');
            expect(threadId).toContain('Assistant');
            expect(threadId).toMatch(/^Alice-Assistant-/);
        });

        it('should create new conversation', () => {
            const threadId = plugin.createNewConversation({
                setActive: true,
                tabId: 'test-tab'
            });
            
            expect(threadId).toBeDefined();
            expect(threadId).toMatch(/^/); // Should match the thread ID pattern
            
            // Check the conversation was created
            const conversation = plugin.getConversation(threadId);
            expect(conversation).toBeDefined();
            expect(conversation.metadata).toBeDefined();
        });

        it('should set and get active conversation', () => {
            // Set up a tab first
            const tabId = 'test-tab-123';
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = {
                trackedThreadId: undefined,
                selectedModel: 'chat',
                includePageContent: true,
                useMCP: false,
                useBrowserTools: false,
                autoExecuteTools: false,
            };
            
            // Create a conversation first
            const threadId = plugin.createNewConversation({
                setActive: false,
                tabId: tabId
            });
            
            // Set it as active
            plugin.setActiveConversation(threadId, { tabId });
            
            // Get active thread ID (using the correct method name)
            const activeThreadId = plugin.getActiveThreadId();
            expect(activeThreadId).toBe(threadId);
        });

        it('should list conversations with filters', () => {
            // Create some test conversations
            plugin.storeMessage('thread-active-1', 
                { content: 'Test' }, 
                { content: 'Response' },
                { personaName: 'Assistant', status: 'active' }
            );
            
            plugin.storeMessage('thread-completed-1', 
                { content: 'Test' }, 
                { content: 'Response' },
                { personaName: 'Helper', status: 'completed' }
            );
            
            // Update metadata to set status
            stateService.state.conversation.metadata['thread-completed-1'].status = 'completed';
            
            // Test filtering by status
            const activeConvos = plugin.listConversations({ status: 'active' });
            expect(activeConvos.some(c => c.threadId === 'thread-active-1')).toBe(true);
            expect(activeConvos.some(c => c.threadId === 'thread-completed-1')).toBe(false);
        });

        it('should get conversations by persona', () => {
            // Create conversations for different personas
            plugin.storeMessage('thread-p1', 
                { content: 'Test' }, 
                { content: 'Response' },
                { personaName: 'PersonaOne' }
            );
            
            plugin.storeMessage('thread-p2', 
                { content: 'Test' }, 
                { content: 'Response' },
                { personaName: 'PersonaTwo' }
            );
            
            const result = plugin.getConversationsFor('PersonaOne');
            expect(result).toHaveLength(1);
            expect(result[0].personaName).toBe('PersonaOne');
        });
    });

    describe('markMessage', () => {
        const threadId = 'thread-1';
        const sharedMessageId = 'shared-message-id';

        beforeEach(() => {
            // Create a thread with messages that share the same messageId
            const state = plugin._safeConversationState();
            state.history[threadId] = [
                {
                    messageId: sharedMessageId,
                    role: 'user',
                    content: 'Test user message',
                    timestamp: Date.now()
                },
                {
                    messageId: sharedMessageId,
                    role: 'assistant', 
                    content: 'Test assistant response',
                    timestamp: Date.now() + 1
                },
                {
                    messageId: 'different-id',
                    role: 'user',
                    content: 'Different message',
                    timestamp: Date.now() + 2
                }
            ];
            eventBus.reset();
        });

        it('should mark all messages with the same messageId', () => {
            plugin.markMessage(threadId, sharedMessageId, 'error');
            
            const messages = stateService.state.conversation.history[threadId];
            
            // Both messages with sharedMessageId should be marked
            expect(messages[0].status).toBe('error');
            expect(messages[1].status).toBe('error');
            
            // Message with different ID should not be affected
            expect(messages[2].status).toBeUndefined();
            
            // Check event was emitted
            StateAssertions.assertEventEmitted(eventBus, EVENTS.CONVERSATION.UPDATED,
                data => data.threadId === threadId);
        });

        it('should handle non-existent thread gracefully', () => {
            plugin.markMessage('non-existent-thread', sharedMessageId, 'error');
            
            // Should not throw error, just log warning
            // No events should be emitted
            expect(eventBus.events).toHaveLength(0);
        });

        it('should handle non-existent messageId gracefully', () => {
            plugin.markMessage(threadId, 'non-existent-id', 'error');
            
            const messages = stateService.state.conversation.history[threadId];
            
            // No messages should be modified
            expect(messages[0].status).toBeUndefined();
            expect(messages[1].status).toBeUndefined();
            expect(messages[2].status).toBeUndefined();
            
            // No events should be emitted
            expect(eventBus.events).toHaveLength(0);
        });

        it('should mark only matching messageId even if multiple exist', () => {
            plugin.markMessage(threadId, 'different-id', 'retry');
            
            const messages = stateService.state.conversation.history[threadId];
            
            // Only the message with 'different-id' should be marked
            expect(messages[0].status).toBeUndefined();
            expect(messages[1].status).toBeUndefined();
            expect(messages[2].status).toBe('retry');
            
            // Check event was emitted
            StateAssertions.assertEventEmitted(eventBus, EVENTS.CONVERSATION.UPDATED,
                data => data.threadId === threadId);
        });
    });
});