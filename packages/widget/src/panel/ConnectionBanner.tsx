import type { ConnectionBanner as ConnectionBannerKind } from './view-state'

export interface ConnectionBannerProps {
  kind: ConnectionBannerKind
}

export function ConnectionBanner({ kind }: ConnectionBannerProps) {
  if (kind === null) return null
  return kind === 'reconnect' ? (
    <div class="conn reconnect" role="status"><span class="spin" aria-hidden="true" /> Reconectando…</div>
  ) : (
    <div class="conn offline" role="status">Sin conexión. Reintentando…</div>
  )
}
