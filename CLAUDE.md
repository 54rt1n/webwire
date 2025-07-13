# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

- **Development build with watch**: `npm run dev` - Uses webpack in development mode with file watching
- **Production build**: `npm run build` - Creates production build using webpack  
- **Clean build artifacts**: `npm run clean` - Removes dist directory
- **Vite development server**: `npm run dev:vite` - Runs Vite dev server on port 3000
- **Vite build**: `npm run build:vite` - Production build using Vite
- **Vite preview**: `npm run preview:vite` - Preview production build

Note: This project uses both Webpack (primary) for Chrome extension and Vite for development testing.

**Important**: Do not run `npm run build` or other build commands in this environment - the development environment is not configured for running builds.

## Development Workflow

- The first thing you should always do is run tree src and then node scripts/sig.js src to see the code documentation.

## Architecture Overview

WebWire is a Chrome extension providing AI-powered web page analysis with Model Context Protocol (MCP) tool integration. The codebase is ~20k lines with sophisticated architecture across 77 files in 21 directories.

### Primary Extension Structure

**Chrome Extension Components:**
- `src/background/` - Service worker managing extension lifecycle
- `src/content/` - Content script injection and page interaction  
- `src/popup/` - Extension popup interface
- `src/options/` - Settings and configuration pages
- `src/mcp/` - MCP status panel and tool management interface
- `src/mcp_test/` - MCP testing interface

### Core JavaScript Architecture (`src/js/`)

**AI System (`ai/`):**
- `abstract-ai-client.js` - Base interface for all AI providers
- `ai-client-factory.js` - Factory creating provider-specific clients
- `providers/` - Concrete implementations (OpenAI, Featherless, Google AI Studio, AIMind)

**State Management (`state/`):**
- `state-container.js` - Main state container with plugin architecture
- `state-service.js` - High-level state operations and coordination
- `state-validator.js` - State validation and integrity checking
- `plugins/` - Domain-specific state managers:
  - `conversation-state.js` - Chat threads and message history
  - `settings-state.js` - User preferences and AI configuration
  - `mcp-state.js` - MCP server connections and tool state
  - `ui-state.js` - Panel visibility and UI preferences
  - `aim-state.js` - AIM-specific state (personas, workspace)
  - `stash-state.js` - Document stashing functionality
  - `disk-state.js` - Persistent storage coordination

**Storage System (`storage/`):**
- `storage-manager.js` - Central storage coordination
- `adapters/` - Storage adapters for different data types:
  - `settings-adapter.js` - Settings persistence
  - `state-adapter.js` - General state storage
  - `ui-adapter.js` - UI state persistence
  - `stash-adapter.js` - Document stash storage
  - `storage-adapter.js` - Base storage interface

**Core Framework (`core/`):**
- `app-config.js` - Hierarchical configuration with dot-notation access
- `event-bus.js` - Domain-scoped event system
- `event-dispatcher.js` - Cross-context message routing
- `events.js` - Event type definitions and constants
- `error-boundary.js` - Error handling and recovery

**MCP Integration (`mcp/`):**
- `mcp-connector.js` - Server-Sent Events connection to MCP servers
- `tool-formatter.js` - Converts MCP tools to OpenAI format
- `tool-parser.js` - Parses and validates tool responses

**Client Core (`client/`):**
- `webwire-client-core.js` - Main application controller
- `cmcp-helper.js` - MCP communication helper
- `panel-event-handlers.js` - Panel-specific event handling

**Context System (`context/`):**
- `context-init.js` - Application context initialization
- `context-factory.js` - Context object creation and dependency injection

**Utilities (`utils/`):**
- `id-generator.js` - UUID and session ID generation
- `flatten-data.js` - Data transformation utilities

### Chat System (`src/chat/`)

**Complete chat interface with:**
- `chat-service.js` - Core chat logic, message handling, AI integration
- `chat-panel.js` - UI management and user interactions
- `chat-renderer.js` - HTML generation and DOM manipulation
- `message-utils.js` - Message formatting and processing
- `page-utils.js` - Page content extraction and context building
- `chat-constants.js` - Chat-related constants
- `chat.css` - Chat styling

