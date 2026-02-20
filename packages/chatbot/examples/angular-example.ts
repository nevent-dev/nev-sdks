/**
 * @nevent/chatbot — Angular Integration Example
 *
 * Provides a standalone Angular component that wraps the ChatbotWidget
 * lifecycle. The component:
 *
 * - Initializes the widget in ngAfterViewInit (DOM guaranteed to exist)
 * - Destroys it in ngOnDestroy (prevents memory leaks)
 * - Exposes widget methods as public API for parent components
 *
 * Usage:
 *   <app-nevent-chatbot chatbotId="bot-123" tenantId="tenant-456" />
 *
 * Requirements:
 *   npm install @nevent/chatbot
 *   npm install @angular/core    (peer dep)
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  AfterViewInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ChatbotWidget } from '@nevent/chatbot';
import type {
  ChatbotConfig,
  ChatMessage,
  ChatbotError,
  ConversationState,
  ChatbotStyles,
  FontConfig,
  BubblePosition,
  ThemeMode,
  SupportedLocale,
} from '@nevent/chatbot';

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * Standalone Angular component wrapping @nevent/chatbot ChatbotWidget.
 *
 * The widget renders directly into the DOM (document.body in floating mode,
 * or inside containerId in inline mode). The Angular component itself has no
 * visual output — its template is empty.
 *
 * @example
 * // Floating bubble
 * <app-nevent-chatbot
 *   chatbotId="bot-123"
 *   tenantId="tenant-456"
 *   locale="es"
 *   theme="auto"
 * />
 *
 * @example
 * // Inline mode with callback outputs
 * <div id="chat-container" style="height: 500px;"></div>
 * <app-nevent-chatbot
 *   chatbotId="bot-123"
 *   tenantId="tenant-456"
 *   containerId="chat-container"
 *   (chatOpened)="onOpen()"
 *   (messageSent)="onMessage($event)"
 * />
 */
