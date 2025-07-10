import { AIClientFactory } from '../ai/ai-client-factory.js';
import { EventDispatcher } from '../core/event-dispatcher.js';
import { EventErrorBoundary } from '../core/error-boundary.js';
import { MCPConnector } from '../mcp/mcp-connector.js';
import { StateService } from '../state/state-service.js';
import { StorageManager } from '../storage/storage-manager.js';

export async function contextFactory(eventBus, context,
    {storage = false, state = false, ai = false, mcp = false},
    {backgroundIsLocal = false, loadSettings = false, loadState = false, loadStash = false, modelType = null} = {}) {

    if ((ai || mcp) && (!state || !loadSettings)) {
        throw new Error('Invalid context configuration: loading settings is required for AI and MCP');
    }

    const results = {};
    results.eventBus = eventBus;
    results.dispatcher = new EventDispatcher(context, results.eventBus, {backgroundIsLocal});
    results.errorBoundary = new EventErrorBoundary(results.dispatcher);

    if (storage) {
        results.storage = new StorageManager(results.eventBus);
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
    }

    if (ai) {
        results.aiClient = AIClientFactory.createClient(results.eventBus, results.stateService.settings.getModelConfig(modelType));
    }

    if (mcp) {
        const serverUrl = results.stateService.state.settings?.mcp?.serverUrl;
        if (serverUrl) {
            results.mcpConnector = new MCPConnector(serverUrl);
        }
    }

    return results;
}