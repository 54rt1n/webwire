# Browser Module - DOM Interaction & Page Tools

The browser module provides comprehensive DOM manipulation and page interaction capabilities for WebWire's AI-powered web automation. This module acts as the bridge between AI tool requests and actual browser operations.

## Architecture Overview

The browser module consists of three primary components that work together to provide robust DOM manipulation capabilities:

### 1. **DOMAgent** (`dom-agent.js`) - Direct DOM Tool Executor
The DOMAgent is the final executor for browser automation tasks. It runs directly in the page context and provides immediate DOM manipulation capabilities.

**Key Features:**
- **Direct DOM Execution** - Runs synchronously in page context
- **Multi-Strategy Element Finding** - Uses selector, text, elementIndex, and aria-label approaches
- **Semantic Page Integration** - Leverages SemanticPageExtractor for intelligent element location
- **Essential Tool Set** - 3 core DOM manipulation tools
- **Robust Error Handling** - Graceful failure with detailed error reporting

**Available Tools:**
```javascript
const tools = [
    'navigate_to_url',     // Navigate to URLs
    'click_element',       // Click elements with multiple finding strategies
    'form_fill'           // Fill form fields intelligently
];
```

### 2. **DOMConnector** (`dom-connector.js`) - Event-Based Remote Interface
The DOMConnector provides a remote interface that mimics MCP connector patterns but dispatches DOM operations via events to the content script.

**Key Features:**
- **MCP-Compatible Interface** - Follows same patterns as external MCP tools
- **Event-Driven Communication** - Uses WebWire's event system for cross-context messaging
- **Asynchronous Operation Tracking** - Manages pending operations with timeouts
- **Seamless Integration** - Works alongside external MCP tools in AI conversations

**Communication Pattern:**
```javascript
// 1. ChatService calls DOM tool
const result = await domConnector.executeTool('click_element', { selector: '#button' });

// 2. DOMConnector dispatches event to content script
eventBus.emit(EVENTS.DOM.EXECUTE, {
    operationId,
    toolName,
    parameters
});

// 3. Content script receives and executes via DOMAgent
const result = await domAgent.executeTool(toolName, parameters);

// 4. Result sent back via events
eventBus.emit(EVENTS.DOM.OPERATION_COMPLETE, { operationId, result });
```

### 3. **SemanticPageExtractor** (`page-utils.js`) - Intelligent Content Analysis
The SemanticPageExtractor provides sophisticated page content analysis and structured data extraction, optimized for AI consumption.

**Key Features:**
- **Structured Content Extraction** - Converts pages into AI-friendly structured data
- **Interactive Element Discovery** - Identifies and catalogs actionable page elements
- **Semantic Understanding** - Uses accessibility standards for element identification
- **Content Filtering** - Excludes WebWire UI and non-content elements
- **Multi-Format Support** - Extracts text, metadata, links, images, and structure

## Core Functionality

### DOM Tool Execution

#### Element Finding Strategies
The DOMAgent uses a hierarchical approach to find elements reliably:

1. **Element Index** (Most Reliable) - Uses SemanticPageExtractor's indexed elements
2. **CSS Selector** - Direct CSS selector matching
3. **Aria Label** - Accessibility-based matching
4. **Text Content** - Partial text matching with fuzzy search

```javascript
// Example: Multi-strategy element finding
const element = domAgent.findElement({
    elementIndex: 5,           // From page extraction (preferred)
    selector: '#submit-btn',   // CSS fallback
    ariaLabel: 'Submit form',  // Accessibility fallback
    text: 'Submit'            // Text fallback
});
```

#### Tool Execution Pattern
All DOM tools follow a consistent execution pattern:

```javascript
async executeTool(toolName, parameters) {
    const executionStart = Date.now();
    const toolCallId = generateUUID();
    
    try {
        const result = await this[toolName](parameters);
        return {
            callId: toolCallId,
            name: toolName,
            parameters,
            success: true,
            result: result || { status: 'completed' },
            executionTime: Date.now() - executionStart,
        };
    } catch (error) {
        return {
            callId: toolCallId,
            name: toolName,
            parameters,
            success: false,
            error: error.message,
            executionTime: Date.now() - executionStart,
        };
    }
}
```

