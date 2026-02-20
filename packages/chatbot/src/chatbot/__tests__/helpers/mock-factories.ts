/**
 * mock-factories.ts - Test factories for creating consistent mock objects
 *
 * Provides factory functions for every domain model in the chatbot SDK.
 * All factories accept an optional `overrides` partial so tests only need
 * to specify the fields that differ from the sensible defaults.
 *
 * Usage:
 * ```typescript
 * import { createMockMessage, createMockServerConfig } from './helpers/mock-factories';
 *
 * const userMsg = createMockMessage({ role: 'user', content: 'Hello' });
 * const serverCfg = createMockServerConfig({ name: 'My Bot' });
 * ```
 */

import type {
  ChatMessage,
  Conversation,
  ChatbotConfig,
  ServerChatbotConfig,
  RichContent,
  RichContentType,
  MessageRole,
  MessageType,
  MessageStatus,
} from '../../../types';

// ============================================================================
// Sequence counters — ensure unique IDs across a test run
// ============================================================================

let messageSeq = 0;
let conversationSeq = 0;

/**
 * Resets all sequence counters to 0.
 * Call this in `beforeEach` when ID uniqueness across tests is important.
 */
export function resetFactorySequences(): void {
  messageSeq = 0;
  conversationSeq = 0;
}

// ============================================================================
// ChatMessage factory
// ============================================================================

/**
 * Creates a minimal but fully-typed {@link ChatMessage}.
 *
 * Defaults:
 * - `id`: auto-incremented `msg-N`
 * - `conversationId`: `'conv-1'`
 * - `role`: `'user'`
 * - `content`: `'Hello, bot!'`
 * - `type`: `'text'`
 * - `timestamp`: `'2025-01-01T00:01:00Z'`
 * - `status`: `'sent'`
 *
 * @param overrides - Partial properties to override the defaults
 * @returns A fully-typed ChatMessage object
 */
export function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const id = `msg-${++messageSeq}`;
  return {
    id,
    conversationId: 'conv-1',
    role: 'user' as MessageRole,
    content: 'Hello, bot!',
    type: 'text' as MessageType,
    timestamp: '2025-01-01T00:01:00Z',
    status: 'sent' as MessageStatus,
    ...overrides,
  };
}

/**
 * Creates a bot (assistant) {@link ChatMessage} with sensible bot defaults.
 *
 * @param overrides - Partial properties to override the defaults
 * @returns A ChatMessage with `role: 'assistant'`
 */
export function createMockBotMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return createMockMessage({
    role: 'assistant',
    content: 'Hello! How can I help you today?',
    ...overrides,
  });
}

// ============================================================================
// Conversation factory
// ============================================================================

/**
 * Creates a minimal but fully-typed {@link Conversation}.
 *
 * Defaults:
 * - `id`: auto-incremented `conv-N`
 * - `chatbotId`: `'bot-test-123'`
 * - `status`: `'active'`
 * - `messages`: `[]`
 * - `createdAt` / `updatedAt`: `'2025-01-01T00:00:00Z'`
 *
 * @param overrides - Partial properties to override the defaults
 * @returns A fully-typed Conversation object
 */
