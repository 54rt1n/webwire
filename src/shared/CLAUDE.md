# CLAUDE.md - Shared Styling System

This file provides guidance for working with the WebWire shared styling system.

## Directory Structure
```
src/shared
├── design-tokens.scss    # CSS custom properties and design tokens
├── common.scss          # Mixins, functions, and reusable component styles
└── global.scss          # Global container styles and base layouts
```

## Critical Pattern: Everything is Scoped

**NEVER write global styles**. All styles must be scoped to WebWire containers:

```scss
// WRONG
.button { }
h1 { }

// RIGHT
.ww-panel .button { }
.ww-modal h1 { }
```

## Import Pattern

Every component SCSS file starts with:
```scss
@use '../shared/common';  // Mixins and functions
```

## Design Tokens Quick Reference

```scss
// Colors
var(--color-primary-500)    // #3b82f6 - Primary blue
var(--color-gray-100)       // #f1f5f9 - Light gray background
var(--color-surface)        // #ffffff - White surface
var(--color-text-primary)   // var(--color-gray-800) - Main text
var(--color-text-secondary) // var(--color-gray-500) - Muted text
var(--color-border)         // var(--color-gray-200) - Borders
var(--color-success-500)    // #10b981 - Success green
var(--color-error-500)      // #ef4444 - Error red

// Spacing
var(--space-1)  // 4px
var(--space-2)  // 8px
var(--space-3)  // 12px
var(--space-4)  // 16px
var(--space-5)  // 20px
var(--space-6)  // 24px

// Typography
var(--font-size-xs)   // 12px
var(--font-size-sm)   // 14px
var(--font-size-base) // 16px
var(--font-size-lg)   // 18px

// Border Radius
var(--radius-sm)   // 4px
var(--radius-md)   // 6px
var(--radius-lg)   // 8px
var(--radius-xl)   // 12px
var(--radius-full) // 50%

// Shadows
var(--shadow-sm)  // Small shadow
var(--shadow-md)  // Medium shadow
var(--shadow-lg)  // Large shadow

// Z-Index
var(--z-modal)    // 1040
var(--z-tooltip)  // 1060
var(--z-max)      // 2147483647
```

## Common Mixins Reference

```scss
// Buttons
@include common.ww-button-base;              // Base button styling
@include common.ww-button-variant-primary;   // Blue primary button
@include common.ww-button-variant-success;   // Green success button
@include common.ww-button-variant-danger;    // Red danger button
@include common.ww-button-variant-warning;   // Yellow warning button
@include common.ww-button-variant-secondary; // Gray secondary button

// Forms
@include common.ww-form-input-base;          // Standard input styling
@include common.ww-widget-base;              // Widget container

// Status indicators
@include common.ww-status-indicator(
  var(--color-success-50),   // Background color
  var(--color-success-600),  // Text color
  var(--color-success-300)   // Border color (optional)
);

// Usage example
.my-button {
  @include common.ww-button-base;
  @include common.ww-button-variant-primary;
}

.my-input {
  @include common.ww-form-input-base;
}

.my-status {
  @include common.ww-status-indicator(
    var(--color-error-50),
    var(--color-error-600)
  );
}
```

## Placeholder Classes (use with @extend)

```scss
// Layout
@extend %ww-flex-center;        // display: flex; align-items: center; justify-content: center;
@extend %ww-flex-between;       // display: flex; justify-content: space-between; align-items: center;
@extend %ww-flex-column;        // display: flex; flex-direction: column;

// Components
@extend %ww-loading-spinner;    // Animated spinner
@extend %ww-modal-base;         // Modal overlay
@extend %ww-modal-content-base; // Modal content container

// Typography
@extend %ww-text-center;        // text-align: center;
@extend %ww-text-primary;       // color: var(--color-text-primary);
@extend %ww-text-secondary;     // color: var(--color-text-secondary);
@extend %ww-font-mono;          // font-family: var(--font-family-mono);

// Example
.my-centered-content {
  @extend %ww-flex-center;
  @extend %ww-text-primary;
}
```

## Container Classes (predefined in global.scss)

```scss
// Main containers - use these classes directly
.ww-panel           // Chat panel - fixed position, right side
.ww-modal           // Modal overlay with backdrop
.ww-dashboard       // Grid dashboard layout
.ww-options         // Options page container
.ww-popup           // Extension popup (300px wide)
.ww-fab             // Floating action button
.ww-notification    // Toast notification

// Example usage in HTML
<div class="ww-panel">
  <div class="header">
    <div class="title">Chat</div>
  </div>
  <div class="content">
    <!-- Messages here -->
  </div>
</div>
```

## Utility Classes Available

```scss
// Visibility
.ww-hidden         // display: none !important
.ww-sr-only        // Screen reader only

// Typography
.ww-text-xs        // 12px
.ww-text-sm        // 14px  
.ww-text-base      // 16px
.ww-text-lg        // 18px
.ww-font-medium    // 500 weight
.ww-font-semibold  // 600 weight
.ww-text-center    // center align
.ww-text-primary   // Primary text color
.ww-text-secondary // Secondary text color
.ww-text-error     // Error red color

// Animations
.ww-animate-fade-in   // Fade in animation
.ww-animate-slide-in  // Slide down animation
.ww-animate-pulse     // Pulse animation
```

## Quick Component Patterns

```scss
// Standard button
.my-button {
  @include common.ww-button-base;
  @include common.ww-button-variant-primary;
}

// Input field
.my-input {
  @include common.ww-form-input-base;
}

// Status badge
.status-badge {
  @include common.ww-status-indicator(
    var(--color-success-50),
    var(--color-success-600)
  );
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-lg);
}

// Modal
.my-modal {
  @extend %ww-modal-base;
  
  .content {
    @extend %ww-modal-content-base;
    width: 500px;
  }
}

// Centered layout
.centered-container {
  @extend %ww-flex-center;
  height: 100vh;
}
```

## Button Variants in HTML

```html
<!-- Use these classes directly on buttons -->
<button class="primary">Primary Action</button>
<button class="success">Save</button>
<button class="danger">Delete</button>
<button class="sm">Small Button</button>
<button class="icon">⚙</button>
```

## Message Styling Pattern

```scss
// Chat messages (already styled in global.scss)
.message {
  &.user { /* Blue background, right-aligned */ }
  &.assistant { /* Light background, left-aligned */ }
  &.thinking { /* Dashed border, loading state */ }
  &.error { /* Red background, error state */ }
}
```

## Critical Rules

1. **Always scope to containers**: `.ww-panel .my-component {}`
2. **Use design tokens**: `var(--space-4)` not `16px`
3. **Import shared styles**: `@use '../shared/common';`
4. **Prefix utility classes**: `.ww-hidden` not `.hidden`