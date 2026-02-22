/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../state-manager';
import type {
  Conversation,
  ChatMessage,
  ConversationState,
  PersistedConversationState,
} from '../../types';

/**
 * Factory for a minimal Conversation object.
 */
function createConversation(
  overrides: Partial<Conversation> = {}
): Conversation {
  return {
    id: 'conv-1',
    chatbotId: 'bot-123',
    status: 'active',
    messages: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Factory for a minimal ChatMessage object.
 */
function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'Hello',
    type: 'text',
    timestamp: '2025-01-01T00:01:00Z',
    status: 'sent',
    ...overrides,
  };
}

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new StateManager('bot-123', true);
  });

  // ==========================================================================
  // Initial state
  // ==========================================================================

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = manager.getState();

      expect(state.conversation).toBeNull();
      expect(state.isOpen).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.isTyping).toBe(false);
      expect(state.error).toBeNull();
      expect(state.unreadCount).toBe(0);
      expect(state.lastActivity).toBeNull();
    });

    it('getState() should return a copy (immutable)', () => {
      const state1 = manager.getState();
      const state2 = manager.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  // ==========================================================================
  // State mutations
  // ==========================================================================

  describe('setConversation()', () => {
    it('should update conversation', () => {
      const conversation = createConversation();
      manager.setConversation(conversation);

      expect(manager.getState().conversation).toEqual(conversation);
    });

    it('should update lastActivity to conversation updatedAt', () => {
      const conversation = createConversation({
        updatedAt: '2025-06-15T12:00:00Z',
      });
      manager.setConversation(conversation);

      expect(manager.getState().lastActivity).toBe('2025-06-15T12:00:00Z');
    });
  });

  describe('addMessage()', () => {
    it('should append message to conversation messages', () => {
      manager.setConversation(createConversation());
      const message = createMessage();
      manager.addMessage(message);

      const state = manager.getState();
      expect(state.conversation?.messages).toHaveLength(1);
      expect(state.conversation?.messages[0]).toEqual(message);
    });

    it('should update lastActivity to message timestamp', () => {
      manager.setConversation(createConversation());
      const message = createMessage({
        timestamp: '2025-06-15T14:30:00Z',
      });
      manager.addMessage(message);

      expect(manager.getState().lastActivity).toBe('2025-06-15T14:30:00Z');
    });

    it('should be a no-op when no active conversation', () => {
      const message = createMessage();
      manager.addMessage(message);

      expect(manager.getState().conversation).toBeNull();
    });

    it('should append multiple messages in order', () => {
      manager.setConversation(createConversation());
      manager.addMessage(createMessage({ id: 'msg-1', content: 'First' }));
      manager.addMessage(createMessage({ id: 'msg-2', content: 'Second' }));

      const messages = manager.getState().conversation?.messages ?? [];
      expect(messages).toHaveLength(2);
      expect(messages[0]?.content).toBe('First');
      expect(messages[1]?.content).toBe('Second');
    });
  });

  describe('updateMessageStatus()', () => {
    it('should change status of a specific message', () => {
      manager.setConversation(createConversation());
      manager.addMessage(createMessage({ id: 'msg-1', status: 'sending' }));

      manager.updateMessageStatus('msg-1', 'sent');

      const messages = manager.getState().conversation?.messages ?? [];
      expect(messages[0]?.status).toBe('sent');
    });

    it('should not modify other messages', () => {
      manager.setConversation(createConversation());
      manager.addMessage(createMessage({ id: 'msg-1', status: 'sent' }));
      manager.addMessage(createMessage({ id: 'msg-2', status: 'sending' }));

      manager.updateMessageStatus('msg-2', 'delivered');

      const messages = manager.getState().conversation?.messages ?? [];
      expect(messages[0]?.status).toBe('sent');
      expect(messages[1]?.status).toBe('delivered');
    });

    it('should be a no-op when no active conversation', () => {
      manager.updateMessageStatus('msg-1', 'sent');
      expect(manager.getState().conversation).toBeNull();
    });

    it('should silently ignore unknown message IDs', () => {
      manager.setConversation(createConversation());
      manager.addMessage(createMessage({ id: 'msg-1', status: 'sent' }));

      manager.updateMessageStatus('msg-unknown', 'error');

      const messages = manager.getState().conversation?.messages ?? [];
      expect(messages[0]?.status).toBe('sent');
    });
  });

  describe('setTyping()', () => {
    it('should toggle typing state', () => {
      manager.setTyping(true);
      expect(manager.getState().isTyping).toBe(true);

      manager.setTyping(false);
      expect(manager.getState().isTyping).toBe(false);
    });

    it('should not notify when value is unchanged', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setTyping(false); // already false
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setLoading()', () => {
    it('should toggle loading state', () => {
      manager.setLoading(true);
      expect(manager.getState().isLoading).toBe(true);

      manager.setLoading(false);
      expect(manager.getState().isLoading).toBe(false);
    });

    it('should not notify when value is unchanged', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setLoading(false); // already false
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setOpen()', () => {
    it('should toggle open state', () => {
      manager.setOpen(true);
      expect(manager.getState().isOpen).toBe(true);

      manager.setOpen(false);
      expect(manager.getState().isOpen).toBe(false);
    });

    it('should not notify when value is unchanged', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setOpen(false); // already false
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setError()', () => {
    it('should set an error', () => {
      const error = { code: 'API_ERROR' as const, message: 'Something failed' };
      manager.setError(error);

      expect(manager.getState().error).toEqual(error);
    });

    it('should clear error with null', () => {
      manager.setError({
        code: 'API_ERROR' as const,
        message: 'err',
      });
      manager.setError(null);

      expect(manager.getState().error).toBeNull();
    });
  });

  describe('incrementUnread()', () => {
    it('should increment unread count by one', () => {
      manager.incrementUnread();
      expect(manager.getState().unreadCount).toBe(1);

      manager.incrementUnread();
      expect(manager.getState().unreadCount).toBe(2);
    });
  });

  describe('resetUnread()', () => {
    it('should reset unread count to zero', () => {
      manager.incrementUnread();
      manager.incrementUnread();
      manager.incrementUnread();

      manager.resetUnread();
      expect(manager.getState().unreadCount).toBe(0);
    });

    it('should not notify when already zero', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.resetUnread(); // already 0
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pub/sub
  // ==========================================================================

  describe('subscribe()', () => {
    it('should notify subscribers on state change', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setOpen(true);

      expect(listener).toHaveBeenCalledTimes(1);
      const receivedState = listener.mock.calls[0]?.[0] as ConversationState;
      expect(receivedState.isOpen).toBe(true);
    });

    it('should return unsubscribe function that works', () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setOpen(true);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      manager.setOpen(false);
      // Should NOT be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should notify multiple subscribers on each change', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.subscribe(listener1);
      manager.subscribe(listener2);

      manager.setLoading(true);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should continue notifying other subscribers if one throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const listener1 = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const listener2 = vi.fn();

      manager.subscribe(listener1);
      manager.subscribe(listener2);

      manager.setOpen(true);

      // Both should have been called, even though first threw
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Persistence
  // ==========================================================================

  describe('persist()', () => {
    it('should save conversation state to localStorage', () => {
      manager.setConversation(
        createConversation({
          id: 'conv-persist',
          chatbotId: 'bot-123',
          messages: [createMessage({ id: 'msg-p1' })],
        })
      );

      manager.persist();

      const stored = localStorage.getItem('nevent_chatbot_bot-123');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!) as PersistedConversationState;
      expect(parsed.conversationId).toBe('conv-persist');
      expect(parsed.chatbotId).toBe('bot-123');
      expect(parsed.messages).toHaveLength(1);
    });

    it('should not persist when shouldPersist is false', () => {
      const noPersistManager = new StateManager('bot-np', false);
      noPersistManager.setConversation(createConversation());
      noPersistManager.persist();

      expect(localStorage.getItem('nevent_chatbot_bot-np')).toBeNull();
    });

    it('should not persist when no conversation exists', () => {
      manager.persist();

      expect(localStorage.getItem('nevent_chatbot_bot-123')).toBeNull();
    });

    it('should cap persisted messages to 50', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 60; i++) {
        messages.push(createMessage({ id: `msg-${i}`, content: `Msg ${i}` }));
      }

      manager.setConversation(createConversation({ messages }));
      manager.persist();

      const stored = localStorage.getItem('nevent_chatbot_bot-123');
      const parsed = JSON.parse(stored!) as PersistedConversationState;
      expect(parsed.messages).toHaveLength(50);
      // Should keep the LAST 50 messages
      expect(parsed.messages[0]?.id).toBe('msg-10');
      expect(parsed.messages[49]?.id).toBe('msg-59');
    });
  });

  describe('restore()', () => {
    it('should restore persisted state from localStorage', () => {
      // Manually set valid persisted data
      const persisted: PersistedConversationState = {
        conversationId: 'conv-restored',
        chatbotId: 'bot-123',
        messages: [createMessage({ id: 'msg-r1' })],
        lastActivity: '2025-01-01T00:00:00Z',
      };
      localStorage.setItem('nevent_chatbot_bot-123', JSON.stringify(persisted));

      const result = manager.restore();

      expect(result).not.toBeNull();
      expect(result?.conversationId).toBe('conv-restored');
      expect(result?.chatbotId).toBe('bot-123');
      expect(result?.messages).toHaveLength(1);
    });

    it('should return null when no data exists', () => {
      const result = manager.restore();
      expect(result).toBeNull();
    });

    it('should return null if data is corrupt JSON', () => {
      localStorage.setItem('nevent_chatbot_bot-123', 'not-valid-json{{{');

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = manager.restore();

      // Storage.get() catches JSON.parse errors internally and returns null,
      // so restore() treats it as "no data found" and returns null.
      expect(result).toBeNull();

      errorSpy.mockRestore();
    });

    it('should return null and clear storage if data is malformed (missing fields)', () => {
      const malformed = { conversationId: '', chatbotId: '' };
      localStorage.setItem('nevent_chatbot_bot-123', JSON.stringify(malformed));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = manager.restore();

      expect(result).toBeNull();
      expect(localStorage.getItem('nevent_chatbot_bot-123')).toBeNull();

      warnSpy.mockRestore();
    });

    it('should return null when shouldPersist is false', () => {
      const noPersistManager = new StateManager('bot-np', false);

      // Even if there is data in localStorage, it should not be read
      const persisted: PersistedConversationState = {
        conversationId: 'conv-1',
        chatbotId: 'bot-np',
        messages: [],
        lastActivity: '2025-01-01T00:00:00Z',
      };
      localStorage.setItem('nevent_chatbot_bot-np', JSON.stringify(persisted));

      const result = noPersistManager.restore();
      expect(result).toBeNull();
    });
  });

  describe('clearPersisted()', () => {
    it('should remove persisted data from localStorage', () => {
      const persisted: PersistedConversationState = {
        conversationId: 'conv-1',
        chatbotId: 'bot-123',
        messages: [],
        lastActivity: '2025-01-01T00:00:00Z',
      };
      localStorage.setItem('nevent_chatbot_bot-123', JSON.stringify(persisted));

      manager.clearPersisted();

      expect(localStorage.getItem('nevent_chatbot_bot-123')).toBeNull();
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe('reset()', () => {
    it('should return to initial state', () => {
      manager.setConversation(createConversation());
      manager.setOpen(true);
      manager.setLoading(true);
      manager.setTyping(true);
      manager.setError({ code: 'API_ERROR', message: 'err' });
      manager.incrementUnread();

      manager.reset();

      const state = manager.getState();
      expect(state.conversation).toBeNull();
      expect(state.isOpen).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.isTyping).toBe(false);
      expect(state.error).toBeNull();
      expect(state.unreadCount).toBe(0);
      expect(state.lastActivity).toBeNull();
    });

    it('should notify subscribers after reset', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.reset();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should NOT clear persisted localStorage data', () => {
      const persisted: PersistedConversationState = {
        conversationId: 'conv-1',
        chatbotId: 'bot-123',
        messages: [],
        lastActivity: '2025-01-01T00:00:00Z',
      };
      localStorage.setItem('nevent_chatbot_bot-123', JSON.stringify(persisted));

      manager.reset();

      // reset() does NOT clear localStorage per the implementation
      expect(localStorage.getItem('nevent_chatbot_bot-123')).not.toBeNull();
    });
  });
});
