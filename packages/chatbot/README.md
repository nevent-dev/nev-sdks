# @nevent/chatbot

Embeddable chatbot widget for Nevent. Add a conversational AI assistant to any website with a single script tag.

## Features

- **Plug-and-play integration** — CDN script tag or npm import, works in any environment
- **Real-time streaming responses** — Server-Sent Events (SSE) for a ChatGPT-like token-by-token experience
- **Rich messages** — Cards, carousels, image embeds, button groups, and quick reply chips
- **Markdown rendering** — Bot responses render formatted text, lists, and code blocks
- **Customizable themes** — Built-in presets: `light`, `dark`, `midnight`, `ocean`, `sunset`, `forest`, `rose`, plus `auto` (follows OS preference)
- **Brand color auto-theming** — Generate a complete widget theme from a single hex color
- **Multi-language** — Spanish (ES), English (EN), Catalan (CA), Portuguese (PT)
- **Accessibility** — WCAG 2.1 Level AA: keyboard navigation, screen reader support, focus management, reduced motion
- **Conversation persistence** — Resumes across page navigations and browser refreshes (localStorage, configurable TTL)
- **Analytics built-in** — Automatic event tracking for opens, messages, clicks, and errors
- **Zero runtime dependencies** — No jQuery, no React, no external libraries required
- **< 60KB gzipped** — Minimal impact on page load performance

---

## Quick Start

### CDN (recommended for most use cases)

The fastest way to embed the chatbot. Add these two lines before the closing `</body>` tag:

```html
<script src="https://cdn.nevent.es/chatbot/nevent-chatbot.umd.cjs"></script>
<script>
  const chatbot = new NeventChatbot.ChatbotWidget({
    chatbotId: 'your-chatbot-id',
    tenantId: 'your-tenant-id',
  });
  chatbot.init();
</script>
```

### NPM

Install the package and import the class directly in your application:

```bash
npm install @nevent/chatbot
```

```typescript
import { ChatbotWidget } from '@nevent/chatbot';

const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
});

await chatbot.init();
```

---

## Configuration

### Required Options

| Option      | Type     | Description                                           |
| ----------- | -------- | ----------------------------------------------------- |
| `chatbotId` | `string` | Chatbot identifier from the Nevent platform dashboard |
| `tenantId`  | `string` | Your tenant identifier for multi-tenancy scoping      |

### Optional Options

| Option                | Type                              | Default                           | Description                                                                                     |
| --------------------- | --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apiUrl`              | `string`                          | `'https://api.nevent.es'`         | Base URL for API requests                                                                       |
| `containerId`         | `string \| null`                  | `null`                            | DOM element ID for inline mode. When `null`, renders as a floating bubble                       |
| `position`            | `'bottom-right' \| 'bottom-left'` | `'bottom-right'`                  | Position of the floating bubble                                                                 |
| `theme`               | `'light' \| 'dark' \| 'auto'`     | `'light'`                         | Color theme mode. `'auto'` follows `prefers-color-scheme`                                       |
| `themePreset`         | `string`                          | `undefined`                       | Named preset: `'light'`, `'dark'`, `'midnight'`, `'ocean'`, `'sunset'`, `'forest'`, `'rose'`    |
| `brandColor`          | `string`                          | `undefined`                       | Hex color to auto-generate a full theme (e.g. `'#6366F1'`). Takes precedence over `themePreset` |
| `locale`              | `'es' \| 'en' \| 'ca' \| 'pt'`    | `'es'`                            | Language for UI strings                                                                         |
| `styles`              | `ChatbotStyles`                   | `{}`                              | Granular visual style overrides for each widget component                                       |
| `customCSS`           | `string`                          | `undefined`                       | Raw CSS string injected after all base widget styles                                            |
| `fonts`               | `FontConfig[]`                    | `[]`                              | Custom fonts to load (Google Fonts or custom `@font-face`)                                      |
| `analytics`           | `boolean`                         | `true`                            | Enable analytics event tracking                                                                 |
| `analyticsUrl`        | `string`                          | `'https://events.neventapis.com'` | Analytics ingestion endpoint                                                                    |
| `debug`               | `boolean`                         | `false`                           | Enable verbose debug logging to the browser console                                             |
| `welcomeMessage`      | `string`                          | _(server configured)_             | Override the server-configured welcome message                                                  |
| `placeholder`         | `string`                          | _(server configured)_             | Override the input field placeholder text                                                       |
| `autoOpen`            | `boolean`                         | `false`                           | Automatically open the chat window on page load                                                 |
| `autoOpenDelay`       | `number`                          | `3000`                            | Milliseconds to wait before auto-opening                                                        |
| `persistConversation` | `boolean`                         | `true`                            | Persist conversation state in `localStorage` across page navigations                            |
| `conversationTTL`     | `number`                          | `24`                              | Hours before a persisted conversation expires                                                   |
| `showBranding`        | `boolean`                         | `true`                            | Show "Powered by Nevent" branding in the footer                                                 |
| `onOpen`              | `() => void`                      | `undefined`                       | Callback fired when the chat window opens                                                       |
| `onClose`             | `() => void`                      | `undefined`                       | Callback fired when the chat window closes                                                      |
| `onMessage`           | `(message: ChatMessage) => void`  | `undefined`                       | Callback fired on every new message (sent or received)                                          |
| `onError`             | `(error: ChatbotError) => void`   | `undefined`                       | Callback fired when an API error occurs                                                         |
| `onReady`             | `() => void`                      | `undefined`                       | Callback fired when the widget is fully initialized                                             |

---

## Customization

### Theme Presets

Apply a built-in visual preset with a single option:

```javascript
const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  themePreset: 'midnight', // 'light' | 'dark' | 'midnight' | 'ocean' | 'sunset' | 'forest' | 'rose'
});
```

### Brand Color Auto-Theming

Generate a complete, harmonious theme from a single brand color. The widget derives complementary colors using HSL manipulation:

```javascript
const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  brandColor: '#6366F1', // Any valid hex color
});
```

`brandColor` takes precedence over `themePreset` when both are specified.

### Custom Styles

Use the `styles` object for granular control over every visual component:

```typescript
import { ChatbotWidget, ChatbotStyles } from '@nevent/chatbot';

