import type { ConversationState } from '../contract/types'
import type { ConnectionStatus } from '../store/message-store'

export type ConversationPhase = 'idle' | 'waiting' | 'agent' | 'resolved'
export type RibbonKind = 'idle' | 'bot-streaming' | 'waiting' | 'agent' | 'resolved' | 'reconnect' | 'offline'
export type ConnectionBanner = 'reconnect' | 'offline' | null

export interface ViewStateInput {
  conversationState: ConversationState | null
  connection: ConnectionStatus
  agentName: string | null
  agentAvatarUrl: string | null
  assistantName: string
  isStreaming: boolean
}

export interface PanelViewState {
  conversationPhase: ConversationPhase
  connectionState: ConnectionStatus
  isStreaming: boolean
  ribbon: RibbonKind
  headerName: string
  headerStatus: string
  headerPulse: 'wait' | 'live' | null
  composerPlaceholder: string
  composerDisabled: boolean
  showStopButton: boolean
  connectionBanner: ConnectionBanner
  showAgentAvatar: boolean
  headerAvatarUrl: string | null
}

export function computeViewState(input: ViewStateInput): PanelViewState {
  const { conversationState, connection, agentName, agentAvatarUrl, assistantName, isStreaming } = input

  // 1) Fase — dictada EXCLUSIVAMENTE por el servidor (spec §5). Nunca se
  // recalcula ni se oculta por conexión o streaming (Critical #1).
  const conversationPhase: ConversationPhase =
    conversationState === 'ESCALATED_WAITING' ? 'waiting' :
    conversationState === 'AGENT_ACTIVE' ? 'agent' :
    conversationState === 'RESOLVED' ? 'resolved' : 'idle'

  const hasAgent = conversationPhase === 'agent' && agentName !== null

  // Foto del agente: SOLO se expone dentro de la fase agent con identidad
  // conocida — la misma condición que showAgentAvatar (más abajo). Evita que
  // un agentAvatarUrl residual del store (p.ej. tras resolver, si el
  // watermark aún no lo limpió) se filtre a una cabecera que ya no debería
  // mostrar avatar de agente.
  const headerAvatarUrl = hasAgent ? agentAvatarUrl : null

  // 2) Nombre/avatar de cabecera — reflejan la fase, NUNCA la conexión.
  // Copia neutral "El equipo" para waiting/resolved/agent-sin-nombre-aún
  // (gap #1 de contrato: sin campo de tenant separado de assistantName;
  // reutilizarlo ahí producía "Laura · Asistente de X" — rechazado en revisión).
  const headerName =
    conversationPhase === 'agent' ? (hasAgent ? (agentName as string) : 'El equipo') :
    conversationPhase === 'waiting' || conversationPhase === 'resolved' ? 'El equipo' :
    assistantName

  const phaseStatus =
    conversationPhase === 'waiting' ? 'El equipo te atenderá en breve' :
    conversationPhase === 'agent' ? 'En línea ahora' :
    conversationPhase === 'resolved' ? 'Conversación resuelta' :
    isStreaming ? 'Escribiendo…' : 'Respuesta al instante'

  const headerPulse: 'wait' | 'live' | null =
    conversationPhase === 'waiting' ? 'wait' : conversationPhase === 'agent' ? 'live' : null

  // 3) La conexión SOLO se superpone al texto de estado y al banner — nunca
  // sustituye nombre/avatar ni fase.
  const connectionOverlayStatus =
    connection === 'offline' ? 'Sin conexión' :
    connection === 'reconnecting' || connection === 'polling' ? 'Reconectando…' : null

  // 4) Ribbon — PURAMENTE visual (color/animación de la cinta de 2px).
  // Ningún consumidor debe usar este valor para decidir qué contenido de
  // handoff pintar — para eso está conversationPhase (Critical #1).
  const ribbon: RibbonKind =
    connection === 'offline' ? 'offline' :
    connection === 'reconnecting' || connection === 'polling' ? 'reconnect' :
    isStreaming ? 'bot-streaming' :
    conversationPhase === 'waiting' ? 'waiting' :
    conversationPhase === 'agent' ? 'agent' :
    conversationPhase === 'resolved' ? 'resolved' : 'idle'

  const composerPlaceholder =
    conversationPhase === 'agent' ? (hasAgent ? `Escribe a ${agentName}…` : 'Escribe al equipo…') :
    conversationPhase === 'waiting' ? 'Escribe al equipo…' : 'Escribe tu pregunta…'

  return {
    conversationPhase,
    connectionState: connection,
    isStreaming,
    ribbon,
    headerName,
    headerStatus: connectionOverlayStatus ?? phaseStatus,
    headerPulse,
    composerPlaceholder,
    composerDisabled: connection === 'offline',
    showStopButton: isStreaming,
    connectionBanner: connection === 'offline' ? 'offline' : (connection === 'reconnecting' || connection === 'polling') ? 'reconnect' : null,
    showAgentAvatar: hasAgent,
    headerAvatarUrl,
  }
}
