/**
 * WebWire Content Script Debug Methods
 * 
 * Debug utilities and testing methods for the WebWire content script.
 * These are separated from the main index.js to keep it clean and focused.
 */

import { pageUtils } from './page-utils.js';

// Export functions for testing and debugging
let webwireContentScript = null;

export function setWebWireInstance(instance) {
    webwireContentScript = instance;
}

export function getWebWireInstance() {
    return webwireContentScript;
}

export function isWebWireReady() {
    return webwireContentScript && (webwireContentScript.aiClient || webwireContentScript.mcpConnector);
}

/**
 * Setup debug methods on the WebWire class prototype
 * @param {Function} WebWireContentScript - The main content script class
 */
export function setupDebugMethods(WebWireContentScript) {
    // Add debug methods to the WebWire class prototype for window access
    if (typeof window !== 'undefined') {
        
        /**
         * Get current debug state
         */
        WebWireContentScript.prototype.debug = function() {
            return {
                panelInjected: this.panel.isReady(),
                mcpConnected: this.mcpConnector ? true : false,
                aiClientConfigured: this.aiClient ? true : false,
                currentThreadId: this.currentThreadId,
                frameworkReady: true,
                streamingActive: this.streamingState.isActive,
                currentContent: this.streamingState.currentContent,
                currentSettings: this.currentSettings
            };
        };

        /**
         * Force inject the panel
         */
        WebWireContentScript.prototype.forceInject = function() {
            console.log('Force injecting WebWire panel...');
            return this.injectPanel();
        };

        /**
         * Force toggle the panel
         */
        WebWireContentScript.prototype.forceToggle = function() {
            console.log('Force toggling WebWire panel...');
            this.togglePanel();
        };

        /**
         * Get current page information
         */
        WebWireContentScript.prototype.getPageInfo = function() {
            console.log('Getting page content...');
            return pageUtils.getCurrentPageContent();
        };

        /**
         * Debug message enhancement functionality
         */
        WebWireContentScript.prototype.debugMessageEnhancement = function(testMessage = 'Test message') {
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
        WebWireContentScript.prototype.debugPanelPersistence = function() {
            console.log('=== WebWire Panel Persistence Debug ===');
            console.log('Current panel visible state:', this.panel.isVisible);
            
            const testActions = {
                showPanel: () => {
                    console.log('Testing: Show panel (will persist state to background)');
                    return this.showPanel();
                },
                hidePanel: () => {
                    console.log('Testing: Hide panel (will persist state to background)');
                    return this.hidePanel();
                },
                togglePanel: () => {
                    console.log('Testing: Toggle panel (will persist state to background)');
                    return this.togglePanel();
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
                        this.panel.show();
                        console.log('Panel restored to visible state');
                    } else {
                        this.panel.hide();
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

        console.log('[WebWire Debug] Debug methods attached to WebWireContentScript prototype');
    }
}

/**
 * Setup global debug access on the window object
 * @param {Object} instance - The WebWire content script instance
 */
export function setupGlobalDebugAccess(instance) {
    if (typeof window !== 'undefined') {
        window.webwireContentScript = instance;
        window.webwire = instance; // Shorter alias
        console.log('WebWire hooked to window.webwireContentScript and window.webwire');
        
        // Store instance for debug functions
        setWebWireInstance(instance);
    }
} 