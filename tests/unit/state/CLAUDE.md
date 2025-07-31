# CLAUDE.md - State System Unit Tests

This document describes the unit test setup and coverage for WebWire's state management system.

## Test Architecture

### Test Environment
- **Test Runner**: Vitest with jsdom environment
- **Approach**: Integration-style testing using real state system components
- **Mock Strategy**: Minimal mocking - only storage adapters and browser APIs
- **Coverage**: State container, plugins, and their interactions

### Key Files

#### `conftest.js` - Test Fixtures and Utilities
Provides comprehensive test infrastructure:

**Mock Classes:**
- `MockStorageAdapter` - Simulates Chrome storage with call tracking
- `MockEventBus` - Extends real EventBus with spy functionality
- `MockStateService` - Lightweight wrapper around real StateService

**Test Factories:**
- `TestStateFactory` - Creates test states with specific configurations
- `TestData` - Generates realistic test data (messages, threads, tools, etc.)

**Utilities:**
- `StateAssertions` - Common assertion helpers
- `WaitUtils` - Async operation utilities
- `setupTest()` - Complete test environment setup

#### Test Philosophy
Tests use **real state components** rather than heavy mocking:
```javascript
// Real StateService with mock storage
stateService = new StateService(eventBus, storage);
plugin = stateService.conversation; // Real plugin instance
```

This approach provides:
- **Better coverage** - Tests actual implementation behavior
- **Regression detection** - Catches real integration issues
- **Maintainability** - Less brittle than heavily mocked tests

## Test Coverage

### ✅ Completed Tests

#### `container.test.js` (12 tests)
Tests core state container functionality:
- **State Creation**: `createInitialState()`, `createInitialSettingsState()`, etc.
- **Serialization**: `serializeState()` and `deserializeState()`
- **State Structure**: Validates all required state domains
- **Error Handling**: Invalid data handling and recovery

#### `conversation.test.js` (27 tests)
Tests conversation state plugin comprehensively:
- **Message Storage**: Single messages, message pairs, partial messages
- **Thread Management**: Creation, retrieval, updates, deletion
- **Metadata Handling**: User info, timestamps, status tracking
- **Event Emission**: State change notifications
- **Advanced Features**: Active conversation tracking, filtering, persona-based queries

#### `validator.test.js` (30 tests)
Tests state validation logic comprehensively:
- **Constructor Validation**: StateValidator initialization
- **Complete State Validation**: Full state object validation with success/error reporting
- **Partial Validation**: Individual state section validation (session, settings)
- **Consistency Checking**: Validate/isPartValid consistency across different validation methods
- **Edge Cases**: Empty objects, extra properties, deeply nested objects, malformed data

#### `settings.test.js` (42 tests)
Tests settings management and provider configurations:
- **Constructor & Basic Operations**: Initialization, getters/setters, storage adapter handling
- **Storage Integration**: Loading from storage with deep merge, saving with verification
- **Settings Patching**: Deep merging of partial settings updates
- **Model Configuration**: Provider/model config retrieval, fallback handling, validation
- **AI Provider Support**: OpenAI, Anthropic, AIMind, Featherless configurations
- **Validation Logic**: Complete settings validation, missing fields detection
- **Storage Integration**: Round-trip save/load operations, rapid operations handling

#### `ui.test.js` (35+ tests)
Tests UI state and tab management:
- **Basic State Access**: UI state retrieval, tab ID management
- **Auto-inject Settings**: Global UI preference management
- **Per-tab Settings**: Include page content, MCP usage, browser tools, auto-execute tools
- **Model Selection**: Per-tab model selection and retrieval
- **Thread Tracking**: Tab-specific conversation thread tracking
- **Voice Settings**: Voice configuration management
- **Multi-tab Scenarios**: Tab switching, tab removal, cross-tab state isolation
- **Edge Cases**: Missing tabs, malformed state, consistent behavior patterns

#### `mcp.test.js` (50+ tests)
Tests MCP connection and tool management:
- **Connection Lifecycle**: Connect, disconnect, initialization, error handling
- **Server URL Management**: HTTPS downgrade detection, settings persistence
- **Connection State Tracking**: Status changes, error states, connection metadata
- **Tool Management**: Tool discovery, updates, clearing, availability checking
- **Request Lifecycle**: Pending requests, completion, failure, timeout handling
- **System Messages**: MCP system message management, change detection
- **Integration Scenarios**: Complete connection flows, request workflows
- **Error Handling**: Network failures, malformed responses, edge cases