const styles: ChatbotStyles = {
  bubble: {
    backgroundColor: '#6366F1',
    iconColor: '#ffffff',
    size: 64,
    bottom: 24,
    right: 24,
  },
  window: {
    width: 380,
    height: 580,
    borderRadius: 20,
  },
  header: {
    backgroundColor: '#6366F1',
    textColor: '#ffffff',
    fontSize: '16px',
  },
  messages: {
    userBubbleColor: '#6366F1',
    userTextColor: '#ffffff',
    botBubbleColor: '#F3F4F6',
    botTextColor: '#111827',
    fontSize: '14px',
    borderRadius: 14,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#E5E7EB',
    sendButtonColor: '#6366F1',
    focusBorderColor: '#6366F1',
  },
  quickReplies: {
    borderColor: '#6366F1',
    textColor: '#6366F1',
    hoverBackgroundColor: '#6366F1',
    hoverTextColor: '#ffffff',
  },
  zIndex: 9999,
};

const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  styles,
});
```

### Custom CSS

Inject raw CSS for fine-grained overrides. Dangerous patterns (`@import`, `expression()`, `behavior:`) are stripped automatically before injection:

```javascript
const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  customCSS: `
    .nevent-chatbot-bubble {
      border: 2px solid rgba(255, 255, 255, 0.3);
    }
    .nevent-chatbot-header {
      background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;
    }
    .nevent-chatbot-message--bot .nevent-chatbot-message-content {
      font-style: italic;
    }
  `,
});
```

### Custom Fonts

Load Google Fonts or custom `@font-face` fonts for the widget typography:

```typescript
import { ChatbotWidget, FontConfig } from '@nevent/chatbot';

// Google Font
const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  fonts: [
    {
      family: 'Inter',
      category: 'sans-serif',
      type: 'GOOGLE_FONT',
    },
  ],
  styles: {
    fontFamily: 'Inter, sans-serif',
  },
});

