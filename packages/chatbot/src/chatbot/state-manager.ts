/**
 * StateManager - Conversation state management with pub/sub and optional persistence
 *
 * Manages the in-memory conversation state for the chatbot widget and optionally
 * syncs it to localStorage for cross-page persistence. Implements a lightweight
 * pub/sub pattern so UI components can reactively update when state changes.
 *
 * State lifecycle:
 * 1. On construction, initializes with default empty state
 * 2. On `restore()`, loads and validates persisted state from localStorage
 * 3. On every state mutation, notifies all active subscribers
 * 4. On `persist()`, writes a serializable subset to localStorage
 * 5. On `reset()` or `clearPersisted()`, removes stored data
 *
 * @remarks
 * Persistence key pattern: `nevent_chatbot_{chatbotId}` (no additional prefix
 * since the Storage class already applies the `nevent_` prefix internally).
 *
 * Only a safe subset of state is persisted — runtime-only fields like
 * `isLoading`, `isTyping`, and `error` are never written to disk.
 * Messages are capped at the last 50 to avoid exceeding localStorage quotas.
 */

import { Storage } from '@nevent/core';
import type {
  ConversationState,
  PersistedConversationState,
  Conversation,
  ChatMessage,
  MessageStatus,
  ChatbotError,
} from '../types';

/**
 * Maximum number of messages stored in the persisted snapshot.
 * Older messages are trimmed to keep localStorage usage bounded.
 */
const MAX_PERSISTED_MESSAGES = 50;

/**
 * Default initial state when no persisted data is available.
 */
function createInitialState(): ConversationState {
  return {
    conversation: null,
    isOpen: false,
    isLoading: false,
    isTyping: false,
    error: null,
    unreadCount: 0,
    lastActivity: null,
  };
}

/**
 * Manages the reactive conversation state for the chatbot widget.
 *
 * Consumers subscribe to state changes via {@link StateManager.subscribe} and
 * receive a readonly snapshot on each update. All mutation methods are
 * synchronous and immediately notify subscribers.
 *
 * @example
 * ```typescript
 * const manager = new StateManager('bot-123', true);
 *
 * // Subscribe to state changes
 * const unsubscribe = manager.subscribe((state) => {
 *   renderUI(state);
 * });
 *
 * // Restore persisted conversation (returns null if none exists or TTL exceeded)
 * const persisted = manager.restore();
 *
 * // Mutate state
 * manager.setOpen(true);
 * manager.addMessage(botMessage);
 * manager.setTyping(false);
 *
 * // Persist before page unload
 * manager.persist();
 *
 * // Clean up
 * unsubscribe();
 * ```
 */
export class StateManager {
  /** Current in-memory conversation state */
  private state: ConversationState;

  /** Storage key suffix (combined with Storage prefix this becomes 'nevent_chatbot_{chatbotId}') */
  private readonly persistKey: string;

  /** Whether this manager should read/write from localStorage */
  private readonly shouldPersist: boolean;

  /** Storage wrapper from @nevent/core */
  private readonly storage: Storage;

  /** Active subscriber callbacks */
  private readonly listeners: Set<(state: ConversationState) => void>;

  /**
   * Creates a new StateManager instance.
   *
   * @param chatbotId - Unique chatbot identifier used to namespace the storage key
   * @param persist - When true, state will be read from and written to localStorage
   */
  constructor(chatbotId: string, persist: boolean) {
    this.state = createInitialState();
    // Storage class adds 'nevent_' prefix — key becomes 'nevent_chatbot_{chatbotId}'
    this.persistKey = `chatbot_${chatbotId}`;
    this.shouldPersist = persist;
    this.storage = new Storage();
    this.listeners = new Set();
  }

  // ============================================================================
  // State access
  // ============================================================================

  /**
   * Returns a readonly snapshot of the current conversation state.
   *
   * The returned object is a shallow copy — mutating it will not affect
   * the internal state. Always use the provided mutation methods.
   *
   * @returns Readonly view of the current {@link ConversationState}
   */
  getState(): Readonly<ConversationState> {
    return { ...this.state };
  }

