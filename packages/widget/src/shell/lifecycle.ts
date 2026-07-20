export interface LifecycleHandlers {
  onSuspend(): void
  onResume(): void
}

// Suspends/reconciles the durable channel across the page lifecycle (spec §9).
// Deliberately does NOT listen to `unload` (unreliable, blocks bfcache).
export function bindPageLifecycle(target: Window, handlers: LifecycleHandlers): () => void {
  const doc = target.document
  const suspend = (): void => handlers.onSuspend()
  const resume = (): void => handlers.onResume()
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') handlers.onSuspend()
    else handlers.onResume()
  }

  // Page Lifecycle API: `freeze`/`resume` are dispatched on `document`, NOT
  // `window` (unlike `pageshow`/`online`/`offline`, which are Window events).
  // Binding them to `target` was dead code — Chrome's tab-freezing never
  // reached these handlers.
  doc.addEventListener('freeze', suspend)
  target.addEventListener('offline', suspend)
  doc.addEventListener('resume', resume)
  target.addEventListener('pageshow', resume)
  target.addEventListener('online', resume)
  doc.addEventListener('visibilitychange', onVisibility)

  return () => {
    doc.removeEventListener('freeze', suspend)
    target.removeEventListener('offline', suspend)
    doc.removeEventListener('resume', resume)
    target.removeEventListener('pageshow', resume)
    target.removeEventListener('online', resume)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
