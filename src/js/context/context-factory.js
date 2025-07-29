import { EventDispatcher } from '../core/event-dispatcher.js';
import { EventErrorBoundary } from '../core/error-boundary.js';
import { MCPConnector } from '../mcp/mcp-connector.js';
import { StateService, ContentStateService } from '../state/state-service.js';
import { StorageManager } from '../storage/storage-manager.js';
import { createInitialState } from '../state/state-container.js';

export async function contextFactory(eventBus, context,
    {storage = false, state = false, contentState = false, ai = false, mcp = false},
    {backgroundIsLocal = false, loadSettings = false, loadState = false, loadStash = false, modelType = null, initialState = null, readInitialState = false, config = null} = {}) {

    if ((ai || mcp) && ((!state || !loadSettings) && (!readInitialState && !initialState))) {
        console.error('[ContextFactory] Invalid context configuration: loading settings is required for AI and MCP', {ai, mcp, state, loadSettings, readInitialState, initialState});
        throw new Error('Invalid context configuration: loading settings is required for AI and MCP');
    }

    if (state && !storage) {
        console.error('[ContextFactory] Invalid context configuration: storage is required for state', {state, storage});
        throw new Error('Invalid context configuration: storage is required for state');
    }

    const results = {};
    results.eventBus = eventBus;
    results.dispatcher = new EventDispatcher(context, results.eventBus, {backgroundIsLocal});
    results.errorBoundary = new EventErrorBoundary(results.dispatcher);

    if (readInitialState) {
        const response = await results.dispatcher.dispatch(
                'GET_WEBWIRE_STATE', 
                {}, 
                { target: 'background' }
            );
        console.log('[ContextFactory] Initial state from background:', response);
        const { tabId, ...state } = response.result;
        initialState = {
            ...createInitialState(tabId),
            ...(state || {})
        };
    }

    if (storage) {
        // Pass storage config from app config if available
        const storageConfig = config ? { storage: config.get('storage', {}) } : {};
        results.storage = new StorageManager(results.eventBus, storageConfig);
    }

    if (state) {
        results.stateService = new StateService(results.eventBus, results.storage.storage);
        if (loadSettings) {
            await results.stateService.settings.loadFromStorage();
        }
        if (loadState) {
            await results.stateService.disk.loadFromStorage();
        }
        if (loadStash) {
            await results.stateService.stash.loadFromStorage();
        }
    } else if (contentState) {
        if (!initialState) {
            throw new Error('Initial state is required for content state');
        }
        console.log('[ContextFactory] Creating content state service with initial state:', initialState);
        results.stateService = new ContentStateService(initialState, results.eventBus);
    }

    // AI client creation removed - now handled lazily by ChatService.getAiClient()

    if (mcp && config && config.get('features.mcp.enabled', false)) {
        const serverUrl = results.stateService.mcp.getMcpServerUrl();
        if (serverUrl) {
            results.mcpConnector = new MCPConnector(serverUrl);
            
            // Apply MCP-specific config
            const reconnectDelay = config.get('features.mcp.reconnectDelay');
            if (reconnectDelay) {
                results.mcpConnector.reconnectDelay = reconnectDelay;
            }
            
            const maxReconnectAttempts = config.get('features.mcp.maxReconnectAttempts');
            if (maxReconnectAttempts) {
                results.mcpConnector.maxReconnectAttempts = maxReconnectAttempts;
            }
        }
    }

    return results;
}