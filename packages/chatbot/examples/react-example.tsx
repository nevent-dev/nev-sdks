/**
 * @nevent/chatbot — React Integration Example
 *
 * Provides a reusable <NeventChatbot> component that wraps the ChatbotWidget
 * lifecycle inside a React component. The component:
 *
 * - Creates the widget on mount
 * - Destroys it on unmount (prevents memory leaks and DOM orphans)
 * - Exposes a ref so parent components can call the programmatic API
 *
 * Usage:
 *   <NeventChatbot chatbotId="bot-123" tenantId="tenant-456" />
 *
 * Requirements:
 *   npm install @nevent/chatbot
 *   npm install react react-dom   (peer deps)
 */

import { useEffect, useRef, useCallback } from 'react';
import { ChatbotWidget } from '@nevent/chatbot';
import type { ChatbotConfig, ChatMessage, ChatbotError } from '@nevent/chatbot';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Props accepted by the NeventChatbot component. */
interface NeventChatbotProps extends ChatbotConfig {
  /**
   * Optional ref to expose the widget instance to parent components.
   * Useful for calling open(), close(), or sendMessage() from parent code.
   *
   * @example
   * const chatbotRef = useRef<ChatbotWidget | null>(null);
   * <NeventChatbot {...config} widgetRef={chatbotRef} />
   * // Later: chatbotRef.current?.open();
   */
  widgetRef?: React.MutableRefObject<ChatbotWidget | null>;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * React wrapper for the @nevent/chatbot ChatbotWidget.
 *
 * Renders as null in the React tree — the widget appends itself directly to
 * document.body (floating mode) or into the specified containerId (inline mode).
 *
 * @example
 * // Floating bubble (default)
 * <NeventChatbot
 *   chatbotId="bot-123"
 *   tenantId="tenant-456"
 *   locale="en"
 *   theme="auto"
 * />
 *
 * @example
 * // Inline mode inside a container
 * <div id="my-chat-container" style={{ height: 500 }} />
 * <NeventChatbot
 *   chatbotId="bot-123"
 *   tenantId="tenant-456"
 *   containerId="my-chat-container"
 * />
 */
export function NeventChatbot({
  widgetRef: externalRef,
  ...config
}: NeventChatbotProps) {
  const internalRef = useRef<ChatbotWidget | null>(null);

  useEffect(() => {
    const widget = new ChatbotWidget(config);

    widget.init().catch((err: Error) => {
      console.error('[NeventChatbot] Initialization failed:', err);
    });

    internalRef.current = widget;

    // Also expose on the external ref if provided
    if (externalRef) {
      externalRef.current = widget;
    }

    return () => {
      widget.destroy();
      internalRef.current = null;
      if (externalRef) {
        externalRef.current = null;
      }
    };
    // Re-initialize only when the chatbot identity changes.
    // Callback props (onOpen, onMessage, etc.) are intentionally excluded
    // from deps to avoid reinitializing on every render if they are inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.chatbotId, config.tenantId]);

  // The widget renders into the DOM directly — no React output needed
  return null;
}

// ----------------------------------------------------------------------------
// Usage examples
// ----------------------------------------------------------------------------

/**
 * Example 1: Basic floating chatbot in a React application.
 */
export function BasicExample() {
  return (
    <main>
      <h1>My Event Page</h1>
      <p>Ask our AI assistant anything about the event.</p>

      <NeventChatbot
        chatbotId="your-chatbot-id"
        tenantId="your-tenant-id"
        locale="en"
        theme="auto"
      />
    </main>
  );
}

/**
 * Example 2: Chatbot with event callbacks and programmatic control.
 */
export function WithCallbacksExample() {
  const chatbotRef = useRef<ChatbotWidget | null>(null);

  const handleMessage = useCallback((message: ChatMessage) => {
    console.log(`[${message.role}] ${message.content}`);
  }, []);

  const handleError = useCallback((error: ChatbotError) => {
    console.error(`[${error.code}] ${error.message}`);
  }, []);

  const handleReady = useCallback(() => {
    console.log('Chatbot is ready');
    // Open automatically after a 2-second delay
    setTimeout(() => chatbotRef.current?.open(), 2000);
  }, []);

  return (
    <div>
      <button onClick={() => chatbotRef.current?.open()}>Open Support Chat</button>

      <NeventChatbot
        chatbotId="your-chatbot-id"
        tenantId="your-tenant-id"
        locale="en"
        theme="auto"
        brandColor="#6366F1"
        widgetRef={chatbotRef}
        onReady={handleReady}
        onMessage={handleMessage}
        onError={handleError}
        onOpen={() => console.log('Chat opened')}
        onClose={() => console.log('Chat closed')}
      />
    </div>
  );
}

/**
 * Example 3: Inline chatbot embedded inside a React component.
 */
export function InlineExample() {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <h2>Festival Info</h2>
        <p>Parque de la Ciudadela, Barcelona. Doors open at 17:00.</p>
      </div>

      {/* The widget renders inside this container */}
      <div id="chatbot-container" style={{ height: 500, borderRadius: 16, overflow: 'hidden' }} />

      <NeventChatbot
        chatbotId="your-chatbot-id"
        tenantId="your-tenant-id"
        containerId="chatbot-container"
        locale="en"
        theme="light"
      />
    </section>
  );
}
