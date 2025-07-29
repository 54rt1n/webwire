/**
 * WebWire Full Version Content Script Wrapper
 * 
 * This wrapper configures the content script with full features including MCP tools.
 */

// Configure global settings before importing
window.__WEBWIRE_CONFIG__ = {
    enableMcp: true,
    enableTools: true,
    version: 'full'
};

// Import the main content script which will use the config
import '../src/content/index.js';