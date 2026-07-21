export interface WidgetConfig {
  schemaVersion: 1
  installationId: string
  // Opcional: el backend real (GET /widget/v1/installations/{id}/config) NO
  // siempre lo envía (drift de contrato cazado en integración E2E, Task 17 —
  // fixtures/mocks previos siempre lo incluían). Normalizado con fallback
  // 'Asistente' en runtime en shell/session.ts, igual que welcome.
  assistantName?: string
  locale: 'es' | 'en' | 'ca' | 'pt'
  theme: {
    // Opcional por el mismo motivo: el backend real puede omitirlo (drift
    // cazado en integración E2E, Task 17). applyTheme (panel/theme.ts) trata
    // su ausencia como config legítima, no como color inválido.
    primaryColor?: string
    position: 'right' | 'left'
    mode: 'light' | 'dark' | 'auto'
    // Logo del tenant que sustituye al glifo BotIcon por defecto (Launcher,
    // Header sin agente humano, burbujas de mensaje del bot). Ausente o null
    // (tenant sin logo configurado) son ambos casos legítimos — tal cual
    // llega de red, sin transformar, igual que el resto de campos opcionales
    // de este bloque.
    logoUrl?: string | null
  }
  features: { upload: boolean; handoff: boolean }
  // Opcional: normalizado en runtime en shell/session.ts (Task 15) — nunca
  // se confía en el shape tal cual llega de red. Ver "Brechas de contrato" #6.
  welcome?: { title: string; subtitle: string; quickReplies: string[] }
}

export interface WidgetSession {
  token: string
  expiresInSeconds: number
  resumeSecret: string
  // Task W3c: SOLO presente en la respuesta de POST /sessions (creación),
  // nunca en /sessions/refresh. true cuando el backend resumió de verdad una
  // sesión existente vía el resumeSecret enviado (incl. la ventana de solape
  // de la rotación, W3b); false cuando acuñó una sesión nueva. Ausente en un
  // backend aún no desplegado con este campo — ver shell/session.ts
  // wasResumed() y su fallback al echo-compare.
  resumed?: boolean
}

interface EventBase {
  eventId: string
  schemaVersion: 1
  conversationId: string
  occurredAt: string
}

export type WidgetEvent =
  | (EventBase & { type: 'message.created'; payload: { messageId: string; role: 'bot' | 'agent' | 'user'; text: string } })
  | (EventBase & { type: 'conversation.state_changed'; payload: { state: ConversationState } })
  | (EventBase & { type: 'agent.joined'; payload: { agentName: string; agentAvatarUrl: string | null } })

export type ConversationState = 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED'

// Frames of the bot-turn stream (POST /widget/v1/conversations/current/stream).
// Vocabulary per backend §4.2: accepted → delta(s) → DONE | ERROR. `done` still
// carries eventId on the wire; the client does not use it to move the cursor
// (the authoritative message.created arrives via the durable channel).
export type TurnStreamFrame =
  | { type: 'accepted'; turnId: string; userMessageId: string }
  | { type: 'delta'; turnId: string; seq: number; delta: string }
  | { type: 'done'; turnId: string; messageId: string; eventId: string }
  | { type: 'error'; code: string }

// Ephemeral inbound events (TTL, no cursor/replay) per backend §4.3.
// presence is parsed for forward-compat but not yet surfaced by the store.
export type WidgetEphemeralEvent =
  | { type: 'agent.typing'; payload: { isTyping: boolean } }
  | { type: 'presence'; payload: { agentOnline: boolean } }

// A historical message as returned by GET /messages (snapshot).
export interface WidgetMessage {
  messageId: string
  role: 'bot' | 'agent' | 'user'
  text: string
  createdAt: string
  // Fix W5b (backend W5a, JsonInclude NON_NULL): presente solo en mensajes
  // role:'agent' cuyo evento original llevaba el nombre del agente; ausente
  // en eventos legacy y en mensajes bot/user. Nunca se confía en el shape
  // tal cual llega de red (mismo criterio que assistantName/welcome arriba).
  authorName?: string
  // Identidad de autor POR MENSAJE, resuelta en lectura al snapshot (backend
  // en paralelo a W5b): ya no depende del matching authorName===agentName
  // para decidir de quién es la foto (ese matching no distinguía "otro
  // agente" de "el mismo agente renombrado"). SOLO snapshot — el contrato de
  // eventos vivos (message.created) no lo lleva. El wire puede omitirlo
  // (backend aún no desplegado) o mandarlo null (agente sin foto); nunca se
  // confía en el shape tal cual llega de red.
  authorAvatarUrl?: string | null
}

// GET /widget/v1/conversations/current/messages?limit=N
export interface MessagesSnapshot {
  messages: WidgetMessage[]
  state: ConversationState
  // Opcional: el backend serializa MessagesSnapshotDto con @JsonInclude(NON_NULL),
  // así que una sesión sin conversación NO manda `snapshotCursor: null` sino que
  // OMITE el campo por completo (drift cazado en integración E2E, 2026-07-20).
  // null también se acepta (algún fixture/mock previo lo incluía así). Nunca se
  // confía en el shape tal cual llega de red — normalizado en la frontera en
  // transport/events-channel.ts `snapshot()`.
  snapshotCursor?: string | null
  // Fix W5b (backend W5a, JsonInclude NON_NULL): presente sii hay un agente
  // humano asignado a la conversación ahora mismo — la snapshot nunca
  // reproduce el evento durable agent.joined, así que esto es la ÚNICA
  // fuente de identidad de agente tras un rebuild desde snapshot (reconnect
  // / reload). avatarUrl se añade EN PARALELO por el backend (foto real del
  // agente, misma CDN propia que agent.joined) — el wire puede omitirlo
  // (backend aún no desplegado con el campo) o mandarlo `null` (agente sin
  // foto configurada); nunca se confía en el shape tal cual llega de red,
  // normalizado en la frontera en store/message-store.ts.
  agent?: { name: string; avatarUrl?: string | null }
}

// GET /widget/v1/events/poll?after={cursor} — ALL durables after the cursor.
export interface EventsPollResponse {
  events: WidgetEvent[]
  cursor: string | null
}
