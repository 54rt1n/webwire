import { StorageManager } from '../storage/storage-manager.js';
import { StateService } from '../state/state-service.js';

/**
 * Initialize Popup Context
 * - Quick status display
 * - Extension actions
 * - Settings shortcuts
 */
export async function initializePopup(dispatcher) {
  console.log('[Context] Initializing Popup context');
  
  // Popup is lightweight - mainly for UI and quick actions
  const storage = new StorageManager(dispatcher);
  const stateService = new StateService(dispatcher, storage.storage);
  
  // Load minimal state for status display
  await stateService.settings.loadSettings();
  
  // Get current tab for context-aware actions
  const getCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  };
  
  // Quick actions
  const actions = {
    togglePanel: async () => {
      const tab = await getCurrentTab();
      return chrome.tabs.sendMessage(tab.id, {
        action: 'TOGGLE_WEBWIRE_PANEL'
      });
    },
    
    analyzePage: async () => {
      const tab = await getCurrentTab();
      return chrome.tabs.sendMessage(tab.id, {
        action: 'ANALYZE_PAGE'
      });
    },
    
    openOptions: () => chrome.runtime.openOptionsPage()
  };
  
  // Get status from background
  const getStatus = async () => {
    return dispatcher.dispatch('GET_STATUS', {}, { 
      target: 'background',
      timeout: 2000 
    });
  };
  
  return {
    stateService,
    storage,
    actions,
    getStatus,
    getCurrentTab,
  };
}