/**
 * WebWire Lite Version Content Script Wrapper
 * 
 * This wrapper configures the content script with all features except MCP tools.
 */

import { AppConfig } from '../src/js/core/app-config.js';
import { WebWireContentHost } from '../src/content/index.js';
import { DOM_READY_STATES } from '../src/js/core/cc-actions.js';
import { logger } from '../src/js/core/logging.js';

// Create configuration
const config = AppConfig.contentFactory('lite');
logger.initialize(config);

// Initialize when DOM is ready
function initializeContent() {
    WebWireContentHost.factory(config).then(contentHost => {
        window.webwireContentHost = contentHost;
        logger.log('WebWire Lite', 'Content host initialized');
        console.log(".-= WebWire Lite Extension is active =-.");
    }).catch(error => {
        logger.error('WebWire Lite', 'Failed to initialize content host:', error);
    });
}

// Wait for DOM to be ready
if (document.readyState === DOM_READY_STATES.LOADING) {
    document.addEventListener('DOMContentLoaded', initializeContent);
} else {
    initializeContent();
}

// Handle page restoration from back/forward cache
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        logger.log('WebWire Lite', 'Page restored from cache, re-initializing...');
        initializeContent();
    }
});