export function createMockConversation(overrides: Partial<Conversation> = {}): Conversation {
  const id = `conv-${++conversationSeq}`;
  return {
    id,
    chatbotId: 'bot-test-123',
    status: 'active',
    messages: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// ChatbotConfig factory
// ============================================================================

/**
 * Creates a minimal {@link ChatbotConfig} suitable for unit and integration tests.
 *
 * Only `chatbotId` and `tenantId` are required by the real constructor, so
 * the factory fills those with stable test values and keeps everything else
 * at their defaults. Callbacks are no-ops by default to prevent `undefined is
 * not a function` errors in tests that don't care about them.
 *
 * @param overrides - Partial properties to override the defaults
 * @returns A minimal, valid ChatbotConfig
 */
export function createMockConfig(overrides: Partial<ChatbotConfig> = {}): ChatbotConfig {
  return {
    chatbotId: 'bot-test-123',
    tenantId: 'tenant-test-456',
    apiUrl: 'https://api.test.nevent.es',
    persistConversation: false,
    debug: false,
    analytics: false,
    autoOpen: false,
    onOpen: () => {},
    onClose: () => {},
    onMessage: () => {},
    onError: () => {},
    onReady: () => {},
    ...overrides,
  };
}

// ============================================================================
// ServerChatbotConfig factory
// ============================================================================

/**
 * Creates a minimal {@link ServerChatbotConfig} that satisfies all required
 * fields returned by the config API endpoint.
 *
 * Feature flags default to a safe baseline (most features disabled) so tests
 * that need specific features can enable them via `overrides`.
 *
 * @param overrides - Partial properties to override the defaults
 * @returns A fully-typed ServerChatbotConfig
 */
export function createMockServerConfig(
  overrides: Partial<ServerChatbotConfig> = {},
): ServerChatbotConfig {
  return {
    chatbotId: 'bot-test-123',
    tenantId: 'tenant-test-456',
    name: 'Test Bot',
    description: 'A test chatbot',
    welcomeMessage: 'Welcome! How can I help you?',
    placeholder: 'Type a message…',
    theme: {
      primaryColor: '#007bff',
    },
    features: {
      quickReplies: true,
      richContent: false,
      persistence: true,
      typingIndicator: true,
      fileAttachments: false,
      reactions: false,
      eventSuggestions: false,
      streaming: false,
      showBranding: true,
    },
    rateLimit: {
      messagesPerMinute: 20,
      conversationsPerHour: 5,
      minMessageInterval: 1000,
      maxMessageLength: 500,
    },
    token: 'test-server-token-xyz',
    ...overrides,
  };
}

// ============================================================================
// RichContent factory
// ============================================================================

/**
 * Creates a {@link RichContent} payload for the given rich content type.
 *
 * Each type is populated with realistic sample data to exercise full rendering
 * paths in integration and UI tests.
 *
 * @param type - The type of rich content to create
 * @returns A RichContent object matching the requested type
 */
export function createMockRichContent(type: RichContentType): RichContent {
  switch (type) {
    case 'card':
      return {
        type: 'card',
        title: 'Festival Pass 2025',
        description: 'Get your all-access festival pass. Includes all stages and events.',
        imageUrl: 'https://example.com/festival-pass.jpg',
        buttons: [
          { id: 'btn-1', label: 'Buy Now', type: 'url', value: 'https://tickets.nevent.es' },
          { id: 'btn-2', label: 'More Info', type: 'postback', value: 'more_info' },
        ],
      };

    case 'carousel':
      return {
        type: 'carousel',
        items: [
          {
            type: 'card',
            title: 'Day 1 Pass',
            description: 'Friday, 23 May 2025',
            imageUrl: 'https://example.com/day1.jpg',
            buttons: [{ id: 'btn-day1', label: 'Buy', type: 'url', value: 'https://tickets.nevent.es/day1' }],
          },
          {
            type: 'card',
            title: 'Day 2 Pass',
            description: 'Saturday, 24 May 2025',
            imageUrl: 'https://example.com/day2.jpg',
            buttons: [{ id: 'btn-day2', label: 'Buy', type: 'url', value: 'https://tickets.nevent.es/day2' }],
          },
          {
            type: 'card',
            title: 'Weekend Pass',
            description: 'Both days for the price of 1.5',
            imageUrl: 'https://example.com/weekend.jpg',
            buttons: [{ id: 'btn-wkd', label: 'Buy', type: 'url', value: 'https://tickets.nevent.es/weekend' }],
          },
        ],
      };

    case 'image':
      return {
        type: 'image',
        url: 'https://example.com/venue-map.jpg',
        alt: 'Venue layout map showing all stages',
        aspectRatio: '16:9',
      };

    case 'button_group':
      return {
        type: 'button_group',
        buttons: [
          { id: 'bg-1', label: 'General Admission', type: 'postback', value: 'ticket_ga' },
          { id: 'bg-2', label: 'VIP Access', type: 'postback', value: 'ticket_vip' },
          { id: 'bg-3', label: 'Family Pack', type: 'postback', value: 'ticket_family' },
        ],
      };

    default:
      return { type };
  }
}

// ============================================================================
// Fetch mock helpers
// ============================================================================

/**
 * Creates a Response-like mock for the server config API endpoint.
 *
 * @param serverConfig - The server config to embed in the response
 * @returns A mock Response object compatible with `fetch`
 */
export function createMockConfigResponse(serverConfig: ServerChatbotConfig): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: serverConfig, success: true }),
  } as unknown as Response;
}

/**
 * Creates a Response-like mock for the create-conversation API endpoint.
 *
 * @param conversationId - The conversation ID to return
 * @returns A mock Response object
 */
export function createMockConversationResponse(conversationId: string): Response {
  return {
    ok: true,
    status: 201,
    json: () =>
      Promise.resolve({
        data: {
          conversationId,
          createdAt: '2025-01-01T00:00:00Z',
        },
        success: true,
      }),
  } as unknown as Response;
}

/**
 * Creates a Response-like mock for the send-message API endpoint.
 *
 * @param botContent - The bot response text
 * @returns A mock Response object
 */
export function createMockSendMessageResponse(botContent: string): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        data: {
          botMessage: createMockBotMessage({ content: botContent }),
          quickReplies: [],
        },
        success: true,
      }),
  } as unknown as Response;
}
