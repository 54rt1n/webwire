import { StorageManager } from '../storage/storage-manager.js';
import { StateService } from '../state/state-service.js';
import { EVENT_CONTEXT } from '../core/events.js';

/**
 * Initialize Background Script Context
 * - Central state authority
 * - Cross-tab message routing
 * - Global settings management
 * @param {EventDispatcher} dispatcher
 * @returns {Promise<{dispatcher: EventDispatcher, stateService: StateService, storage: StorageManager, centralState: Map, context: string}>}
 */
export async function initializeBackground(dispatcher) {
  console.log('[Context] Initializing Background context');
  
  // Background acts as the central state authority
  const storage = new StorageManager(dispatcher);
  const stateService = new StateService(dispatcher, storage.storage);
  
  // Load global settings
  await stateService.settings.loadSettings();
  
  // Setup central state management
  const centralState = new Map();
  
  // Handle state updates from any context
  dispatcher.on('STATE_UPDATE', async (update) => {
    centralState.set(update.type, {
      data: update.data,
      timestamp: Date.now()
    });
    
    // Broadcast to all active tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'STATE_SYNC',
          update
        });
      } catch (e) {
        // Tab doesn't have content script
      }
    }
  });
  
  // Handle extension lifecycle
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.runtime.openOptionsPage();
    }
  });
  
  return {
    stateService,
    storage,
    centralState,
  };
}