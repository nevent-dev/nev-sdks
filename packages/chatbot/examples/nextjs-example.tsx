/**
 * @nevent/chatbot — Next.js Integration Example
 *
 * The chatbot widget accesses browser globals (document, window, localStorage).
 * In Next.js this means the component must be:
 *
 *   1. Marked with 'use client' to opt out of SSR for that subtree.
 *   2. Dynamically imported with ssr: false at the page/layout level to
 *      prevent the module from being bundled or executed on the server.
 *
 * This file exports:
 *   - NeventChatbot — the 'use client' component (safe to import anywhere)
 *   - Usage examples showing dynamic import patterns for pages and layouts
 *
 * Requirements:
 *   npm install @nevent/chatbot
 *   npm install next react react-dom   (peer deps)
 */

'use client';

import { useEffect, useRef } from 'react';
import type { ChatbotConfig, ChatMessage, ChatbotError } from '@nevent/chatbot';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Ref handle exposed by NeventChatbot for programmatic control. */
export interface ChatbotHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => Promise<void>;
}

/** Props accepted by the NeventChatbot component. */
interface NeventChatbotProps extends ChatbotConfig {
  /**
   * Optional ref for programmatic control from parent components.
   *
   * @example
   * const ref = useRef<ChatbotHandle>(null);
   * <NeventChatbot {...config} handleRef={ref} />
   * ref.current?.open();
   */
  handleRef?: React.RefObject<ChatbotHandle | null>;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * Next.js-compatible React wrapper for @nevent/chatbot.
 *
 * Lazy-loads the ChatbotWidget module inside a useEffect to guarantee the
 * import only runs in the browser, preventing any SSR issues with
 * document/window references.
 *
 * @example
 * // app/layout.tsx  (with dynamic import wrapper — see below)
 * import { NeventChatbotDynamic } from '@/components/NeventChatbot';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <NeventChatbotDynamic
 *           chatbotId="your-chatbot-id"
 *           tenantId="your-tenant-id"
 *         />
 *       </body>
 *     </html>
 *   );
 * }
 */
export function NeventChatbot({ handleRef, ...config }: NeventChatbotProps) {
  // Holds the widget instance. Using `any` here avoids importing the class
  // type at module level, which would cause SSR to attempt evaluating the SDK.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    // Dynamic import ensures the SDK is never evaluated on the server
    import('@nevent/chatbot').then(({ ChatbotWidget }) => {
      if (!active) return;

      const widget = new ChatbotWidget(config);

      widget.init().catch((err: Error) => {
        console.error('[NeventChatbot] Initialization failed:', err);
      });

      widgetRef.current = widget;

      // Wire the external handle ref if provided
      if (handleRef && 'current' in handleRef) {
        (handleRef as React.MutableRefObject<ChatbotHandle | null>).current = {
          open: () => widget.open(),
          close: () => widget.close(),
          toggle: () => widget.toggle(),
          isOpen: () => widget.isOpen(),
          sendMessage: (text) => widget.sendMessage(text),
          clearConversation: () => widget.clearConversation(),
        };
      }
    });

    return () => {
      active = false;
      widgetRef.current?.destroy();
      widgetRef.current = null;

      if (handleRef && 'current' in handleRef) {
        (handleRef as React.MutableRefObject<ChatbotHandle | null>).current =
          null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.chatbotId, config.tenantId]);

  return null;
}

// ----------------------------------------------------------------------------
// Dynamic import wrapper (for use in Server Components / layouts)
// ----------------------------------------------------------------------------

/*
  PATTERN 1 — Dynamic import in a Server Component layout
  =========================================================
  In app/layout.tsx or pages/_app.tsx, wrap NeventChatbot with dynamic()
  to prevent it from being included in the server bundle at all.

  // components/NeventChatbotDynamic.tsx
  import dynamic from 'next/dynamic';

  export const NeventChatbotDynamic = dynamic(
    () => import('./NeventChatbot').then((mod) => mod.NeventChatbot),
    { ssr: false },
  );

  // app/layout.tsx
  import { NeventChatbotDynamic } from '@/components/NeventChatbotDynamic';

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <body>
          {children}
          <NeventChatbotDynamic
            chatbotId="your-chatbot-id"
            tenantId="your-tenant-id"
            locale="en"
            theme="auto"
          />
        </body>
      </html>
    );
  }
*/

/*
  PATTERN 2 — Inline lazy load inside a Client Component page
  ============================================================
  When the entire page is a Client Component ('use client'), you can use
  the NeventChatbot component directly. The internal dynamic import in
  useEffect already guards against SSR.

  // app/events/[id]/page.tsx
  'use client';

  import { NeventChatbot } from '@/components/NeventChatbot';

  export default function EventPage() {
    return (
      <>
        <main>
          <h1>Summer Music Festival</h1>
        </main>
        <NeventChatbot
          chatbotId="your-chatbot-id"
          tenantId="your-tenant-id"
          locale="en"
          theme="auto"
          brandColor="#6366F1"
        />
      </>
    );
  }
*/

/*
  PATTERN 3 — Programmatic control with a handle ref
  ====================================================
  'use client';

  import { useRef } from 'react';
  import { NeventChatbot, ChatbotHandle } from '@/components/NeventChatbot';

  export default function SupportPage() {
    const chatbotHandle = useRef<ChatbotHandle>(null);

    return (
      <>
        <button onClick={() => chatbotHandle.current?.open()}>
          Open Support Chat
        </button>

        <NeventChatbot
          chatbotId="your-chatbot-id"
          tenantId="your-tenant-id"
          locale="en"
          handleRef={chatbotHandle}
          onReady={() => console.log('Chatbot ready')}
          onMessage={(msg: ChatMessage) => console.log('New message:', msg.content)}
          onError={(err: ChatbotError) => console.error('Error:', err.code)}
        />
      </>
    );
  }
*/

/*
  PATTERN 4 — Inline mode inside a Next.js page section
  ======================================================
  'use client';

  import { NeventChatbot } from '@/components/NeventChatbot';

  export default function EventDetailPage() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2>Festival Assistant</h2>
          <p>Ask anything about the event, tickets, or venue.</p>
        </div>

        <div
          id="chatbot-container"
          style={{ height: 520, borderRadius: 16, overflow: 'hidden' }}
        />

        <NeventChatbot
          chatbotId="your-chatbot-id"
          tenantId="your-tenant-id"
          containerId="chatbot-container"
          locale="en"
          theme="light"
        />
      </div>
    );
  }
*/
