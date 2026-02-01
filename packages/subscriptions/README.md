# @nevent/subscriptions

Newsletter subscription widget for the Nevent platform.

## Features

- **GDPR Compliant**: Built-in consent management and privacy policy integration
- **Customizable Layouts**: Column or row layouts with flexible styling
- **Font Support**: Google Fonts and custom fonts from your CMS
- **Responsive Design**: Mobile-first approach with responsive breakpoints
- **Form Validation**: Client-side validation with user-friendly error messages
- **TypeScript**: Full type safety and IntelliSense support
- **Analytics Ready**: Built-in event tracking hooks
- **Lightweight**: ~15KB gzipped (vs 39KB in v1.3.6)

## Installation

```bash
npm install @nevent/subscriptions
# or
pnpm add @nevent/subscriptions
```

## Usage

### Basic Example

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Newsletter Subscription</title>
  </head>
  <body>
    <div id="newsletter-container"></div>

    <script type="module">
      import { NewsletterWidget } from '@nevent/subscriptions';

      const widget = new NewsletterWidget({
        newsletterId: 'newsletter-123',
        tenantId: 'tenant-456',
        containerId: 'newsletter-container',
      });

      await widget.init();
    </script>
  </body>
</html>
```

### With Custom Configuration

```typescript
import { NewsletterWidget } from '@nevent/subscriptions';

const widget = new NewsletterWidget({
  newsletterId: 'newsletter-123',
  tenantId: 'tenant-456',
  containerId: 'newsletter-container',

  // Custom styling
  primaryColor: '#FF6B6B',
  backgroundColor: '#F8F9FA',
  borderRadius: 12,

  // Form fields
  fields: {
    email: { enabled: true, required: true, placeholder: 'Your email' },
    firstName: { enabled: true, required: true, placeholder: 'First name' },
    lastName: { enabled: true, required: false, placeholder: 'Last name' },
  },

  // Messages
  messages: {
    submit: 'Subscribe',
    success: 'Welcome! Check your inbox for confirmation.',
    error: 'Oops! Something went wrong.',
    invalidEmail: 'Please enter a valid email address.',
  },

  // Callbacks
  onSuccess: (response) => {
    console.log('Subscription successful:', response);
  },
  onError: (error) => {
    console.error('Subscription failed:', error);
  },

  // Advanced options
  analytics: true,
  resetOnSuccess: true,
  animations: true,
  debug: false,
});

await widget.init();
```

### UMD (Script Tag)

```html
<div id="newsletter-container"></div>

<script src="https://cdn.nevent.es/sdk/subscriptions/2.0.0/nevent-subscriptions.umd.js"></script>
<script>
  const widget = new NeventSubscriptions.NewsletterWidget({
    newsletterId: 'newsletter-123',
    tenantId: 'tenant-456',
    containerId: 'newsletter-container',
  });

  widget.init();
</script>
```

## Configuration Options

### Required

- `newsletterId` (string): Your newsletter ID from Nevent dashboard
- `tenantId` (string): Your tenant ID

### Optional

| Option            | Type    | Default                   | Description                                          |
| ----------------- | ------- | ------------------------- | ---------------------------------------------------- |
| `apiUrl`          | string  | `'https://api.nevent.es'` | API base URL                                         |
| `containerId`     | string  | `null`                    | Container element ID (or use `.nevent-widget` class) |
| `primaryColor`    | string  | `'#007bff'`               | Primary brand color                                  |
| `backgroundColor` | string  | `'#ffffff'`               | Form background color                                |
| `borderRadius`    | number  | `8`                       | Border radius in pixels                              |
| `fields`          | object  | See below                 | Form field configuration                             |
| `messages`        | object  | See below                 | UI messages and labels                               |
| `analytics`       | boolean | `true`                    | Enable analytics tracking                            |
| `resetOnSuccess`  | boolean | `true`                    | Reset form after successful submission               |
| `showLabels`      | boolean | `false`                   | Show field labels                                    |
| `animations`      | boolean | `true`                    | Enable entry animations                              |
| `debug`           | boolean | `false`                   | Enable debug logging                                 |

### Field Configuration

```typescript
{
  email: { enabled: true, required: true, placeholder: 'Your email' },
  firstName: { enabled: true, required: false, placeholder: 'First name' },
  lastName: { enabled: false, required: false, placeholder: 'Last name' },
  postalCode: { enabled: false, required: false, placeholder: 'Postal code' },
  birthDate: { enabled: false, required: false, placeholder: 'Birth date' },
}
```

### Callbacks

- `onLoad(widget)`: Called when widget is initialized
- `onSubmit(data)`: Called before form submission
- `onSuccess(response)`: Called after successful subscription
- `onError(error)`: Called on submission error

## Migration from v1.3.6

### Before (v1.3.6)

```html
<script src="https://api.nevent.es/widget/v1/newsletter-v1.3.6.min.js"></script>
<script>
  new NeventWidget({
    newsletterId: '123',
    tenantId: '456',
  }).init();
</script>
```

### After (v2.0.0)

```html
<script type="module">
  import { NewsletterWidget } from '@nevent/subscriptions';

  const widget = new NewsletterWidget({
    newsletterId: '123',
    tenantId: '456',
  });

  await widget.init();
</script>
```

### Key Changes

1. **Module System**: Now uses ES modules (better tree-shaking)
2. **TypeScript**: Full type safety
3. **Smaller Bundle**: ~62% size reduction (39KB → 15KB)
4. **Better DX**: IntelliSense, autocomplete, inline documentation
5. **Modern Build**: Vite-powered with optimized output

## Browser Support

- Chrome/Edge 88+
- Firefox 90+
- Safari 14+
- Modern mobile browsers

For older browsers, consider using polyfills for:

- `fetch` API
- `Promise`
- ES2020 features

## Development

```bash
# Install dependencies
pnpm install

# Build package
pnpm build

# Watch mode
pnpm dev

# Type checking
pnpm typecheck
```

## License

MIT
