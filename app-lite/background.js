/**
 * WebWire Lite Version Background Script Wrapper
 * 
 * This wrapper configures the background service worker without MCP features.
 */

import { AppConfig } from '../src/js/core/app-config.js';
import { WebWireBackground } from '../src/background/webwire-background.js';
import { logger } from '../src/js/core/logging.js';

// Create and initialize the background service with lite configuration
const config = AppConfig.backgroundFactory('lite');
logger.initialize(config);

WebWireBackground.factory(config).then(webwireBackground => {
    self.webwireBackground = webwireBackground;
    logger.log('WebWire Lite', 'Background service initialized');
    console.log(".-= WebWire Lite Extension is active =-.");
}).catch(error => {
    logger.error('WebWire Lite', 'Failed to initialize background service:', error);
});