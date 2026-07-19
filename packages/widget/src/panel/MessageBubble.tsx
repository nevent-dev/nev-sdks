import type { StoredMessage } from '../store/message-store'
import { AgentInitialsAvatar, BotIcon } from './icons'

export interface MessageBubbleProps {
  message: StoredMessage
  agentName: string | null
  onRetry: (clientId: string) => void
  compact: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({ message, agentName, onRetry, compact }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAgent = message.role === 'agent'
  // Fix W5b: per-message authorName (snapshot-only, backend W5a) wins over
  // the conversation-level agentName (live agent.joined) — a historical
  // message authored by a PREVIOUSLY assigned agent must keep showing ITS
  // author, not whoever is assigned now. Neither present → undefined, which
  // AgentInitialsAvatar renders as a neutral '?' glyph. An agent-role message
  // NEVER falls back to BotIcon, whatever the identity resolution yields.
  const agentAvatarName = message.authorName ?? agentName ?? undefined

  return (
    <div class={`m${isUser ? ' user' : ''}${compact ? ' compact' : ''}`}>
      {!isUser && (
        <div class={`b-avatar${compact ? ' ghost' : ''}`}>
          {isAgent ? <AgentInitialsAvatar name={agentAvatarName} /> : <BotIcon />}
        </div>
      )}
      <div>
        {/* `{message.text}` es un hijo de texto JSX: Preact lo asigna como
            nodo de texto (no innerHTML) — sin markdown en v1 (Global Constraints). */}
        {message.streaming && message.text === '' ? (
          <div class="thinking">
            <svg class="spark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" fill="currentColor" />
            </svg>
            Pensando…
          </div>
        ) : (
          <div class="bubble">
            {message.text}
            {message.streaming && <span class="stream-caret" aria-hidden="true" />}
          </div>
        )}
        {isUser && (
          <div class="meta">
            {formatTime(message.createdAt)}
            {message.status === 'sent' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 13l4 4L15 7" /><path d="M9 13l4 4 8-10" />
              </svg>
            )}
            {message.status === 'failed' && message.clientId !== null && (
              <>
                <span class="fail">No enviado</span>
                <button type="button" class="retry" onClick={() => onRetry(message.clientId as string)}>
                  Reintentar
                </button>
              </>
            )}
          </div>
        )}
        {!isUser && !message.streaming && (
          <div class="meta">{formatTime(message.createdAt)}</div>
        )}
      </div>
    </div>
  )
}
