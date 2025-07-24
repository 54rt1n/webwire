# CLAUDE.md - Conversations Management Interface

This file provides documentation for the Conversations panel, which manages conversation history, viewing, and lifecycle operations in WebWire.

## Directory Structure
```
src/conversations/
├── components/
│   ├── conversation-modal.js    # Modal for viewing conversation details
│   └── conversation-modal.scss  # Modal styling
├── index.html                   # Conversations panel HTML
├── index.js                     # Main application controller
├── panel.js                     # UI rendering and event handling
└── style.scss                   # Panel styling
```

## Overview

The Conversations interface provides a comprehensive management system for chat conversations, including:

- **Conversation List View** - Browse all conversations with metadata
- **Conversation Details Modal** - View full conversation history with messages and tool calls
- **Bulk Operations** - Select and operate on multiple conversations
- **Conversation Lifecycle** - Set active, complete, and delete conversations
- **Export Functionality** - Export conversation data in JSON format

## Architecture

### Component Hierarchy

```
ConversationsPanelApp (index.js)
├── WebWireClientCore           # State management and core functionality
├── PanelEventHandlers          # Panel-specific event handling
├── ConversationsPanel          # UI rendering and DOM management
└── ConversationModal           # Modal for viewing conversation details
```

### Data Flow

1. **State Service** provides conversation data from storage
2. **ConversationsPanelApp** coordinates between state and UI
3. **ConversationsPanel** renders the UI and handles user interactions
4. **ConversationModal** displays detailed conversation view
5. **Events** propagate changes to other components

## ConversationsPanelApp (index.js)

The main application controller that initializes and coordinates all components.

### Key Responsibilities

```javascript
class ConversationsPanelApp {
    constructor() {
        this.eventBus = new EventBus({domain: 'conversations'});
        this.core = new WebWireClientCore(this.eventBus);
        this.panel = new ConversationsPanel(this.eventBus);
        this.conversationModal = new ConversationModal();
    }
}
```

### Event Handling

Listens for conversation state changes:
- `CONVERSATION.UPDATED` - Refresh when conversations change
- `CONVERSATION.ACTIVATED` - Update UI when active conversation changes
- `CONVERSATION.DELETED` - Remove from list when deleted

### Core Operations

#### Load Conversations
```javascript
async loadConversations() {
    const conversations = this.core.stateService.conversation.listConversations();
    // Sort by most recent first
    conversations.sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));
    this.panel.renderConversations(conversations);
}
```

#### Delete Conversation
```javascript
async deleteConversation(threadId) {
    // Clear history
    this.core.stateService.conversation.clearConversationHistory(threadId);
    // Save state
    await this.core.stateService.disk.saveToStorage();
    // Emit event
    this.eventBus.emit(EVENTS.CONVERSATION.DELETED, { threadId });
}
```

#### Set Active Conversation
```javascript
async setActiveConversation(threadId) {
    const isAlreadyActive = currentActiveThreadId === threadId;
    
    if (isAlreadyActive) {
        // Mark as completed
        this.core.stateService.conversation.updateConversationStatus(threadId, 'completed');
    } else {
        // Set as active (auto-completes others)
        this.core.stateService.conversation.setActiveConversation(threadId);
    }
}
```

## ConversationsPanel (panel.js)

Manages all UI rendering and DOM event handling for the conversations list.

### UI Structure

```html
<!-- Main Container -->
<div id="conversations-list-container">
    <!-- Conversation Items -->
    <div class="conversation-item" data-thread-id="...">
        <div class="conversation-item-header">
            <div class="conversation-checkbox-area">
                <input type="checkbox" class="conversation-checkbox">
            </div>
            <div class="conversation-title">Title</div>
            <div class="conversation-actions">
                <button class="view-conversation">👁️</button>
                <button class="delete-conversation">🗑️</button>
            </div>
        </div>
        <div class="conversation-meta">
            <!-- Metadata display -->
        </div>
    </div>
</div>
```

### Key Features

#### Bulk Selection
- Select individual conversations with checkboxes
- Select all functionality
- Visual feedback for selection state

#### Bulk Operations
```javascript
// Delete selected conversations
_handleConfirmBulkDelete() {
    for (const threadId of this.selectedConversations) {
        this.handlers.onDeleteConversation(threadId);
    }
}

// Export selected conversations
_handleBulkExport() {
    const exportData = [];
    for (const threadId of this.selectedConversations) {
        const messages = this.stateService.conversation.getConversationMessages(threadId);
        const metadata = this.stateService.state.conversation.metadata[threadId];
        exportData.push({ threadId, metadata, messages });
    }
    // Download as JSON
}
```

#### Conversation Metadata Display
- Title (generated from URL or custom)
- Participants (User & Assistant names)
- Message count
- Duration
- Last activity timestamp
- Status (active, completed, saved, error)

### Rendering Logic

```javascript
renderConversations(conversations) {
    // Update count display
    this.elements.conversationsCountDisplay.textContent = 
        `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`;
    
    // Create conversation elements
    conversations.forEach(conversation => {
        const conversationEl = this._createConversationElement(conversation);
        this.elements.conversationsContainer.appendChild(conversationEl);
    });
}
```

## ConversationModal (components/conversation-modal.js)

A modal component for displaying full conversation history with rich formatting.

### Modal Features

