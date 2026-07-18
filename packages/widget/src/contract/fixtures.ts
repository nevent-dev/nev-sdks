import type {
  WidgetConfig, WidgetSession, WidgetEvent,
  MessagesSnapshot, TurnStreamFrame, EventsPollResponse,
} from './types'

export function fixtureConfig(): WidgetConfig {
  return {
    schemaVersion: 1,
    installationId: 'inst_demo_festival_01',
    assistantName: 'Asistente de DEMO FEST',
    locale: 'es',
    theme: { primaryColor: '#6d4aff', position: 'right', mode: 'auto' },
    features: { upload: true, handoff: true },
    welcome: {
      title: 'Hola 👋 ¿en qué te ayudamos?',
      subtitle: 'Respondemos al momento sobre entradas, accesos y cualquier duda del festival.',
      quickReplies: ['Cambiar el nombre de mi entrada', 'Horarios y artistas', 'Cómo llegar', 'No me llegó el email'],
    },
  }
}

export function fixtureSession(): WidgetSession {
  return { token: 'sess_jwt_fixture_0123456789abcdef', expiresInSeconds: 3600, resumeSecret: 'resume_9f2c1a3e7b0d4f6a8c1e2b5d9f0a3c7e' }
}

export function fixtureEvents(): WidgetEvent[] {
  const base = { schemaVersion: 1 as const, conversationId: 'conv_demo_01' }
  return [
    { ...base, eventId: 'evt_0001', occurredAt: '2026-07-17T14:02:00Z', type: 'message.created', payload: { messageId: 'msg_0001', role: 'bot', text: 'Hola, ¿en qué te ayudamos?' } },
    { ...base, eventId: 'evt_0002', occurredAt: '2026-07-17T14:06:00Z', type: 'conversation.state_changed', payload: { state: 'ESCALATED_WAITING' } },
    { ...base, eventId: 'evt_0003', occurredAt: '2026-07-17T14:09:00Z', type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null } },
  ]
}

export function fixtureSnapshot(): MessagesSnapshot {
  return {
    messages: [
      { messageId: 'msg_0001', role: 'bot', text: 'Hola, ¿en qué te ayudamos?', createdAt: '2026-07-17T14:02:00Z' },
    ],
    state: 'BOT_ACTIVE',
    snapshotCursor: 'evt_v1_conv_demo_01_1',
  }
}

export function fixtureTurnFrames(): TurnStreamFrame[] {
  return [
    { type: 'accepted', turnId: 'turn_1', userMessageId: 'msg_user_1' },
    { type: 'delta', turnId: 'turn_1', seq: 1, delta: 'Sí, ' },
    { type: 'delta', turnId: 'turn_1', seq: 2, delta: 'puedes cambiarlo.' },
    { type: 'done', turnId: 'turn_1', messageId: 'msg_bot_1', eventId: 'evt_v1_conv_demo_01_5' },
  ]
}

export function fixturePollResponse(): EventsPollResponse {
  const durables = fixtureEvents() as WidgetEvent[]
  return { events: durables, cursor: 'evt_v1_conv_demo_01_3' }
}
