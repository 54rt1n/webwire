/**
 * WebWire Lite Version Background Script Wrapper
 * 
 * This wrapper configures the background service worker without MCP features.
 */

// Configure global settings before importing
globalThis.__WEBWIRE_CONFIG__ = {
    enableMcp: false,
    enableTools: false,
    version: 'lite'
};

// Import the main background script which will use the config
import '../src/background/webwire-background.js';