#### Message Display
```javascript
_renderMessage(message) {
    return `
        <div class="conversation-message ${message.role}">
            <div class="conversation-message-header">
                <span class="conversation-message-role">${message.role}</span>
                <span class="conversation-message-timestamp">${timestamp}</span>
            </div>
            <div class="conversation-message-content">
                ${this._formatMessageContent(message.content)}
            </div>
            ${hasThinking ? this._renderThinking(message.think) : ''}
            ${hasToolCalls ? this._renderToolMessages(toolMessages) : ''}
        </div>
    `;
}
```

#### Tool Call Visualization
- Displays tool name and parameters
- Shows execution status (pending, success, error)
- Includes execution time
- Formats tool results with syntax highlighting

#### Thinking Display
Shows AI thinking process when available:
```javascript
_renderThinking(thinking) {
    return `
        <div class="conversation-thinking">
            <div class="conversation-thinking-header">🤔 AI Thinking</div>
            <div class="conversation-thinking-content">${thinking}</div>
        </div>
    `;
}
```

### Modal Lifecycle

```javascript
// Open modal
open(conversationData, onClose, onSetActive) {
    this.currentConversation = conversationData;
    this._createModal(conversationData);
    this._attachEventListeners();
    document.body.appendChild(this.modal);
}

// Close modal with animation
close() {
    this.modal.classList.remove('modal-visible');
    setTimeout(() => {
        this.modal.parentNode.removeChild(this.modal);
        this._cleanupEventListeners();
    }, 200);
}
```

## Conversation Data Structure

### Conversation Metadata
```javascript
{
    threadId: "uuid-v4",
    title: "Conversation Title",
    location: "https://example.com/page",
    userName: "User",
    personaName: "Assistant",
    startTime: 1234567890,
    endTime: 1234567899,
    duration: 9000,
    status: "active" | "completed" | "saved" | "error" | "deleted"
}
```

### Message Structure
```javascript
{
    role: "user" | "assistant",
    content: "Message text",
    timestamp: 1234567890,
    think: "AI thinking content",
    toolCalls: [...],
    toolResults: [...]
}
```

## Event Integration

### Emitted Events
- `CONVERSATION.DELETED` - When conversation is deleted
- `CONVERSATION.LOADED` - When conversation is set as active

### Listened Events
- `CONVERSATION.UPDATED` - Refresh list on updates
- `CONVERSATION.ACTIVATED` - Update UI for active conversation
- `CONVERSATION.STATUS_UPDATED` - Update status display

## Styling Architecture

### SCSS Structure
```scss
// Panel layout
.conversations-container {
    display: flex;
    flex-direction: column;
}

// Conversation items
.conversation-item {
    border: 1px solid var(--color-border);
    &:hover { background: var(--color-hover); }
    &.selected { background: var(--color-selected); }
}

// Modal overlay
.conversation-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
}
```

### Design Tokens
Uses shared design tokens from `src/shared/design-tokens.scss`:
- Color scheme
- Typography
- Spacing
- Border radius
- Shadows

## User Workflows

### 1. Browse Conversations
- View list sorted by most recent
- See key metadata at a glance
- Click to view full conversation

### 2. Manage Active Conversation
- Click conversation to view in modal
- Click "Set Active" to resume conversation
- Click "Complete" to mark active as done

### 3. Bulk Operations
- Select multiple conversations
- Export selected as JSON
- Delete selected with confirmation

### 4. Delete Conversations
- Individual delete with confirmation
- Bulk delete with count confirmation
- Delete all with extra confirmation

## Performance Considerations

### Rendering Optimization
- Virtual scrolling for large conversation lists
- Lazy loading of conversation messages
- Debounced search and filter operations

### Memory Management
- Clean up event listeners on unmount
- Remove DOM elements when closing modals
- Limit conversation preview length

### State Synchronization
- Listen for external state changes
- Update UI reactively
- Maintain selection state during refreshes

## Security Considerations

### XSS Prevention
- All user content escaped with `_escapeHtml()`
- No innerHTML with user data
- Safe JSON stringification

### Data Privacy
- Conversation export includes all data
- Delete operations are permanent
- No conversation data sent externally

## Extension Points

### Custom Renderers
Override rendering methods for custom display:
```javascript
class CustomConversationsPanel extends ConversationsPanel {
    _createConversationElement(conversation) {
        // Custom rendering logic
    }
}
```

### Additional Actions
Add new conversation actions:
```javascript
const handlers = {
    onDeleteConversation,
    onViewConversation,
    onSetActiveConversation,
    onArchiveConversation, // Custom action
    onTagConversation     // Custom action
};
```

### Export Formats
Extend export functionality:
```javascript
_handleExport(format = 'json') {
    switch(format) {
        case 'json': // Default
        case 'csv':  // Custom CSV export
        case 'md':   // Markdown export
    }
}
```

## Error Handling

### Graceful Degradation
- Empty states for no conversations
- Fallback for missing state service
- Error boundaries for render failures

### User Feedback
- Confirmation dialogs for destructive actions
- Loading states during async operations
- Error messages for failed operations

## Testing Considerations

### Unit Testing
- Test conversation sorting logic
- Test metadata generation
- Test selection state management

### Integration Testing
- Test state service integration
- Test event propagation
- Test modal lifecycle

### E2E Testing
- Test conversation workflows
- Test bulk operations
- Test data persistence