  // ============================================================================
  // Pub/sub
  // ============================================================================

  /**
   * Subscribes a listener to state changes.
   *
   * The listener is invoked synchronously after every state mutation with
   * a readonly snapshot of the new state. The returned function unsubscribes
   * the listener when called.
   *
   * @param listener - Callback invoked with the new state on each change
   * @returns Unsubscribe function — call it to stop receiving updates
   *
   * @example
   * ```typescript
   * const off = manager.subscribe((state) => console.log('State changed', state));
   * // Later:
   * off(); // Stop listening
   * ```
   */
  subscribe(listener: (state: ConversationState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ============================================================================
  // State mutations
  // ============================================================================

  /**
   * Sets the active conversation, replacing any previous one.
   *
   * Also updates `lastActivity` to the conversation's `updatedAt` timestamp.
   *
   * @param conversation - The conversation object returned by the API
   */
  setConversation(conversation: Conversation): void {
    this.state = {
      ...this.state,
      conversation,
      lastActivity: conversation.updatedAt,
    };
    this.notify();
  }

  /**
   * Appends a message to the end of the current conversation's message list.
   *
   * If no active conversation exists, this is a no-op (logs a warning in debug).
   * Also updates `lastActivity` to the message's timestamp.
   *
   * @param message - The {@link ChatMessage} to append
   */
  addMessage(message: ChatMessage): void {
    if (!this.state.conversation) {
      return;
    }

    this.state = {
      ...this.state,
      conversation: {
        ...this.state.conversation,
        messages: [...this.state.conversation.messages, message],
        updatedAt: message.timestamp,
      },
      lastActivity: message.timestamp,
    };
    this.notify();
  }

  /**
   * Updates the delivery status of a specific message by its ID.
   *
   * If the message is not found in the current conversation, the call is silently
   * ignored to handle race conditions (e.g. message deleted before status update).
   *
   * @param messageId - UUID of the target message
   * @param status - The new {@link MessageStatus} to apply
   */
  updateMessageStatus(messageId: string, status: MessageStatus): void {
    if (!this.state.conversation) {
      return;
    }

    const messages = this.state.conversation.messages.map((msg) =>
      msg.id === messageId ? { ...msg, status } : msg
    );

    this.state = {
      ...this.state,
      conversation: {
        ...this.state.conversation,
        messages,
      },
    };
    this.notify();
  }

  /**
   * Sets the bot's typing indicator state.
   *
   * @param isTyping - `true` to show the typing indicator, `false` to hide it
   */
  setTyping(isTyping: boolean): void {
    if (this.state.isTyping === isTyping) {
      return;
    }
    this.state = { ...this.state, isTyping };
    this.notify();
  }

  /**
   * Sets the loading state (e.g. while a message is being sent or the API is being called).
   *
   * @param isLoading - `true` to indicate an in-progress operation, `false` when complete
   */
  setLoading(isLoading: boolean): void {
    if (this.state.isLoading === isLoading) {
      return;
    }
    this.state = { ...this.state, isLoading };
    this.notify();
  }

  /**
   * Sets whether the chat window is currently open.
   *
   * @param isOpen - `true` to mark the window as open, `false` as closed
   */
  setOpen(isOpen: boolean): void {
    if (this.state.isOpen === isOpen) {
      return;
    }
    this.state = { ...this.state, isOpen };
    this.notify();
  }

  /**
   * Sets the current error state.
   *
   * Pass `null` to clear a previously set error.
   *
   * @param error - The {@link ChatbotError} to surface, or `null` to clear
   */
  setError(error: ChatbotError | null): void {
    this.state = { ...this.state, error };
    this.notify();
  }

  /**
   * Increments the unread message counter by one.
   *
   * Called when a bot message arrives while the chat window is closed.
   */
  incrementUnread(): void {
    this.state = { ...this.state, unreadCount: this.state.unreadCount + 1 };
    this.notify();
  }

  /**
   * Resets the unread message counter to zero.
   *
   * Should be called when the user opens the chat window.
   */
  resetUnread(): void {
    if (this.state.unreadCount === 0) {
      return;
    }
    this.state = { ...this.state, unreadCount: 0 };
    this.notify();
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Persists a serializable snapshot of the current state to localStorage.
   *
   * Only persists when `persist` was set to `true` in the constructor and when
   * an active conversation exists. Silently handles quota-exceeded errors to
   * avoid breaking the widget when storage is full.
   *
   * Persisted fields:
   * - `conversationId` — for conversation resumption
   * - `chatbotId` — for integrity validation on restore
   * - `messages` — last {@link MAX_PERSISTED_MESSAGES} messages for instant display
   * - `lastActivity` — ISO timestamp for TTL calculation
   * - `metadata` — optional conversation metadata
   */
  persist(): void {
    if (!this.shouldPersist || !this.state.conversation) {
      return;
    }

    const conversation = this.state.conversation;

    // Cap messages to avoid exceeding localStorage quota
    const messages = conversation.messages.slice(-MAX_PERSISTED_MESSAGES);

    const persisted: PersistedConversationState = {
      conversationId: conversation.id,
      chatbotId: conversation.chatbotId,
      messages,
      lastActivity: this.state.lastActivity ?? new Date().toISOString(),
      // Only include metadata when it has a value — exactOptionalPropertyTypes
      // disallows assigning `undefined` to an optional property.
      ...(conversation.metadata !== undefined
        ? { metadata: conversation.metadata }
        : {}),
    };

    try {
      this.storage.set<PersistedConversationState>(this.persistKey, persisted);
    } catch (error) {
      // Storage quota exceeded — not a fatal error. The widget continues to work
      // without persistence for this session.
      console.warn('[NeventChatbot:StateManager] Could not persist state (quota exceeded?):', error);
    }
  }

  /**
   * Attempts to restore a previously persisted conversation state from localStorage.
   *
   * Validates the restored data for structural integrity before returning it.
   * If the data is malformed or missing required fields, returns `null` so the
   * caller can start a fresh conversation.
   *
   * @returns The {@link PersistedConversationState} if found and valid, otherwise `null`
   */
  restore(): PersistedConversationState | null {
    if (!this.shouldPersist) {
      return null;
    }

    try {
      const persisted = this.storage.get<PersistedConversationState>(this.persistKey);
      if (!persisted) {
        return null;
      }

      // Structural validation — guard against corrupt / partially written data
      if (
        typeof persisted.conversationId !== 'string' ||
        !persisted.conversationId ||
        typeof persisted.chatbotId !== 'string' ||
        !persisted.chatbotId ||
        !Array.isArray(persisted.messages) ||
        typeof persisted.lastActivity !== 'string'
      ) {
        console.warn('[NeventChatbot:StateManager] Persisted state is malformed — clearing.');
        this.clearPersisted();
        return null;
      }

      return persisted;
    } catch {
      // JSON.parse error or any other unexpected failure
      console.warn('[NeventChatbot:StateManager] Failed to restore persisted state — clearing.');
      this.clearPersisted();
      return null;
    }
  }

  /**
   * Removes the persisted conversation state from localStorage.
   *
   * Should be called when the user explicitly closes a conversation or when
   * the widget is destroyed and the promoter does not want to retain history.
   */
  clearPersisted(): void {
    this.storage.remove(this.persistKey);
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Resets the in-memory state to the initial empty state.
   *
   * Does NOT clear persisted localStorage data — call {@link clearPersisted}
   * separately if that is desired.
   *
   * Notifies all subscribers after the reset so the UI can re-render.
   */
  reset(): void {
    this.state = createInitialState();
    this.notify();
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Notifies all active subscribers with a readonly snapshot of the current state.
   *
   * Subscribers are called synchronously in insertion order. Any exception thrown
   * by a subscriber is caught and logged so it cannot break other subscribers or
   * the mutation that triggered the notification.
   */
  private notify(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[NeventChatbot:StateManager] Subscriber threw an error:', error);
      }
    });
  }
}
