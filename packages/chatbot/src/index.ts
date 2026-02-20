/**
 * @nevent/chatbot - Embeddable chatbot widget SDK
 *
 * A production-ready embeddable chatbot widget for the Nevent platform.
 * Provides AI-powered conversational interactions for event attendees,
 * deployable on any website with a single script tag.
 *
 * Features:
 * - Floating bubble (FAB) or inline embedded mode
 * - Visual customization (colors, fonts, theme, position)
 * - Multi-language support (es, en, ca, pt)
 * - Conversation persistence across page navigations
 * - Rich content support (cards, carousels, quick replies)
 * - Analytics tracking
 * - WCAG 2.1 Level AA accessibility
 * - XSS prevention for bot messages
 *
 * @example
 * ```typescript
 * import { ChatbotWidget } from '@nevent/chatbot';
 *
 * const widget = new ChatbotWidget({
 *   chatbotId: 'bot-123',
 *   tenantId: 'tenant-456',
 * });
 *
 * await widget.init();
 * ```
 *
 * @example
 * ```html
 * <script src="https://cdn.nevent.es/chatbot/nevent-chatbot.umd.cjs"></script>
 * <script>
 *   const widget = new NeventChatbot.ChatbotWidget({
 *     chatbotId: 'bot-123',
 *     tenantId: 'tenant-456',
 *     theme: 'auto',
 *     locale: 'en',
 *   });
 *   widget.init();
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export { ChatbotWidget } from './chatbot-widget';
export { AuthManager } from './chatbot/auth-manager';
export type {
  // Configuration
  ChatbotConfig,
  ChatbotStyles,
  BubbleStyles,
  WindowStyles,
  HeaderStyles,
  MessageStyles,
  InputStyles,
  QuickReplyStyles,
  TypingIndicatorStyles,
  FontConfig,

  // Messages & Conversation
  ChatMessage,
  RichContent,
  ActionButton,
  QuickReply,
  Conversation,

  // Server Configuration
  ServerChatbotConfig,
  ThemeConfig,
  FeatureFlags,
  RateLimitConfig,

  // API DTOs
  CreateConversationRequest,
  CreateConversationResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesResponse,
  GetMessagesParams,

  // Authentication
  AuthConfig,
  AuthMode,
  UserIdentity,

  // Errors
  ChatbotError,
  ChatbotErrorCode,

  // Analytics
  ChatbotAnalyticsEvent,
  MessageAnalyticsMetadata,

  // State
  ConversationState,
  PersistedConversationState,

  // i18n
  ChatbotTranslations,

  // Enums / Union Types
  BubblePosition,
  ThemeMode,
  SupportedLocale,
  MessageRole,
  MessageType,
  MessageStatus,
  ConversationStatus,
  RichContentType,
  ActionButtonType,
  ChatbotEventType,
  WidgetLifecycleState,

  // CSS
  CSSClassNames,

  // Internal Events
  WidgetInternalEvent,
  WidgetEventMap,
} from './types';
