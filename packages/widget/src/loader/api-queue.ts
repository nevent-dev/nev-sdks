export type ApiCall = [method: string, ...args: unknown[]]

export interface ApiStub {
  (...call: ApiCall): void
  q?: ApiCall[]
  __dispatch?: (method: string, args: unknown[]) => void
}

export function installGlobalStub(w: Window & { NeventWidget?: ApiStub }): ApiStub {
  if (w.NeventWidget) return w.NeventWidget
  const stub: ApiStub = (...call: ApiCall) => {
    const dispatch = stub.__dispatch
    if (dispatch) {
      const [method, ...args] = call
      dispatch(method, args)
      return
    }
    ;(stub.q = stub.q ?? []).push(call)
  }
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
