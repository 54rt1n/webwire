// js/core/context-init.js
import { initializeBackground } from './initialize-background.js';
import { initializeContent } from './initialize-content.js';
import { initializePopup } from './initialize-popup.js';
import { initializePanel } from './initialize-panel.js';
import { EventDispatcher } from '../core/event-dispatcher.js';
import { EVENT_CONTEXT } from '../core/events.js';
import { EventErrorBoundary } from '../core/error-boundary.js';
import { EventBus } from '../core/event-bus.js';

export async function initializeContext(context = null) {
  if (context === null) {
    context = detectContext();
  }
  const eventBus = new EventBus();
  
  const dispatcher = new EventDispatcher(context, eventBus);
  const errorBoundary = new EventErrorBoundary(dispatcher);
  
  // Context-specific setup
  let results = {};
  switch (context) {
    case EVENT_CONTEXT.BACKGROUND:
      /*
        stateService,
        storage,
        centralState,
      */
      results = await initializeBackground(dispatcher);
      break;
    case EVENT_CONTEXT.CONTENT:
      /*
        stateService,
        storage,
        aiClient,
        mcpConnector,
        pageAnalyzer,
      */
      results = await initializeContent(dispatcher);
      break;
    case EVENT_CONTEXT.POPUP:
      /*
        stateService,
        storage,
        actions,
        getStatus,
        getCurrentTab,
      */
      results = await initializePopup(dispatcher);
      break;
    case EVENT_CONTEXT.PANEL:
      /*
        stateService,
        storage,
        aiClient,
        chatState,
        sendToContent,
      */
      results = await initializePanel(dispatcher);
      break;
  }
  return {
    dispatcher,
    errorBoundary,
    ...results,
  };
}

function detectContext() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getBackgroundPage) {
    return EVENT_CONTEXT.BACKGROUND;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    return EVENT_CONTEXT.POPUP;
  }
  if (window.location.href.includes('chrome-extension://')) {
    return EVENT_CONTEXT.POPUP;
  }
  if (window.parent !== window) {
    return EVENT_CONTEXT.PANEL;
  }
  return EVENT_CONTEXT.CONTENT;
}