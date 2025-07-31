# WebWire Style Guide

## Overview

This guide defines the proper patterns for building WebWire components using our design system. All WebWire UI must follow these patterns to ensure consistency, maintainability, and proper functionality.

### Core Principles

1. **Namespace Everything**: All classes must be prefixed with `ww-` to avoid conflicts with host websites
2. **Use Design Tokens**: Never hardcode colors, spacing, or typography - use CSS variables
3. **Import Shared Styles**: Always import `@use '../shared/common'` for mixins and utilities
4. **Base Container Class**: All pages must use `<body class="ww-container-base">` to inherit global styles
5. **Component Scoping**: Every page/component has a root container class (e.g., `.ww-options`, `.ww-conversations`)
6. **Consistent Structure**: Follow established HTML patterns for headers, content, and actions

## Page Structure

### Important: Base Container Class

**All WebWire pages MUST include `ww-container-base` class on the root container.** This ensures:
- Global styles are applied (typography, colors, box-sizing)
- Design tokens are available
- Button and form mixins work correctly
- Consistent styling across all pages

You can either:
1. Use both classes on the same element: `class="ww-container-base ww-[component-name]"`
2. Or just use the component class if it's already in the global.scss list

### Full Page Template

Every WebWire page follows this pattern:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebWire - [Page Name]</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div class="ww-container-base ww-[component-name]">  <!-- Both classes on root container -->
    <!-- Header -->
    <div class="ww-[component]-header">
      <h1>
        <span class="ww-icon">🎯</span> <!-- Optional icon (emoji or SVG) -->
        Page Title
      </h1>
      <div class="ww-header-actions">
        <button class="ww-btn-[action]">Action</button>
      </div>
    </div>

    <!-- Main Container -->
    <div class="ww-[component]-container">
      <!-- Content sections -->
      <div class="ww-section">
        <div class="ww-section-header">
          <h2>Section Title</h2>
          <p class="ww-section-description">Optional description</p>
        </div>
        <!-- Section content -->
      </div>
    </div>

    <!-- Actions Bar (if needed) -->
    <div class="ww-actions">
      <button class="ww-btn-primary">Primary Action</button>
    </div>
  </div>
</body>
</html>
```

### SCSS Structure

```scss
@use '../shared/design-tokens' as tokens;
@use '../shared/common' as common;

.ww-[component-name] {
  --header-height: 60px; // Component-specific variable
  
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text-primary);
  font-family: var(--font-family-base);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);

  .ww-[component]-header {
    position: sticky;
    top: 0;
    z-index: 100;
    height: var(--header-height);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    padding: 0 var(--space-5);
    box-shadow: var(--shadow-sm);

    h1 {
      flex: 1;
      margin: 0;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: var(--space-3);

      .ww-icon {
        width: 24px;
        height: 24px;
        color: var(--color-primary-500);
      }
    }

    .ww-header-actions {
      display: flex;
      gap: var(--space-3);
    }
  }

  .ww-[component]-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }
}
```

## Modal Patterns

Modals follow a consistent structure across all components:

```html
<!-- Modal HTML -->
<div id="my-modal" class="ww-modal">
  <div class="ww-modal-content">
    <div class="ww-modal-header">
      <h2>Modal Title</h2>
      <button class="ww-modal-close">
        <span class="ww-icon">✕</span>
      </button>
    </div>
    <div class="ww-modal-body">
      <!-- Modal content -->
    </div>
    <div class="ww-modal-footer">
      <button class="ww-btn-cancel">Cancel</button>
      <button class="ww-btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

### Modal SCSS (Already defined in conversations/style.scss)

```scss
.ww-modal {
  display: none; // Hidden by default
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  align-items: center;
  justify-content: center;

  &.show {
    display: flex;
  }

  .ww-modal-content {
    @include common.ww-widget-base;
    max-width: 800px;
    max-height: 90vh;
    width: 100%;
    display: flex;
    flex-direction: column;
  }
}
```

### Modal JavaScript Pattern

```javascript
// Show modal
const modal = document.getElementById('my-modal');
modal.classList.add('show');

// Hide modal
modal.classList.remove('show');

// Close on backdrop click
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('show');
  }
});
```

## Button Patterns

### Basic Buttons

