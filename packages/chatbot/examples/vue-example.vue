<!--
  @nevent/chatbot — Vue 3 Integration Example

  Provides a reusable <NeventChatbot> component using the Composition API.
  The component:

  - Creates the widget on mount (onMounted)
  - Destroys it on unmount (onUnmounted) to prevent memory leaks
  - Exposes the widget instance via defineExpose() for template-ref access

  Usage:
    <NeventChatbot chatbot-id="bot-123" tenant-id="tenant-456" />

  Requirements:
    npm install @nevent/chatbot
    npm install vue          (peer dep)
-->

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ChatbotWidget } from '@nevent/chatbot';
import type { ChatbotConfig, ChatMessage, ChatbotError } from '@nevent/chatbot';

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

/**
 * All ChatbotConfig options are accepted as props.
 * chatbotId and tenantId are required; all others are optional with SDK defaults.
 */
const props = withDefaults(defineProps<ChatbotConfig>(), {
  locale: 'es',
  theme: 'auto',
  analytics: true,
  debug: false,
  persistConversation: true,
  conversationTTL: 24,
  autoOpen: false,
  autoOpenDelay: 3000,
  showBranding: true,
});

// ----------------------------------------------------------------------------
// Widget instance
// ----------------------------------------------------------------------------

const widget = ref<ChatbotWidget | null>(null);

// ----------------------------------------------------------------------------
// Lifecycle
// ----------------------------------------------------------------------------

onMounted(async () => {
  widget.value = new ChatbotWidget(props);

  try {
    await widget.value.init();
  } catch (err) {
    console.error('[NeventChatbot] Initialization failed:', err);
  }
});

onUnmounted(() => {
  widget.value?.destroy();
  widget.value = null;
});

// ----------------------------------------------------------------------------
// Expose public API to parent components via template ref
// ----------------------------------------------------------------------------

/**
 * Access via template ref:
 *   <NeventChatbot ref="chatbotRef" ... />
 *   chatbotRef.value?.open()
 */
defineExpose({
  open: () => widget.value?.open(),
  close: () => widget.value?.close(),
  toggle: () => widget.value?.toggle(),
  isOpen: () => widget.value?.isOpen() ?? false,
  sendMessage: (text: string) => widget.value?.sendMessage(text),
  clearConversation: () => widget.value?.clearConversation(),
  getState: () => widget.value?.getState(),
  destroy: () => widget.value?.destroy(),
});
</script>

<template>
  <!--
    The chatbot renders directly into the DOM (document.body in floating mode,
    or inside containerId in inline mode). No template markup is needed here.
  -->
</template>


<!--
  =============================================================================
  USAGE EXAMPLES (copy into your own components)
  =============================================================================

  Example 1: Basic floating chatbot
  ---------------------------------------------------------------------------

  <script setup lang="ts">
  import NeventChatbot from './NeventChatbot.vue';
  </script>

  <template>
    <main>
      <h1>My Event Page</h1>
      <NeventChatbot
        chatbot-id="your-chatbot-id"
        tenant-id="your-tenant-id"
        locale="es"
        theme="auto"
      />
    </main>
  </template>


  Example 2: Chatbot with callbacks and programmatic control
  ---------------------------------------------------------------------------

  <script setup lang="ts">
  import { ref } from 'vue';
  import NeventChatbot from './NeventChatbot.vue';
  import type { ChatMessage, ChatbotError } from '@nevent/chatbot';

  const chatbotRef = ref();

  function onMessage(message: ChatMessage) {
    console.log(`[${message.role}]`, message.content);
  }

  function onError(error: ChatbotError) {
    console.error(`[${error.code}]`, error.message);
  }

  function openChat() {
    chatbotRef.value?.open();
  }

  function sendGreeting() {
    chatbotRef.value?.sendMessage('Hello! I have a question about tickets.');
  }
  </script>

  <template>
    <div>
      <button @click="openChat">Open Support Chat</button>
      <button @click="sendGreeting">Send Greeting</button>

      <NeventChatbot
        ref="chatbotRef"
        chatbot-id="your-chatbot-id"
        tenant-id="your-tenant-id"
        locale="es"
        theme="auto"
        brand-color="#6366F1"
        :on-message="onMessage"
        :on-error="onError"
        :on-ready="() => console.log('Chatbot ready')"
        :on-open="() => console.log('Chat opened')"
        :on-close="() => console.log('Chat closed')"
      />
    </div>
  </template>


  Example 3: Inline chatbot embedded in a page section
  ---------------------------------------------------------------------------

  <script setup lang="ts">
  import NeventChatbot from './NeventChatbot.vue';
  </script>

  <template>
    <section class="event-help-section">
      <div class="info">
        <h2>Festival Assistant</h2>
        <p>Ask anything about the event, tickets, or venue.</p>
      </div>

      <!-- The widget renders inside this container element -->
      <div id="chatbot-container" class="chat-container" />

      <NeventChatbot
        chatbot-id="your-chatbot-id"
        tenant-id="your-tenant-id"
        container-id="chatbot-container"
        locale="es"
        theme="light"
      />
    </section>
  </template>

  <style scoped>
  .event-help-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;
  }
  .chat-container {
    height: 520px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  }
  </style>
-->
