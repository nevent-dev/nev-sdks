export interface SSEEvent {
  event: string
  data: string
  id?: string
}

function parseFrame(frame: string): SSEEvent | null {
  let event = 'message'
  let id: string | undefined
  const dataLines: string[] = []
  let hasField = false
  for (const line of frame.split('\n')) {
    if (line === '' || line.startsWith(':')) continue // blank or comment/heartbeat
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') { event = value; hasField = true }
    else if (field === 'data') { dataLines.push(value); hasField = true }
    else if (field === 'id') { id = value; hasField = true }
  }
  if (!hasField) return null // frame was only comment/heartbeat colons
  const base: SSEEvent = { event, data: dataLines.join('\n') }
  return id === undefined ? base : { ...base, id }
}

export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // A parked reader.read() only resolves when data arrives OR the stream is
  // cancelled. Cancelling on abort unblocks it (resolves with {done:true}).
  const onAbort = (): void => { void reader.cancel().catch(() => {}) }
  if (signal) {
    if (signal.aborted) { await reader.cancel().catch(() => {}); reader.releaseLock(); return }
    signal.addEventListener('abort', onAbort)
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n') // \r\n reunites across chunks before splitting
      let idx = buffer.indexOf('\n\n')
      while (idx !== -1) {
        const frame = parseFrame(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 2)
        if (frame) yield frame
        idx = buffer.indexOf('\n\n')
      }
    }
    if (signal?.aborted) return // aborted mid-turn: do not emit a partial tail
    buffer += decoder.decode() // flush any bytes the decoder was holding
    const tail = parseFrame(buffer)
    if (tail) yield tail
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
    try { await reader.cancel() } catch { /* already closed */ }
    reader.releaseLock()
  }
}