```html
<!-- Primary actions -->
<button class="ww-btn-primary">Save Changes</button>

<!-- Secondary actions -->
<button class="ww-btn-secondary">Cancel</button>
<button class="ww-btn-cancel">Cancel</button>

<!-- Danger actions -->
<button class="ww-btn-delete">Delete</button>
<button class="ww-btn-danger">Remove</button>

<!-- Success actions -->
<button class="ww-btn-save">Save</button>
<button class="ww-btn-export">Export</button>
<button class="ww-btn-success">Success Action</button>

<!-- Utility buttons -->
<button class="ww-btn-options">Settings</button>
<button class="ww-btn-close">Close</button>
<button class="ww-btn-guide">📖 Guide</button>
```

### Button Styling with Mixins

```scss
.ww-btn-primary {
  @include common.ww-button-base;
  @include common.ww-button-variant-primary;
}

.ww-btn-save {
  @include common.ww-button-base;
  @include common.ww-button-variant-success;
}

.ww-btn-delete {
  @include common.ww-button-base;
  @include common.ww-button-variant-danger;
}
```

### Button Sizes

```html
<!-- Small button -->
<button class="ww-btn-primary ww-btn-sm">Small</button>

<!-- Large button -->
<button class="ww-btn-primary ww-btn-lg">Large</button>
```

## Form Patterns

### Form Structure

```html
<form class="ww-form">
  <!-- Text Input -->
  <div class="ww-form-group">
    <label class="ww-form-label" for="username">
      Username
      <span class="ww-label-required">*</span>
    </label>
    <input 
      type="text" 
      id="username" 
      class="ww-form-input" 
      placeholder="Enter username"
      required
    >
    <small class="ww-form-help">Your unique identifier</small>
  </div>

  <!-- Select Dropdown -->
  <div class="ww-form-group">
    <label class="ww-form-label" for="provider">Provider</label>
    <select id="provider" class="ww-form-select">
      <option value="">Select a provider</option>
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
    </select>
  </div>

  <!-- Textarea -->
  <div class="ww-form-group">
    <label class="ww-form-label" for="description">Description</label>
    <textarea 
      id="description" 
      class="ww-form-textarea" 
      rows="4"
      placeholder="Enter description"
    ></textarea>
  </div>

  <!-- Checkbox -->
  <div class="ww-form-group">
    <label class="ww-checkbox-label">
      <input type="checkbox" class="ww-checkbox">
      <span>Enable notifications</span>
    </label>
  </div>

  <!-- Form Actions -->
  <div class="ww-form-actions">
    <button type="button" class="ww-btn-cancel">Cancel</button>
    <button type="submit" class="ww-btn-primary">Submit</button>
  </div>
</form>
```

### Form Input Styling

```scss
.ww-form-input,
.ww-form-select,
.ww-form-textarea {
  @include common.ww-form-input-base;
}

// Already includes:
// - Padding, border, border-radius
// - Focus states with blue outline
// - Disabled states
// - Placeholder styling
```

## Table Patterns

### Basic Table

```html
<div class="ww-table-wrapper">
  <table class="ww-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Item Name</td>
        <td>
          <span class="ww-status-badge status-active">Active</span>
        </td>
        <td>
          <button class="ww-btn-sm">Edit</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Table Styling

```scss
.ww-table-wrapper {
  @include common.ww-widget-base;
  overflow-x: auto;

  .ww-table {
    width: 100%;
    border-collapse: collapse;

    th {
      text-align: left;
      padding: var(--space-3);
      border-bottom: 2px solid var(--color-border);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    td {
      padding: var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }

    tr:hover {
      background: var(--color-gray-50);
    }
  }
}
```

## Stats and Metrics Patterns

### Stats Bar (from Conversations)

```html
<div class="ww-stats-bar">
  <div class="ww-stat-item">
    <span class="ww-stat-value">42</span>
    <span class="ww-stat-label">Total Items</span>
  </div>
  <div class="ww-stat-item">
    <span class="ww-stat-value">8</span>
    <span class="ww-stat-label">Active</span>
  </div>
</div>
```

### Stats Bar Styling

```scss
.ww-stats-bar {
  @include common.ww-widget-base;
  display: flex;
  gap: var(--space-6);
  
  .ww-stat-item {
    text-align: center;
    
    .ww-stat-value {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary-600);
      display: block;
    }
    
    .ww-stat-label {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }
  }
}
```

## Status and Alert Patterns

### Status Messages

```html
<!-- Success -->
<div class="ww-status-message status-success">
  Settings saved successfully!