### Page Content Extraction

#### Structured Data Format
The SemanticPageExtractor returns comprehensive page analysis:

```javascript
const pageData = {
    url: window.location.href,
    title: document.title,
    language: document.documentElement.lang,
    headings: [{ level: 1, text: 'Page Title', tag: 'H1' }],
    links: [{ href: 'https://...', text: 'Link Text', isExternal: false }],
    images: [{ src: 'https://...', alt: 'Alt text', width: 300, height: 200 }],
    metadata: {
        description: 'Page description',
        ogTitle: 'Social media title',
        keywords: 'keyword1, keyword2',
        canonical: 'https://...'
    },
    interactiveElements: [
        {
            id: 0,
            role: 'button',
            accessibleName: 'Submit',
            selector: '#submit-btn'
        }
    ],
    mainContent: 'Cleaned page text content...',
    timestamp: '2024-01-01T00:00:00.000Z'
};
```

#### Interactive Element Discovery
Elements are cataloged with comprehensive accessibility information:

```javascript
// Element discovery with accessibility focus
extractInteractiveElements() {
    const selectors = [
        'a[href]', 'button', 'input[type="submit"]', 'input[type="button"]',
        '[role="button"]', '[role="link"]', '[role="tab"]',
        'input[type="text"]', 'input[type="email"]', 'textarea', 'select'
    ];
    
    return elements.map((el, index) => ({
        id: index,
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        accessibleName: this.getAccessibleName(el),
        selector: this.getUniqueSelector(el)
    }));
}
```

### Event-Driven Communication

#### Cross-Context DOM Operations
The DOMConnector enables DOM operations from any extension context:

```javascript
// From ChatService (popup/options/panel context)
const result = await domConnector.executeTool('form_fill', {
    fields: {
        email: 'user@example.com',
        password: 'secure123'
    }
});

// Automatically routed to content script DOMAgent
// Result returned asynchronously via events
```

#### Operation Lifecycle
1. **Request** - Tool requested from ChatService
2. **Dispatch** - Event sent to content script  
3. **Execute** - DOMAgent executes in page context
4. **Response** - Result sent back via events
5. **Resolution** - Promise resolved in original context

## Tool Specifications

### Navigation Tools

#### `navigate_to_url`
Navigates the current tab to a specified URL.

```javascript
await domAgent.executeTool('navigate_to_url', {
    url: 'https://example.com'
});
```

**Parameters:**
- `url` (string, required) - Full URL to navigate to

**Behavior:**
- Uses `window.location.href` for navigation
- Page will reload, interrupting current context
- Returns immediately with navigation confirmation

### Interaction Tools

#### `click_element`
Clicks on page elements using robust identification strategies.

```javascript
await domAgent.executeTool('click_element', {
    selector: '#submit-button',
    text: 'Submit',
    elementIndex: 12,
    ariaLabel: 'Submit form'
});
```

**Parameters:**
- `selector` (string, optional) - CSS selector
- `text` (string, optional) - Text content to match
- `elementIndex` (number, optional) - Index from page extraction (most reliable)
- `ariaLabel` (string, optional) - Aria-label attribute

**Behavior:**
- Tries multiple strategies in order of reliability
- Validates element visibility before clicking
- Returns element information on success

#### `form_fill`
Intelligently fills form fields based on field identifiers.

```javascript
await domAgent.executeTool('form_fill', {
    fields: {
        'email': 'user@example.com',
        'username': 'myuser',
        'message': 'Hello world'
    },
    formSelector: '#contact-form'
});
```

**Parameters:**
- `fields` (object, required) - Mapping of field identifiers to values
- `formSelector` (string, optional) - Specific form to target

**Behavior:**
- Matches fields by name, id, or placeholder attributes
- Dispatches input and change events for reactive frameworks
- Reports number of successfully filled fields


## Integration Patterns

### With AI Chat System
DOM tools integrate seamlessly with AI conversations:

