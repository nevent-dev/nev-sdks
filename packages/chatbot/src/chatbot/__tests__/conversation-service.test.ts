import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConversationService } from '../conversation-service';
import type {
  ServerChatbotConfig,
  CreateConversationResponse,
  SendMessageResponse,
  GetMessagesResponse,
  ChatbotError,
} from '../../types';

/**
 * Mocked fetch helper.
 *
 * Creates a mock implementation for globalThis.fetch that returns
 * a resolved response with the given data and status code.
 */
function mockFetchSuccess<T>(data: T, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue({ data, success: true }),
    })
  );
}

/**
 * Creates a mock fetch that returns an error response (non-2xx).
 */
function mockFetchError(status: number, message: string): void {
  const error = {
    message,
    status,
    code: `HTTP_${status}`,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(error)
  );
}

/**
 * Creates a mock fetch that rejects with a network error.
 */
function mockFetchNetworkError(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('Network error'))
  );
}

describe('ConversationService', () => {
  let service: ConversationService;

  const API_URL = 'https://api.nevent.es';
  const TOKEN = 'test-token-abc';
  const CHATBOT_ID = 'bot-123';
  const TENANT_ID = 'tenant-456';
  const CONVERSATION_ID = 'conv-789';

  beforeEach(() => {
    service = new ConversationService(API_URL, TOKEN, CHATBOT_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe('constructor', () => {
    it('should create service without errors', () => {
      expect(service).toBeDefined();
    });

    it('should configure HttpClient with the correct base URL and token', async () => {
      const mockConfig: ServerChatbotConfig = {
        chatbotId: CHATBOT_ID,
        tenantId: TENANT_ID,
        name: 'Test Bot',
        welcomeMessage: 'Hello',
        placeholder: 'Type...',
        theme: { primaryColor: '#007bff' },
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
        token: 'server-token',
      };

      mockFetchSuccess(mockConfig);

      await service.fetchConfig(TENANT_ID);

      const fetchMock = vi.mocked(globalThis.fetch);
      const [calledUrl, calledOptions] = fetchMock.mock.calls[0]!;

      // Verify the URL starts with the base URL
      expect(calledUrl).toContain(API_URL);
      // Verify auth headers are sent
      expect((calledOptions as RequestInit).headers).toEqual(
        expect.objectContaining({
          'X-API-Key': TOKEN,
          'Content-Type': 'application/json',
        })
      );
    });
  });

  // ==========================================================================
  // fetchConfig()
  // ==========================================================================

  describe('fetchConfig()', () => {
    it('should make GET request to the correct endpoint', async () => {
      const mockConfig: ServerChatbotConfig = {
        chatbotId: CHATBOT_ID,
        tenantId: TENANT_ID,
        name: 'Test Bot',
        welcomeMessage: 'Hello',
        placeholder: 'Type...',
        theme: { primaryColor: '#007bff' },
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
        token: 'server-token',
      };

      mockFetchSuccess(mockConfig);

      const result = await service.fetchConfig(TENANT_ID);

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toBe(
        `${API_URL}/public/chatbot/${CHATBOT_ID}/config?tenantId=${TENANT_ID}`
      );
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET' });
    });

    it('should return ServerChatbotConfig from response', async () => {
      const mockConfig: ServerChatbotConfig = {
        chatbotId: CHATBOT_ID,
        tenantId: TENANT_ID,
        name: 'Test Bot',
        welcomeMessage: 'Welcome!',
        placeholder: 'Type here...',
        theme: { primaryColor: '#007bff' },
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
        token: 'server-token',
      };

      mockFetchSuccess(mockConfig);

      const result = await service.fetchConfig(TENANT_ID);

      expect(result.chatbotId).toBe(CHATBOT_ID);
      expect(result.name).toBe('Test Bot');
      expect(result.token).toBe('server-token');
    });

    it('should throw ChatbotError with CONFIG_LOAD_FAILED on failure', async () => {
      mockFetchNetworkError();

      try {
        await service.fetchConfig(TENANT_ID);
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('CONFIG_LOAD_FAILED');
        expect(chatbotError.message).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // createConversation()
  // ==========================================================================

  describe('createConversation()', () => {
    it('should make POST request to the correct endpoint', async () => {
      const mockResponse: CreateConversationResponse = {
        conversationId: CONVERSATION_ID,
        createdAt: '2025-01-01T00:00:00Z',
      };

      mockFetchSuccess(mockResponse);

      await service.createConversation({
        tenantId: TENANT_ID,
        locale: 'es',
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toBe(
        `${API_URL}/public/chatbot/${CHATBOT_ID}/conversations`
      );
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    });

    it('should return CreateConversationResponse', async () => {
      const mockResponse: CreateConversationResponse = {
        conversationId: CONVERSATION_ID,
        createdAt: '2025-01-01T00:00:00Z',
      };

      mockFetchSuccess(mockResponse);

      const result = await service.createConversation({
        tenantId: TENANT_ID,
      });

      expect(result.conversationId).toBe(CONVERSATION_ID);
      expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
    });

    it('should throw ChatbotError with CONVERSATION_CREATE_FAILED on failure', async () => {
      mockFetchNetworkError();

      try {
        await service.createConversation({ tenantId: TENANT_ID });
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('CONVERSATION_CREATE_FAILED');
      }
    });

    it('should send empty object when no request body provided', async () => {
      const mockResponse: CreateConversationResponse = {
        conversationId: CONVERSATION_ID,
        createdAt: '2025-01-01T00:00:00Z',
      };

      mockFetchSuccess(mockResponse);

      await service.createConversation();

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledOptions = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(calledOptions.body).toBe(JSON.stringify({}));
    });
  });

  // ==========================================================================
  // sendMessage()
  // ==========================================================================

  describe('sendMessage()', () => {
    it('should make POST request to /chatbot/send-message with BackendMessageRequest body', async () => {
      const mockResponse: SendMessageResponse = {
        userMessage: {
          id: 'msg-user-1',
          conversationId: CONVERSATION_ID,
          role: 'user',
          content: 'Hola',
          type: 'text',
          timestamp: '2025-01-01T00:01:00Z',
          status: 'sent',
        },
        botMessage: {
          id: 'msg-bot-1',
          conversationId: CONVERSATION_ID,
          role: 'assistant',
          content: 'Hello! How can I help?',
          type: 'text',
          timestamp: '2025-01-01T00:01:01Z',
          status: 'delivered',
        },
      };

      mockFetchSuccess(mockResponse);

      const result = await service.sendMessage(CONVERSATION_ID, {
        content: 'Hola',
        type: 'text',
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      // The real backend endpoint is /chatbot/send-message (no chatbotId or conversationId in URL)
      expect(calledUrl).toBe(`${API_URL}/chatbot/send-message`);

      // Body should be BackendMessageRequest format { message: string }
      const calledOptions = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(JSON.parse(calledOptions.body as string)).toEqual({ message: 'Hola' });

      expect(result.userMessage.content).toBe('Hola');
      expect(result.botMessage.content).toBe('Hello! How can I help?');
    });

    it('should include eventId and source as query params when provided', async () => {
      const serviceWithContext = new ConversationService(API_URL, TOKEN, CHATBOT_ID, false, undefined, {
        tenantId: TENANT_ID,
        eventId: 'evt-1',
        source: 'src-uuid',
      });

      const mockResponse: SendMessageResponse = {
        userMessage: {
          id: 'msg-user-1',
          conversationId: CONVERSATION_ID,
          role: 'user',
          content: 'Hello',
          type: 'text',
          timestamp: '2025-01-01T00:01:00Z',
          status: 'sent',
        },
        botMessage: {
          id: 'msg-bot-1',
          conversationId: CONVERSATION_ID,
          role: 'assistant',
          content: 'Hi there!',
          type: 'text',
          timestamp: '2025-01-01T00:01:01Z',
          status: 'delivered',
        },
      };

      mockFetchSuccess(mockResponse);

      await serviceWithContext.sendMessage(CONVERSATION_ID, { content: 'Hello' });

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toContain('/chatbot/send-message');
      expect(calledUrl).toContain('eventId=evt-1');
      expect(calledUrl).toContain('source=src-uuid');
    });

    it('should map HTTP 429 to RATE_LIMIT_EXCEEDED', async () => {
      const rateLimitError = {
        message: 'Too many requests',
        status: 429,
        code: 'HTTP_429',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(rateLimitError)
      );

      try {
        await service.sendMessage(CONVERSATION_ID, { content: 'Hello' });
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(chatbotError.status).toBe(429);
      }
    });

    it('should throw MESSAGE_SEND_FAILED for non-429 errors', async () => {
      const serverError = {
        message: 'Internal server error',
        status: 500,
        code: 'HTTP_500',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(serverError)
      );

      try {
        await service.sendMessage(CONVERSATION_ID, { content: 'Hello' });
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('MESSAGE_SEND_FAILED');
      }
    });

    it('should throw MESSAGE_SEND_FAILED for network errors', async () => {
      mockFetchNetworkError();

      try {
        await service.sendMessage(CONVERSATION_ID, { content: 'Hello' });
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('MESSAGE_SEND_FAILED');
      }
    });
  });

  // ==========================================================================
  // getMessages()
  // ==========================================================================

  describe('getMessages()', () => {
    it('should make GET request to /chatbot/messages with query params', async () => {
      const mockResponse: GetMessagesResponse = {
        messages: [],
        total: 0,
        hasMore: false,
      };

      mockFetchSuccess(mockResponse);

      await service.getMessages(CONVERSATION_ID, {
        limit: 20,
        order: 'asc',
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      // The real backend endpoint is /chatbot/messages
      expect(calledUrl).toContain('/chatbot/messages');
      expect(calledUrl).toContain('limit=20');
      expect(calledUrl).toContain('order=asc');
    });

    it('should include source and eventId as query params when provided', async () => {
      const serviceWithContext = new ConversationService(API_URL, TOKEN, CHATBOT_ID, false, undefined, {
        tenantId: TENANT_ID,
        eventId: 'evt-1',
        source: 'src-uuid',
      });

      const mockResponse: GetMessagesResponse = {
        messages: [],
        total: 0,
        hasMore: false,
      };

      mockFetchSuccess(mockResponse);

      await serviceWithContext.getMessages(CONVERSATION_ID, { limit: 10 });

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toContain('source=src-uuid');
      expect(calledUrl).toContain('eventId=evt-1');
      expect(calledUrl).toContain('limit=10');
    });

    it('should support pagination with before cursor', async () => {
      const mockResponse: GetMessagesResponse = {
        messages: [
          {
            id: 'msg-1',
            conversationId: CONVERSATION_ID,
            role: 'user',
            content: 'Hello',
            type: 'text',
            timestamp: '2025-01-01T00:01:00Z',
          },
        ],
        total: 50,
        hasMore: true,
        cursor: 'cursor-abc',
      };

      mockFetchSuccess(mockResponse);

      const result = await service.getMessages(CONVERSATION_ID, {
        cursor: 'before-cursor-xyz',
        limit: 10,
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toContain('cursor=before-cursor-xyz');
      expect(result.hasMore).toBe(true);
      expect(result.messages).toHaveLength(1);
    });

    it('should make request without pagination query params when none provided', async () => {
      const mockResponse: GetMessagesResponse = {
        messages: [],
        total: 0,
        hasMore: false,
      };

      mockFetchSuccess(mockResponse);

      await service.getMessages(CONVERSATION_ID);

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      // URL should be /chatbot/messages (no pagination query string when
      // no params provided and no source/eventId configured)
      expect(calledUrl).toBe(`${API_URL}/chatbot/messages`);
    });

    it('should throw ChatbotError with MESSAGE_LOAD_FAILED on failure', async () => {
      mockFetchNetworkError();

      try {
        await service.getMessages(CONVERSATION_ID);
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('MESSAGE_LOAD_FAILED');
      }
    });
  });

  // ==========================================================================
  // closeConversation()
  // ==========================================================================

  describe('closeConversation()', () => {
    it('should not throw error on success', async () => {
      mockFetchSuccess({});

      await expect(
        service.closeConversation(CONVERSATION_ID)
      ).resolves.toBeUndefined();

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toBe(
        `${API_URL}/public/chatbot/${CHATBOT_ID}/conversations/${CONVERSATION_ID}/close`
      );
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    });

    it('should not throw error on failure (silent)', async () => {
      mockFetchNetworkError();

      // closeConversation should catch errors silently
      await expect(
        service.closeConversation(CONVERSATION_ID)
      ).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // sendFeedback()
  // ==========================================================================

  describe('sendFeedback()', () => {
    it('should make POST request to /chatbot/message/{id}/feedback with feedbackType', async () => {
      mockFetchSuccess({});

      await service.sendFeedback('msg-123', 'POSITIVE');

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toContain('/chatbot/message/msg-123/feedback');
      expect(calledUrl).toContain('feedbackType=POSITIVE');
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    });

    it('should support NEGATIVE feedback', async () => {
      mockFetchSuccess({});

      await service.sendFeedback('msg-456', 'NEGATIVE');

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledUrl = fetchMock.mock.calls[0]![0] as string;

      expect(calledUrl).toContain('feedbackType=NEGATIVE');
    });

    it('should throw FEEDBACK_FAILED on failure', async () => {
      mockFetchNetworkError();

      try {
        await service.sendFeedback('msg-123', 'POSITIVE');
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('FEEDBACK_FAILED');
      }
    });
  });

  // ==========================================================================
  // Backend context headers
  // ==========================================================================

  describe('backend context headers', () => {
    it('should include X-Tenant-ID header when tenantId is provided', async () => {
      const serviceWithTenant = new ConversationService(API_URL, TOKEN, CHATBOT_ID, false, undefined, {
        tenantId: TENANT_ID,
      });

      mockFetchSuccess({});

      await serviceWithTenant.sendFeedback('msg-123', 'POSITIVE');

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledOptions = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = calledOptions.headers as Record<string, string>;

      expect(headers['X-Tenant-ID']).toBe(TENANT_ID);
    });

    it('should include X-User-Context header when userContext is provided', async () => {
      const serviceWithContext = new ConversationService(API_URL, TOKEN, CHATBOT_ID, false, undefined, {
        tenantId: TENANT_ID,
        userContext: { lat: 40.4168, lng: -3.7038 },
      });

      mockFetchSuccess({});

      await serviceWithContext.sendFeedback('msg-123', 'POSITIVE');

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledOptions = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = calledOptions.headers as Record<string, string>;

      expect(headers['X-User-Context']).toBeDefined();
      // Decode and verify the Base64 content
      const decoded = JSON.parse(atob(headers['X-User-Context']!));
      expect(decoded.lat).toBe(40.4168);
      expect(decoded.lng).toBe(-3.7038);
    });

    it('should not include context headers when options are not provided', async () => {
      // Default service (no options)
      mockFetchSuccess({});

      await service.sendFeedback('msg-123', 'POSITIVE');

      const fetchMock = vi.mocked(globalThis.fetch);
      const calledOptions = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = calledOptions.headers as Record<string, string>;

      expect(headers['X-Tenant-ID']).toBeUndefined();
      expect(headers['X-User-Context']).toBeUndefined();
    });
  });

  // ==========================================================================
  // getStreamingUrl()
  // ==========================================================================

  describe('getStreamingUrl()', () => {
    it('should return /chatbot/stream URL without query params by default', () => {
      const url = service.getStreamingUrl('conv-123');
      expect(url).toBe(`${API_URL}/chatbot/stream`);
    });

    it('should include eventId and source as query params when configured', () => {
      const serviceWithContext = new ConversationService(API_URL, TOKEN, CHATBOT_ID, false, undefined, {
        tenantId: TENANT_ID,
        eventId: 'evt-1',
        source: 'src-uuid',
      });

      const url = serviceWithContext.getStreamingUrl('conv-123');
      expect(url).toContain('/chatbot/stream');
      expect(url).toContain('eventId=evt-1');
      expect(url).toContain('source=src-uuid');
    });
  });

  // ==========================================================================
  // Error mapping
  // ==========================================================================

  describe('error mapping', () => {
    it('should map ApiError objects with message and status', async () => {
      const apiError = {
        message: 'Unauthorized',
        status: 401,
        code: 'HTTP_401',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(apiError)
      );

      try {
        await service.fetchConfig(TENANT_ID);
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('CONFIG_LOAD_FAILED');
        expect(chatbotError.message).toBe('Unauthorized');
        expect(chatbotError.status).toBe(401);
      }
    });

    it('should map plain Error instances', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Connection refused'))
      );

      try {
        await service.fetchConfig(TENANT_ID);
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('CONFIG_LOAD_FAILED');
        expect(chatbotError.message).toBe('Connection refused');
      }
    });

    it('should use fallback message for unknown error types', async () => {
      // When fetch rejects with a non-standard type (e.g. a plain string),
      // HttpClient normalises it to a generic 'Network request failed' ApiError.
      // ConversationService then maps that to the domain error code while
      // preserving the HttpClient's message.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue('string error')
      );

      try {
        await service.fetchConfig(TENANT_ID);
        expect.fail('Should have thrown');
      } catch (error) {
        const chatbotError = error as ChatbotError;
        expect(chatbotError.code).toBe('CONFIG_LOAD_FAILED');
        // HttpClient wraps unknown throw values with a generic message
        expect(chatbotError.message).toBe('Network request failed');
      }
    });
  });
});
