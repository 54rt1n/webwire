/**
 * WebWire Lite Version Background Script Wrapper
 * 
 * This wrapper configures the background service worker without MCP features.
 */

import { AppConfig } from '../src/js/core/app-config.js';
import { WebWireBackground } from '../src/background/webwire-background.js';

// Create and initialize the background service with lite configuration
const config = AppConfig.backgroundFactory('lite');

WebWireBackground.factory(config).then(webwireBackground => {
    self.webwireBackground = webwireBackground;
    console.log('[WebWire Lite] Background service initialized');
}).catch(error => {
    console.error('[WebWire Lite] Failed to initialize background service:', error);
});