### 🔄 In Progress Tests

None currently - all implemented tests are complete and passing.

### ❌ Missing Tests

#### State Plugins (Lower Priority)
- **`aim-state.test.js`** - AIM-specific functionality (thought content, toggles)
- **`stash-state.test.js`** - Document stashing functionality  
- **`disk-state.test.js`** - Master persistence coordination
- **`tab-state.test.js`** - Per-tab state management (if separate from UI)
- **`prompt-state.test.js`** - Prompt configuration management

#### Integration Tests
- **Cross-plugin interactions** - How plugins work together
- **Event flow testing** - Event propagation across the system
- **Storage integration** - Real Chrome storage adapter testing
- **State synchronization** - Cross-context state sync

#### Edge Cases and Error Handling
- **Corrupted state recovery**
- **Storage quota exceeded**
- **Network failures in MCP operations**
- **Concurrent state modifications**

## Test Patterns

### 1. Plugin Testing Pattern
```javascript
describe('PluginName', () => {
    let stateService, plugin;

    beforeEach(() => {
        // Real StateService with mock storage
        stateService = new StateService(eventBus, storage);
        plugin = stateService.pluginName;
    });

    it('should test specific functionality', () => {
        // Test using real plugin methods
        plugin.someMethod(testData);
        expect(stateService.state.someProperty).toBe(expectedValue);
    });
});
```

### 2. Event Testing Pattern
```javascript
it('should emit events on state changes', () => {
    plugin.updateSomething(data);
    
    StateAssertions.assertEventEmitted(eventBus, EVENTS.SOMETHING_UPDATED, 
        eventData => eventData.id === expectedId);
});
```

### 3. Storage Testing Pattern
```javascript
it('should persist changes to storage', async () => {
    await plugin.saveToStorage();
    
    StateAssertions.assertStorageCalled(storage.domain, 'save', 'expectedKey');
});
```

### 4. State Factory Pattern
```javascript
it('should handle specific state configurations', () => {
    const testState = TestStateFactory.createStateWithMcp({
        connection: { isConnected: true },
        tools: [TestData.createMcpTool()]
    });
    
    // Test behavior with this specific state
});
```

## Running Tests

```bash
# Run all state tests
npm test tests/unit/state/

# Run specific test file
npm test tests/unit/state/conversation.test.js

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch
```

## Test Data Patterns

### Realistic Test Data
Tests use realistic data that matches production patterns:
```javascript
// Generated message with proper structure
const message = TestData.createMessage({
    content: 'Hello world',
    url: 'https://example.com',
    title: 'Example Page'
});

// Generated thread with metadata
const { thread, messages } = TestData.createThreadWithMessages(3, {
    personaName: 'Assistant',
    status: 'active'
});
```

### State Assertions
Common validations wrapped in reusable assertions:
```javascript
StateAssertions.assertValidStateShape(state);
StateAssertions.assertConversationExists(state, threadId);
StateAssertions.assertMcpConnected(state);
```

## Bug Fixes Covered

Tests have helped identify and verify fixes for:
1. **Title/Location Storage Bug** - Undefined variables in metadata updates
2. **Tab State Dependencies** - Missing tab setup for active conversation tracking
3. **Method Name Mismatches** - Incorrect method names in plugin interfaces
4. **Storage Adapter Interface** - Missing `getAll()` and `setAll()` methods in MockStorageAdapter
5. **Event Bus Object Comparison** - Fixed object equality assertions using `toStrictEqual()`
6. **Model Config Behavior** - Clarified that `getModelConfig()` returns merged objects even with missing providers
7. **Storage Mock Setup** - Proper mocking of plugin-specific storage adapters for accurate testing

## Best Practices

### DO
- Test with real state system components
- Use descriptive test names that explain the behavior
- Group related tests in describe blocks
- Clean up between tests with proper setup/teardown
- Test both success and error cases
- Verify event emission and storage calls

### DON'T
- Over-mock internal components
- Test implementation details instead of behavior
- Skip cleanup between tests
- Use hardcoded values instead of test data generators
- Ignore async operations without proper waiting

## Future Improvements

1. **Performance Testing** - Add tests for large state objects and many concurrent operations
2. **Browser Compatibility** - Test with different storage backends
3. **Migration Testing** - Test state migration between versions
4. **Load Testing** - Test behavior under high message volume
5. **Property-Based Testing** - Use generated test cases for edge case discovery