```javascript
// AI can request DOM operations during conversation
const aiResponse = await aiClient.generateResponse([
    { role: 'user', content: 'Click the submit button' }
], {
    tools: domConnector.getAvailableTools(),
    toolChoice: 'auto'
});

// AI tool calls are automatically executed
if (aiResponse.tool_calls) {
    for (const toolCall of aiResponse.tool_calls) {
        const result = await domConnector.executeTool(
            toolCall.function.name,
            toolCall.function.arguments
        );
    }
}
```

### With MCP Ecosystem
DOM tools work alongside external MCP tools:

```javascript
// Combined tool availability
const allTools = [
    ...mcpConnector.getAvailableTools(),    // External tools
    ...domConnector.getAvailableTools()     // DOM tools
];

// AI can choose between DOM and external tools
await aiClient.generateResponse(messages, {
    tools: allTools,
    toolChoice: 'auto'
});
```

### With Page Analysis
DOM operations leverage intelligent page understanding:

```javascript
// Page extraction provides context for DOM operations
const pageContent = pageUtils.getCurrentPageContent();

// AI gets structured page data for informed decisions
const aiResponse = await aiClient.generateResponse([
    {
        role: 'system',
        content: `Page context: ${JSON.stringify(pageContent)}`
    },
    {
        role: 'user', 
        content: 'Fill out the contact form'
    }
]);
```

## Error Handling & Resilience

### Element Finding Fallbacks
Multiple strategies ensure reliable element location:

1. **Structural Approach** - Use page extraction index (most reliable)
2. **Selector Approach** - CSS selectors with specificity
3. **Semantic Approach** - Accessibility labels and roles
4. **Content Approach** - Text-based fuzzy matching

### Visibility Validation
All interactions validate element visibility:

```javascript
isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' && 
           rect.width > 0 && 
           rect.height > 0;
}
```

### Graceful Degradation
- Operations fail gracefully with detailed error messages
- Partial success reported (e.g., "filled 3 of 5 form fields")
- Timeout handling prevents hanging operations
- Element not found scenarios handled gracefully

## Performance Considerations

### Content Extraction Optimization
- Configurable limits for different content types
- Efficient DOM traversal with early exit conditions
- Text length limiting to prevent memory issues
- Selector optimization for large pages

### Event System Efficiency
- Operation ID tracking prevents memory leaks
- Timeout cleanup for abandoned operations
- Minimal data transfer in cross-context communication
- Efficient element caching during operations

### Memory Management
- Temporary DOM copies cleaned up after extraction
- Event listener cleanup on disconnection
- Operation result caching limited by time and size
- Proper cleanup of interval timers and timeouts

## Development Guidelines

### Adding New DOM Tools

1. **Add Tool Definition** to both DOMAgent and DOMConnector:
```javascript
{
    name: 'new_tool',
    description: 'Tool description',
    parameters: {
        type: 'object',
        properties: { /* parameter schema */ },
        required: ['param1']
    }
}
```

2. **Implement in DOMAgent**:
```javascript
async new_tool({ param1, param2 }) {
    // Validate parameters
    if (!param1) throw new Error('param1 is required');
    
    // Perform DOM operation
    const result = /* implementation */;
    
    // Return structured result
    return { message: 'Operation completed', data: result };
}
```

3. **Update Tool Lists** in both classes to include new tool
4. **Add Error Handling** for tool-specific failure modes
5. **Document Tool** with examples and use cases

### Extending Page Extraction

1. **Add New Content Types** to SemanticPageExtractor:
```javascript
extractNewContentType() {
    const elements = document.querySelectorAll('selector');
    return Array.from(elements).map(el => ({
        // Structured data
    }));
}
```

2. **Update Main Extract Method** to include new content
3. **Add Configuration** for limits and filtering
4. **Consider Performance** impact of new extraction

### Event Integration

1. **Define New Events** in `src/js/core/events.js`
2. **Emit Events** at appropriate lifecycle points
3. **Handle Events** in relevant components
4. **Document Event Flow** for debugging

This streamlined browser module provides the essential foundation for intelligent, AI-driven web automation focused on the core interactions: navigation, clicking, and form filling. The module maintains robustness, performance, and ease of use while keeping the tool set minimal and focused.