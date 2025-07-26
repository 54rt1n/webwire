import { EventErrorBoundary } from './error-boundary.js';
import { EVENT_TYPES, EVENT_CONTEXT } from './events.js';
import { BACKGROUND_ACTIONS } from './cc-actions.js';

export class EventDispatcher {
  constructor(context, eventBus, {backgroundIsLocal = false} = {}) {
    this.context = context;
    this.eventBus = eventBus;
    this.errorBoundary = new EventErrorBoundary(this);
    this.backgroundIsLocal = backgroundIsLocal;
      
    // Track pending cross-context requests
    this.pendingRequests = new Map();
    this.requestId = 0;
    
    // Retry queue for failed messages due to extension context invalidation
    this.retryQueue = [];
    this.isReconnecting = false;
    this.defaultTimeout = 3000;
    this.maxRetries = 3;
    this.retryDelay = 100; // Start with 100ms, exponential backoff
    
    // Setup context-specific communication handlers
    this.setupContextHandlers();
  }

  // ── Core Dispatch Method ──────────────────────────────────────────
  
  async dispatch(event, data, options = {}) {
    const { target = 'local', timeout = this.defaultTimeout, priority = 'normal', tabId = undefined } = options;
    
    try {
      if (target === EVENT_CONTEXT.LOCAL) {
        return this.eventBus.emit(event, data, options);
      }
      
      if (target === EVENT_CONTEXT.BACKGROUND) {
        if (this.backgroundIsLocal) {
          return this.eventBus.emit(event, data, {source: EVENT_CONTEXT.BACKGROUND, tabId});
        }
        return this.sendToBackground(event, data, timeout, tabId);
      }

      if (target === EVENT_CONTEXT.CONTENT) {
        return this.sendToContent(event, data, timeout, tabId);
      }
      
      if (target === EVENT_CONTEXT.PANEL) {
        return this.sendToPanel(event, data, timeout, tabId);
      }
      
      if (target === EVENT_CONTEXT.BROADCAST) {
        return this.broadcast(event, data, options);
      }
      
      throw new Error(`Unknown dispatch target: ${target}`);
      
    } catch (error) {
      console.error(`[EventDispatcher] Dispatch failed:`, { event, target, error: error.message });
      throw error;
    }
  }

  async call(event, data, options = {}) {
    return this.dispatch(event, data, options);
  }

  // ── Cross-Context Communication ──────────────────────────────────

  async sendToBackground(event, data, timeout = this.defaultTimeout, tabId = null) {
    console.log('[EventDispatcher] sendToBackground', event, data, timeout, tabId);
    if (this.context === EVENT_CONTEXT.BACKGROUND && this.backgroundIsLocal) {
      // Already in background, dispatch locally
      return this.eventBus.emit(event, data, {source: EVENT_CONTEXT.BACKGROUND});
    }

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available for background communication');
    }

