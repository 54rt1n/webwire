// js/core/context-init.js
import { EVENT_CONTEXT } from '../core/events.js';
import { contextFactory } from './context-factory.js';

export async function initializeContext(eventBus, context = null, {initialState = null, config = null} = {}) {
  if (context === null) {
    context = detectContext();
  }

  console.log('[ContextInit] Context:', context, config);
  
  // Context-specific setup
  let results = {};
  switch (context) {
    case EVENT_CONTEXT.BACKGROUND:
      /*
        stateService,
        storage,
        centralState,
      */
      results = await contextFactory(eventBus, context,
        {storage: true, state: true, ai: false, mcp: false, sentry: true},
        {backgroundIsLocal: true, loadSettings: true, loadState: true, loadStash: true, loadUi: true, config});
      break;
    case EVENT_CONTEXT.CONTENT:
      /*
        stateService,
        storage,
        aiClient,
        mcpConnector,
        pageAnalyzer,
      */
     // TODO our settings can't be loaded here, so we will need to get them from the background
     // We will need to make our own state-service instance
      const enableMcp = config ? config.get('features.mcp.enabled', false) : false;
      results = await contextFactory(eventBus, context,
        {storage: false, contentState: true, ai: true, mcp: enableMcp},
        {backgroundIsLocal: false, modelType: 'chat', readInitialState: true, config});
      break;
    case EVENT_CONTEXT.POPUP:
      /*
        stateService,
        storage,
        actions,
        getStatus,
        getCurrentTab,
      */
      results = await contextFactory(eventBus, context,
        {storage: true, state: true, ai: false, mcp: false},
        {backgroundIsLocal: true, loadSettings: true, config});
      break;
    case EVENT_CONTEXT.PANEL:
      /*
        stateService,
        storage,
        aiClient,
        chatState,
        sendToContent,
      */
      const enableMcpPanel = config ? config.get('features.mcp.enabled', false) : false;
      results = await contextFactory(eventBus, context,
        {storage: true, state: true, ai: true, mcp: enableMcpPanel, sentry: true},
        {backgroundIsLocal: true, loadSettings: true, loadState: true, loadStash: true, modelType: 'chat', config});
      break;
    case EVENT_CONTEXT.SIMPLE:
      /*
        stateService,
        storage,
      */
      results = await contextFactory(eventBus, context,
        {storage: true, state: true, ai: false, mcp: false},
        {backgroundIsLocal: true, loadSettings: true, config});
      break;
  }
  return results;
}

function detectContext() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getBackgroundPage) {
    return EVENT_CONTEXT.PANEL;
    console.log('[ContextInit] Detected background context', chrome.runtime);
    return EVENT_CONTEXT.BACKGROUND;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    return EVENT_CONTEXT.POPUP;
  }
  if (window.location.href.includes('chrome-extension://')) {
    return EVENT_CONTEXT.PANEL;
  }
  if (window.parent !== window) {
    return EVENT_CONTEXT.PANEL;
  }
  return EVENT_CONTEXT.CONTENT;
}