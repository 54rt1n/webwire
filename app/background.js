/**
 * WebWire Full Version Background Script Wrapper
 * 
 * This wrapper configures the background service worker with full features including MCP.
 */

import { AppConfig } from '../src/js/core/app-config.js';
import { WebWireBackground } from '../src/background/webwire-background.js';

// Create and initialize the background service with full configuration
const config = AppConfig.backgroundFactory('full');

WebWireBackground.factory(config).then(webwireBackground => {
    self.webwireBackground = webwireBackground;
    console.log('[WebWire Full] Background service initialized with all features');
}).catch(error => {
    console.error('[WebWire Full] Failed to initialize background service:', error);
});