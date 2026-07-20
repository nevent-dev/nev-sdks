export type ApiCall = [method: string, ...args: unknown[]]

export interface ApiStub {
  (...call: ApiCall): void
  q?: ApiCall[]
  __dispatch?: (method: string, args: unknown[]) => void
  __installed?: true
}

export function installGlobalStub(w: Window & { NeventWidget?: ApiStub }): ApiStub {
  const existing = w.NeventWidget
  // Idempotencia real: solo reutilizamos el global si YA es el stub que este
  // propio módulo instaló antes (doble inclusión del script). Si el global lo
  // definió el snippet del anfitrión (el patrón estándar
  // `window.X = window.X || function(){(...).q.push(arguments)}` que
  // examples/host-demo.html usa), ese objeto no sabe leer __dispatch: sin este
  // reemplazo, cualquier llamada posterior al boot (open, close, on...) se
  // quedaría encolada para siempre porque su cuerpo solo hace push a .q.
  if (existing?.__installed) return existing
  const stub: ApiStub = (...call: ApiCall) => {
    const dispatch = stub.__dispatch
    if (dispatch) {
      const [method, ...args] = call
      dispatch(method, args)
      return
    }
    ;(stub.q = stub.q ?? []).push(call)
  }
  stub.__installed = true
  if (existing?.q?.length) stub.q = existing.q
  w.NeventWidget = stub
  return stub
}

export function drainQueue(stub: ApiStub, handler: (method: string, args: unknown[]) => void): void {
  const pending = stub.q ?? []
  delete stub.q
  const dispatch = (method: string, args: unknown[]): void => handler(method, args)
  stub.__dispatch = dispatch
  pending.forEach(([method, ...args]) => dispatch(method, args))
}
