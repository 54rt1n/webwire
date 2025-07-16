# CLAUDE.md - MCP Interface System

This file provides guidance for working with the WebWire MCP interface system.

## Directory Structure
```
src/mcp
├── components/             # UI components and modals
│   ├── document-modal.js  # Document viewing modal component
│   ├── document-modal.scss # Styling for document modal
│   ├── graph-draw.js      # Knowledge base graph visualization
│   ├── stash-button.js    # Stash functionality button component
│   ├── stash-panel.js     # Floating stash viewer panel
│   ├── stash-panel.scss   # Styling for stash panel
│   ├── textview-modal.js  # Text content viewing modal
│   └── textview.scss      # Text viewer styling
├── index.html             # MCP interface HTML structure
├── index.js               # Main MCP app controller
├── panel.js               # MCP control panel UI management
└── style.scss             # Main MCP interface styling
```

Note: All styles use SCSS for enhanced styling capabilities, compiled to CSS during build.

## Overview

The MCP interface provides a comprehensive control panel for managing Model Context Protocol connections, browsing file systems, visualizing knowledge bases, and handling document stashing. It integrates with the WebWire chat system for AI-powered interactions.

## Architecture

### MCPControlPanelApp (`index.js`)

Main controller that wires together all MCP components:

- **WebWireClientCore** - Core client functionality
- **MCPControlPanel** - UI management 
- **ChatService** - AI chat integration
- **StashPanel** - Document stash viewer
- **PanelEventHandlers** - Event coordination
- **CMCPHelper** - MCP communication helper

Initializes all components and sets up event handling between them.

### MCPControlPanel (`panel.js`)

Manages the main UI interface with sections for:

- **Health Check** - Server connection status
- **File System Browser** - Directory and file navigation  
- **Knowledge Base Graph** - Visual graph of KB connections
- **Lists Browser** - MCP list management
- **Connection Status** - Real-time connection indicators

Handles DOM rendering and user interactions, delegates business logic to other components.

## Key Components

### UI Components (`components/`)

#### Graph Visualization (`graph-draw.js`)
- Renders knowledge base relationships as interactive graphs
- Handles node selection and graph manipulation
- Integrates with knowledge base data from MCP server

#### Document Modal (`document-modal.js`) 
- Displays document content in modal overlay
- Handles different content types and formats
- Provides document viewing and interaction capabilities

#### Text View Modal (`textview-modal.js`)
- Specialized modal for text content viewing
- Supports syntax highlighting and text formatting
- Integrates with document viewing workflow

#### Stash System
- **StashButton** (`stash-button.js`) - Adds stash functionality to components
- **StashPanel** (`stash-panel.js`) - Floating panel showing stashed items
- Allows users to save and manage document references

## Integration Points

### Chat Service Integration
The MCP interface integrates with WebWire's chat system:
- AI chat functionality available within MCP interface
- Chat service can execute MCP tools
- Shared event bus for coordination

### State Management
- Uses WebWire state service for persistence
- Stash items stored in state system
- Connection status tracked in MCP state plugin

### Event Coordination
- Shared event bus for component communication
- Events for tool execution, document viewing, stash operations
- Coordination between MCP operations and chat functionality

## UI Structure (`index.html`)

The interface is organized into tabs/sections:
1. **Health Check** - Server status and diagnostics
2. **File System** - File browser with tree navigation
3. **Knowledge Base** - Graph visualization of knowledge relationships  
4. **Lists** - Management of MCP list resources
5. **Chat Integration** - AI chat functionality

Each section has dedicated DOM elements and event handlers managed by the control panel.

## Usage Patterns

### Tool Execution Flow
1. User interacts with MCP interface (file selection, etc.)
2. MCPControlPanel handles UI interaction
3. Event emitted to trigger tool execution
4. CMCPHelper coordinates with MCP connector
5. Results displayed in appropriate UI section

### Document Viewing
1. User selects document/file
2. Content fetched via MCP tools
3. Document modal displays content
4. Stash button allows saving reference

### Stash Management
1. Documents can be stashed from various interface sections
2. StashPanel shows floating list of stashed items
3. Stashed items persist via state management
4. Items can be removed or accessed from stash

## Development Notes

The MCP interface serves as both a standalone tool browser and an integrated component of the WebWire chat system. It demonstrates the MCP protocol in action while providing practical file system and knowledge base browsing capabilities.