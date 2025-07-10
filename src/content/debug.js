/**
 * WebWire Content Script Debug Methods
 * 
 * Debug utilities and testing methods for the WebWire content script.
 * Updated for the new ChatService architecture.
 */

import { pageUtils } from './page-utils.js';

// Export functions for testing and debugging
let webwireContentHost = null;

export function setWebWireInstance(instance) {
    webwireContentHost = instance;
}

export function getWebWireInstance() {
    return webwireContentHost;
}

export function isWebWireReady() {
    return webwireContentHost && webwireContentHost.chatService && webwireContentHost.chatService.isReady();
}

/**
 * Setup debug methods on the WebWire class prototype
 * @param {Function} WebWireContentHost - The main content host class
 */
export function setupDebugMethods(WebWireContentHost) {
    // Add debug methods to the WebWire class prototype for window access
    if (typeof window !== 'undefined') {
        
        /**
         * Get current debug state
         */
        WebWireContentHost.prototype.debug = function() {
            return {
                panelInjected: this.chatService.isReady(),
                mcpConnected: this.chatService.mcpConnector ? true : false,
                aiClientConfigured: this.chatService.aiClient ? true : false,
                currentThreadId: this.currentThreadId,
                frameworkReady: true,
                streamingActive: this.chatService.streamingState.isActive,
                currentContent: this.chatService.streamingState.currentContent,
                currentSettings: this.currentSettings,
                eventBusReady: this.eventBus ? true : false,
                totalEventListeners: this.eventBus ? this.eventBus.getTotalListeners() : 0
            };
        };

        /**
         * Force inject the panel
         */
        WebWireContentHost.prototype.forceInject = function() {
            console.log('Force injecting WebWire panel...');
            return this.injectPanel();
        };

        /**
         * Force toggle the panel
         */
        WebWireContentHost.prototype.forceToggle = function() {
            console.log('Force toggling WebWire panel...');
            this.chatService.togglePanel();
        };

        /**
         * Get current page information
         */
        WebWireContentHost.prototype.getPageInfo = function() {
            console.log('Getting page content...');
            return pageUtils.getCurrentPageContent();
        };

        /**
         * Debug message enhancement functionality
         */
        WebWireContentHost.prototype.debugMessageEnhancement = function(testMessage = 'Test message') {
            console.log('=== WebWire Message Enhancement Debug ===');
            const original = testMessage;
            const enhanced = pageUtils.enhanceMessageWithContext(testMessage);
            
            console.log('Original Message:', original);
            console.log('Enhanced Message (sent to API):', enhanced);
            console.log('Difference in length:', enhanced.length - original.length, 'characters');
            
            return {
                original,
                enhanced,
                lengthDiff: enhanced.length - original.length
            };
        };

        /**
         * Debug panel persistence functionality
         */
        WebWireContentHost.prototype.debugPanelPersistence = function() {
            console.log('=== WebWire Panel Persistence Debug ===');
            console.log('Current panel visible state:', this.chatService.panel.isVisible);
            
            const testActions = {
                showPanel: () => {
                    console.log('Testing: Show panel (will persist state to background)');
                    return this.chatService.showPanel();
                },
                hidePanel: () => {
                    console.log('Testing: Hide panel (will persist state to background)');
                    return this.chatService.hidePanel();
                },
                togglePanel: () => {
                    console.log('Testing: Toggle panel (will persist state to background)');
                    return this.chatService.togglePanel();
                },
                checkBackgroundState: async () => {
                    console.log('Testing: Check background state');
                    const state = await this.getBackgroundState();
                    console.log('Background state:', state);
                    console.log('Panel visible in background:', state?.ui?.panelVisible);
                    return state;
                },
                testRestore: async () => {
                    console.log('Testing: Restore panel from background state');
                    const state = await this.getBackgroundState();
                    const shouldShow = state?.ui?.panelVisible || false;
                    console.log('Should show panel:', shouldShow);
                    if (shouldShow) {
                        this.chatService.showPanel();
                        console.log('Panel restored to visible state');
                    } else {
                        this.chatService.hidePanel();
                        console.log('Panel restored to hidden state');
                    }
                    return shouldShow;
                }
            };
            
            console.log('Available test actions:', Object.keys(testActions));
            console.log('Usage: webwire.debugPanelPersistence().showPanel()');
            console.log('Usage: webwire.debugPanelPersistence().checkBackgroundState()');
            
            return testActions;
        };

        /**
         * Debug event system functionality
         */
        WebWireContentHost.prototype.debugEventSystem = function() {
            console.log('=== WebWire Event System Debug ===');
            
            const eventBusStats = {
                totalListeners: this.eventBus.getTotalListeners(),
                eventNames: this.eventBus.getEventNames(),
                listenerCounts: {}
            };
            
            // Get listener counts for each event
            for (const eventName of eventBusStats.eventNames) {
                eventBusStats.listenerCounts[eventName] = this.eventBus.listenerCount(eventName);
            }
            
            console.log('Event Bus Statistics:', eventBusStats);
            
            const testActions = {
                sendTestMessage: (message = 'Test message from debug') => {
                    console.log('Testing: Send test message to ChatService');
                    this.eventBus.emit('chat:send-message', { message });
                },
                triggerPageAnalysis: () => {
                    console.log('Testing: Trigger page analysis');
                    this.eventBus.emit('chat:analyze-page', {});
                },
                testSettingsUpdate: (testSettings = { test: true }) => {
                    console.log('Testing: Settings update event');
                    this.eventBus.emit('chat:update-settings', { settings: testSettings });
                },
                listAllEvents: () => {
                    console.log('All registered events:', this.eventBus.getEventNames());
                    return this.eventBus.getEventNames();
                }
            };
            
            console.log('Available test actions:', Object.keys(testActions));
            console.log('Usage: webwire.debugEventSystem().sendTestMessage("Hello!")');
            
            return testActions;
        };

        /**
         * Debug ChatService functionality
         */
        WebWireContentHost.prototype.debugChatService = function() {
            console.log('=== WebWire ChatService Debug ===');
            
            const chatServiceState = {
                isReady: this.chatService.isReady(),
                hasAIClient: this.chatService.aiClient ? true : false,
                hasMCPConnector: this.chatService.mcpConnector ? true : false,
                currentSettings: this.chatService.currentSettings,
                streamingState: this.chatService.streamingState
            };
            
            console.log('ChatService State:', chatServiceState);
            
            return {
                chatService: this.chatService,
                state: chatServiceState,
                panel: this.chatService.panel
            };
        };

        console.log('[WebWire Debug] Debug methods attached to WebWireContentHost prototype');
    }
}

/**
 * Setup global debug access on the window object
 * @param {Object} instance - The WebWire content host instance
 */
export function setupGlobalDebugAccess(instance) {
    if (typeof window !== 'undefined') {
        window.webwireContentHost = instance;
        window.webwire = instance; // Shorter alias
        console.log('WebWire hooked to window.webwireContentHost and window.webwire');
        
        // Store instance for debug functions
        setWebWireInstance(instance);
    }
} 