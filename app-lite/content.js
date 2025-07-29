/**
 * WebWire Lite Version Content Script Wrapper
 * 
 * This wrapper configures the content script with all features except MCP tools.
 */

// Configure global settings before importing
window.__WEBWIRE_CONFIG__ = {
    enableMcp: false,
    enableTools: false,
    version: 'lite'
};

// Import the main content script which will use the config
import '../src/content/index.js';