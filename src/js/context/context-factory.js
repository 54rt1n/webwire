import { EventDispatcher } from '../core/event-dispatcher.js';
import { EventErrorBoundary } from '../core/error-boundary.js';
import { MCPConnector } from '../mcp/mcp-connector.js';
import { StateService, ContentStateService } from '../state/state-service.js';
import { StorageManager } from '../storage/storage-manager.js';
import { createInitialState } from '../state/state-container.js';
import { PromptLoader } from '../utils/prompt-loader.js';
import { SentryService } from '../core/sentry-service.js';
import { logger } from '../core/logging.js';

export async function contextFactory(eventBus, context,
    {storage = false, state = false, contentState = false, ai = false, mcp = false, sentry = false},
    {backgroundIsLocal = false, loadSettings = false, loadState = false, loadStash = false, modelType = null, initialState = null, readInitialState = false, config = null} = {}) {

    if ((ai || mcp) && ((!state || !loadSettings) && (!readInitialState && !initialState))) {
        logger.error('ContextFactory', 'Invalid context configuration: loading settings is required for AI and MCP', {ai, mcp, state, loadSettings, readInitialState, initialState});
        throw new Error('Invalid context configuration: loading settings is required for AI and MCP');
    }

    if (state && !storage) {
        logger.error('ContextFactory', 'Invalid context configuration: storage is required for state', {state, storage});
        throw new Error('Invalid context configuration: storage is required for state');
    }

    const results = {};
    results.eventBus = eventBus;
    results.dispatcher = new EventDispatcher(context, results.eventBus, {backgroundIsLocal});
    results.errorBoundary = new EventErrorBoundary(results.dispatcher);
    
    // Sentry for background context only
    if (sentry && config) {
        const sentryConfig = {
            dsn: config.get('sentry.dsn'),
            context: context,
            environment: config.get('sentry.environment', 'production')
        };
        results.sentryService = new SentryService(sentryConfig);
    }

    if (readInitialState) {
        const response = await results.dispatcher.dispatch(
                'GET_WEBWIRE_STATE', 
                {}, 
                { target: 'background' }
            );
        logger.log('ContextFactory', 'Initial state from background:', response);
        const { tabId, ...state } = response.result;
        initialState = {
            ...createInitialState(tabId),
            ...(state || {})
        };
        
        // Ensure the tab ID is preserved in the UI state
        if (tabId && initialState.ui) {
            initialState.ui.tabId = tabId;
        }
        
        logger.log('ContextFactory', 'Final initial state with tab ID:', tabId, 'UI state:', initialState.ui);
    }

    if (storage) {
        // Pass storage config from app config if available
        const storageConfig = config ? { storage: config.get('storage', {}) } : {};
        results.storage = new StorageManager(results.eventBus, storageConfig);
    }

    if (state) {
        results.stateService = new StateService(results.eventBus, results.storage.storage, config);
        if (loadSettings) {
            await results.stateService.settings.loadFromStorage();
            // Initialize Sentry after settings are loaded
            if (results.sentryService) {
                const crashReportingEnabled = results.stateService.settings.getCrashReportingEnabled();
                await results.sentryService.initialize(crashReportingEnabled);
            }
        }
        if (loadState) {
            await results.stateService.disk.loadFromStorage();
            // Also load prompts from storage
            await results.stateService.prompts.loadFromStorage();
        }
        if (loadStash) {
            await results.stateService.stash.loadFromStorage();
        }
        
        // Initialize prompts if this is a background context with full state
        if (backgroundIsLocal && loadState) {
            try {
                // Check if prompts already exist in state (from storage)
                const existingPrompts = results.stateService.prompts.getAllPrompts();
                
                if (Object.keys(existingPrompts).length === 0) {
                    // First time - load default prompts from JSON files
                    logger.log('ContextFactory', 'No prompts found in storage, loading defaults from JSON files...');
                    const defaultPrompts = await PromptLoader.loadPromptsWithFallback();
                    
                    if (Object.keys(defaultPrompts).length > 0) {
                        logger.log('ContextFactory', 'Loaded default prompts:', Object.keys(defaultPrompts));
                        
                        // Add prompts one by one to get proper display order
                        for (const [promptId, promptData] of Object.entries(defaultPrompts)) {
                            results.stateService.prompts.setPrompt(promptId, promptData);
                        }
                        
                        // Save to storage for next time
                        await results.stateService.prompts.saveToStorage();
                        logger.log('ContextFactory', 'Prompts saved to storage');
                    } else {
                        logger.warn('ContextFactory', 'No default prompts found in JSON files');
                    }
                } else {
                    logger.log('ContextFactory', 'Found existing prompts in storage:', Object.keys(existingPrompts));
                }
                
                // Verify prompts are in state
                const finalPrompts = results.stateService.prompts.getAllPrompts();
                logger.log('ContextFactory', 'Final prompts in state:', finalPrompts);
            } catch (error) {
                logger.error('ContextFactory', 'Failed to initialize prompts:', error);
            }
        }
        
    } else if (contentState) {
        if (!initialState) {
            throw new Error('Initial state is required for content state');
        }
        logger.log('ContextFactory', 'Creating content state service with initial state:', initialState);
        results.stateService = new ContentStateService(initialState, results.eventBus, config);
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