export interface WidgetConfig {
  schemaVersion: 1
  installationId: string
  assistantName: string
  locale: 'es' | 'en' | 'ca' | 'pt'
  theme: { primaryColor: string; position: 'right' | 'left' }
  features: { upload: boolean; handoff: boolean }
}

export interface WidgetSession {
  token: string
  expiresInSeconds: number
  guestHandle: string
}

interface EventBase {
  eventId: string
  schemaVersion: 1
  conversationId: string
  occurredAt: string
}

export type WidgetEvent =
  | (EventBase & { type: 'message.created'; payload: { messageId: string; role: 'bot' | 'agent' | 'user'; text: string } })
  | (EventBase & { type: 'conversation.state_changed'; payload: { state: 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED' } })
  | (EventBase & { type: 'agent.joined'; payload: { agentName: string; agentAvatarUrl: string | null } })
