import type { ConnectionBanner as ConnectionBannerKind } from './view-state'
import { useStrings } from './strings'

export interface ConnectionBannerProps {
  kind: ConnectionBannerKind
}

export function ConnectionBanner({ kind }: ConnectionBannerProps) {
  const strings = useStrings()
  if (kind === null) return null
  return kind === 'reconnect' ? (
    <div class="conn reconnect" role="status"><span class="spin" aria-hidden="true" /> {strings.connReconnecting}</div>
  ) : (
    <div class="conn offline" role="status">{strings.connOffline}</div>
  )
}