</div>

<!-- Error -->
<div class="ww-status-message status-error">
  Failed to save settings. Please try again.
</div>

<!-- Info -->
<div class="ww-alert alert-info">
  <div class="alert-content">
    <strong>Note:</strong> Changes will take effect on next reload.
  </div>
</div>
```

### Status Badges

```html
<span class="ww-status-badge status-active">Active</span>
<span class="ww-status-badge status-completed">Completed</span>
<span class="ww-status-badge status-error">Error</span>
```

## Card/Widget Patterns

### Basic Card

```html
<div class="ww-widget">
  <div class="ww-widget-header">
    <h3>Widget Title</h3>
    <div class="ww-widget-actions">
      <button class="ww-btn-options">⚙️</button>
    </div>
  </div>
  <div class="ww-widget-content">
    <!-- Content -->
  </div>
  <div class="ww-widget-footer">
    <!-- Footer actions -->
  </div>
</div>
```

### Widget Styling

```scss
.ww-widget {
  @include common.ww-widget-base;
  // Includes: background, border, border-radius, shadow, padding
}
```

## Filter and Action Patterns

### Filter Bar (from Conversations)

```html
<div class="ww-filters">
  <div class="ww-filters-row">
    <label class="ww-checkbox-label">
      <input type="checkbox" class="ww-checkbox" />
      <span>Select All</span>
    </label>
    
    <div class="ww-filter-group">
      <button class="ww-filter-btn active" data-filter="all">
        All
        <span class="ww-filter-count">12</span>
      </button>
      <button class="ww-filter-btn" data-filter="active">
        Active
        <span class="ww-filter-count">3</span>
      </button>
    </div>
    
    <div class="ww-bulk-actions">
      <span class="ww-selection-count">0 selected</span>
      <button class="ww-btn-export" disabled>📤 Export</button>
      <button class="ww-btn-delete" disabled>🗑️ Delete</button>
    </div>
  </div>
</div>
```

## Grid Layouts

### Two Column Grid

```html
<div class="ww-grid-2">
  <div>Column 1</div>
  <div>Column 2</div>
</div>
```

### Model Configuration Grid

```html
<div class="ww-model-grid">
  <div class="ww-form-group"><!-- Input 1 --></div>
  <div class="ww-form-group"><!-- Input 2 --></div>
  <div class="ww-form-group"><!-- Input 3 --></div>
</div>
```

## Loading States

### Spinner

```html
<div class="ww-loading">
  <div class="ww-spinner"></div>
  <p>Loading conversations...</p>
</div>
```

### Loading Overlay

```html
<div class="ww-loading-overlay">
  <div class="ww-content">
    <div class="ww-spinner"></div>
    <span>Processing...</span>
  </div>
</div>
```

## Empty States

```html
<div class="ww-empty-state">
  <div class="ww-empty-icon">💬</div>
  <h3>No conversations yet</h3>
  <p>Create a new conversation to get started.</p>
  <button class="ww-btn-primary">Start Conversation</button>
</div>
```

## Icons and Visual Elements

### Icon Usage

```html
<!-- Emoji icons in text -->
<button class="ww-btn-export">📤 Export</button>
<button class="ww-btn-delete">🗑️ Delete</button>

<!-- SVG icons (preferred for UI elements) -->
<button class="ww-btn-options">
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="..."/>
  </svg>
  Settings
</button>

<!-- Icon as header element -->
<h1>
  <span class="ww-icon">💬</span>
  Page Title
