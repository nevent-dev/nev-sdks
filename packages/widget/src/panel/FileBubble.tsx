import { useEffect, useRef } from 'preact/hooks'

export interface FileBubbleProps {
  fileName: string
  fileSizeLabel: string
  progressPercent: number | null // null = ya enviado/recibido, sin barra
  variant: 'user' | 'bot'
}

export function FileBubble({ fileName, fileSizeLabel, progressPercent, variant }: FileBubbleProps) {
  const barRef = useRef<HTMLElement | null>(null)
  const clamped = progressPercent === null ? null : Math.max(0, Math.min(100, progressPercent))

  // Custom property vía setProperty, NUNCA `style={{width: ...}}` de JSX
  // (Critical #4: bajo una CSP sin `style-src-attr 'unsafe-inline'`, un
  // atributo `style=""` generado dinámicamente es una superficie a evitar
  // por completo, aunque Preact resuelva objetos `style` por propiedad y no
  // por `cssText` — se prescinde de la ambigüedad, igual que theme.ts).
  useEffect(() => {
    if (clamped !== null) barRef.current?.style.setProperty('--progress', `${clamped}%`)
  }, [clamped])

  return (
    <div class={`file${variant === 'user' ? ' file-user' : ''}`}>
      <div class="fi" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
        </svg>
      </div>
      <div class="file-meta">
        <div class="fn">{fileName}</div>
        <div class="fs">{fileSizeLabel}</div>
        {clamped !== null && <div class="bar"><i ref={barRef} /></div>}
      </div>
    </div>
  )
}
