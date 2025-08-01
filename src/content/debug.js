/**
 * WebWire Content Script Debug Methods
 * 
 * Debug utilities and testing methods for the WebWire content script.
 * Updated for the new ChatService architecture.
 */

import { PageUtils } from '../js/browser/page-utils.js';
import { EVENTS } from '../js/core/events.js';
import { logger } from '../js/core/logging.js';

// Export functions for testing and debugging
let webwireContentHost = null;
const DEBUGGER_NAME = 'DebugHost'

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
            logger.log(DEBUGGER_NAME, 'Force injecting WebWire panel...');
            return this.injectPanel();
        };

        /**
         * Force toggle the panel
         */
        WebWireContentHost.prototype.forceToggle = function() {
            logger.log(DEBUGGER_NAME, 'Force toggling WebWire panel...');
            this.chatService.togglePanel();
        };

        /**
         * Get current page information
         */
        WebWireContentHost.prototype.getPageInfo = function() {
            logger.log(DEBUGGER_NAME, 'Getting page content...');
            const pageUtils = new PageUtils();
            return pageUtils.getCurrentPageContent();
        };

        /**
         * Debug message enhancement functionality
         */
        WebWireContentHost.prototype.debugMessageEnhancement = function(testMessage = 'Test message') {
            logger.log(DEBUGGER_NAME, '=== WebWire Message Enhancement Debug ===');
            const pageUtils = new PageUtils();
            const original = testMessage;
            const enhanced = pageUtils.enhanceMessageWithContext(testMessage);
            
            logger.log(DEBUGGER_NAME, 'Original Message:', original);
            logger.log(DEBUGGER_NAME, 'Enhanced Message (sent to API):', enhanced);
            logger.log(DEBUGGER_NAME, 'Difference in length:', enhanced.length - original.length, 'characters');
            
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
            logger.log(DEBUGGER_NAME, '=== WebWire Panel Persistence Debug ===');
            logger.log(DEBUGGER_NAME, 'Current panel visible state:', this.chatService.panel.isVisible);
            
            const testActions = {
                showPanel: () => {
                    logger.log(DEBUGGER_NAME, 'Testing: Show panel (will persist state to background)');
                    return this.chatService.showPanel();
                },
                hidePanel: () => {
                    logger.log(DEBUGGER_NAME, 'Testing: Hide panel (will persist state to background)');
                    return this.chatService.hidePanel();
                },
                togglePanel: () => {
                    logger.log(DEBUGGER_NAME, 'Testing: Toggle panel (will persist state to background)');
                    return this.chatService.togglePanel();
                },
                checkBackgroundState: async () => {
                        logger.log(DEBUGGER_NAME, 'Testing: Check background state');
                    const state = await this.getBackgroundState();
                    logger.log(DEBUGGER_NAME, 'Background state:', state);
                    logger.log(DEBUGGER_NAME, 'Panel visible in background:', state?.ui?.panelVisible);
                    return state;
                },
                testRestore: async () => {
                    logger.log(DEBUGGER_NAME, 'Testing: Restore panel from background state');
                    const state = await this.getBackgroundState();
                    const shouldShow = state?.ui?.panelVisible || false;
                    logger.log(DEBUGGER_NAME, 'Should show panel:', shouldShow);
                    if (shouldShow) {
                        this.chatService.showPanel();
                        logger.log(DEBUGGER_NAME, 'Panel restored to visible state');
                    } else {
                        this.chatService.hidePanel();
                        logger.log(DEBUGGER_NAME, 'Panel restored to hidden state');
                    }
                    return shouldShow;
                }
            };
            
            logger.log(DEBUGGER_NAME, 'Available test actions:', Object.keys(testActions));
            logger.log(DEBUGGER_NAME, 'Usage: webwire.debugPanelPersistence().showPanel()');
            logger.log(DEBUGGER_NAME, 'Usage: webwire.debugPanelPersistence().checkBackgroundState()');
            
            return testActions;
        };

        /**
         * Debug event system functionality
         */
        WebWireContentHost.prototype.debugEventSystem = function() {
            logger.log(DEBUGGER_NAME, '=== WebWire Event System Debug ===');
            
            const eventBusStats = {
                totalListeners: this.eventBus.getTotalListeners(),
                eventNames: this.eventBus.getEventNames(),
                listenerCounts: {}
            };
            
            // Get listener counts for each event
            for (const eventName of eventBusStats.eventNames) {
                eventBusStats.listenerCounts[eventName] = this.eventBus.listenerCount(eventName);
            }
            
            logger.log(DEBUGGER_NAME, 'Event Bus Statistics:', eventBusStats);
            
            const testActions = {
                sendTestMessage: (message = 'Test message from debug') => {
                    logger.log(DEBUGGER_NAME, 'Testing: Send test message to ChatService');
                    this.eventBus.emit(EVENTS.CHAT.SEND_MESSAGE, { message });
                },
                triggerPageAnalysis: () => {
                    logger.log(DEBUGGER_NAME, 'Testing: Trigger page analysis');
                    this.eventBus.emit(EVENTS.CHAT.ANALYZE_PAGE, {});
                },
                testSettingsUpdate: (testSettings = { test: true }) => {
                    logger.log(DEBUGGER_NAME, 'Testing: Settings update event');
                    this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, { settings: testSettings });
                },
                listAllEvents: () => {
                    logger.log(DEBUGGER_NAME, 'All registered events:', this.eventBus.getEventNames());
                    return this.eventBus.getEventNames();
                }
            };
            
            logger.log(DEBUGGER_NAME, 'Available test actions:', Object.keys(testActions));
            logger.log(DEBUGGER_NAME, 'Usage: webwire.debugEventSystem().sendTestMessage("Hello!")');
            
            return testActions;
        };

        /**
         * Debug ChatService functionality
         */
        WebWireContentHost.prototype.debugChatService = function() {
            logger.log(DEBUGGER_NAME, '=== WebWire ChatService Debug ===');
            
            const chatServiceState = {
                isReady: this.chatService.isReady(),
                hasAIClient: this.chatService.aiClient ? true : false,
                hasMCPConnector: this.chatService.mcpConnector ? true : false,
                currentSettings: this.chatService.currentSettings,
                streamingState: this.chatService.streamingState
            };
            
            logger.log(DEBUGGER_NAME, 'ChatService State:', chatServiceState);
            
            return {
                chatService: this.chatService,
                state: chatServiceState,
                panel: this.chatService.panel
            };
        };

        logger.log(DEBUGGER_NAME, 'Debug methods attached to WebWireContentHost prototype');
    }
}