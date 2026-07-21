import type { PanelViewState } from './view-state'
import { AgentAvatar, BotLogo } from './icons'

export interface HeaderProps {
  viewState: PanelViewState
  onMinimize: () => void
  onClose: () => void
}

export function Header({ viewState, onMinimize, onClose }: HeaderProps) {
  return (
    <>
      <header class="head">
        <div class="avatar">
          {viewState.showAgentAvatar ? <AgentAvatar name={viewState.headerName} avatarUrl={viewState.headerAvatarUrl} /> : <BotLogo logoUrl={viewState.logoUrl} />}
          {viewState.showAgentAvatar && <span class="dot-live" aria-hidden="true" />}
        </div>
        <div class="id">
          <div class="name">{viewState.headerName}</div>
          <div class="state">
            {viewState.headerPulse && <span class={`pulse pulse-${viewState.headerPulse}`} aria-hidden="true" />}
            {viewState.headerStatus}
          </div>
        </div>
        <button class="iconbtn" aria-label="Minimizar" onClick={onMinimize}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button class="iconbtn" aria-label="Cerrar" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div class="state-ribbon" data-ribbon={viewState.ribbon} />
    </>
  )
}