// Custom @font-face font
const chatbotWithCustomFont = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  fonts: [
    {
      family: 'BrandFont',
      category: 'sans-serif',
      type: 'CUSTOM_FONT',
      files: {
        '400': 'https://cdn.example.com/fonts/brandfont-regular.woff2',
        '700': 'https://cdn.example.com/fonts/brandfont-bold.woff2',
      },
    },
  ],
});
```

---

## API Reference

### Methods

#### `init(): Promise<void>`

Initializes the chatbot widget: fetches server configuration, renders the UI, restores persisted conversation state, and sets up event listeners.

Must be called after construction and before any other method. Safe to call only once; subsequent calls are no-ops.

```typescript
const widget = new ChatbotWidget({ chatbotId: 'bot-1', tenantId: 't-1' });
await widget.init();
// Widget is now visible and ready
```

#### `open(): void`

Opens the chat window. In floating mode, the window slides in above the bubble. Resets the unread message badge and focuses the input field.

```typescript
widget.open();
```

#### `close(): void`

Closes the chat window. In floating mode, returns focus to the bubble button.

```typescript
widget.close();
```

#### `toggle(): void`

Opens the window if it is closed, closes it if it is open.

```typescript
widget.toggle();
```

#### `isOpen(): boolean`

Returns `true` if the chat window is currently visible.

```typescript
if (widget.isOpen()) {
  console.log('Chat window is open');
}
```

#### `sendMessage(text: string): Promise<void>`

Sends a message programmatically on behalf of the user. Creates an optimistic message in the UI immediately, then calls the API. A client-side rate limit of 1 message per second is enforced.

```typescript
await widget.sendMessage('I need help finding my tickets');
```

#### `clearConversation(): Promise<void>`

Ends the current conversation on the server, resets in-memory state, clears the message list, removes persisted data, and shows the welcome message again.

```typescript
await widget.clearConversation();
```

#### `getState(): Readonly<ConversationState>`

Returns a readonly snapshot of the current conversation state.

```typescript
const state = widget.getState();
console.log('Open:', state.isOpen);
console.log('Messages:', state.conversation?.messages.length ?? 0);
console.log('Unread:', state.unreadCount);
```

#### `destroy(): void`

Removes all UI elements from the DOM, unsubscribes from state changes, cleans up event listeners, removes injected CSS, and persists conversation state. The instance cannot be reused after calling this method.

```typescript
widget.destroy();
```

---

### Events / Callbacks

Callbacks are passed as options when constructing the widget:

```typescript
const widget = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',

  onReady: () => {
    console.log('Widget initialized and ready');
  },

  onOpen: () => {
    console.log('Chat window opened');
    // e.g. pause a video, log an analytics event
  },

  onClose: () => {
    console.log('Chat window closed');
  },

  onMessage: (message) => {
    // Fired for both user messages and bot responses
    console.log(`[${message.role}] ${message.content}`);
    if (message.role === 'assistant') {
      // e.g. update a notification badge in your own UI
    }
  },

  onError: (error) => {
    console.error(`Chatbot error [${error.code}]: ${error.message}`);
    // error.code is a ChatbotErrorCode for programmatic handling
  },
});
```

---

### Types

Key TypeScript types exported from `@nevent/chatbot`:

```typescript
// Widget configuration
interface ChatbotConfig {
  chatbotId: string;
  tenantId: string;
  apiUrl?: string;
  containerId?: string | null;
  position?: 'bottom-right' | 'bottom-left';
  theme?: 'light' | 'dark' | 'auto';
  themePreset?: string;
  brandColor?: string;
  locale?: 'es' | 'en' | 'ca' | 'pt';
  styles?: ChatbotStyles;
  customCSS?: string;
  fonts?: FontConfig[];
  analytics?: boolean;
  debug?: boolean;
  welcomeMessage?: string;
  placeholder?: string;
  autoOpen?: boolean;
  autoOpenDelay?: number;
  persistConversation?: boolean;
  conversationTTL?: number;
  showBranding?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (message: ChatMessage) => void;
  onError?: (error: ChatbotError) => void;
  onReady?: () => void;
}

// Current widget state
interface ConversationState {
  conversation: Conversation | null;
  isOpen: boolean;
  isLoading: boolean;
  isTyping: boolean;
  error: ChatbotError | null;
  unreadCount: number;
  lastActivity: string | null;
}

// Individual chat message
interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'rich' | 'quick_reply' | 'system';
  richContent?: RichContent;
  quickReplies?: QuickReply[];
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
  metadata?: Record<string, unknown>;
}