### UI Interfaces

**MCP Management (`src/mcp/`):**
- Full MCP tool interface with graph visualization
- Document modal and text viewer
- Stash panel for document management
- Tool execution and result display

**Options Interface (`src/options/`):**
- AI provider configuration
- MCP server settings
- Extension preferences

**Popup (`src/popup/`):**
- Quick access interface
- Status display

## Key Design Patterns

### State Architecture
- **Plugin-based state management** - Each domain (chat, settings, MCP) has dedicated state plugin
- **Automatic persistence** - State changes trigger Chrome storage saves
- **Cross-tab synchronization** - Background script coordinates state across tabs
- **Event-driven updates** - State changes emit events for UI updates

### Event System
- **Domain-scoped EventBus** - Each context has isolated event space
- **EventDispatcher** - Routes messages between extension contexts
- **Type-safe events** - Centralized event definitions in `events.js`

### Extension Communication
- **Background script hub** - Coordinates all cross-context communication
- **Content script adapter** - Thin layer managing Chrome APIs
- **Message routing** - Sophisticated routing between popup, options, content, background

### AI Integration
- **Provider abstraction** - Unified interface for multiple AI providers
- **Factory pattern** - Runtime provider selection based on configuration
- **Streaming support** - Real-time response handling with tool execution

### MCP Protocol
- **Server-Sent Events** - Persistent connections to MCP servers
- **Tool discovery** - Automatic tool enumeration and OpenAI format conversion
- **Request/response tracking** - Manages async tool execution with timeouts

## Development Workflows

### Adding New AI Providers
1. Extend `abstract-ai-client.js` in `src/js/ai/providers/`
2. Register in `ai-client-factory.js`
3. Add configuration schema to `settings-state.js`
4. Update UI in options panel

### Adding New State Domains
1. Create plugin in `src/js/state/plugins/`
2. Follow existing plugin patterns (constructor, state shape, persistence)
3. Register in `state-service.js`
4. Create storage adapter if needed

### Modifying Chat Interface
- Core logic in `chat-service.js`
- UI updates in `chat-panel.js`
- HTML generation in `chat-renderer.js`
- Page interaction in `page-utils.js`

### Extension Context Communication
- Background script handles routing
- Use message types defined in `events.js`
- Follow async response patterns for Chrome API limitations

## Storage Strategy

- **Chrome Storage API** - Primary persistence layer
- **Compression** - Large state objects compressed before storage
- **Backup system** - Configurable retention of previous states
- **Adapter pattern** - Domain-specific storage handling
- **Synchronization** - Background script manages cross-tab consistency

## Configuration System

- **AppConfig** (`app-config.js`) - Hierarchical config with dot-notation
- **Runtime settings** - User preferences persisted in state
- **Environment detection** - Automatic Chrome extension vs. web context
- **Default values** - Comprehensive defaults for all configuration

## Tool Integration

- **MCP Protocol** - Standard tool integration via MCP servers
- **Tool discovery** - Automatic enumeration from connected servers
- **OpenAI compatibility** - Converts MCP tools to OpenAI function format
- **Execution tracking** - Request/response correlation with timeouts
- **Error handling** - Graceful degradation when tools fail

## Testing Infrastructure

- **MCP Test Interface** (`src/mcp_test/`) - Testing MCP connections
- **Debug utilities** (`src/content/debug.js`) - Runtime debugging tools
- **State inspection** - Access to internal state via debug interface

## Critical Implementation Notes

- **Chrome Manifest V3** - Service worker architecture, no persistent background
- **ES Modules** - Entire codebase uses native ES modules
- **No bundling dependencies** - Self-contained with minimal external dependencies
- **Extension security** - CSP-compliant, no eval or inline scripts
- **Cross-context state** - Complex synchronization between isolated extension contexts
- **Streaming AI responses** - Real-time message updates with tool execution
- **Page content extraction** - Sophisticated content analysis for AI context
- **Event-driven architecture** - Loose coupling via comprehensive event system