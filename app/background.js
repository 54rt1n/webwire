/**
 * WebWire Full Version Background Script Wrapper
 * 
 * This wrapper configures the background service worker with full features including MCP.
 */

// Configure global settings before importing
globalThis.__WEBWIRE_CONFIG__ = {
    enableMcp: true,
    enableTools: true,
    version: 'full'
};

// Import the main background script which will use the config
import '../src/background/webwire-background.js';