</h1>
```

## Complete Page Example

Here's a minimal but complete example combining these patterns:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebWire - Example Page</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div class="ww-example">
    <!-- Header -->
    <div class="ww-example-header">
      <h1>
        <span class="ww-icon">📊</span>
        Example Page
      </h1>
      <div class="ww-header-actions">
        <button class="ww-btn-primary" id="add-btn">Add New</button>
      </div>
    </div>

    <!-- Container -->
    <div class="ww-example-container">
      <!-- Stats Section -->
      <div class="ww-stats-bar">
        <div class="ww-stat-item">
          <span class="ww-stat-value">42</span>
          <span class="ww-stat-label">Total Items</span>
        </div>
        <div class="ww-stat-item">
          <span class="ww-stat-value">8</span>
          <span class="ww-stat-label">Active</span>
        </div>
      </div>

      <!-- Content Section -->
      <div class="ww-section">
        <div class="ww-section-header">
          <h2>Items</h2>
        </div>
        
        <div class="ww-table-wrapper">
          <table class="ww-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Example Item</td>
                <td><span class="ww-status-badge status-active">Active</span></td>
                <td>
                  <button class="ww-btn-sm">Edit</button>
                  <button class="ww-btn-delete ww-btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add Modal -->
    <div id="add-modal" class="ww-modal">
      <div class="ww-modal-content">
        <div class="ww-modal-header">
          <h2>Add New Item</h2>
          <button class="ww-modal-close">✕</button>
        </div>
        <div class="ww-modal-body">
          <form>
            <div class="ww-form-group">
              <label class="ww-form-label" for="item-name">Name</label>
              <input type="text" id="item-name" class="ww-form-input" required>
            </div>
            <div class="ww-form-group">
              <label class="ww-checkbox-label">
                <input type="checkbox" class="ww-checkbox">
                <span>Active</span>
              </label>
            </div>
          </form>
        </div>
        <div class="ww-modal-footer">
          <button class="ww-btn-cancel">Cancel</button>
          <button class="ww-btn-primary">Add Item</button>
        </div>
      </div>
    </div>

    <!-- Status Message -->
    <div id="status" class="ww-status-message" style="display: none;"></div>
  </div>
</body>
</html>
```

## Best Practices

### DO:
- ✅ Always use `ww-` prefix for all classes
- ✅ Use design tokens for colors, spacing, typography
- ✅ Import and use common mixins
- ✅ Follow established HTML structure patterns
- ✅ Use semantic HTML elements
- ✅ Include proper ARIA labels for accessibility
- ✅ Test responsiveness on mobile devices
- ✅ Use SVG for UI icons, emoji for content icons
- ✅ Add `ww-form-help` text for complex inputs
- ✅ Include IDs on form elements for label association
- ✅ Use component-specific CSS variables (e.g., `--header-height`)

### DON'T:
- ❌ Create global styles without `ww-` prefix
- ❌ Hardcode colors or spacing values
- ❌ Create one-off button or form styles
- ❌ Use inline styles except for show/hide (`display: none`)
- ❌ Forget to import shared styles
- ❌ Mix old class names with new `ww-` classes
- ❌ Create new button variants without updating common.scss

## Migration Checklist

When updating old components:

1. [ ] Replace all non-prefixed classes with `ww-` versions
2. [ ] Update button classes to use proper variants
3. [ ] Update form inputs to use `ww-form-*` classes
4. [ ] Update modals to use standard structure
5. [ ] Replace hardcoded colors with design tokens
6. [ ] Add proper mixins for buttons and widgets
7. [ ] Test all interactive elements
8. [ ] Verify responsive behavior

## Quick Reference

### Design Tokens
```scss
// Colors
var(--color-primary-500)
var(--color-surface)
var(--color-text-primary)
var(--color-border)

// Spacing
var(--space-1) through var(--space-10)

// Typography
var(--font-size-xs/sm/base/lg/xl)
var(--font-weight-normal/medium/semibold/bold)

// Shadows
var(--shadow-sm/md/lg/xl)

// Border Radius
var(--radius-sm/md/lg/xl/full)
```

### Common Mixins
```scss
@include common.ww-button-base;
@include common.ww-button-variant-primary;
@include common.ww-widget-base;
@include common.ww-form-input-base;
```

### Button Classes
```
ww-btn-primary    ww-btn-save      ww-btn-options
ww-btn-secondary  ww-btn-export    ww-btn-close
ww-btn-danger     ww-btn-delete    ww-btn-cancel
ww-btn-guide      ww-btn-success
```

### Links Styled as Buttons
```html
<!-- Links can use button classes too -->
<a href="guide.html" class="ww-btn-guide">
  <span>📖</span> Setup Guide
</a>
```

### Form Classes
```
ww-form-group     ww-form-label    ww-form-input
ww-form-select    ww-form-textarea ww-checkbox
```

### Layout Classes
```
ww-section        ww-widget        ww-modal
ww-grid-2         ww-model-grid    ww-stats-bar
```