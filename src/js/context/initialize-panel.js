import { StorageManager } from '../storage/storage-manager.js';
import { StateService } from '../state/state-service.js';
import { AIClientFactory } from '../ai/ai-client-factory.js';
import { MCPConnector } from '../mcp/mcp-connector.js';

/**
 * Initialize Panel Context (Injected UI)
 * - Chat interface
 * - Real-time AI streaming
 * - MCP tool execution
 * - Local interaction state
 */
export async function initializePanel(dispatcher) {
  console.log('[Context] Initializing Panel context');
  
  // Panel needs full functionality but isolated state
  const storage = new StorageManager(dispatcher);
  const stateService = new StateService(dispatcher, storage.storage);
  
  // Load state but don't auto-save (content script handles persistence)
  await stateService.settings.loadSettings();
  
  // Setup AI client for chat
  let aiClient = null;
  const modelConfig = stateService.settings.getModelConfig('chat');
  if (modelConfig && modelConfig.provider && modelConfig.model) {
    aiClient = AIClientFactory.createClient(dispatcher, modelConfig);
  }
  
  // Chat state management
  const chatState = {
    conversationId: 'panel-' + Date.now(),
    isStreaming: false,
    currentMessage: null
  };
  
  // Real-time streaming handler
  dispatcher.on('AI_STREAM_CHUNK', ({ chunk }) => {
    if (chatState.isStreaming && chatState.currentMessage) {
      // Update UI with streaming content
      updateStreamingMessage(chatState.currentMessage, chunk);
    }
  });
  
  // Communication with content script
  const sendToContent = (message) => {
    window.parent.postMessage({
      type: 'PANEL_TO_CONTENT',
      ...message
    }, '*');
  };
  
  // Listen for messages from content script
  window.addEventListener('message', (event) => {
    if (event.data.type === 'CONTENT_TO_PANEL') {
      dispatcher.dispatch('CONTENT_MESSAGE', event.data);
    }
  });
  
  return {
    stateService,
    storage,
    aiClient,
    chatState,
    sendToContent,
  };
}