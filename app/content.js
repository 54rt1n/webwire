/**
 * WebWire Full Version Content Script Wrapper
 * 
 * This wrapper configures the content script with full features including MCP tools.
 */

import { AppConfig } from '../src/js/core/app-config.js';
import { WebWireContentHost } from '../src/content/index.js';
import { DOM_READY_STATES } from '../src/js/core/cc-actions.js';

// Create configuration
const config = AppConfig.contentFactory('full');

// Initialize when DOM is ready
function initializeContent() {
    WebWireContentHost.factory(config).then(contentHost => {
        window.webwireContentHost = contentHost;
        console.log('[WebWire Full] Content host initialized with all features');
    }).catch(error => {
        console.error('[WebWire Full] Failed to initialize content host:', error);
    });
}

// Wait for DOM to be ready
if (document.readyState === DOM_READY_STATES.LOADING) {
    document.addEventListener('DOMContentLoaded', initializeContent);
} else {
    initializeContent();
}