// Error object
interface ChatbotError {
  code: ChatbotErrorCode;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

// Error codes
type ChatbotErrorCode =
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'CONFIG_LOAD_FAILED'
  | 'CONVERSATION_CREATE_FAILED'
  | 'MESSAGE_SEND_FAILED'
  | 'MESSAGE_LOAD_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_CONFIG'
  | 'CONTAINER_NOT_FOUND'
  | 'INITIALIZATION_FAILED'
  | 'CONVERSATION_EXPIRED'
  | 'SANITIZATION_ERROR'
  | 'UNKNOWN_ERROR';
```

---

## Framework Integration

### React

```tsx
import { useEffect, useRef } from 'react';
import { ChatbotWidget } from '@nevent/chatbot';
import type { ChatbotConfig } from '@nevent/chatbot';

interface NeventChatbotProps extends ChatbotConfig {}

export function NeventChatbot(props: NeventChatbotProps) {
  const widgetRef = useRef<ChatbotWidget | null>(null);

  useEffect(() => {
    const widget = new ChatbotWidget(props);
    widget.init().catch((err) => {
      console.error('Failed to initialize chatbot:', err);
    });
    widgetRef.current = widget;

    return () => {
      widgetRef.current?.destroy();
      widgetRef.current = null;
    };
    // Re-initialize only when the chatbot identity changes
  }, [props.chatbotId, props.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The widget renders as a floating bubble — no DOM output needed here
  return null;
}

// Usage
function App() {
  return (
    <>
      <main>My Event Page</main>
      <NeventChatbot
        chatbotId="your-chatbot-id"
        tenantId="your-tenant-id"
        locale="en"
        theme="auto"
      />
    </>
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ChatbotWidget } from '@nevent/chatbot';
import type { ChatbotConfig } from '@nevent/chatbot';

const props = defineProps<ChatbotConfig>();

const widget = ref<ChatbotWidget | null>(null);

onMounted(async () => {
  widget.value = new ChatbotWidget(props);
  await widget.value.init();
});

onUnmounted(() => {
  widget.value?.destroy();
  widget.value = null;
});
</script>

<template>
  <!-- The chatbot renders as a floating bubble in the DOM body -->
</template>
```

### Angular

```typescript
import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  AfterViewInit,
} from '@angular/core';
import { ChatbotWidget } from '@nevent/chatbot';
import type { ChatbotConfig } from '@nevent/chatbot';

@Component({
  selector: 'app-nevent-chatbot',
  standalone: true,
  template: '', // Renders as a floating bubble — no template needed
})
export class NeventChatbotComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) chatbotId!: string;
  @Input({ required: true }) tenantId!: string;
  @Input() locale: ChatbotConfig['locale'] = 'es';
  @Input() theme: ChatbotConfig['theme'] = 'auto';

  private widget: ChatbotWidget | null = null;

  async ngAfterViewInit(): Promise<void> {
    this.widget = new ChatbotWidget({
      chatbotId: this.chatbotId,
      tenantId: this.tenantId,
      locale: this.locale,
      theme: this.theme,
    });
    await this.widget.init();
  }

  ngOnDestroy(): void {
    this.widget?.destroy();
    this.widget = null;
  }
}
```

```html
<!-- In your app template -->
<app-nevent-chatbot
  chatbotId="your-chatbot-id"
  tenantId="your-tenant-id"
  locale="es"
  theme="auto"
/>
```

### Next.js

The chatbot widget accesses `document` and `window`, so it must run only in the browser. Use dynamic import with `ssr: false`:

```tsx
'use client';

import { useEffect, useRef } from 'react';

interface ChatbotProps {
  chatbotId: string;
  tenantId: string;
}

export function NeventChatbot({ chatbotId, tenantId }: ChatbotProps) {
  const widgetRef = useRef<import('@nevent/chatbot').ChatbotWidget | null>(
    null
  );

  useEffect(() => {
    let mounted = true;

    import('@nevent/chatbot').then(({ ChatbotWidget }) => {
      if (!mounted) return;

      const widget = new ChatbotWidget({ chatbotId, tenantId });
      widget.init().catch(console.error);
      widgetRef.current = widget;
    });

    return () => {
      mounted = false;
      widgetRef.current?.destroy();
      widgetRef.current = null;
    };
  }, [chatbotId, tenantId]);

  return null;
}
```

```tsx
// In your layout or page
import dynamic from 'next/dynamic';

const NeventChatbot = dynamic(
  () => import('@/components/NeventChatbot').then((mod) => mod.NeventChatbot),
  { ssr: false }
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <NeventChatbot chatbotId="your-chatbot-id" tenantId="your-tenant-id" />
    </>
  );
}
```

---

## Accessibility

The widget is built to WCAG 2.1 Level AA standards:

- **Keyboard navigation** — The floating bubble is a focusable `<button>`. Open/close with Enter or Space. Press Escape to close the chat window from anywhere on the page.
- **Focus management** — Opening the chat moves focus to the input field. Closing the chat returns focus to the bubble button, following the ARIA dialog pattern.
- **Focus trap** — While the chat window is open, Tab and Shift+Tab cycle focus within the window so keyboard users stay in context.
- **Screen reader support** — The chat window uses `role="dialog"` and `aria-live` regions. New messages are announced via `aria-live="polite"`. Errors are announced via `role="alert"` and `aria-live="assertive"`.
- **Reduced motion** — Animations respect the `prefers-reduced-motion` media query. When enabled, slide-in/slide-out transitions are replaced with instant show/hide.
- **Colour contrast** — All built-in theme presets meet the WCAG AA minimum contrast ratio of 4.5:1 for normal text.
- **Status messages** — Connection status banners (offline, reconnecting, reconnected) use `role="status"` and `aria-live="polite"`.

---

## Analytics

The widget tracks the following events automatically when `analytics: true` (default):

| Event                  | Fired when                                 |
| ---------------------- | ------------------------------------------ |
| `chatbot_loaded`       | Widget finishes initializing               |
| `chatbot_opened`       | Chat window opens                          |
| `chatbot_closed`       | Chat window closes                         |
| `chatbot_error`        | An API error occurs                        |
| `conversation_started` | User sends their first message             |
| `conversation_resumed` | A persisted conversation is restored       |
| `message_sent`         | User submits a message                     |
| `message_received`     | Bot response arrives                       |
| `quick_reply_clicked`  | User clicks a quick reply chip             |
| `rich_content_clicked` | User clicks a button in a card or carousel |
| `link_clicked`         | User clicks a URL in a bot message         |
| `typing_started`       | Bot typing indicator appears               |
| `typing_stopped`       | Bot typing indicator disappears            |

To disable all analytics tracking:

```javascript
const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  analytics: false,
});
```

---

## Browser Support

The SDK targets **ES2020** and supports all evergreen browsers:

| Browser          | Minimum version |
| ---------------- | --------------- |
| Chrome / Edge    | 88+             |
| Firefox          | 90+             |
| Safari           | 14+             |
| iOS Safari       | 14+             |
| Samsung Internet | 14+             |

The UMD bundle (`nevent-chatbot.umd.cjs`) provides CommonJS compatibility for build tools that do not support ES modules natively.

---

## Troubleshooting

**Widget does not appear after calling `init()`**

- Verify that `chatbotId` and `tenantId` are correct. Copy them from the Nevent platform dashboard.
- Open the browser console and check for error messages. Enable verbose logging with `debug: true`.
- Confirm that your domain is whitelisted in the chatbot's allowed origins settings in the Nevent dashboard.

**`CONTAINER_NOT_FOUND` error**

When using inline mode (`containerId`), the container element must exist in the DOM before `init()` is called. Ensure you are not calling `init()` before the DOM is ready.

```javascript
// Make sure the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const chatbot = new ChatbotWidget({
    chatbotId: 'your-chatbot-id',
    tenantId: 'your-tenant-id',
    containerId: 'chat-container',
  });
  chatbot.init();
});
```

**`CONFIG_LOAD_FAILED` error**

The widget could not fetch its configuration from the Nevent API. Common causes:

- Network connectivity issue
- Incorrect `apiUrl` — defaults to `https://api.nevent.es`
- The chatbot has been deleted or deactivated in the Nevent platform

**Messages are not sending**

- Check for `RATE_LIMIT_EXCEEDED` errors. The client enforces a minimum 1-second interval between messages. The server may also apply rate limits (configurable per tenant).
- Ensure `init()` has resolved before calling `sendMessage()`.

**Conversation does not persist between page reloads**

- Persistence requires `localStorage` access. Check that your site does not block storage APIs (some cookie consent tools may do this).
- The default TTL is 24 hours. Set `conversationTTL` to a larger value if needed.
- Set `persistConversation: false` to intentionally disable persistence.

**Widget appears behind other page elements**

Increase the z-index:

```javascript
const chatbot = new ChatbotWidget({
  chatbotId: 'your-chatbot-id',
  tenantId: 'your-tenant-id',
  styles: {
    zIndex: 99999,
  },
});
```

---

## License

MIT
