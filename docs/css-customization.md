# CSS Customization Guide

This guide explains how to customize the appearance of the Newsletter Widget using CSS custom properties (CSS variables).

## Table of Contents

- [Overview](#overview)
- [CSS Variables Reference](#css-variables-reference)
- [Customization Methods](#customization-methods)
- [Examples](#examples)
- [Best Practices](#best-practices)

---

## Overview

The Newsletter Widget uses CSS custom properties to enable easy customization without requiring `!important` declarations. All design tokens are exposed as `--nw-*` variables that can be overridden.

### Why CSS Variables?

- **No !important needed**: Variables can be overridden naturally through CSS specificity
- **Scoped customization**: Override variables globally or per-widget instance
- **Runtime changes**: Update colors dynamically without recompiling
- **Better maintainability**: Centralized design tokens

---

## CSS Variables Reference

### Colors - Primary Palette

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-primary-color` | `#007bff` | Primary brand color (buttons, links) |
| `--nw-primary-color-hover` | `#0056b3` | Primary color on hover |
| `--nw-primary-color-active` | `#004085` | Primary color when active/pressed |
| `--nw-primary-text-color` | `#ffffff` | Text color on primary background |

### Colors - Secondary Palette

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-secondary-color` | `#6c757d` | Secondary brand color |
| `--nw-secondary-color-hover` | `#5a6268` | Secondary color on hover |
| `--nw-secondary-text-color` | `#ffffff` | Text color on secondary background |

### Colors - Semantic

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-success-color` | `#28a745` | Success state color |
| `--nw-error-color` | `#dc3545` | Error state color |
| `--nw-warning-color` | `#ffc107` | Warning state color |
| `--nw-info-color` | `#17a2b8` | Info state color |

### Colors - Neutrals

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-text-color` | `#212529` | Default text color |
| `--nw-text-color-secondary` | `#6c757d` | Secondary text color (hints, descriptions) |
| `--nw-border-color` | `#dee2e6` | Default border color |
| `--nw-background-color` | `#ffffff` | Widget background color |
| `--nw-surface-color` | `#f8f9fa` | Surface color for containers |

### Typography

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-font-family` | `system fonts` | Font family stack |
| `--nw-font-size-base` | `16px` | Base font size |
| `--nw-font-size-sm` | `14px` | Small font size |
| `--nw-font-size-lg` | `18px` | Large font size |
| `--nw-font-weight-normal` | `400` | Normal font weight |
| `--nw-font-weight-medium` | `500` | Medium font weight |
| `--nw-font-weight-bold` | `700` | Bold font weight |
| `--nw-line-height` | `1.5` | Line height |

### Spacing

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-spacing-xs` | `4px` | Extra small spacing |
| `--nw-spacing-sm` | `8px` | Small spacing |
| `--nw-spacing-md` | `16px` | Medium spacing (default gap) |
| `--nw-spacing-lg` | `24px` | Large spacing |
| `--nw-spacing-xl` | `32px` | Extra large spacing |

### Form Elements

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-input-border-color` | `#ced4da` | Input border color |
| `--nw-input-border-color-focus` | `#80bdff` | Input border on focus |
| `--nw-input-border-color-error` | `#dc3545` | Input border on error |
| `--nw-input-bg-color` | `#ffffff` | Input background |
| `--nw-input-text-color` | `#495057` | Input text color |
| `--nw-input-placeholder-color` | `#6c757d` | Placeholder text color |
| `--nw-input-padding` | `0.75rem 1rem` | Input padding |
| `--nw-input-border-radius` | `6px` | Input border radius |
| `--nw-input-border-width` | `1px` | Input border width |

### Buttons

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-button-padding` | `0.75rem 1.5rem` | Button padding |
| `--nw-button-border-radius` | `6px` | Button border radius |
| `--nw-button-font-weight` | `500` | Button font weight |
| `--nw-button-text-transform` | `none` | Button text transform |
| `--nw-button-box-shadow` | `0 2px 4px rgba(0,0,0,0.1)` | Button shadow |
| `--nw-button-box-shadow-hover` | `0 4px 8px rgba(0,0,0,0.15)` | Button shadow on hover |

### Labels and Hints

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-label-color` | `#495057` | Label text color |
| `--nw-label-font-size` | `14px` | Label font size |
| `--nw-label-font-weight` | `500` | Label font weight |
| `--nw-label-margin-bottom` | `0.5rem` | Label bottom margin |
| `--nw-hint-color` | `#6c757d` | Hint text color |
| `--nw-hint-font-size` | `12px` | Hint font size |

### Transitions

| Variable | Default | Description |
|----------|---------|-------------|
| `--nw-transition-duration` | `0.2s` | Animation duration |
| `--nw-transition-timing` | `ease-in-out` | Animation timing function |

---

## Customization Methods

### Method 1: Global Override (All Widgets)

Override variables in your main CSS file:

```css
:root {
  --nw-primary-color: #ff6600;
  --nw-primary-color-hover: #cc5200;
  --nw-font-family: 'Inter', sans-serif;
  --nw-button-border-radius: 8px;
}
```

### Method 2: Per-Widget Override

Target a specific widget container:

```css
#my-newsletter-widget {
  --nw-primary-color: #9b4dca;
  --nw-input-border-radius: 12px;
  --nw-button-padding: 1rem 2rem;
}
```

### Method 3: Inline Styles (Dynamic)

Override via JavaScript:

```javascript
const widgetElement = document.getElementById('newsletter-widget-123');
widgetElement.style.setProperty('--nw-primary-color', '#ff6600');
widgetElement.style.setProperty('--nw-font-family', '"Poppins", sans-serif');
```

### Method 4: Widget Config (Recommended)

Use the widget configuration API:

```javascript
NewsletterWidget.init('container', {
  apiKey: 'your-api-key',
  widgetId: 'widget-123',
  styles: {
    button: {
      backgroundColor: '#ff6600', // Maps to --nw-primary-color
      color: '#ffffff'            // Maps to --nw-primary-text-color
    },
    fontFamily: '"Inter", sans-serif', // Maps to --nw-font-family
    borderRadius: '8px'                // Maps to --nw-input-border-radius
  }
});
```

---

## Examples

### Example 1: Dark Theme

```css
.dark-theme {
  --nw-background-color: #1a1a1a;
  --nw-surface-color: #2d2d2d;
  --nw-text-color: #ffffff;
  --nw-text-color-secondary: #b0b0b0;
  --nw-border-color: #404040;
  --nw-input-bg-color: #2d2d2d;
  --nw-input-text-color: #ffffff;
  --nw-input-border-color: #404040;
}
```

### Example 2: Brand Matching

```css
.brand-newsletter {
  /* Colors from your brand guidelines */
  --nw-primary-color: #0066cc;
  --nw-primary-color-hover: #0052a3;
  --nw-success-color: #00b894;
  --nw-error-color: #e74c3c;

  /* Typography */
  --nw-font-family: 'Montserrat', sans-serif;
  --nw-font-weight-bold: 600;

  /* Spacing */
  --nw-spacing-md: 20px;
  --nw-button-padding: 1rem 2.5rem;

  /* Borders */
  --nw-input-border-radius: 4px;
  --nw-button-border-radius: 4px;
}
```

### Example 3: Pill-Shaped Buttons

```css
.pill-buttons {
  --nw-button-border-radius: 999px;
  --nw-button-padding: 0.875rem 2rem;
  --nw-button-box-shadow: none;
}
```

### Example 4: Minimal Design

```css
.minimal-newsletter {
  --nw-border-color: #e0e0e0;
  --nw-input-border-width: 0;
  --nw-input-border-radius: 0;
  --nw-input-bg-color: #f5f5f5;
  --nw-button-border-radius: 0;
  --nw-button-box-shadow: none;
  --nw-spacing-md: 12px;
}
```

### Example 5: Animated Hover Effects

```css
.animated-newsletter {
  --nw-transition-duration: 0.3s;
  --nw-transition-timing: cubic-bezier(0.4, 0, 0.2, 1);
  --nw-button-box-shadow-hover: 0 8px 16px rgba(0, 0, 0, 0.2);
}

.animated-newsletter .newsletter-widget__button:hover {
  transform: scale(1.05);
}
```

---

## Best Practices

### 1. Use Semantic Color Names

Instead of:
```css
.newsletter-widget {
  --nw-primary-color: #ff0000;
}
```

Do:
```css
:root {
  --brand-primary: #ff0000;
}

.newsletter-widget {
  --nw-primary-color: var(--brand-primary);
}
```

### 2. Maintain Accessibility

Ensure sufficient color contrast:
```css
/* ✅ Good - WCAG AA compliant */
--nw-primary-color: #0066cc;
--nw-primary-text-color: #ffffff;

/* ❌ Bad - Low contrast */
--nw-primary-color: #ffff00;
--nw-primary-text-color: #ffffff;
```

### 3. Test Responsive Behavior

Override variables at different breakpoints:
```css
@media (max-width: 640px) {
  .newsletter-widget {
    --nw-font-size-base: 14px;
    --nw-button-padding: 0.75rem 1.25rem;
    --nw-spacing-lg: 16px;
  }
}
```

### 4. Group Related Overrides

```css
/* Typography */
.newsletter-widget {
  --nw-font-family: 'Inter', sans-serif;
  --nw-font-size-base: 16px;
  --nw-line-height: 1.6;
}

/* Brand Colors */
.newsletter-widget {
  --nw-primary-color: #0066cc;
  --nw-primary-color-hover: #0052a3;
  --nw-primary-color-active: #003d7a;
}

/* Border Radius */
.newsletter-widget {
  --nw-input-border-radius: 8px;
  --nw-button-border-radius: 8px;
}
```

### 5. Avoid Hardcoding Values in Component Styles

Instead of:
```css
.newsletter-widget__input {
  border: 1px solid #ced4da; /* ❌ Hardcoded */
}
```

Use:
```css
.newsletter-widget__input {
  border: var(--nw-input-border-width) solid var(--nw-input-border-color); /* ✅ Customizable */
}
```

---

## Security Note

All CSS values are sanitized to prevent XSS attacks. The following patterns are blocked:

- `javascript:` URLs
- `expression()` CSS expressions
- `<script>` tags
- Event handlers (e.g., `onclick=`)
- Data URLs in `url()`

Invalid values will be ignored and fall back to defaults.

---

## Browser Support

CSS custom properties are supported in:
- Chrome 49+
- Firefox 31+
- Safari 9.1+
- Edge 15+
- Opera 36+

For older browsers, default values are used automatically.

---

## Migration from Legacy Styles

If you were using inline styles or `!important`, migrate to CSS variables:

**Before (legacy):**
```css
.newsletter-widget button {
  background-color: #ff6600 !important;
  border-radius: 8px !important;
}
```

**After (CSS variables):**
```css
.newsletter-widget {
  --nw-primary-color: #ff6600;
  --nw-button-border-radius: 8px;
}
```

---

## Support

For questions or issues with CSS customization:
- Documentation: [https://docs.nevent.io/widgets/customization](https://docs.nevent.io/widgets/customization)
- GitHub Issues: [https://github.com/nevent-dev/nev-sdks/issues](https://github.com/nevent-dev/nev-sdks/issues)
- Support: support@nevent.io