@Component({
  selector: 'app-nevent-chatbot',
  standalone: true,
  template: '',
  // OnPush is safe here: the component has no template bindings to trigger CD
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeventChatbotComponent implements AfterViewInit, OnDestroy {
  // --------------------------------------------------------------------------
  // Required inputs
  // --------------------------------------------------------------------------

  /** Chatbot identifier from the Nevent platform dashboard. */
  @Input({ required: true }) chatbotId!: string;

  /** Tenant identifier for multi-tenancy scoping. */
  @Input({ required: true }) tenantId!: string;

  // --------------------------------------------------------------------------
  // Optional inputs (mirror ChatbotConfig)
  // --------------------------------------------------------------------------

  /** Base URL for API requests. Default: 'https://api.nevent.es' */
  @Input() apiUrl?: string;

  /** DOM element ID to mount inline. When null (default), renders as floating bubble. */
  @Input() containerId?: string | null;

  /** Position of the floating bubble. Default: 'bottom-right' */
  @Input() position?: BubblePosition;

  /** Color theme mode. Default: 'light' */
  @Input() theme?: ThemeMode;

  /** Named theme preset (e.g. 'midnight', 'ocean', 'sunset'). */
  @Input() themePreset?: string;

  /** Brand color hex to auto-generate a full theme (e.g. '#6366F1'). */
  @Input() brandColor?: string;

  /** Locale for UI strings. Default: 'es' */
  @Input() locale?: SupportedLocale;

  /** Granular visual style overrides. */
  @Input() styles?: ChatbotStyles;

  /** Raw CSS string injected after base widget styles. */
  @Input() customCSS?: string;

  /** Custom fonts to load (Google Fonts or @font-face). */
  @Input() fonts?: FontConfig[];

  /** Enable analytics tracking. Default: true */
  @Input() analytics?: boolean;

  /** Enable debug logging. Default: false */
  @Input() debug?: boolean;

  /** Override server-configured welcome message. */
  @Input() welcomeMessage?: string;

  /** Override input placeholder text. */
  @Input() placeholder?: string;

  /** Automatically open the chat window on page load. Default: false */
  @Input() autoOpen?: boolean;

  /** Delay in ms before auto-opening. Default: 3000 */
  @Input() autoOpenDelay?: number;

  /** Persist conversation in localStorage. Default: true */
  @Input() persistConversation?: boolean;

  /** Hours before a persisted conversation expires. Default: 24 */
  @Input() conversationTTL?: number;

  /** Show "Powered by Nevent" branding. Default: true */
  @Input() showBranding?: boolean;

  // --------------------------------------------------------------------------
  // Output events (Angular @Output instead of callback props)
  // --------------------------------------------------------------------------

  /** Emitted when the chat window opens. */
  @Output() chatOpened = new EventEmitter<void>();

  /** Emitted when the chat window closes. */
  @Output() chatClosed = new EventEmitter<void>();

  /** Emitted when a new message is sent or received. */
  @Output() messageSent = new EventEmitter<ChatMessage>();

  /** Emitted when an API error occurs. */
  @Output() chatError = new EventEmitter<ChatbotError>();

  /** Emitted when the widget is fully initialized. */
  @Output() chatReady = new EventEmitter<void>();

  // --------------------------------------------------------------------------
  // Private state
  // --------------------------------------------------------------------------

  private widget: ChatbotWidget | null = null;

  // --------------------------------------------------------------------------
  // Lifecycle hooks
  // --------------------------------------------------------------------------

  /**
   * Initializes the chatbot widget after the view is ready.
   * AfterViewInit guarantees the host DOM is available for inline mode.
   */
  async ngAfterViewInit(): Promise<void> {
    const config: ChatbotConfig = {
      chatbotId: this.chatbotId,
      tenantId: this.tenantId,
      ...(this.apiUrl          !== undefined && { apiUrl: this.apiUrl }),
      ...(this.containerId     !== undefined && { containerId: this.containerId }),
      ...(this.position        !== undefined && { position: this.position }),
      ...(this.theme           !== undefined && { theme: this.theme }),
      ...(this.themePreset     !== undefined && { themePreset: this.themePreset }),
      ...(this.brandColor      !== undefined && { brandColor: this.brandColor }),
      ...(this.locale          !== undefined && { locale: this.locale }),
      ...(this.styles          !== undefined && { styles: this.styles }),
      ...(this.customCSS       !== undefined && { customCSS: this.customCSS }),
      ...(this.fonts           !== undefined && { fonts: this.fonts }),
      ...(this.analytics       !== undefined && { analytics: this.analytics }),
      ...(this.debug           !== undefined && { debug: this.debug }),
      ...(this.welcomeMessage  !== undefined && { welcomeMessage: this.welcomeMessage }),
      ...(this.placeholder     !== undefined && { placeholder: this.placeholder }),
      ...(this.autoOpen        !== undefined && { autoOpen: this.autoOpen }),
      ...(this.autoOpenDelay   !== undefined && { autoOpenDelay: this.autoOpenDelay }),
      ...(this.persistConversation !== undefined && { persistConversation: this.persistConversation }),
      ...(this.conversationTTL !== undefined && { conversationTTL: this.conversationTTL }),
      ...(this.showBranding    !== undefined && { showBranding: this.showBranding }),

      // Wire Angular EventEmitters to the SDK callback options
      onOpen:    () => this.chatOpened.emit(),
      onClose:   () => this.chatClosed.emit(),
      onMessage: (msg)   => this.messageSent.emit(msg),
      onError:   (error) => this.chatError.emit(error),
      onReady:   () => this.chatReady.emit(),
    };

    this.widget = new ChatbotWidget(config);

    try {
      await this.widget.init();
    } catch (err) {
      console.error('[NeventChatbotComponent] Initialization failed:', err);
    }
  }

  /** Destroys the widget when the Angular component is removed from the DOM. */
  ngOnDestroy(): void {
    this.widget?.destroy();
    this.widget = null;
  }

  // --------------------------------------------------------------------------
  // Public API (callable from parent via ViewChild)
  // --------------------------------------------------------------------------

  /** Opens the chat window. */
  open(): void {
    this.widget?.open();
  }

  /** Closes the chat window. */
  close(): void {
    this.widget?.close();
  }

  /** Toggles the chat window open/closed. */
  toggle(): void {
    this.widget?.toggle();
  }

  /** Returns true if the chat window is currently open. */
  isOpen(): boolean {
    return this.widget?.isOpen() ?? false;
  }

  /** Sends a message programmatically. */
  async sendMessage(text: string): Promise<void> {
    await this.widget?.sendMessage(text);
  }

  /** Clears the current conversation and starts fresh. */
  async clearConversation(): Promise<void> {
    await this.widget?.clearConversation();
  }

  /** Returns a snapshot of the current conversation state. */
  getState(): Readonly<ConversationState> | undefined {
    return this.widget?.getState();
  }
}

// ----------------------------------------------------------------------------
// Usage examples
// ----------------------------------------------------------------------------

/**
 * Example 1: Basic floating chatbot in an Angular application.
 *
 * app.component.ts
 * ----------------
 *
 * @Component({
 *   selector: 'app-root',
 *   standalone: true,
 *   imports: [NeventChatbotComponent],
 *   template: `
 *     <main>
 *       <h1>My Event Page</h1>
 *       <app-nevent-chatbot
 *         chatbotId="your-chatbot-id"
 *         tenantId="your-tenant-id"
 *         locale="es"
 *         theme="auto"
 *       />
 *     </main>
 *   `,
 * })
 * export class AppComponent {}
 */

/**
 * Example 2: Chatbot with outputs and ViewChild programmatic control.
 *
 * feature.component.ts
 * --------------------
 *
 * @Component({
 *   selector: 'app-feature',
 *   standalone: true,
 *   imports: [NeventChatbotComponent],
 *   template: `
 *     <button (click)="chatbot.open()">Open Support</button>
 *
 *     <app-nevent-chatbot
 *       #chatbot
 *       chatbotId="your-chatbot-id"
 *       tenantId="your-tenant-id"
 *       brandColor="#6366F1"
 *       locale="es"
 *       (chatOpened)="onOpen()"
 *       (chatClosed)="onClose()"
 *       (messageSent)="onMessage($event)"
 *       (chatError)="onError($event)"
 *       (chatReady)="onReady()"
 *     />
 *   `,
 * })
 * export class FeatureComponent {
 *   @ViewChild('chatbot') chatbot!: NeventChatbotComponent;
 *
 *   onOpen()  { console.log('Chat opened'); }
 *   onClose() { console.log('Chat closed'); }
 *
 *   onMessage(message: ChatMessage) {
 *     console.log(`[${message.role}] ${message.content}`);
 *   }
 *
 *   onError(error: ChatbotError) {
 *     console.error(`[${error.code}] ${error.message}`);
 *   }
 *
 *   onReady() {
 *     // Widget is initialized — safe to call API methods
 *     setTimeout(() => this.chatbot.sendMessage('Hello!'), 1000);
 *   }
 * }
 */

/**
 * Example 3: Inline chatbot embedded in a component layout.
 *
 * event-page.component.ts
 * -----------------------
 *
 * @Component({
 *   selector: 'app-event-page',
 *   standalone: true,
 *   imports: [NeventChatbotComponent],
 *   template: `
 *     <section class="layout">
 *       <div class="info">
 *         <h2>Festival Assistant</h2>
 *         <p>Ask anything about tickets, schedule, or venue.</p>
 *       </div>
 *
 *       <div id="chat-container" class="chat-container"></div>
 *
 *       <app-nevent-chatbot
 *         chatbotId="your-chatbot-id"
 *         tenantId="your-tenant-id"
 *         containerId="chat-container"
 *         locale="es"
 *         theme="light"
 *       />
 *     </section>
 *   `,
 *   styles: [`
 *     .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
 *     .chat-container { height: 520px; border-radius: 16px; overflow: hidden; }
 *   `],
 * })
 * export class EventPageComponent {}
 */
