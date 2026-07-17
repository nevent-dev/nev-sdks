import type { WidgetConfig, WidgetSession, WidgetEvent } from './types'

export function fixtureConfig(): WidgetConfig {
  return {
    schemaVersion: 1,
    installationId: 'inst_demo_festival_01',
    assistantName: 'Asistente de DEMO FEST',
    locale: 'es',
    theme: { primaryColor: '#6d4aff', position: 'right' },
    features: { upload: true, handoff: true },
  }
}

export function fixtureSession(): WidgetSession {
  return { token: 'sess_jwt_fixture_0123456789abcdef', expiresInSeconds: 3600, guestHandle: 'guest_9f2c1a' }
}

export function fixtureEvents(): WidgetEvent[] {
  const base = { schemaVersion: 1 as const, conversationId: 'conv_demo_01' }
  return [
    { ...base, eventId: 'evt_0001', occurredAt: '2026-07-17T14:02:00Z', type: 'message.created', payload: { messageId: 'msg_0001', role: 'bot', text: 'Hola, ¿en qué te ayudamos?' } },
    { ...base, eventId: 'evt_0002', occurredAt: '2026-07-17T14:06:00Z', type: 'conversation.state_changed', payload: { state: 'ESCALATED_WAITING' } },
    { ...base, eventId: 'evt_0003', occurredAt: '2026-07-17T14:09:00Z', type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null } },
  ]
}