    return this.sendChromeMessage({
      type: 'CROSS_CONTEXT_EVENT',
      event,
      data,
      source: this.context,
      target: 'background'
    }, timeout);
  }

  async sendToContent(event, data, timeout = this.defaultTimeout, tabId = undefined) {
    console.log('[EventDispatcher] sendToContent', event, data, timeout, tabId);
    if (this.context === EVENT_CONTEXT.CONTENT) {
      // Already in content, dispatch locally
      return this.eventBus.emit(event, data);
    }

    if (this.context === EVENT_CONTEXT.BACKGROUND) {
      // Send to specific tab or all tabs
      if (tabId) {
        return this.sendToSpecificTab(tabId, event, data, timeout);
      } else {
        return this.sendToAllTabs(event, data, timeout);
      }
    }

    if (this.context === EVENT_CONTEXT.POPUP) {
      // Route through background to content
      return this.sendToBackground('ROUTE_TO_CONTENT', {
        event,
        data,
        tabId
      }, timeout);
    }

    if (this.context === EVENT_CONTEXT.PANEL) {
      // Send to parent content script via postMessage
      return this.sendToParentContent(event, data, timeout, tabId);
    }

    throw new Error(`Cannot send to content from context: ${this.context}`);
  }

  async sendToPanel(event, data, timeout = this.defaultTimeout, tabId = undefined) {
    console.log('[EventDispatcher] sendToPanel', event, data, timeout, tabId);
    if (this.context === EVENT_CONTEXT.PANEL) {
      // Already in panel, dispatch locally
      return this.eventBus.emit(event, data, { tabId });
    }

    if (this.context === EVENT_CONTEXT.CONTENT) {
      // Send to injected panel via postMessage
      return this.sendToInjectedPanel(event, data, timeout, tabId);
    }

    // Route through content script
    return this.sendToContent('ROUTE_TO_PANEL', {
      event,
      data,
      tabId
    }, timeout);
  }

  async broadcast(event, data, options = {}) {
    const { exclude = [], includeLocal = true } = options;
    const results = [];

    if (includeLocal && !exclude.includes(EVENT_CONTEXT.LOCAL)) {
      try {
        const localResult = await this.eventBus.emit(event, data);
        results.push({ target: EVENT_CONTEXT.LOCAL, success: true, result: localResult });
      } catch (error) {
        results.push({ target: EVENT_CONTEXT.LOCAL, success: false, error: error.message });
      }
    }

    // Broadcast to other contexts based on current context
    const targets = this.getBroadcastTargets(exclude);
    
    for (const target of targets) {
      try {
        const result = await this.dispatch(event, data, { target, timeout: this.defaultTimeout });
        results.push({ target, success: true, result });
      } catch (error) {
        results.push({ target, success: false, error: error.message });
      }
    }

    return results;
  }

  // ── Chrome Extension Messaging ───────────────────────────────────

  async sendChromeMessage(message, timeout = this.defaultTimeout, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Chrome message timeout after ${timeout}ms`));
      }, timeout);

      // Track request with retry info
      this.pendingRequests.set(requestId, { 
        resolve, 
        reject, 
        timeoutId,
        message,
        timeout,
        retryCount
      });

      // Enhance message with tab context if available
      const enhancedMessage = {
        ...message,
        requestId
      };

      // Add tab context when available and relevant
      this.addTabContextToMessage(enhancedMessage);

      // Send message
      chrome.runtime.sendMessage(enhancedMessage, (response) => {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) return; // Already timed out

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);

        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError.message;
          
          // Check if it's an extension context invalidation
          if (error.includes('Extension context invalidated')) {
            console.warn('[EventDispatcher] Extension context invalidated, queueing for retry');
            
            // Queue for retry
            this.queueForRetry({
              message,
              timeout,
              retryCount,
              resolve,
              reject
            });
            
            // Trigger reconnection process
            this.handleContextInvalidation();
          } else {
            reject(new Error(error));
          }
        } else {
          resolve(response);
        }
      });
    });
  }

  // Helper method to add tab context to messages when available
  addTabContextToMessage(message) {
    // Don't override if message already has tabId
    if (message.tabId) {
      return;
    }

    try {
      // In content script context, we can get the current tab info
      if (this.context === EVENT_CONTEXT.CONTENT && typeof window !== 'undefined') {
        // Note: Content scripts don't have direct access to tab ID
        // but they can indicate they're from a content context
        message.fromContent = true;
      }

      // In popup context, we could potentially get active tab
      // but it's better to let the background script handle this
      if (this.context === EVENT_CONTEXT.POPUP) {
        message.needsActiveTab = true;
      }
    } catch (error) {
      // Ignore errors in tab context detection
      console.debug('Could not add tab context:', error.message);
    }
  }

  async sendToSpecificTab(tabId, event, data, timeout = this.defaultTimeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tab message timeout after ${timeout}ms`));
      }, timeout);

      chrome.tabs.sendMessage(tabId, {
        type: 'CROSS_CONTEXT_EVENT',
        event,
        data,
        source: this.context
      }, (response) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async sendToAllTabs(event, data, timeout = this.defaultTimeout) {
    const tabs = await chrome.tabs.query({});
    const results = [];

    for (const tab of tabs) {
      try {
        const result = await this.sendToSpecificTab(tab.id, event, data, timeout);
        results.push({ tabId: tab.id, success: true, result });
      } catch (error) {
        results.push({ tabId: tab.id, success: false, error: error.message });
      }
    }

    return results;
  }

  // ── PostMessage Communication (Panel ↔ Content) ─────────────────

  async sendToInjectedPanel(event, data, timeout = this.defaultTimeout, tabId = undefined) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Panel message timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      // Find panel iframe/window
      const panelWindow = this.findPanelWindow();
      if (!panelWindow) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(new Error('Panel window not found'));
        return;
      }

      panelWindow.postMessage({
        type: 'CONTENT_TO_PANEL',
        event,
        data,
        requestId,
        source: 'content',
        tabId
      }, '*');
    });
  }

  async sendToParentContent(event, data, timeout = this.defaultTimeout, tabId = undefined) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Content message timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      window.parent.postMessage({
        type: 'PANEL_TO_CONTENT',
        event,
        data,
        requestId,
        source: 'panel',
        tabId
      }, '*');
    });
  }

  // ── Context Setup and Handlers ───────────────────────────────────

  setupContextHandlers() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      this.setupChromeMessageHandler();
    }

    if (typeof window !== 'undefined') {
      this.setupPostMessageHandler();
    }

    // Context-specific setup
    switch (this.context) {
      case EVENT_CONTEXT.BACKGROUND:
        this.setupBackgroundHandlers();
        break;
      case EVENT_CONTEXT.CONTENT:
        this.setupContentHandlers();
        break;
      case EVENT_CONTEXT.POPUP:
        this.setupPopupHandlers();
        break;
      case EVENT_CONTEXT.PANEL:
        this.setupPanelHandlers();
        break;
    }
  }

  setupChromeMessageHandler() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'CROSS_CONTEXT_EVENT') {
        this.handleCrossContextEvent(message, sender, sendResponse);
        return true; // Keep channel open for async response
      }

      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const pending = this.pendingRequests.get(message.requestId);
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message);
        return;
      }

      return false;
    });
  }

  setupPostMessageHandler() {
    window.addEventListener('message', (event) => {
      if (event.source === window) return; // Ignore same-window messages

      const { type, event: eventName, data, requestId } = event.data;

      if (type === 'CONTENT_TO_PANEL' && this.context === EVENT_CONTEXT.PANEL) {
        this.handlePanelMessage(eventName, data, requestId, event.source);
      }

      if (type === 'PANEL_TO_CONTENT' && this.context === EVENT_CONTEXT.CONTENT) {
        this.handleContentMessage(eventName, data, requestId, event.source);
      }

      if (requestId && this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId);
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);
        pending.resolve(event.data);
      }
    });
  }

  setupCrossContextListener(event, handler, source, options = {}) {
    // Create a wrapper that only handles events from the specified source
    const wrappedHandler = (eventData, metadata = {}) => {
      if (metadata.source === source || source === 'any') {
        return handler(eventData, metadata);
      }
    };

    return this.eventBus.on(`cross_context:${event}`, wrappedHandler, options);
  }

  // ── Event Handlers ───────────────────────────────────────────────

  async handleCrossContextEvent(message, sender, sendResponse) {
    try {
      const result = await this.eventBus.emitAsync(message.event, message.data, {
        source: message.source,
        sender
      });
      
      sendResponse({ success: true, result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  handlePanelMessage(event, data, requestId, source, options = {}) {
    this.eventBus.emit(event, data, { source: EVENT_CONTEXT.PANEL, ...options })
      .then(result => {
        if (requestId) {
          source.postMessage({
            type: 'CONTENT_RESPONSE',
            requestId,
            success: true,
            result
          }, '*');
        }
      })
      .catch(error => {
        if (requestId) {
          source.postMessage({
            type: 'CONTENT_RESPONSE',
            requestId,
            success: false,
            error: error.message
          }, '*');
        }
      });
  }

  handleContentMessage(event, data, requestId, source) {
    this.eventBus.emit(event, data, { source: EVENT_CONTEXT.CONTENT })
      .then(result => {
        if (requestId) {
          source.postMessage({
            type: 'PANEL_RESPONSE',
            requestId,
            success: true,
            result
          }, '*');
        }
      })
      .catch(error => {
        if (requestId) {
          source.postMessage({
            type: 'PANEL_RESPONSE',
            requestId,
            success: false,
            error: error.message
          }, '*');
        }
      });
  }

  // ── Context-Specific Handlers ────────────────────────────────────

  setupBackgroundHandlers() {
  }

  setupContentHandlers() {
  }

  setupPopupHandlers() {
  }

  setupPanelHandlers() {
  }

  // ── Utility Methods ──────────────────────────────────────────────

  // Send event with explicit tab context
  async dispatchWithTab(event, data, tabId, options = {}) {
    const enhancedOptions = {
      ...options,
      target: options.target || EVENT_CONTEXT.BACKGROUND
    };
    
    const enhancedData = {
      ...data,
      tabId
    };
    
    return this.dispatch(event, enhancedData, enhancedOptions);
  }

  getBroadcastTargets(exclude = []) {
    const allTargets = [EVENT_CONTEXT.BACKGROUND, EVENT_CONTEXT.CONTENT, EVENT_CONTEXT.PANEL];
    return allTargets.filter(target => 
      target !== this.context && !exclude.includes(target)
    );
  }

  findPanelWindow() {
    // Look for panel iframe or popup window
    const panelFrame = document.querySelector('#ww-panel iframe');
    if (panelFrame) {
      return panelFrame.contentWindow;
    }

    // Look for panel elements that might have their own window context
    const panelContainer = document.querySelector('#webwire-container');
    if (panelContainer && panelContainer.contentWindow) {
      return panelContainer.contentWindow;
    }

    return null;
  }

  // ── Debugging and Utilities ──────────────────────────────────────

  // ── Retry and Reconnection Logic ─────────────────────────────────
  
  queueForRetry(retryInfo) {
    if (retryInfo.retryCount >= this.maxRetries) {
      console.error('[EventDispatcher] Max retries reached, failing message');
      retryInfo.reject(new Error('Max retries reached after extension context invalidation'));
      return;
    }
    
    this.retryQueue.push(retryInfo);
    console.log(`[EventDispatcher] Queued message for retry (${this.retryQueue.length} in queue)`);
  }
  
  async handleContextInvalidation() {
    if (this.isReconnecting) {
      console.log('[EventDispatcher] Already reconnecting, skipping');
      return;
    }
    
    this.isReconnecting = true;
    console.log('[EventDispatcher] Starting reconnection process');
    
    // Wait a bit for the extension to stabilize
    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    
    // Test if we can communicate
    try {
      await this.testConnection();
      console.log('[EventDispatcher] Connection restored, processing retry queue');
      
      // Process all queued messages
      await this.processRetryQueue();
      
    } catch (error) {
      console.error('[EventDispatcher] Connection test failed:', error);
      // Exponential backoff
      this.retryDelay = Math.min(this.retryDelay * 2, 5000);
      
      // Try again
      setTimeout(() => {
        this.isReconnecting = false;
        this.handleContextInvalidation();
      }, this.retryDelay);
    }
    
    this.isReconnecting = false;
  }
  
  async testConnection() {
    // Use BACKGROUND_ACTIONS.PING to test connection
    return new Promise((resolve, reject) => {
      const testMessage = {
        type: 'CROSS_CONTEXT_EVENT',
        event: BACKGROUND_ACTIONS.PING,
        data: {},
        source: this.context,
        target: 'background'
      };
      
      chrome.runtime.sendMessage(testMessage, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error('Invalid response from background'));
        }
      });
    });
  }
  
  async processRetryQueue() {
    console.log(`[EventDispatcher] Processing ${this.retryQueue.length} queued messages`);
    
    // Process all queued messages
    while (this.retryQueue.length > 0) {
      const retryInfo = this.retryQueue.shift();
      
      try {
        // Retry the message with incremented retry count
        const result = await this.sendChromeMessage(
          retryInfo.message,
          retryInfo.timeout,
          retryInfo.retryCount + 1
        );
        
        // Success! Resolve the original promise
        retryInfo.resolve(result);
        console.log('[EventDispatcher] Successfully retried message');
        
      } catch (error) {
        console.error('[EventDispatcher] Retry failed:', error);
        
        // If it's another invalidation, it will be re-queued
        // Otherwise, reject the original promise
        if (!error.message.includes('Extension context invalidated')) {
          retryInfo.reject(error);
        }
      }
    }
    
    // Reset retry delay after successful processing
    this.retryDelay = 100;
  }

  getStats() {
    return {
      context: this.context,
      pendingRequests: this.pendingRequests.size,
      retryQueueSize: this.retryQueue.length,
      isReconnecting: this.isReconnecting,
      errorBoundaryStats: this.errorBoundary.getErrorStats(),
      eventBusStats: this.eventBus.getTotalListeners()
    };
  }

  destroy() {
    // Clear pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('EventDispatcher destroyed'));
    }
    this.pendingRequests.clear();
    
    // Clear retry queue
    for (const retryInfo of this.retryQueue) {
      retryInfo.reject(new Error('EventDispatcher destroyed'));
    }
    this.retryQueue = [];

    // Cleanup event bus
    this.eventBus.destroy();
  }
}