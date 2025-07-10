import { StorageManager } from '../storage/storage-manager.js';
import { StateService } from '../state/state-service.js';
import { AIClientFactory } from '../ai/ai-client-factory.js';
import { MCPConnector } from '../mcp/mcp-connector.js';

/**
 * Initialize Content Script Context
 * - Page analysis capabilities
 * - Panel injection and management
 * - Local AI processing
 */
export async function initializeContent(dispatcher) {
  console.log('[Context] Initializing Content context');
  
  const storage = new StorageManager(dispatcher);
  const stateService = new StateService(dispatcher, storage.storage);
  
  // Load settings and state
  await stateService.settings.loadSettings();
  await stateService.disk.loadFromStorage();
  
  // Setup AI client for page analysis
  let aiClient = null;
  const modelConfig = stateService.settings.getModelConfig('chat');
  if (modelConfig && modelConfig.provider && modelConfig.model) {
    aiClient = AIClientFactory.createClient(dispatcher, modelConfig);
  }
  
  // Setup MCP connector if configured
  let mcpConnector = null;
  const mcpUrl = stateService.state.settings?.mcp?.serverUrl;
  const autoConnect = stateService.state.settings?.mcp?.autoConnect;
  if (mcpUrl && autoConnect) {
    mcpConnector = new MCPConnector(mcpUrl);
    try {
      await mcpConnector.initialize(stateService);
    } catch (error) {
      console.warn('[Content] MCP auto-connect failed:', error);
    }
  }
  
  // Listen for state sync from background
  dispatcher.on('STATE_SYNC', (update) => {
    stateService.syncFromBackground(update);
  });
  
  // Page analysis capabilities
  const pageAnalyzer = {
    extractContent: () => {
      return {
        title: document.title,
        url: window.location.href,
        text: document.body.innerText.slice(0, 10000),
        headings: Array.from(document.querySelectorAll('h1,h2,h3'))
          .map(h => ({ level: h.tagName, text: h.textContent.trim() }))
      };
    }
  };
  
  return {
    stateService,
    storage,
    aiClient,
    mcpConnector,
    pageAnalyzer,
  };
}