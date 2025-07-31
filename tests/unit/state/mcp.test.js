import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPStatePlugin } from '../../../src/js/state/plugins/mcp-state.js';
import { createInitialState } from '../../../src/js/state/state-container.js';
import { EVENTS } from '../../../src/js/core/events.js';
import { MockStorageAdapter, MockEventBus, TestData, StateAssertions, setupTest } from './conftest.js';

describe('MCPStatePlugin', () => {
    let plugin, stateService, eventBus, storage;

    beforeEach(() => {
        const setup = setupTest();
        stateService = setup.stateService;
        eventBus = setup.eventBus;
        storage = setup.storage;
        
        plugin = new MCPStatePlugin(stateService);
    });

    describe('constructor', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toStrictEqual(eventBus);
        });
    });

    describe('state access methods', () => {
        it('should get MCP state', () => {
            const result = plugin.getMcpState();
            expect(result).toBe(stateService.state.mcp);
        });

        it('should get MCP connection state', () => {
            const result = plugin.getMcpConnectionState();
            expect(result).toBe(stateService.state.mcp.connection);
        });

        it('should check if MCP is connected', () => {
            stateService.state.mcp.connection.isConnected = true;
            expect(plugin.isMcpConnected()).toBe(true);

            stateService.state.mcp.connection.isConnected = false;
            expect(plugin.isMcpConnected()).toBe(false);
        });

        it('should check if MCP is initialized', () => {
            stateService.state.mcp.connection.isInitialized = true;
            expect(plugin.isMcpInitialized()).toBe(true);

            stateService.state.mcp.connection.isInitialized = false;
            expect(plugin.isMcpInitialized()).toBe(false);
        });

        it('should check if MCP is available', () => {
            stateService.state.mcp.isAvailable = true;
            expect(plugin.isMcpAvailable()).toBe(true);

            stateService.state.mcp.isAvailable = false;
            expect(plugin.isMcpAvailable()).toBe(false);
        });

        it('should get MCP error', () => {
            const error = 'Connection failed';
            stateService.state.mcp.error = error;
            expect(plugin.getMcpError()).toBe(error);
        });
    });

    describe('server URL management', () => {
        it('should get MCP server URL from settings', () => {
            const serverUrl = 'http://localhost:3000';
            stateService.state.settings.mcp.serverUrl = serverUrl;
            expect(plugin.getMcpServerUrl()).toBe(serverUrl);
        });

        it('should set MCP server URL in settings', () => {
            const serverUrl = 'http://localhost:4000';
            plugin.setMcpServerUrl(serverUrl);
            expect(stateService.state.settings.mcp.serverUrl).toBe(serverUrl);
        });

        describe('HTTPS downgrade detection', () => {
            let originalWindow;

            beforeEach(() => {
                originalWindow = global.window;
            });

            afterEach(() => {
                global.window = originalWindow;
            });

            it('should detect HTTPS downgrade', () => {
                global.window = { location: { protocol: 'https:' } };
                plugin.setMcpServerUrl('http://localhost:3000');
                expect(plugin.isHTTPSDowngrade()).toBe(true);
            });

            it('should not detect downgrade for HTTPS to HTTPS', () => {
                global.window = { location: { protocol: 'https:' } };
                plugin.setMcpServerUrl('https://localhost:3000');
                expect(plugin.isHTTPSDowngrade()).toBe(false);
            });

            it('should not detect downgrade for HTTP to HTTP', () => {
                global.window = { location: { protocol: 'http:' } };
                plugin.setMcpServerUrl('http://localhost:3000');
                expect(plugin.isHTTPSDowngrade()).toBe(false);
            });

            it('should handle missing window (service worker context)', () => {
                global.window = undefined;
                plugin.setMcpServerUrl('http://localhost:3000');
                expect(plugin.isHTTPSDowngrade()).toBe(false);
            });

            it('should handle missing server URL', () => {
                global.window = { location: { protocol: 'https:' } };
                plugin.setMcpServerUrl(null);
                expect(plugin.isHTTPSDowngrade()).toBe(false);
            });
        });
    });

    describe('connection management', () => {
        it('should set MCP connection data', () => {
            const connectionData = {
                serverUrl: 'http://localhost:3000',
                sessionId: 'session-123',
                postEndpoint: 'http://localhost:3000/mcp'
            };

            plugin.setMcpConnection(connectionData);

            expect(stateService.state.settings.mcp.serverUrl).toBe(connectionData.serverUrl);
            expect(stateService.state.mcp.connection.sessionId).toBe(connectionData.sessionId);
            expect(stateService.state.mcp.connection.postEndpoint).toBe(connectionData.postEndpoint);
        });

        it('should handle partial connection data', () => {
            plugin.setMcpConnection({ sessionId: 'session-456' });
            expect(stateService.state.mcp.connection.sessionId).toBe('session-456');
        });

        it('should set connection error and update state', () => {
            const error = 'Connection timeout';
            plugin.setMcpConnectionError(error);

            expect(stateService.state.mcp.isAvailable).toBe(false);
            expect(stateService.state.mcp.error).toBe(error);
            expect(stateService.state.mcp.connection.connectionError).toBe(error);
            expect(stateService.state.mcp.connection.isInitialized).toBe(false);
            expect(stateService.state.mcp.connection.isConnected).toBe(false);

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.CONNECTION_ERROR);
        });

        it('should clear connection error', () => {
            stateService.state.mcp.connection.connectionError = 'Some error';
            plugin.clearMcpConnectionError();
            expect(stateService.state.mcp.connection.connectionError).toBeUndefined();
        });

        describe('connection status changes', () => {
            it('should set connected and emit event', () => {
                const serverUrl = 'http://localhost:3000';
                stateService.state.settings.mcp.serverUrl = serverUrl;
                stateService.state.mcp.connection.isConnected = false;

                plugin.setMcpConnected(true);

                expect(stateService.state.mcp.connection.isConnected).toBe(true);
                expect(stateService.state.mcp.connection.serverUrl).toBe(serverUrl);
                expect(stateService.state.mcp.connection.lastConnected).toBeGreaterThan(0);
                expect(stateService.state.mcp.connection.connectionError).toBeUndefined();

                StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.CONNECTED);
            });

            it('should set disconnected and emit event', () => {
                stateService.state.mcp.connection.isConnected = true;
                stateService.state.mcp.connection.isInitialized = true;

                plugin.setMcpConnected(false);

                expect(stateService.state.mcp.connection.isConnected).toBe(false);
                expect(stateService.state.mcp.connection.isInitialized).toBe(false);

                StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.DISCONNECTED);
            });

            it('should not emit events for unchanged state', () => {
                stateService.state.mcp.connection.isConnected = true;
                plugin.setMcpConnected(true);

                const connectedEvents = eventBus.getEmittedEvents(EVENTS.MCP.CONNECTED);
                expect(connectedEvents).toHaveLength(0);
            });
        });

        describe('initialization status', () => {
            it('should set initialized and emit event', () => {
                stateService.state.mcp.connection.isInitialized = false;
                plugin.setMcpInitialized(true);

                expect(stateService.state.mcp.connection.isInitialized).toBe(true);
                StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.INITIALIZED);
            });

            it('should not emit event for unchanged initialization', () => {
                stateService.state.mcp.connection.isInitialized = true;
                plugin.setMcpInitialized(true);

                const initializedEvents = eventBus.getEmittedEvents(EVENTS.MCP.INITIALIZED);
                expect(initializedEvents).toHaveLength(0);
            });
        });
    });

    describe('tools management', () => {
        it('should set MCP tools and emit event', () => {
            const tools = [
                TestData.createMcpTool({ name: 'tool1' }),
                TestData.createMcpTool({ name: 'tool2' })
            ];

            plugin.setMcpTools(tools);

            expect(stateService.state.mcp.tools).toEqual(tools);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.TOOLS_UPDATED, 
                data => data.count === 2);
        });

        it('should handle null tools array', () => {
            plugin.setMcpTools(null);
            expect(stateService.state.mcp.tools).toEqual([]);
        });

        it('should get MCP tools', () => {
            const tools = [TestData.createMcpTool()];
            stateService.state.mcp.tools = tools;
            
            expect(plugin.getMcpTools()).toEqual(tools);
        });

        it('should clear MCP tools', () => {
            stateService.state.mcp.tools = [TestData.createMcpTool()];
            plugin.clearMcpTools();
            
            expect(stateService.state.mcp.tools).toEqual([]);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.TOOLS_UPDATED,
                data => data.count === 0);
        });

        it('should check if tool is available', () => {
            const tools = [
                TestData.createMcpTool({ name: 'available_tool' }),
                TestData.createMcpTool({ name: 'another_tool' })
            ];
            stateService.state.mcp.tools = tools;

            expect(plugin.isTool('available_tool')).toBe(true);
            expect(plugin.isTool('missing_tool')).toBe(false);
        });
    });

    describe('request management', () => {
        it('should add pending request and emit event', () => {
            const requestId = 123;
            const method = 'test_method';
            const params = { input: 'test' };

            plugin.addMcpPendingRequest(requestId, method, params);

            const request = stateService.state.mcp.pendingRequests[requestId];
            expect(request).toEqual({
                id: requestId,
                method,
                params,
                timestamp: expect.any(Number),
                status: 'pending',
                response: undefined,
                error: undefined
            });

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_STARTED,
                data => data.requestId === requestId && data.method === method);
        });

        it('should complete request and emit event', () => {
            const requestId = 123;
            plugin.addMcpPendingRequest(requestId, 'test_method');

            const response = { result: 'success' };
            plugin.completeMcpRequest(requestId, response);

            const request = stateService.state.mcp.pendingRequests[requestId];
            expect(request.status).toBe('completed');
            expect(request.response).toEqual(response);

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_COMPLETED,
                data => data.requestId === requestId);
        });

        it('should fail request and emit event', () => {
            const requestId = 123;
            plugin.addMcpPendingRequest(requestId, 'test_method');

            const error = 'Request failed';
            plugin.failMcpRequest(requestId, error);

            const request = stateService.state.mcp.pendingRequests[requestId];
            expect(request.status).toBe('failed');
            expect(request.error).toBe(error);

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_FAILED,
                data => data.requestId === requestId && data.error === error);
        });

        it('should timeout request and emit event', () => {
            const requestId = 123;
            plugin.addMcpPendingRequest(requestId, 'test_method');

            plugin.timeoutMcpRequest(requestId);

            const request = stateService.state.mcp.pendingRequests[requestId];
            expect(request.status).toBe('timeout');
            expect(request.error).toBe('Request timeout');

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_TIMEOUT,
                data => data.requestId === requestId);
        });

        it('should handle operations on non-existent requests gracefully', () => {
            const requestId = 999;

            expect(() => {
                plugin.completeMcpRequest(requestId, { result: 'test' });
                plugin.failMcpRequest(requestId, 'error');
                plugin.timeoutMcpRequest(requestId);
            }).not.toThrow();
        });

        it('should remove pending request', () => {
            const requestId = 123;
            plugin.addMcpPendingRequest(requestId, 'test_method');
            
            expect(stateService.state.mcp.pendingRequests[requestId]).toBeDefined();
            
            plugin.removeMcpPendingRequest(requestId);
            expect(stateService.state.mcp.pendingRequests[requestId]).toBeUndefined();
        });

        it('should get pending requests', () => {
            plugin.addMcpPendingRequest(1, 'method1');
            plugin.addMcpPendingRequest(2, 'method2');

            const requests = plugin.getMcpPendingRequests();
            expect(Object.keys(requests)).toHaveLength(2);
            expect(requests[1].method).toBe('method1');
            expect(requests[2].method).toBe('method2');
        });

        it('should clear all pending requests', () => {
            plugin.addMcpPendingRequest(1, 'method1');
            plugin.addMcpPendingRequest(2, 'method2');

            plugin.clearMcpPendingRequests();
            expect(plugin.getMcpPendingRequests()).toEqual({});
        });
    });

    describe('system message management', () => {
        it('should set system message in state only', () => {
            const message = 'Test system message';
            plugin.setSystemMessage(message);

            expect(stateService.state.mcp.systemMessage).toBe(message);
            expect(stateService.state.settings.mcp.systemMessage).toBeUndefined();
        });

        it('should set system message in both state and settings', () => {
            const message = 'Test system message';
            plugin.setSystemMessage(message, { setSettings: true });

            expect(stateService.state.mcp.systemMessage).toBe(message);
            expect(stateService.state.settings.mcp.systemMessage).toBe(message);
        });

        it('should get system message from state by default', () => {
            const stateMessage = 'State message';
            const settingsMessage = 'Settings message';
            
            stateService.state.mcp.systemMessage = stateMessage;
            stateService.state.settings.mcp.systemMessage = settingsMessage;

            expect(plugin.getSystemMessage()).toBe(stateMessage);
        });

        it('should get system message from settings when requested', () => {
            const stateMessage = 'State message';
            const settingsMessage = 'Settings message';
            
            stateService.state.mcp.systemMessage = stateMessage;
            stateService.state.settings.mcp.systemMessage = settingsMessage;

            expect(plugin.getSystemMessage({ getSettings: true })).toBe(settingsMessage);
        });

        it('should fallback to settings when state message is undefined', () => {
            const settingsMessage = 'Settings message';
            
            stateService.state.mcp.systemMessage = undefined;
            stateService.state.settings.mcp.systemMessage = settingsMessage;

            expect(plugin.getSystemMessage()).toBe(settingsMessage);
        });

        it('should detect system message changes', () => {
            const originalMessage = 'Original message';
            const newMessage = 'New message';
            
            stateService.state.settings.mcp.systemMessage = originalMessage;
            stateService.state.mcp.systemMessage = originalMessage;
            expect(plugin.hasSystemMessageChanged()).toBe(false);

            stateService.state.mcp.systemMessage = newMessage;
            expect(plugin.hasSystemMessageChanged()).toBe(true);
        });

        it('should clear system message', () => {
            stateService.state.mcp.systemMessage = 'Test message';
            stateService.state.settings.mcp.systemMessage = 'Test message';

            plugin.clearSystemMessage();

            expect(stateService.state.mcp.systemMessage).toBeUndefined();
            expect(stateService.state.settings.mcp.systemMessage).toBeUndefined();
        });
    });

    describe('MCP summary', () => {
        it('should return comprehensive MCP summary', () => {
            // Set up state
            stateService.state.mcp.connection.isConnected = true;
            stateService.state.mcp.connection.isInitialized = true;
            stateService.state.mcp.connection.serverUrl = 'http://localhost:3000';
            stateService.state.mcp.connection.lastConnected = 1234567890;
            stateService.state.mcp.connection.connectionError = 'Some error';
            stateService.state.mcp.tools = [TestData.createMcpTool(), TestData.createMcpTool()];
            
            plugin.addMcpPendingRequest(1, 'method1');
            plugin.addMcpPendingRequest(2, 'method2');

            const summary = plugin.getMcpSummary();

            expect(summary).toEqual({
                isConnected: true,
                isInitialized: true,
                serverUrl: 'http://localhost:3000',
                toolsCount: 2,
                pendingRequestsCount: 2,
                lastConnected: 1234567890,
                hasError: true
            });
        });

        it('should handle empty state in summary', () => {
            const summary = plugin.getMcpSummary();

            expect(summary).toEqual({
                isConnected: false,
                isInitialized: false,
                serverUrl: undefined,
                toolsCount: 0,
                pendingRequestsCount: 0,
                lastConnected: undefined,
                hasError: false
            });
        });
    });

    describe('integration scenarios', () => {
        it('should handle complete connection lifecycle', () => {
            const serverUrl = 'http://localhost:3000';
            const sessionId = 'session-123';
            const tools = [TestData.createMcpTool()];

            // Initial connection
            plugin.setMcpConnection({ serverUrl, sessionId });
            plugin.setMcpConnected(true);
            plugin.setMcpInitialized(true);
            plugin.setMcpTools(tools);

            expect(plugin.isMcpConnected()).toBe(true);
            expect(plugin.isMcpInitialized()).toBe(true);
            expect(plugin.getMcpTools()).toHaveLength(1);

            // Connection error
            plugin.setMcpConnectionError('Network error');
            expect(plugin.isMcpConnected()).toBe(false);
            expect(plugin.isMcpInitialized()).toBe(false);
            expect(plugin.isMcpAvailable()).toBe(false);

            // Verify events were emitted
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.CONNECTED);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.INITIALIZED);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.TOOLS_UPDATED);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.CONNECTION_ERROR);
        });

        it('should handle request lifecycle with success', () => {
            const requestId = 1;
            const method = 'list_files';
            const params = { path: '/home' };
            const response = { files: ['file1.txt', 'file2.txt'] };

            plugin.addMcpPendingRequest(requestId, method, params);
            plugin.completeMcpRequest(requestId, response);

            const request = stateService.state.mcp.pendingRequests[requestId];
            expect(request.status).toBe('completed');
            expect(request.response).toEqual(response);

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_STARTED);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_COMPLETED);
        });

        it('should handle request lifecycle with failure', () => {
            const requestId = 1;
            const method = 'invalid_method';
            const error = 'Method not found';

            plugin.addMcpPendingRequest(requestId, method);
            plugin.failMcpRequest(requestId, error);

            const request = stateService.state.mcp.pendingRequests[requestId];
            expect(request.status).toBe('failed');
            expect(request.error).toBe(error);

            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_STARTED);
            StateAssertions.assertEventEmitted(eventBus, EVENTS.MCP.REQUEST_FAILED);
        });
    });

    describe('edge cases', () => {
        it('should handle malformed state gracefully', () => {
            stateService.state.mcp = null;
            
            expect(() => {
                plugin.getMcpState();
                plugin.isMcpConnected();
            }).toThrow();
        });

        it('should handle operations with missing request tracking', () => {
            stateService.state.mcp.pendingRequests = null;
            
            expect(() => {
                plugin.getMcpPendingRequests();
                plugin.clearMcpPendingRequests();
            }).not.toThrow();
        });

        it('should handle empty tools array operations', () => {
            plugin.clearMcpTools();
            expect(plugin.getMcpTools()).toEqual([]);
            expect(plugin.isTool('any_tool')).toBe(false);
        });
    });
});