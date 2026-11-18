import type { ComponentChildren } from 'preact'
import { AgentAvatar } from './icons'
import { useStrings } from './strings'

// Sin props: ni cifra de ETA (gap #2) ni nombre de tenant (gap #1) — el
// contrato actual no trae ninguno de los dos y nunca se fabrican.
export function WaitingCard() {
  const strings = useStrings()
  return (
    <div class="syscard waiting" role="status">
      <div class="ttl">{strings.handoffTitle}</div>
      <div class="dsc">{strings.handoffDesc}</div>
    </div>
  )
}

export interface AgentJoinedSyslineProps {
  agentName: string
  agentAvatarUrl: string | null
}

export function AgentJoinedSysline({ agentName, agentAvatarUrl }: AgentJoinedSyslineProps) {
  const strings = useStrings()
  return (
    <div class="sysline">
      <span class="who">
        <AgentAvatar name={agentName} avatarUrl={agentAvatarUrl} />
        <span><b>{agentName}</b> {strings.joinedSuffix}</span>
      </span>
    </div>
  )
}

export function TypingDots() {
  const strings = useStrings()
  return (
    <div class="dots" role="status" aria-label={strings.agentTyping}>
      <span class="dot" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
    </div>
  )
}

export interface ResolvedCardProps {
  agentName: string | null
  children?: ComponentChildren
}

export function ResolvedCard({ agentName, children }: ResolvedCardProps) {
  const strings = useStrings()
  return (
    <div class="syscard resolved">
      <div role="status">
        <div class="ttl">{strings.stateResolved}</div>
        <div class="dsc">
          {agentName !== null ? strings.resolvedByAgent(agentName) : strings.resolvedGeneric} {strings.resolvedTail}
        </div>
      </div>
      {children}
    </div>
  )
}

// Task W4: se muestra tras un re-bootstrap silencioso (sesión muerta a mitad
// de vida) cuyo cliente nuevo NO resumió la conversación anterior — ver
// shell/app.tsx y message-store.ts#resetForNewConversation. Sin props, igual
// que WaitingCard: nada que el contrato no traiga se inventa aquí.
export function NewConversationCard() {
  const strings = useStrings()
  return (
    <div class="syscard new-conversation" role="status">
      <div class="ttl">{strings.newConvTitle}</div>
      <div class="dsc">{strings.newConvDesc}</div>
    </div>
  )
}
