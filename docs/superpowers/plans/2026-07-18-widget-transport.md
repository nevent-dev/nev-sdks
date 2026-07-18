# Widget Transport & State Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless transport + observable state store behind the widget panel — message store (single immutable source of truth), optimistic send with idempotency, bot-turn SSE streaming with cancel, a durable inbound events channel with reconciliation/dedup, a client-view state machine driven only by server events, polling fallback, and page-lifecycle wiring — all tested via jsdom + mocked `fetch`/`ReadableStream`.

**Architecture:** A `createMessageStore()` closure holds the only mutable state (messages, conversation state, cursor, agent identity, connection status) with **copy-on-write** so every published snapshot is immutable; it is observable via `subscribe`/`getState` so the Plan 3 panel can consume it with `useSyncExternalStore`. A generic fetch-streaming SSE parser feeds two consumers: `runStreamingTurn` (POST `/stream`) and the `EventsChannel` (GET `/events`). The channel runs a **single generation-serialized loop**: head-first reconciliation (snapshot → tail), dedup by `eventId`/`messageId`, reconnect with jittered/capped backoff, and fallback to `/events/poll` after two consecutive stream failures. The state machine `BOT_ACTIVE → ESCALATED_WAITING → AGENT_ACTIVE → RESOLVED` starts **null** and is set **only** from server `conversation.state_changed` events and snapshots (monotonic by seq — old replays never revert it). A `createTransport(client)` facade wires store + sender + channel + lifecycle into one object the shell (Plan 3) consumes.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), Preact (Plan 3 only — Plan 2 is headless), Vitest + jsdom, `fetch` + `ReadableStream` (WHATWG streams), `crypto.randomUUID()`.

## Codex rev.1 NO-GO → rev.2 resolution map

Codex reviewed the rev.1 plan and returned NO-GO with 7 blockers (all correct). This rev.2 resolves each:

| # | Blocker | Resolved in |
|---|---|---|
| 1 | Turn drop after accepted/delta silently "succeeds"; abort can't cancel a blocked read; TextDecoder not flushed | Task 3 (abort-unblock + flush) + Task 6 (`runStreamingTurn` throws `stream_incomplete` on EOF-without-DONE; distinguishes `AbortError`) |
| 2 | `finishBotTurn` advances the durable cursor with a lateral eventId (skips intermediate `state_changed`); 409 can't lower the cursor; stale reconciliations apply after close/suspend | Task 5 (`finishBotTurn` never touches cursor) + Task 4 (`replaceSnapshot` hard reset) + Task 9 (generation-serialized loop) |
| 3 | Old overlapping replays revert state/agent identity; durable-before-ack and durable-before-finish both duplicate; store mutates previously published objects | Task 4 (seq-guarded state/agent, immutable copy-on-write) + Task 5 (both race orders dedup) |
| 4 | Polling never reached: a 200 that opens then drops resets `consecutiveFailures` | Task 9 (failures reset only on **progress** = first frame; single loop; poll consumes its own cursor; real reset on 409; circuit breaker realized as capped/jittered backoff + polling — separate breaker object removed, Task 8) |
| 5 | Server-only state violated by defaulting to `BOT_ACTIVE` | Task 4 (`ConversationState \| null` until first snapshot/event; older snapshot/replay can't lower state) |
| 6 | Plan auto-resends via `/messages` after a `/stream` drop but the test expects `failed`; cancel triggers fallback; channel opens before the conversation exists | Task 7 (no auto-resend of the **current** message; degrade only **subsequent** sends; `AbortError` never falls back; channel opens on `accepted`/2xx) |
| 7 | `resume()` not idempotent; grouped lifecycle events cause concurrent reconciliations; offline doesn't set `connection='offline'`; tests leak channels/timers | Task 9 (chained single-loop + generation; offline path sets `connection`) + Task 10 + every channel test calls `close()` and injects a scheduler |

## Codex rev.2 → rev.3 (4 remaining, finer)

| # | Blocker | Resolved in |
|---|---|---|
| A | Immutability was shallow (`Object.freeze` only froze `StoreState`); `applySnapshot` notified before finishing its scalar mutations | Task 4 (`getState` deep-freezes the array + every `StoredMessage`; `applySnapshot`/`replaceSnapshot` mutate then publish **once** via `assignMessages` + a single `notify`) |
| B | Hard reset kept `lastAgentSeq` + agent identity, so a valid lower-seq `agent.joined` after the reset would be dropped | Task 4 (`replaceSnapshot` resets agent identity **and** `lastAgentSeq = -1` so the replay re-applies) |
| C | First frame reset backoff but not `failures`; `pollOnce` ignored `body.cursor`; a 409 from polling didn't hard-reconcile | Task 9 (`consecutiveFailures` hoisted to the closure and zeroed on first frame; `pollOnce` applies `body.cursor` monotonically via `store.advanceCursorTo`; 409 from poll → `failures=0` + immediate `replaceSnapshot`) + Task 4 (`advanceCursorTo`) |
| D | `suspend()`/`close()` freed the loop slot before the prior loop unwound, so `resume()` could start a concurrent reconciliation; the drop test used a clean `close()` (EOF), not a real error | Task 9 (chained `launch()`: at most one loop; a `resume()` during an unwinding loop is deferred to its `finally`; one shared `AbortController` per run aborts in-flight snapshot/poll/stream) + Task 11 (drop test emits an event then `controller.error(...)`) |

## Global Constraints

- **Package / worktree:** `packages/widget` in worktree `/Users/mblanco/Desarrollo/nev-sdks-worktrees/widget-rewrite`. Branch `feat/widget-rewrite` (Plan 1 already merged in).
- **TS strictness:** `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. **Zero `@ts-ignore`.** Optional object properties must be omitted (not set to `undefined`); array index and `Map.get` results are `T | undefined` and must be narrowed (or `!`-asserted only after an explicit `!== -1`/`has` check) before use.
- **Reuse, do not reinvent:** all authenticated HTTP goes through `SessionClient.authorizedFetch(path, init?)` from `src/shell/session.ts` (adds `Authorization: Bearer`, refreshes+retries once on 401). Do **not** create a second auth path. `path` starts with `/widget/v1/...`; `authorizedFetch` prepends the API base.
- **Reuse contract types:** `WidgetEvent`, `WidgetConfig`, `WidgetSession` from `src/contract/types.ts`. Extend that file (additively) for wire shapes not yet defined — Task 1 does this and notes it.
- **EventSource is banned** (cannot send `Authorization`). All SSE is consumed via `fetch` streaming + the parser in Task 3.
- **Immutable store (Codex #3):** every value returned by `getState()` is a frozen object built by copy-on-write. Mutators never mutate a `StoredMessage` or array that a prior `getState()` handed out — they always create new objects. `getState()` returns a stable reference between mutations (`useSyncExternalStore`-safe).
- **Server-dictated state (Codex #5):** `conversationState` starts `null` and changes **only** on a `conversation.state_changed` event or a snapshot `state`, and only when the change is **newer by seq** (never revert on an old replay). The client never infers state by walking messages.
- **Durable cursor ownership (Codex #2):** only a snapshot, a durable SSE event, or a poll response advances/sets the cursor. `finishBotTurn()` (the bot-turn DONE) must **never** advance the cursor nor mark an eventId applied — the authoritative `message.created` arrives via the channel and carries the real seq.
- **Generation serialization (Codex #2/#7):** the channel tags each reconcile/connect/poll run with a generation captured at start; `open/close/suspend/resume` bump the generation; no async continuation applies store data unless its generation is still current.
- **Cursor = `eventId`**, format `evt_v1_{conversationId}_{seq}` (backend §2.4). The client sends the full string as `?after=`; it derives the numeric `seq` (trailing segment) only for ordering/dedup.
- **Testing:** Vitest + jsdom. Mock `fetch`; build `ReadableStream`s by hand; inject a `Scheduler` wherever delays matter (never real timers). Every channel test ends with `close()`. Every task ends green.
- **Commits:** Conventional Commits, in Castilian Spanish (e.g. `feat(widget): parser SSE por fetch-streaming`). One commit per task.
- **Run tests from the package dir:** `cd /Users/mblanco/Desarrollo/nev-sdks-worktrees/widget-rewrite/packages/widget`. Single file: `npx vitest run src/<path>.test.ts`. Typecheck: `npm run typecheck`.

### Out of scope (deferred)

- **Plan 3 (visual panel):** rendering the 10 mock states, composer, scroll, focus/a11y, theming/tokens. Plan 2 only exposes the observable store + transport API.
- **Plan 4:** rich content schema rendering, file upload flow, feedback 👍/👎 wire calls, i18n.
- **Bootstrap/session** (`config`/`sessions`/`refresh`) — owned by Plan 1's `session.ts`. Plan 2 consumes `SessionClient` as-is. (Plan 1's `WidgetSession.guestHandle` vs backend `resumeSecret` is encapsulated by `authorizedFetch` and reconciled in the bootstrap layer — not this plan.)
- **Circuit breaker as a distinct object:** realized here as capped + jittered backoff plus the polling fallback; there is no separate breaker class (avoids dead code).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/contract/types.ts` (modify) | Wire types: `ConversationState`, `TurnStreamFrame`, `WidgetEphemeralEvent`, `WidgetMessage`, `MessagesSnapshot`, `EventsPollResponse`. |
| `src/contract/fixtures.ts` (modify) | Fixtures for the new shapes (shared contract source for tests). |
| `src/transport/cursor.ts` | `cursorSeq` / `isNewerCursor`. |
| `src/transport/sse.ts` | `parseSSEStream` — fetch-streaming SSE parser (partial chunks, abort-unblock, decoder flush). |
| `src/store/message-store.ts` | `createMessageStore` — immutable observable source of truth. |
| `src/transport/turn.ts` | `runStreamingTurn` — consume POST `/stream`; throw on incomplete; propagate abort. |
| `src/transport/send.ts` | `createSender` — optimistic send, idempotency, degrade-subsequent, retry, cancel. |
| `src/transport/backoff.ts` | `createBackoff` — capped exponential backoff + jitter. |
| `src/transport/events-channel.ts` | `createEventsChannel` — generation-serialized loop: reconcile, consume, dedup, 409 hard reset, reconnect, polling, offline, suspend/resume. |
| `src/shell/lifecycle.ts` | `bindPageLifecycle` — freeze/resume/pageshow/online/offline/visibilitychange → suspend/resume. |
| `src/transport/index.ts` | `createTransport` — facade wiring store + sender + channel + lifecycle. |

Tests live in `src/<dir>/__tests__/<name>.test.ts` (existing convention; `vitest.config.ts` includes `src/**/__tests__/**/*.test.{ts,tsx}`).

---

## Task 1: Contract wire types + fixtures

**Files:**
- Modify: `src/contract/types.ts`
- Modify: `src/contract/fixtures.ts`
- Test: `src/contract/__tests__/fixtures.test.ts` (extend existing)

**Interfaces:**
- Consumes: existing `WidgetEvent`, `WidgetConfig`, `WidgetSession` (unchanged shapes).
- Produces: `ConversationState`, `TurnStreamFrame`, `WidgetEphemeralEvent`, `WidgetMessage`, `MessagesSnapshot`, `EventsPollResponse`; fixtures `fixtureSnapshot()`, `fixtureTurnFrames()`, `fixturePollResponse()`.

- [ ] **Step 1: Add the wire types to `src/contract/types.ts`**

Append to the end of the file, then update the existing `conversation.state_changed` variant to use the alias:

```typescript
export type ConversationState = 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED'

// Frames of the bot-turn stream (POST /widget/v1/conversations/current/stream).
// Vocabulary per backend §4.2: accepted → delta(s) → DONE | ERROR. `done` still
// carries eventId on the wire; the client does not use it to move the cursor
// (the authoritative message.created arrives via the durable channel).
export type TurnStreamFrame =
  | { type: 'accepted'; turnId: string; userMessageId: string }
  | { type: 'delta'; turnId: string; seq: number; delta: string }
  | { type: 'done'; turnId: string; messageId: string; eventId: string }
  | { type: 'error'; code: string }

// Ephemeral inbound events (TTL, no cursor/replay) per backend §4.3.
// presence is parsed for forward-compat but not yet surfaced by the store.
export type WidgetEphemeralEvent =
  | { type: 'agent.typing'; payload: { isTyping: boolean } }
  | { type: 'presence'; payload: { agentOnline: boolean } }

// A historical message as returned by GET /messages (snapshot).
export interface WidgetMessage {
  messageId: string
  role: 'bot' | 'agent' | 'user'
  text: string
  createdAt: string
}

// GET /widget/v1/conversations/current/messages?limit=N
export interface MessagesSnapshot {
  messages: WidgetMessage[]
  state: ConversationState
  snapshotCursor: string
}

// GET /widget/v1/events/poll?after={cursor} — ALL durables after the cursor.
export interface EventsPollResponse {
  events: WidgetEvent[]
  cursor: string | null
}
```

Edit the existing `conversation.state_changed` line to reference the alias (identical literals):

```typescript
  | (EventBase & { type: 'conversation.state_changed'; payload: { state: ConversationState } })
```

- [ ] **Step 2: Add fixtures to `src/contract/fixtures.ts`**

Replace the existing `import type` line with the extended one and append the fixtures:

```typescript
import type {
  WidgetConfig, WidgetSession, WidgetEvent,
  MessagesSnapshot, TurnStreamFrame, EventsPollResponse,
} from './types'

export function fixtureSnapshot(): MessagesSnapshot {
  return {
    messages: [
      { messageId: 'msg_0001', role: 'bot', text: 'Hola, ¿en qué te ayudamos?', createdAt: '2026-07-17T14:02:00Z' },
    ],
    state: 'BOT_ACTIVE',
    snapshotCursor: 'evt_v1_conv_demo_01_1',
  }
}

export function fixtureTurnFrames(): TurnStreamFrame[] {
  return [
    { type: 'accepted', turnId: 'turn_1', userMessageId: 'msg_user_1' },
    { type: 'delta', turnId: 'turn_1', seq: 1, delta: 'Sí, ' },
    { type: 'delta', turnId: 'turn_1', seq: 2, delta: 'puedes cambiarlo.' },
    { type: 'done', turnId: 'turn_1', messageId: 'msg_bot_1', eventId: 'evt_v1_conv_demo_01_5' },
  ]
}

export function fixturePollResponse(): EventsPollResponse {
  const durables = fixtureEvents() as WidgetEvent[]
  return { events: durables, cursor: 'evt_v1_conv_demo_01_3' }
}
```

- [ ] **Step 3: Write the failing test** — append to `src/contract/__tests__/fixtures.test.ts` (add imports to the existing import line):

```typescript
import { fixtureSnapshot, fixtureTurnFrames, fixturePollResponse } from '../fixtures'

describe('transport fixtures', () => {
  it('snapshot carries a versioned cursor and a canonical state', () => {
    const s = fixtureSnapshot()
    expect(s.snapshotCursor).toMatch(/^evt_v1_/)
    expect(s.state).toBe('BOT_ACTIVE')
    expect(s.messages[0]?.messageId).toBe('msg_0001')
  })
  it('turn frames end in a done frame with messageId + eventId', () => {
    const last = fixtureTurnFrames().at(-1)
    expect(last?.type).toBe('done')
    if (last?.type === 'done') {
      expect(last.messageId).toBe('msg_bot_1')
      expect(last.eventId).toMatch(/^evt_v1_/)
    }
  })
  it('poll response returns durable events + a cursor', () => {
    const p = fixturePollResponse()
    expect(p.events.length).toBeGreaterThan(0)
    expect(p.cursor).toMatch(/^evt_v1_/)
  })
})
```

- [ ] **Step 4: Run + typecheck** — `npx vitest run src/contract/__tests__/fixtures.test.ts && npm run typecheck` → PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/contract/types.ts src/contract/fixtures.ts src/contract/__tests__/fixtures.test.ts
git commit -m "feat(widget): tipos y fixtures de transporte (turno, eventos efímeros, snapshot, poll)"
```

---

## Task 2: Cursor helper

**Files:**
- Create: `src/transport/cursor.ts`
- Test: `src/transport/__tests__/cursor.test.ts`

**Interfaces:**
- Produces: `cursorSeq(eventId: string): number` (trailing seq; `-1` if unparseable), `isNewerCursor(candidate: string, current: string | null): boolean`.

- [ ] **Step 1: Write the failing test** — create `src/transport/__tests__/cursor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cursorSeq, isNewerCursor } from '../cursor'

describe('cursor', () => {
  it('extracts the trailing seq from a versioned eventId', () => {
    expect(cursorSeq('evt_v1_conv_demo_01_42')).toBe(42)
  })
  it('returns -1 for an unparseable cursor', () => {
    expect(cursorSeq('garbage')).toBe(-1)
    expect(cursorSeq('evt_v1_conv_x_')).toBe(-1)
  })
  it('treats a null current cursor as older than any candidate', () => {
    expect(isNewerCursor('evt_v1_c_1', null)).toBe(true)
  })
  it('compares by numeric seq, not lexicographically', () => {
    expect(isNewerCursor('evt_v1_c_10', 'evt_v1_c_9')).toBe(true)
    expect(isNewerCursor('evt_v1_c_9', 'evt_v1_c_10')).toBe(false)
    expect(isNewerCursor('evt_v1_c_5', 'evt_v1_c_5')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/cursor.test.ts` → FAIL (cannot resolve `../cursor`).

- [ ] **Step 3: Implement** — create `src/transport/cursor.ts`:

```typescript
// The durable cursor is the eventId string `evt_v1_{conversationId}_{seq}`
// (backend §2.4). Only the trailing numeric seq is meaningful for ordering.
export function cursorSeq(eventId: string): number {
  const i = eventId.lastIndexOf('_')
  if (i < 0 || i === eventId.length - 1) return -1
  const n = Number(eventId.slice(i + 1))
  return Number.isInteger(n) ? n : -1
}

export function isNewerCursor(candidate: string, current: string | null): boolean {
  if (current === null) return true
  return cursorSeq(candidate) > cursorSeq(current)
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/transport/__tests__/cursor.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/cursor.ts src/transport/__tests__/cursor.test.ts
git commit -m "feat(widget): helper de cursor durable (seq + comparación numérica)"
```

---

## Task 3: Fetch-streaming SSE parser (abort-unblock + decoder flush)

**Files:**
- Create: `src/transport/sse.ts`
- Test: `src/transport/__tests__/sse.test.ts`

**Interfaces:**
- Produces: `interface SSEEvent { event: string; data: string; id?: string }`, `async function* parseSSEStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SSEEvent>`.
- Consumed by: Task 6 (`turn.ts`), Task 9 (`events-channel.ts`).

**Codex #1 requirements covered here:** aborting must cancel a **blocked** `read()` (via `reader.cancel()` on the abort event); the `TextDecoder` must be **flushed** at EOF so a multi-byte char split across byte boundaries decodes correctly; an aborted stream yields no trailing frame.

- [ ] **Step 1: Write the failing test** — create `src/transport/__tests__/sse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseSSEStream, type SSEEvent } from '../sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]!))
      else controller.close()
    },
  })
}
async function collect(chunks: string[]): Promise<SSEEvent[]> {
  const out: SSEEvent[] = []
  for await (const ev of parseSSEStream(streamOf(chunks))) out.push(ev)
  return out
}

describe('parseSSEStream', () => {
  it('parses a single well-formed frame', async () => {
    expect(await collect(['event: accepted\ndata: {"turnId":"t1"}\n\n']))
      .toEqual([{ event: 'accepted', data: '{"turnId":"t1"}' }])
  })
  it('reassembles a frame split mid-event across chunks', async () => {
    expect(await collect(['event: del', 'ta\ndata: {"seq":', '1}\n\n']))
      .toEqual([{ event: 'delta', data: '{"seq":1}' }])
  })
  it('handles two frames in one chunk and CRLF line endings', async () => {
    const out = await collect(['event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n'])
    expect(out.map((e) => e.event)).toEqual(['a', 'b'])
    expect(out.map((e) => e.data)).toEqual(['1', '2'])
  })
  it('ignores comment/heartbeat lines but keeps the surrounding frame', async () => {
    expect(await collect([': keep-alive\n\nevent: done\ndata: {}\n\n']))
      .toEqual([{ event: 'done', data: '{}' }])
  })
  it('yields an event-only heartbeat frame (liveness signal for the channel)', async () => {
    expect(await collect(['event: heartbeat\n\n'])).toEqual([{ event: 'heartbeat', data: '' }])
  })
  it('joins multiple data: lines and reads id:', async () => {
    const out = await collect(['id: evt_v1_c_7\nevent: message.created\ndata: a\ndata: b\n\n'])
    expect(out[0]).toEqual({ event: 'message.created', data: 'a\nb', id: 'evt_v1_c_7' })
  })
  it('flushes a trailing frame with no final blank line', async () => {
    expect(await collect(['event: x\ndata: 1'])).toEqual([{ event: 'x', data: '1' }])
  })
  it('decodes a multi-byte char split across chunk byte boundaries (decoder flush)', async () => {
    const enc = new TextEncoder()
    const full = enc.encode('data: 👋\n\n') // 👋 = 4 bytes (0xF0 0x9F 0x91 0x8B)
    const cut = full.indexOf(0xf0) + 2       // split inside the emoji
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(full.slice(0, cut)); c.enqueue(full.slice(cut)); c.close() },
    })
    const out: SSEEvent[] = []
    for await (const ev of parseSSEStream(body)) out.push(ev)
    expect(out[0]?.data).toBe('👋')
  })
  it('aborting unblocks a read parked on a never-ending stream', async () => {
    const ac = new AbortController()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({ start() { /* never enqueue, never close */ }, cancel() { cancelled = true } })
    const gen = parseSSEStream(body, ac.signal)
    const parked = gen.next() // blocks on read()
    ac.abort()
    const r = await parked
    expect(r.done).toBe(true)
    expect(cancelled).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/sse.test.ts` → FAIL (cannot resolve `../sse`).

- [ ] **Step 3: Implement** — create `src/transport/sse.ts`:

```typescript
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
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/transport/__tests__/sse.test.ts` → PASS (all cases, including abort-unblock and decoder flush).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/sse.ts src/transport/__tests__/sse.test.ts
git commit -m "feat(widget): parser SSE por fetch-streaming (chunks parciales, abort desbloquea lectura, flush del decoder)"
```

---

## Task 4: Message store — durable core (immutable, null state, no-revert)

**Files:**
- Create: `src/store/message-store.ts`
- Test: `src/store/__tests__/message-store.test.ts`

**Interfaces:**
- Consumes: `WidgetEvent`, `ConversationState`, `MessagesSnapshot` (Task 1); `cursorSeq` (Task 2).
- Produces (Task 5 adds the remaining mutators to `MessageStore`):
  ```typescript
  type MessageStatus = 'pending' | 'sent' | 'failed'
  type ConnectionStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'offline'
  interface StoredMessage {
    readonly id: string; readonly role: 'user' | 'bot' | 'agent'; readonly text: string
    readonly status: MessageStatus; readonly seq: number | null; readonly streaming: boolean
    readonly createdAt: string; readonly clientId: string | null; readonly turnId: string | null
  }
  interface StoreState {
    readonly messages: readonly StoredMessage[]; readonly conversationState: ConversationState | null
    readonly cursor: string | null; readonly agentName: string | null; readonly agentAvatarUrl: string | null
    readonly agentTyping: boolean; readonly connection: ConnectionStatus
  }
  interface MessageStore {
    getState(): StoreState
    subscribe(listener: () => void): () => void
    applySnapshot(s: MessagesSnapshot): void
    replaceSnapshot(s: MessagesSnapshot): void
    applyDurableEvent(e: WidgetEvent): void
    advanceCursorTo(eventId: string): void   // monotonic; used by the poll fallback
    // Task 5 adds: addOptimistic, ackOptimistic, failOptimistic, retryOptimistic,
    // beginBotTurn, appendBotDelta, finishBotTurn, failBotTurn, setAgentTyping, setConnection
  }
  function createMessageStore(now?: () => string): MessageStore
  ```

- [ ] **Step 1: Write the failing test** — create `src/store/__tests__/message-store.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createMessageStore } from '../message-store'
import type { WidgetEvent } from '../../contract/types'
import { fixtureSnapshot } from '../../contract/fixtures'

function msgEvent(seq: number, messageId: string, role: 'bot' | 'agent' | 'user', text: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T14:03:00Z', type: 'message.created', payload: { messageId, role, text },
  }
}
function stateEvent(seq: number, state: 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED'): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T14:04:00Z', type: 'conversation.state_changed', payload: { state },
  }
}
function agentJoined(seq: number, name: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T14:09:00Z', type: 'agent.joined', payload: { agentName: name, agentAvatarUrl: null },
  }
}

describe('message store — durable core', () => {
  it('starts idle, empty, with a NULL conversationState (server-dictated)', () => {
    const s = createMessageStore()
    expect(s.getState().messages).toEqual([])
    expect(s.getState().conversationState).toBeNull()
    expect(s.getState().cursor).toBeNull()
    expect(s.getState().connection).toBe('idle')
  })

  it('applies a snapshot: messages, state and cursor', () => {
    const s = createMessageStore()
    s.applySnapshot(fixtureSnapshot())
    const st = s.getState()
    expect(st.messages.map((m) => m.id)).toEqual(['msg_0001'])
    expect(st.conversationState).toBe('BOT_ACTIVE')
    expect(st.cursor).toBe('evt_v1_conv_demo_01_1')
  })

  it('appends durable message.created ordered and advances the cursor', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'segundo'))
    s.applyDurableEvent(msgEvent(3, 'm3', 'user', 'tercero'))
    expect(s.getState().messages.map((m) => m.id)).toEqual(['m2', 'm3'])
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_3')
  })

  it('dedups replayed events by eventId (overlap after reconnect)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'hola'))
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'hola'))
    expect(s.getState().messages).toHaveLength(1)
  })

  it('does not rewind the cursor on an older replayed event; orders by seq', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(5, 'm5', 'bot', 'nuevo'))
    s.applyDurableEvent(msgEvent(3, 'm3', 'bot', 'viejo'))
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_5')
    expect(s.getState().messages.map((m) => m.id)).toEqual(['m3', 'm5'])
  })

  it('sets state ONLY from state_changed; an OLDER replay never reverts it', () => {
    const s = createMessageStore()
    s.applyDurableEvent(stateEvent(6, 'AGENT_ACTIVE'))
    s.applyDurableEvent(stateEvent(4, 'ESCALATED_WAITING')) // stale, out of order
    expect(s.getState().conversationState).toBe('AGENT_ACTIVE')
  })

  it('records agent identity from the newest agent.joined only', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(7, 'Laura'))
    s.applyDurableEvent(agentJoined(5, 'Pedro')) // stale
    expect(s.getState().agentName).toBe('Laura')
  })

  it('applySnapshot after events keeps the max cursor and merges (no rewind, no dup)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(5, 'm5', 'bot', 'live'))
    s.applySnapshot(fixtureSnapshot()) // snapshotCursor seq=1, message msg_0001
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_5')
    expect(s.getState().messages.map((m) => m.id)).toEqual(['msg_0001', 'm5'])
  })

  it('replaceSnapshot hard-resets the cursor DOWN and clears dedup (409 recovery)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(9, 'm9', 'bot', 'lejano'))
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_9')
    s.replaceSnapshot(fixtureSnapshot()) // snapshotCursor seq=1
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_1') // forced down
    expect(s.getState().messages.map((m) => m.id)).toEqual(['msg_0001']) // rebuilt from snapshot
  })

  it('replaceSnapshot resets agent identity + watermark so a lower-seq agent.joined re-applies', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(8, 'Laura'))
    expect(s.getState().agentName).toBe('Laura')
    s.replaceSnapshot(fixtureSnapshot())          // hard reset drops the cursor to seq=1
    expect(s.getState().agentName).toBeNull()     // identity cleared
    s.applyDurableEvent(agentJoined(3, 'Laura'))  // valid replay with seq LOWER than the old 8
    expect(s.getState().agentName).toBe('Laura')  // re-applied (watermark was reset to -1)
  })

  it('advanceCursorTo moves the cursor forward monotonically only', () => {
    const s = createMessageStore()
    s.advanceCursorTo('evt_v1_conv_demo_01_4')
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_4')
    s.advanceCursorTo('evt_v1_conv_demo_01_2') // older → ignored
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_4')
    s.advanceCursorTo('evt_v1_conv_demo_01_7')
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_7')
  })

  it('getState deep-freezes the snapshot, the array and every message', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'x'))
    const st = s.getState()
    expect(Object.isFrozen(st)).toBe(true)
    expect(Object.isFrozen(st.messages)).toBe(true)
    expect(Object.isFrozen(st.messages[0])).toBe(true)
  })

  it('publishes a stable snapshot between changes and a NEW one after a change', () => {
    const s = createMessageStore()
    const listener = vi.fn()
    const unsub = s.subscribe(listener)
    const before = s.getState()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'x'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(s.getState()).not.toBe(before)
    const a = s.getState()
    expect(s.getState()).toBe(a)
    unsub()
    s.applyDurableEvent(msgEvent(3, 'm3', 'bot', 'y'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/store/__tests__/message-store.test.ts` → FAIL (cannot resolve `../message-store`).

- [ ] **Step 3: Implement** — create `src/store/message-store.ts`:

```typescript
import type { WidgetEvent, ConversationState, MessagesSnapshot } from '../contract/types'
import { cursorSeq } from '../transport/cursor'

export type MessageStatus = 'pending' | 'sent' | 'failed'
export type ConnectionStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'offline'

export interface StoredMessage {
  readonly id: string
  readonly role: 'user' | 'bot' | 'agent'
  readonly text: string
  readonly status: MessageStatus
  readonly seq: number | null
  readonly streaming: boolean
  readonly createdAt: string
  readonly clientId: string | null
  readonly turnId: string | null
}

export interface StoreState {
  readonly messages: readonly StoredMessage[]
  readonly conversationState: ConversationState | null
  readonly cursor: string | null
  readonly agentName: string | null
  readonly agentAvatarUrl: string | null
  readonly agentTyping: boolean
  readonly connection: ConnectionStatus
}

export interface MessageStore {
  getState(): StoreState
  subscribe(listener: () => void): () => void
  applySnapshot(snapshot: MessagesSnapshot): void
  replaceSnapshot(snapshot: MessagesSnapshot): void
  applyDurableEvent(event: WidgetEvent): void
  advanceCursorTo(eventId: string): void
}

// Display order: durable events strictly by seq among themselves; anything
// without a seq (snapshot history / optimistic / streaming) by its timestamp.
function compareMessages(a: StoredMessage, b: StoredMessage): number {
  if (a.seq !== null && b.seq !== null) return a.seq - b.seq
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

export function createMessageStore(now: () => string = () => new Date().toISOString()): MessageStore {
  // `messages` is treated as immutable and REPLACED (never mutated) on every
  // change, so any array/object a prior getState() handed out stays frozen.
  let messages: readonly StoredMessage[] = []
  const appliedEventIds = new Set<string>()
  let conversationState: ConversationState | null = null
  let cursor: string | null = null
  let agentName: string | null = null
  let agentAvatarUrl: string | null = null
  let agentTyping = false
  let connection: ConnectionStatus = 'idle'
  let lastStateSeq = -1
  let lastAgentSeq = -1

  const listeners = new Set<() => void>()
  let published: StoreState | null = null

  const notify = (): void => {
    published = null
    for (const l of listeners) l()
  }
  // assignMessages sorts + replaces WITHOUT publishing; callers that also touch
  // scalars call notify() once at the end so each mutation publishes atomically.
  const assignMessages = (next: StoredMessage[]): void => {
    next.sort(compareMessages)
    messages = next
  }
  const setMessages = (next: StoredMessage[]): void => {
    assignMessages(next)
    notify()
  }
  const advanceCursor = (eventId: string): void => {
    if (cursor === null || cursorSeq(eventId) > cursorSeq(cursor)) cursor = eventId
  }
  const indexOf = (pred: (m: StoredMessage) => boolean): number => messages.findIndex(pred)

  const mergeSnapshotMessages = (base: StoredMessage[], snap: MessagesSnapshot): StoredMessage[] => {
    const next = base.slice()
    for (const m of snap.messages) {
      if (next.some((x) => x.id === m.messageId)) continue
      next.push({
        id: m.messageId, role: m.role, text: m.text, status: 'sent',
        seq: null, streaming: false, createdAt: m.createdAt, clientId: null, turnId: null,
      })
    }
    return next
  }

  const applyDurableEvent = (event: WidgetEvent): void => {
    if (appliedEventIds.has(event.eventId)) return
    appliedEventIds.add(event.eventId)
    const seq = cursorSeq(event.eventId)
    advanceCursor(event.eventId)
    if (event.type === 'message.created') {
      const i = indexOf((m) => m.id === event.payload.messageId)
      if (i !== -1) {
        const next = messages.slice()
        next[i] = { ...next[i]!, text: event.payload.text, seq, status: 'sent', streaming: false, turnId: null }
        setMessages(next)
      } else {
        setMessages([...messages, {
          id: event.payload.messageId, role: event.payload.role, text: event.payload.text,
          status: 'sent', seq, streaming: false, createdAt: event.occurredAt, clientId: null, turnId: null,
        }])
      }
    } else if (event.type === 'conversation.state_changed') {
      if (seq > lastStateSeq) { conversationState = event.payload.state; lastStateSeq = seq; notify() }
    } else if (event.type === 'agent.joined') {
      if (seq > lastAgentSeq) { agentName = event.payload.agentName; agentAvatarUrl = event.payload.agentAvatarUrl; lastAgentSeq = seq; notify() }
    }
  }

  const applySnapshot = (snap: MessagesSnapshot): void => {
    // Mutate messages + scalars, THEN publish once (no intermediate notify).
    const snapSeq = cursorSeq(snap.snapshotCursor)
    assignMessages(mergeSnapshotMessages(messages.slice(), snap))
    if (snapSeq >= lastStateSeq) { conversationState = snap.state; lastStateSeq = snapSeq }
    advanceCursor(snap.snapshotCursor)
    notify()
  }

  const replaceSnapshot = (snap: MessagesSnapshot): void => {
    // Hard reset for CURSOR_RESET_REQUIRED: drop dedup + cursor and rebuild from
    // the fresh snapshot, keeping only unsent optimistic / in-flight streaming.
    appliedEventIds.clear()
    const keep = messages.filter((m) => m.status !== 'sent' || m.streaming)
    cursor = snap.snapshotCursor
    const snapSeq = cursorSeq(snap.snapshotCursor)
    conversationState = snap.state
    lastStateSeq = snapSeq
    // The snapshot carries state but NOT agent identity — reset it and its
    // watermark so the agent.joined replay (arriving after the lowered cursor)
    // re-applies even though its seq is below the pre-reset watermark.
    agentName = null
    agentAvatarUrl = null
    lastAgentSeq = -1
    assignMessages(mergeSnapshotMessages(keep, snap))
    notify()
  }

  const advanceCursorTo = (eventId: string): void => {
    if (cursor !== null && cursorSeq(eventId) <= cursorSeq(cursor)) return
    cursor = eventId
    notify()
  }

  return {
    getState(): StoreState {
      if (published === null) {
        // Deep freeze so consumers (and our own future mutations) can never
        // mutate a snapshot that was already handed out. Copy-on-write means the
        // NEXT mutation builds fresh objects, so freezing these is safe.
        for (const m of messages) Object.freeze(m)
        Object.freeze(messages)
        published = Object.freeze({
          messages, conversationState, cursor, agentName, agentAvatarUrl, agentTyping, connection,
        })
      }
      return published
    },
    subscribe(listener): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    applySnapshot,
    replaceSnapshot,
    applyDurableEvent,
    advanceCursorTo,
  }
}
```

> Note for Task 5: `messages`, `appliedEventIds`, `now`, `indexOf`, `assignMessages`, `setMessages`, `notify`, `advanceCursor`, and the mutable scalars live in this closure. Task 5 adds mutators inside `createMessageStore` and to the returned object. Copy-on-write is mandatory: never mutate an existing `StoredMessage` (they are frozen once published) — always build a fresh non-frozen array (`slice`/spread/`filter`) and replace elements by spreading into new objects. A mutator that changes **only** messages uses `setMessages(next)` (assign + single notify); one that also touches scalars uses `assignMessages(next)` then a single `notify()` at the end, so each mutation publishes exactly one atomic snapshot.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/store/__tests__/message-store.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/store/message-store.ts src/store/__tests__/message-store.test.ts
git commit -m "feat(widget): store observable inmutable (snapshot/replaceSnapshot, dedup, cursor, estado sin retroceso)"
```

---

## Task 5: Message store — optimistic + streaming (race-order dedup)

**Files:**
- Modify: `src/store/message-store.ts`
- Test: `src/store/__tests__/message-store-optimistic.test.ts`

**Interfaces:**
- Consumes: the Task 4 closure.
- Produces (added to `MessageStore`):
  ```typescript
  addOptimistic(clientId: string, text: string): void
  ackOptimistic(clientId: string, messageId: string): void
  failOptimistic(clientId: string): void
  retryOptimistic(clientId: string): void
  beginBotTurn(turnId: string): void
  appendBotDelta(turnId: string, delta: string): void
  finishBotTurn(turnId: string, messageId: string): void   // NO eventId — never touches the cursor
  failBotTurn(turnId: string): void
  setAgentTyping(isTyping: boolean): void
  setConnection(status: ConnectionStatus): void
  ```

- [ ] **Step 1: Write the failing test** — create `src/store/__tests__/message-store-optimistic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createMessageStore } from '../message-store'
import type { WidgetEvent } from '../../contract/types'

const clock = () => '2026-07-17T15:00:00Z'
function msgEvent(seq: number, messageId: string, role: 'bot' | 'agent' | 'user', text: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T15:00:01Z', type: 'message.created', payload: { messageId, role, text },
  }
}

describe('message store — optimistic + streaming', () => {
  it('optimistic user message goes pending → sent on ack', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    expect(s.getState().messages[0]).toMatchObject({ id: 'cid_1', role: 'user', status: 'pending', text: 'Hola' })
    s.ackOptimistic('cid_1', 'msg_srv_1')
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_srv_1', status: 'sent', clientId: 'cid_1' })
  })

  it('durable-before-ack: the durable and the ack do not duplicate', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    s.applyDurableEvent(msgEvent(2, 'msg_srv', 'user', 'Hola')) // durable wins the race
    s.ackOptimistic('cid_1', 'msg_srv')
    expect(s.getState().messages).toHaveLength(1)
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_srv', seq: 2 })
  })

  it('failOptimistic then retryOptimistic flips failed → pending', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    s.failOptimistic('cid_1')
    expect(s.getState().messages[0]?.status).toBe('failed')
    s.retryOptimistic('cid_1')
    expect(s.getState().messages[0]?.status).toBe('pending')
  })

  it('streams a bot turn: begin → deltas accumulate → done finalizes with messageId', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t1')
    expect(s.getState().messages[0]).toMatchObject({ role: 'bot', streaming: true, text: '' })
    s.appendBotDelta('t1', 'Sí, ')
    s.appendBotDelta('t1', 'claro.')
    expect(s.getState().messages[0]?.text).toBe('Sí, claro.')
    s.finishBotTurn('t1', 'msg_bot_1')
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_bot_1', streaming: false })
  })

  it('finishBotTurn does NOT advance the durable cursor', () => {
    const s = createMessageStore(clock)
    s.applyDurableEvent(msgEvent(2, 'm2', 'user', 'q')) // cursor = 2
    s.beginBotTurn('t1'); s.appendBotDelta('t1', 'x')
    s.finishBotTurn('t1', 'm_bot')
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_2') // unchanged
  })

  it('durable-before-finish: the durable bot message and finishBotTurn do not duplicate', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t1')
    s.appendBotDelta('t1', 'parcial')
    s.applyDurableEvent(msgEvent(5, 'msg_bot', 'bot', 'texto final')) // durable arrives first
    s.finishBotTurn('t1', 'msg_bot')
    const bots = s.getState().messages.filter((m) => m.role === 'bot')
    expect(bots).toHaveLength(1)
    expect(bots[0]?.text).toBe('texto final') // durable is authoritative
  })

  it('finish-before-durable: the durable replay updates, does not duplicate', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t1'); s.appendBotDelta('t1', 'texto')
    s.finishBotTurn('t1', 'msg_bot')
    s.applyDurableEvent(msgEvent(5, 'msg_bot', 'bot', 'texto'))
    expect(s.getState().messages.filter((m) => m.role === 'bot')).toHaveLength(1)
    expect(s.getState().messages[0]?.seq).toBe(5) // reconciled with the durable seq
  })

  it('failBotTurn removes an empty placeholder but keeps a partial one', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t_empty'); s.failBotTurn('t_empty')
    expect(s.getState().messages).toHaveLength(0)
    s.beginBotTurn('t_partial'); s.appendBotDelta('t_partial', 'a medias'); s.failBotTurn('t_partial')
    expect(s.getState().messages[0]).toMatchObject({ streaming: false, text: 'a medias' })
  })

  it('never mutates a previously published snapshot (copy-on-write)', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    const snapA = s.getState()
    const msgA = snapA.messages[0]!
    s.ackOptimistic('cid_1', 'msg_1')
    expect(s.getState()).not.toBe(snapA)
    expect(snapA.messages[0]).toBe(msgA)    // old snapshot object untouched
    expect(msgA.id).toBe('cid_1')            // still the original value
    expect(s.getState().messages[0]?.id).toBe('msg_1')
  })

  it('setAgentTyping and setConnection update reactive flags', () => {
    const s = createMessageStore(clock)
    s.setAgentTyping(true)
    expect(s.getState().agentTyping).toBe(true)
    s.setConnection('polling')
    expect(s.getState().connection).toBe('polling')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/store/__tests__/message-store-optimistic.test.ts` → FAIL (`addOptimistic is not a function`).

- [ ] **Step 3: Extend the interface** — add to `MessageStore` in `src/store/message-store.ts`:

```typescript
export interface MessageStore {
  getState(): StoreState
  subscribe(listener: () => void): () => void
  applySnapshot(snapshot: MessagesSnapshot): void
  replaceSnapshot(snapshot: MessagesSnapshot): void
  applyDurableEvent(event: WidgetEvent): void
  addOptimistic(clientId: string, text: string): void
  ackOptimistic(clientId: string, messageId: string): void
  failOptimistic(clientId: string): void
  retryOptimistic(clientId: string): void
  beginBotTurn(turnId: string): void
  appendBotDelta(turnId: string, delta: string): void
  finishBotTurn(turnId: string, messageId: string): void
  failBotTurn(turnId: string): void
  setAgentTyping(isTyping: boolean): void
  setConnection(status: ConnectionStatus): void
}
```

- [ ] **Step 4: Add the mutators** — inside `createMessageStore`, before the `return`:

```typescript
  const setStatus = (clientId: string, status: MessageStatus): void => {
    const i = indexOf((m) => m.clientId === clientId)
    if (i === -1) return
    const next = messages.slice()
    next[i] = { ...next[i]!, status }
    setMessages(next)
  }

  const addOptimistic = (clientId: string, text: string): void => {
    setMessages([...messages, {
      id: clientId, role: 'user', text, status: 'pending', seq: null,
      streaming: false, createdAt: now(), clientId, turnId: null,
    }])
  }
  const ackOptimistic = (clientId: string, messageId: string): void => {
    const oi = indexOf((m) => m.clientId === clientId && m.id !== messageId)
    if (oi === -1) return // already acked (idempotent)
    const durableI = indexOf((m) => m.id === messageId)
    const next = messages.slice()
    if (durableI !== -1 && durableI !== oi) {
      next.splice(oi, 1) // durable arrived first: keep it, drop the placeholder
    } else {
      next[oi] = { ...next[oi]!, id: messageId, status: 'sent' }
    }
    setMessages(next)
  }
  const failOptimistic = (clientId: string): void => setStatus(clientId, 'failed')
  const retryOptimistic = (clientId: string): void => setStatus(clientId, 'pending')

  const beginBotTurn = (turnId: string): void => {
    setMessages([...messages, {
      id: `turn:${turnId}`, role: 'bot', text: '', status: 'sent', seq: null,
      streaming: true, createdAt: now(), clientId: null, turnId,
    }])
  }
  const appendBotDelta = (turnId: string, delta: string): void => {
    const i = indexOf((m) => m.turnId === turnId)
    if (i === -1) return
    const next = messages.slice()
    next[i] = { ...next[i]!, text: next[i]!.text + delta }
    setMessages(next)
  }
  const finishBotTurn = (turnId: string, messageId: string): void => {
    const ti = indexOf((m) => m.turnId === turnId)
    if (ti === -1) return
    const durableI = indexOf((m) => m.id === messageId)
    const next = messages.slice()
    if (durableI !== -1 && durableI !== ti) {
      next.splice(ti, 1) // durable already present: discard the streaming placeholder
    } else {
      next[ti] = { ...next[ti]!, id: messageId, streaming: false, turnId: null }
    }
    setMessages(next)
    // Do NOT advance the cursor / mark eventId applied: the durable message.created
    // for this messageId arrives via the channel with the authoritative seq.
  }
  const failBotTurn = (turnId: string): void => {
    const i = indexOf((m) => m.turnId === turnId)
    if (i === -1) return
    const m = messages[i]!
    const next = messages.slice()
    if (m.text === '') next.splice(i, 1)
    else next[i] = { ...m, streaming: false, turnId: null }
    setMessages(next)
  }
  const setAgentTyping = (isTyping: boolean): void => {
    if (agentTyping === isTyping) return
    agentTyping = isTyping; notify()
  }
  const setConnection = (status: ConnectionStatus): void => {
    if (connection === status) return
    connection = status; notify()
  }
```

Add them to the returned object (after `applyDurableEvent`):

```typescript
    addOptimistic, ackOptimistic, failOptimistic, retryOptimistic,
    beginBotTurn, appendBotDelta, finishBotTurn, failBotTurn,
    setAgentTyping, setConnection,
```

- [ ] **Step 5: Run to verify it passes** — `npx vitest run src/store && npm run typecheck` → PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/message-store.ts src/store/__tests__/message-store-optimistic.test.ts
git commit -m "feat(widget): store — optimistas y streaming con dedup en ambos órdenes de carrera; finishBotTurn no toca el cursor"
```

---

## Task 6: Bot-turn streaming consumer (throw on incomplete, propagate abort)

**Files:**
- Create: `src/transport/turn.ts`
- Test: `src/transport/__tests__/turn.test.ts`

**Interfaces:**
- Consumes: `parseSSEStream` (Task 3); `SessionClient.authorizedFetch` (Plan 1).
- Produces:
  ```typescript
  interface TurnHandlers {
    onAccepted(turnId: string, userMessageId: string): void
    onDelta(turnId: string, delta: string): void
    onDone(turnId: string, messageId: string): void   // eventId is on the wire but unused here
    onError(code: string): void
  }
  function runStreamingTurn(
    client: Pick<SessionClient, 'authorizedFetch'>, idempotencyKey: string, text: string,
    handlers: TurnHandlers, signal: AbortSignal,
  ): Promise<void>
  ```
- **Codex #1:** if the stream reaches EOF after `accepted`/`delta` without a terminal `DONE`/`ERROR`, throw `Error('stream_incomplete')`. If the signal was aborted, throw a `DOMException('AbortError')` (the caller must treat abort as a user cancel, never a fallback trigger).

- [ ] **Step 1: Write the failing test** — create `src/transport/__tests__/turn.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runStreamingTurn, type TurnHandlers } from '../turn'

function sseResponse(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}
function openResponse(frames: string[]): Response { // emits frames, never closes
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200 })
}
function handlers(): TurnHandlers & { log: string[] } {
  const log: string[] = []
  return {
    log,
    onAccepted: (t, u) => log.push(`accepted:${t}:${u}`),
    onDelta: (t, d) => log.push(`delta:${t}:${d}`),
    onDone: (t, m) => log.push(`done:${t}:${m}`),
    onError: (c) => log.push(`error:${c}`),
  }
}

describe('runStreamingTurn', () => {
  it('sends Idempotency-Key + body and drives accepted → delta → done', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","seq":1,"delta":"Sí, "}\n\n',
      'event: delta\ndata: {"turnId":"t1","seq":2,"delta":"claro."}\n\n',
      'event: DONE\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n',
    ]))
    const h = handlers()
    await runStreamingTurn({ authorizedFetch }, 'idem-1', 'Hola', h, new AbortController().signal)
    expect(h.log).toEqual(['accepted:t1:u1', 'delta:t1:Sí, ', 'delta:t1:claro.', 'done:t1:m1'])
    const [path, init] = authorizedFetch.mock.calls[0]!
    expect(path).toBe('/widget/v1/conversations/current/stream')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('idem-1')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Hola' })
  })

  it('routes an ERROR frame to onError and stops', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: ERROR\ndata: {"code":"quota_exceeded"}\n\n',
    ]))
    const h = handlers()
    await runStreamingTurn({ authorizedFetch }, 'idem-1', 'Hola', h, new AbortController().signal)
    expect(h.log).toEqual(['accepted:t1:u1', 'error:quota_exceeded'])
  })

  it('throws stream_incomplete when EOF arrives after accepted/delta without DONE', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"parcial"}\n\n',
    ])) // stream closes (EOF), no DONE
    const h = handlers()
    await expect(runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', h, new AbortController().signal))
      .rejects.toThrow('stream_incomplete')
    expect(h.log).toEqual(['accepted:t1:u1', 'delta:t1:parcial'])
  })

  it('throws AbortError (not stream_incomplete) when aborted mid-turn', async () => {
    const ac = new AbortController()
    const h = handlers()
    const authorizedFetch = vi.fn(async () => openResponse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n']))
    const p = runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', h, ac.signal)
    await vi.waitFor(() => expect(h.log).toContain('accepted:t1:u1'))
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('throws on a non-OK HTTP status', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([], 503))
    await expect(runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', handlers(), new AbortController().signal))
      .rejects.toThrow(/stream_http:503/)
  })

  it('passes the abort signal through to authorizedFetch', async () => {
    const ac = new AbortController()
    const authorizedFetch = vi.fn(async () => sseResponse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n', 'event: done\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n']))
    await runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', handlers(), ac.signal)
    expect(authorizedFetch.mock.calls[0]![1]?.signal).toBe(ac.signal)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/turn.test.ts` → FAIL (cannot resolve `../turn`).

- [ ] **Step 3: Implement** — create `src/transport/turn.ts`:

```typescript
import type { SessionClient } from '../shell/session'
import { parseSSEStream } from './sse'

export interface TurnHandlers {
  onAccepted(turnId: string, userMessageId: string): void
  onDelta(turnId: string, delta: string): void
  onDone(turnId: string, messageId: string): void
  onError(code: string): void
}

function asRecord(data: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(data)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function runStreamingTurn(
  client: Pick<SessionClient, 'authorizedFetch'>,
  idempotencyKey: string,
  text: string,
  handlers: TurnHandlers,
  signal: AbortSignal,
): Promise<void> {
  const res = await client.authorizedFetch('/widget/v1/conversations/current/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`stream_http:${res.status}`)
  let settled = false
  for await (const ev of parseSSEStream(res.body, signal)) {
    const name = ev.event.toLowerCase()
    const p = asRecord(ev.data)
    if (name === 'accepted') {
      handlers.onAccepted(str(p['turnId']), str(p['userMessageId']))
    } else if (name === 'delta' || name === 'deltas') {
      handlers.onDelta(str(p['turnId']), str(p['delta']))
    } else if (name === 'done') {
      handlers.onDone(str(p['turnId']), str(p['messageId']))
      settled = true
      return
    } else if (name === 'error') {
      handlers.onError(str(p['code']) || 'stream_error')
      settled = true
      return
    }
    // unknown / heartbeat frames ignored
  }
  if (signal.aborted) throw new DOMException('turno cancelado', 'AbortError')
  if (!settled) throw new Error('stream_incomplete') // EOF without DONE|ERROR → drop
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/transport/__tests__/turn.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/turn.ts src/transport/__tests__/turn.test.ts
git commit -m "feat(widget): consumidor del turno del bot (lanza stream_incomplete en EOF sin DONE, propaga AbortError)"
```

---

## Task 7: Sender — optimistic send, cancel, degrade-subsequent (no auto-resend)

**Files:**
- Create: `src/transport/send.ts`
- Test: `src/transport/__tests__/send.test.ts`

**Interfaces:**
- Consumes: `MessageStore` (Tasks 4–5); `runStreamingTurn` (Task 6); `SessionClient.authorizedFetch` (Plan 1).
- Produces:
  ```typescript
  interface SenderDeps {
    client: Pick<SessionClient, 'authorizedFetch'>
    store: MessageStore
    streaming: boolean
    uuid?: () => string
    onConversationStarted?: () => void
  }
  interface Sender {
    send(text: string): Promise<void>
    retry(clientId: string): Promise<void>
    cancel(): void
  }
  function createSender(deps: SenderDeps): Sender
  ```

**Codex #6 policy (exact):**
- `clientId = uuid()` doubles as the `Idempotency-Key`; `retry(clientId)` re-sends with the **same** key (backend dedups) — the only place a message is re-attempted.
- On a **transport** failure of the streaming path (throw that is not `AbortError`): mark **this** message `failed` and flip `useStreaming=false` so **subsequent** sends use non-streaming. **Never** auto-resend the current message on another endpoint (especially after `accepted`).
- `AbortError` (from `cancel()`): never marks failed, never falls back; it finalizes the in-flight bot placeholder (`failBotTurn`) and returns.
- The conversation channel is opened via `onConversationStarted`, called **only** on `accepted` (streaming) or a 2xx (non-streaming) — never at `send()` entry.
- `send()`/`retry()` resolve regardless of delivery outcome; the result is reflected in the store (`pending`/`sent`/`failed`) so the panel reacts to state, not to promise rejection.

- [ ] **Step 1: Write the failing test** — create `src/transport/__tests__/send.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createSender } from '../send'
import { createMessageStore } from '../../store/message-store'

function sse(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status })
}
function openSse(frames: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200 })
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
let n = 0
const uuid = () => `cid_${++n}`

describe('createSender', () => {
  it('streaming send: optimistic pending → acked, bot bubble streamed and finalized', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => sse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"Hola "}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"👋"}\n\n',
      'event: done\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n',
    ]))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('¿Puedo cambiar mi entrada?')
    const msgs = store.getState().messages
    expect(msgs.find((m) => m.role === 'user')).toMatchObject({ id: 'u1', status: 'sent' })
    expect(msgs.find((m) => m.role === 'bot')).toMatchObject({ id: 'm1', text: 'Hola 👋', streaming: false })
    expect(new Headers(authorizedFetch.mock.calls[0]![1]?.headers).get('Idempotency-Key')).toBe('cid_1')
  })

  it('a stream transport failure marks THIS message failed and does NOT auto-resend', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => { throw new Error('network') })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]?.status).toBe('failed')
    expect(authorizedFetch).toHaveBeenCalledTimes(1) // NO second endpoint attempt for this message
  })

  it('after a stream failure, the NEXT send degrades to non-streaming POST /messages', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let call = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      call += 1
      if (call === 1) throw new Error('network')       // first (streaming) send fails
      return json({ turnId: 't2', userMessageId: 'u2', state: 'BOT_ACTIVE' }) // subsequent: non-streaming
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('uno')
    await sender.send('dos')
    expect(store.getState().messages.find((m) => m.clientId === 'cid_2')).toMatchObject({ id: 'u2', status: 'sent' })
    expect(String(authorizedFetch.mock.calls[1]![0])).toBe('/widget/v1/conversations/current/messages')
  })

  it('retry re-sends with the SAME Idempotency-Key', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let call = 0
    const authorizedFetch = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error('network')
      return json({ turnId: 't1', userMessageId: 'u1', state: 'BOT_ACTIVE' })
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]?.status).toBe('failed')
    await sender.retry('cid_1')
    expect(store.getState().messages[0]).toMatchObject({ id: 'u1', status: 'sent' })
    const keys = authorizedFetch.mock.calls.map((c) => new Headers(c[1]?.headers).get('Idempotency-Key'))
    expect(keys.every((k) => k === 'cid_1')).toBe(true)
  })

  it('non-streaming send acks from the body and NEVER sets state from the response', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => json({ turnId: 't1', userMessageId: 'u1', state: 'AGENT_ACTIVE' }))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: false, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]).toMatchObject({ id: 'u1', status: 'sent' })
    expect(store.getState().conversationState).toBeNull() // NOT taken from the response
  })

  it('cancel aborts the stream, POSTs /turns/{id}/cancel, and does NOT fail the message', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const cancels: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.endsWith('/cancel')) { cancels.push(path); return json({ ok: true }, 202) }
      return openSse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n']) // parks after accepted
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    const p = sender.send('Hola')
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'u1')).toBe(true))
    sender.cancel()
    await p
    expect(cancels).toEqual(['/widget/v1/turns/t1/cancel'])
    expect(store.getState().messages.find((m) => m.role === 'user')?.status).toBe('sent') // not failed
  })

  it('opens the conversation channel on accepted, not before', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const started = vi.fn()
    const authorizedFetch = vi.fn(async () => sse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: done\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n',
    ]))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid, onConversationStarted: started })
    const p = sender.send('Hola')
    expect(started).not.toHaveBeenCalled() // not at send() entry
    await p
    expect(started).toHaveBeenCalledTimes(1) // fired on accepted
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/send.test.ts` → FAIL (cannot resolve `../send`).

- [ ] **Step 3: Implement** — create `src/transport/send.ts`:

```typescript
import type { SessionClient } from '../shell/session'
import type { MessageStore } from '../store/message-store'
import { runStreamingTurn, type TurnHandlers } from './turn'

export interface SenderDeps {
  client: Pick<SessionClient, 'authorizedFetch'>
  store: MessageStore
  streaming: boolean
  uuid?: () => string
  onConversationStarted?: () => void
}

export interface Sender {
  send(text: string): Promise<void>
  retry(clientId: string): Promise<void>
  cancel(): void
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
function asRecord(data: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(data)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function createSender(deps: SenderDeps): Sender {
  const uuid = deps.uuid ?? (() => crypto.randomUUID())
  const texts = new Map<string, string>()
  let useStreaming = deps.streaming
  let started = false
  let inFlight: AbortController | null = null
  let currentTurnId: string | null = null

  const markStarted = (): void => {
    if (started) return
    started = true
    deps.onConversationStarted?.()
  }

  const streamOnce = async (clientId: string, text: string): Promise<void> => {
    const ac = new AbortController()
    inFlight = ac
    currentTurnId = null
    let began = false
    const handlers: TurnHandlers = {
      onAccepted: (turnId, userMessageId) => {
        currentTurnId = turnId
        deps.store.ackOptimistic(clientId, userMessageId)
        markStarted() // channel opens once the conversation exists
      },
      onDelta: (turnId, delta) => {
        if (!began) { deps.store.beginBotTurn(turnId); began = true }
        deps.store.appendBotDelta(turnId, delta)
      },
      onDone: (turnId, messageId) => deps.store.finishBotTurn(turnId, messageId),
      onError: (_code) => { if (currentTurnId) deps.store.failBotTurn(currentTurnId) },
    }
    try {
      await runStreamingTurn(deps.client, clientId, text, handlers, ac.signal)
    } catch (err) {
      if (isAbortError(err)) { if (currentTurnId) deps.store.failBotTurn(currentTurnId); return }
      throw err
    } finally {
      if (inFlight === ac) { inFlight = null; currentTurnId = null }
    }
  }

  const sendNonStreaming = async (clientId: string, text: string): Promise<void> => {
    const res = await deps.client.authorizedFetch('/widget/v1/conversations/current/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientId },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`send_http:${res.status}`)
    const body = asRecord(await res.text())
    const userMessageId = typeof body['userMessageId'] === 'string' ? body['userMessageId'] : clientId
    deps.store.ackOptimistic(clientId, userMessageId)
    markStarted()
    // state + bot reply arrive via the events channel — never inferred from the response.
  }

  const deliver = async (clientId: string, text: string): Promise<void> => {
    try {
      if (useStreaming) await streamOnce(clientId, text)
      else await sendNonStreaming(clientId, text)
    } catch (err) {
      if (isAbortError(err)) return // cancel: never fail, never fall back
      if (useStreaming) useStreaming = false // degrade SUBSEQUENT sends (not this one)
      deps.store.failOptimistic(clientId)
    }
  }

  return {
    async send(text: string): Promise<void> {
      const clientId = uuid()
      texts.set(clientId, text)
      deps.store.addOptimistic(clientId, text)
      await deliver(clientId, text)
    },
    async retry(clientId: string): Promise<void> {
      const text = texts.get(clientId)
      if (text === undefined) return
      deps.store.retryOptimistic(clientId)
      await deliver(clientId, text)
    },
    cancel(): void {
      const turnId = currentTurnId
      inFlight?.abort()
      if (turnId) void deps.client.authorizedFetch(`/widget/v1/turns/${turnId}/cancel`, { method: 'POST' })
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/transport/__tests__/send.test.ts` → PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/send.ts src/transport/__tests__/send.test.ts
git commit -m "feat(widget): sender — idempotencia, sin reenvío automático del mensaje actual, degradación de posteriores, cancel sin fallback"
```

---

## Task 8: Backoff (capped exponential + jitter)

**Files:**
- Create: `src/transport/backoff.ts`
- Test: `src/transport/__tests__/backoff.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface BackoffOptions { baseMs?: number; maxMs?: number; factor?: number; jitter?: number; rng?: () => number }
  interface Backoff { nextDelay(): number; reset(): void }
  function createBackoff(opts?: BackoffOptions): Backoff
  ```
- **Note (Codex #4):** there is no separate circuit-breaker object. The breaker behavior is realized by the cap (`maxMs`) + jitter here plus the polling fallback in Task 9.

- [ ] **Step 1: Write the failing test** — create `src/transport/__tests__/backoff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createBackoff } from '../backoff'

describe('createBackoff', () => {
  it('grows exponentially and caps at maxMs (jitter disabled)', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 800, jitter: 0 })
    expect(b.nextDelay()).toBe(100)
    expect(b.nextDelay()).toBe(200)
    expect(b.nextDelay()).toBe(400)
    expect(b.nextDelay()).toBe(800)
    expect(b.nextDelay()).toBe(800) // capped
  })
  it('applies bounded jitter using the injected rng', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 10000, jitter: 0.5, rng: () => 1 })
    expect(b.nextDelay()).toBe(150) // 100 * (1 + 0.5*1)
  })
  it('reset returns to the first delay', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 800, jitter: 0 })
    b.nextDelay(); b.nextDelay()
    b.reset()
    expect(b.nextDelay()).toBe(100)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/backoff.test.ts` → FAIL (cannot resolve `../backoff`).

- [ ] **Step 3: Implement** — create `src/transport/backoff.ts`:

```typescript
export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  factor?: number
  jitter?: number // fraction of the base delay added, one-sided (0.5 = up to +50%)
  rng?: () => number
}

export interface Backoff {
  nextDelay(): number
  reset(): void
}

export function createBackoff(opts: BackoffOptions = {}): Backoff {
  const baseMs = opts.baseMs ?? 500
  const maxMs = opts.maxMs ?? 15000
  const factor = opts.factor ?? 2
  const jitter = opts.jitter ?? 0.3
  const rng = opts.rng ?? Math.random
  let attempt = 0

  return {
    nextDelay(): number {
      const raw = Math.min(maxMs, baseMs * Math.pow(factor, attempt))
      attempt += 1
      return Math.round(Math.min(maxMs, raw + raw * jitter * rng()))
    },
    reset(): void { attempt = 0 },
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/transport/__tests__/backoff.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/backoff.ts src/transport/__tests__/backoff.test.ts
git commit -m "feat(widget): backoff exponencial con tope y jitter"
```

---

## Task 9: Events channel — generation-serialized loop (reconcile, dedup, reconnect, polling, offline, lifecycle)

**Files:**
- Create: `src/transport/events-channel.ts`
- Test: `src/transport/__tests__/events-channel.test.ts`

**Interfaces:**
- Consumes: `MessageStore` (Tasks 4–5); `parseSSEStream` (Task 3); `createBackoff`/`Backoff` (Task 8); `SessionClient.authorizedFetch` (Plan 1); `WidgetEvent`, `MessagesSnapshot`, `EventsPollResponse` (Task 1).
- Produces:
  ```typescript
  interface Scheduler { setTimeout(fn: () => void, ms: number): number; clearTimeout(id: number): void }
  interface EventsChannelDeps {
    client: Pick<SessionClient, 'authorizedFetch'>
    store: MessageStore
    scheduler?: Scheduler
    backoff?: Backoff
    pollIntervalMs?: number
    reconnectDelayMs?: number
    isOnline?: () => boolean
  }
  interface EventsChannel { open(): void; close(): void; suspend(): void; resume(): void; isActive(): boolean }
  function createEventsChannel(deps: EventsChannelDeps): EventsChannel
  ```

**Design (addresses Codex #2/#3/#4/#7):**
- **One chained loop** `runChannel(gen)`. `launch()` guarantees at most one loop: if a loop is running and current it's a no-op; if a stale loop (post-suspend) is still unwinding, the restart is **deferred to its `finally`** — so `suspend()` then `resume()` never runs two reconciliations at once (Codex #7/D). `open/close/suspend/resume` bump `generation`; every async continuation checks `isCurrent(gen)` before touching the store, and `stopCurrent()` aborts the run's shared `AbortController` (snapshot + poll + stream) so nothing stale applies after a close/suspend.
- Each iteration: `reconcile` (snapshot → `applySnapshot`, or `replaceSnapshot` after a 409) → `connect` (parks on the live `/events` stream). On a clean close pause `reconnectDelayMs`, then reconcile again.
- **Failures reset only on progress:** `connect` resets **both** `backoff` **and** the closure-level `consecutiveFailures` on the **first frame** (heartbeat counts, Codex #4/C). A 200 that opens then drops with zero frames counts as a failure — 2 such drops reach the poll fallback.
- **Fallback:** ≥2 consecutive failures → `connection='polling'`, one `pollOnce` (applies `/events/poll` durables **and** advances the cursor from `body.cursor` even with zero events), wait `pollIntervalMs`, then the loop retries `connect` — a working stream returns to `live`. A 409 on connect **or poll** resets `failures` and triggers a hard `replaceSnapshot`.
- **Offline:** loop top checks `isOnline()` → `connection='offline'` and exits; `suspend()` while offline also sets `offline`. `resume()` (online again) launches one fresh loop.

- [ ] **Step 1: Write the core failing tests** — create `src/transport/__tests__/events-channel.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createEventsChannel, type Scheduler } from '../events-channel'
import { createBackoff } from '../backoff'
import { createMessageStore } from '../../store/message-store'
import type { MessagesSnapshot } from '../../contract/types'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sseOpen(frames: string[]): Response { // emits frames, stays open → connect parks live
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
function sseFail(): Response { return new Response(null, { status: 503 }) }
const immediate = (): Scheduler => ({ setTimeout: (fn) => { queueMicrotask(fn); return 0 }, clearTimeout: () => {} })
const fastBackoff = () => createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 })

const SNAP: MessagesSnapshot = {
  messages: [{ messageId: 'm1', role: 'bot', text: 'Hola', createdAt: '2026-07-17T14:00:00Z' }],
  state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_1',
}
function ev(seq: number, id: string, text: string): string {
  return `event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_${seq}","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:0${seq}:00Z","type":"message.created","payload":{"messageId":"${id}","role":"bot","text":"${text}"}}\n\n`
}

describe('events channel — core', () => {
  it('open: snapshot then tail events with ?after=snapshotCursor, dedup overlap, cursor advances', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const calls: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      calls.push(path)
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseOpen([
        ev(1, 'm1', 'Hola'), // overlaps the snapshot → deduped
        ev(2, 'm2', 'Quiero cambiarla'),
        'event: conversation.state_changed\ndata: {"eventId":"evt_v1_conv_demo_01_3","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:06:00Z","type":"conversation.state_changed","payload":{"state":"ESCALATED_WAITING"}}\n\n',
      ])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().conversationState).toBe('ESCALATED_WAITING'))
    expect(store.getState().messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_3')
    expect(calls[0]).toContain('/widget/v1/conversations/current/messages')
    expect(calls[1]).toContain('/widget/v1/events?after=evt_v1_conv_demo_01_1')
    ch.close()
  })

  it('routes agent.typing (ephemeral) without moving the cursor', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseOpen(['event: agent.typing\ndata: {"isTyping":true}\n\n'])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff() })
    ch.open()
    await vi.waitFor(() => expect(store.getState().agentTyping).toBe(true))
    expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_1')
    ch.close()
  })

  it('a 409 hard-resets via replaceSnapshot and reconnects', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let eventsCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      eventsCall += 1
      if (eventsCall === 1) return jsonRes({ code: 'CURSOR_RESET_REQUIRED' }, 409)
      return sseOpen([ev(2, 'm2', 'reanudado')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    const snapshots = authorizedFetch.mock.calls.filter((c) => String(c[0]).includes('/messages')).length
    expect(snapshots).toBe(2) // re-snapshotted after the 409
    ch.close()
  })

  it('open is idempotent and close stops the loop', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let snapshots = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) { snapshots += 1; return jsonRes(SNAP) }
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff() })
    ch.open(); ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    expect(snapshots).toBe(1)
    ch.close()
    expect(store.getState().connection).toBe('idle')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/events-channel.test.ts` → FAIL (cannot resolve `../events-channel`).

- [ ] **Step 3: Implement** — create `src/transport/events-channel.ts`:

```typescript
import type { SessionClient } from '../shell/session'
import type { MessageStore } from '../store/message-store'
import type { WidgetEvent, MessagesSnapshot, EventsPollResponse } from '../contract/types'
import { parseSSEStream } from './sse'
import { createBackoff, type Backoff } from './backoff'

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number): void
}

export interface EventsChannelDeps {
  client: Pick<SessionClient, 'authorizedFetch'>
  store: MessageStore
  scheduler?: Scheduler
  backoff?: Backoff
  pollIntervalMs?: number
  reconnectDelayMs?: number
  isOnline?: () => boolean
}

export interface EventsChannel {
  open(): void
  close(): void
  suspend(): void
  resume(): void
  isActive(): boolean
}

const DURABLE_TYPES = new Set(['message.created', 'conversation.state_changed', 'agent.joined'])

class CursorResetError extends Error {}

function parseDurable(data: string): WidgetEvent | null {
  try {
    const v: unknown = JSON.parse(data)
    if (typeof v !== 'object' || v === null) return null
    const type = (v as { type?: unknown }).type
    if (typeof type !== 'string' || !DURABLE_TYPES.has(type)) return null
    return v as WidgetEvent
  } catch {
    return null
  }
}

export function createEventsChannel(deps: EventsChannelDeps): EventsChannel {
  const scheduler: Scheduler = deps.scheduler ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  }
  const backoff = deps.backoff ?? createBackoff()
  const pollIntervalMs = deps.pollIntervalMs ?? 3000
  const reconnectDelayMs = deps.reconnectDelayMs ?? 500
  const isOnline = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true)

  let active = false
  let suspended = false
  let generation = 0
  let consecutiveFailures = 0
  let runAc: AbortController | null = null   // one AbortController per loop run (snapshot+poll+stream)
  let timer: number | null = null
  let pendingDelay: (() => void) | null = null
  let loopPromise: Promise<void> | null = null
  let loopGen = 0                            // generation of the loop currently running (0 = none)
  let restartRequested = false

  const isCurrent = (gen: number): boolean => active && !suspended && gen === generation
  const cancelDelay = (): void => {
    if (timer !== null) { scheduler.clearTimeout(timer); timer = null }
    if (pendingDelay) { const r = pendingDelay; pendingDelay = null; r() } // let an awaiting loop unwind
  }
  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      pendingDelay = resolve
      timer = scheduler.setTimeout(() => { timer = null; pendingDelay = null; resolve() }, ms)
    })

  const routeFrame = (event: string, data: string): void => {
    if (DURABLE_TYPES.has(event)) {
      const parsed = parseDurable(data)
      if (parsed) deps.store.applyDurableEvent(parsed)
    } else if (event === 'agent.typing') {
      try { deps.store.setAgentTyping((JSON.parse(data) as { isTyping?: unknown }).isTyping === true) }
      catch { /* ignore malformed ephemeral */ }
    }
    // presence / heartbeat: ignored (heartbeat still counts as progress in connect())
  }

  const snapshot = async (gen: number, signal: AbortSignal): Promise<MessagesSnapshot | null> => {
    const res = await deps.client.authorizedFetch('/widget/v1/conversations/current/messages?limit=50', { signal })
    if (!isCurrent(gen)) return null
    if (res.status === 409) throw new CursorResetError('snapshot_cursor_reset')
    if (!res.ok) throw new Error(`snapshot_http:${res.status}`)
    return (await res.json()) as MessagesSnapshot
  }

  // Parks on the live stream. Returns when the server closes it cleanly WITH
  // progress; throws on transport error or a 0-frame close; throws
  // CursorResetError on a 409. On the FIRST frame it resets BOTH the backoff and
  // the failure counter (Codex #4) — a stream that opens then drops without a
  // single frame still counts as a failure, so 2 such drops reach the fallback.
  const connect = async (gen: number, signal: AbortSignal): Promise<void> => {
    const after = deps.store.getState().cursor ?? ''
    const res = await deps.client.authorizedFetch(`/widget/v1/events?after=${encodeURIComponent(after)}`, { signal })
    if (!isCurrent(gen)) return
    if (res.status === 409) throw new CursorResetError('events_cursor_reset')
    if (!res.ok || !res.body) throw new Error(`events_http:${res.status}`)
    deps.store.setConnection('live')
    let progressed = false
    for await (const frame of parseSSEStream(res.body, signal)) {
      if (!isCurrent(gen)) return
      if (!progressed) { progressed = true; consecutiveFailures = 0; backoff.reset() }
      routeFrame(frame.event, frame.data)
    }
    if (!isCurrent(gen)) return
    if (!progressed) throw new Error('events_closed_no_progress')
  }

  const pollOnce = async (gen: number, signal: AbortSignal): Promise<void> => {
    const after = deps.store.getState().cursor ?? ''
    const res = await deps.client.authorizedFetch(`/widget/v1/events/poll?after=${encodeURIComponent(after)}`, { signal })
    if (!isCurrent(gen)) return
    if (res.status === 409) throw new CursorResetError('poll_cursor_reset')
    if (!res.ok) throw new Error(`poll_http:${res.status}`)
    const body = (await res.json()) as EventsPollResponse
    if (!isCurrent(gen)) return
    for (const e of body.events) deps.store.applyDurableEvent(e)
    if (body.cursor !== null) deps.store.advanceCursorTo(body.cursor) // advance even with 0 events
  }

  const reconcile = async (gen: number, hard: boolean, signal: AbortSignal): Promise<void> => {
    const snap = await snapshot(gen, signal)
    if (snap === null || !isCurrent(gen)) return
    if (hard) deps.store.replaceSnapshot(snap)
    else deps.store.applySnapshot(snap)
  }

  const runChannel = async (gen: number): Promise<void> => {
    const ac = new AbortController()
    runAc = ac
    consecutiveFailures = 0
    let hard = false
    try {
      while (isCurrent(gen)) {
        if (!isOnline()) { deps.store.setConnection('offline'); return }
        try {
          await reconcile(gen, hard, ac.signal)
          hard = false
          if (!isCurrent(gen)) return
          await connect(gen, ac.signal)  // parks while live
          if (!isCurrent(gen)) return
          await delay(reconnectDelayMs)  // clean close → brief pause, then reconcile
        } catch (err) {
          if (!isCurrent(gen)) return
          if (err instanceof CursorResetError) { hard = true; consecutiveFailures = 0; continue }
          consecutiveFailures += 1
          if (consecutiveFailures >= 2) {
            deps.store.setConnection('polling')
            try {
              await pollOnce(gen, ac.signal)
            } catch (e) {
              if (e instanceof CursorResetError) { hard = true; consecutiveFailures = 0; continue } // 409 from poll → hard reconcile
              if (!isCurrent(gen)) return
              // other poll error: stay in polling and retry next tick
            }
            if (!isCurrent(gen)) return
            await delay(pollIntervalMs)
          } else {
            deps.store.setConnection('reconnecting')
            await delay(backoff.nextDelay())
          }
        }
      }
    } finally {
      if (runAc === ac) runAc = null
    }
  }

  // At most ONE loop runs at a time. A launch requested while a loop is still
  // unwinding is deferred to that loop's `finally` (Codex #7) — so a suspend()
  // immediately followed by resume() never yields two concurrent reconciliations.
  // A launch while a CURRENT loop is live is a no-op (nothing to restart).
  const launch = (): void => {
    if (loopPromise && loopGen === generation) return // a live/current loop is already running
    if (loopPromise) { restartRequested = true; return } // a stale loop is unwinding → chain
    restartRequested = false
    generation += 1
    loopGen = generation
    const gen = generation
    loopPromise = runChannel(gen).finally(() => {
      loopPromise = null
      loopGen = 0
      if (restartRequested && active && !suspended) { restartRequested = false; launch() }
    })
  }

  const stopCurrent = (): void => {
    generation += 1        // invalidate the running loop's gen (isCurrent → false)
    runAc?.abort()         // abort in-flight snapshot / poll / stream so it unwinds now
    runAc = null
    cancelDelay()          // release any pending backoff/poll delay
  }

  return {
    open(): void {
      if (active) return
      active = true
      suspended = false
      restartRequested = false
      backoff.reset()
      launch()
    },
    close(): void {
      active = false
      suspended = false
      restartRequested = false
      stopCurrent()
      deps.store.setConnection('idle')
    },
    suspend(): void {
      if (!active) return
      suspended = true
      stopCurrent()
      if (!isOnline()) deps.store.setConnection('offline')
    },
    resume(): void {
      if (!active) return
      suspended = false
      launch()
    },
    isActive(): boolean { return active },
  }
}
```

- [ ] **Step 4: Run the core tests** — `npx vitest run src/transport/__tests__/events-channel.test.ts` → PASS (4 cases).

- [ ] **Step 5: Add the resilience + lifecycle tests** — append to the same test file:

```typescript
function durableEvent(seq: number, id: string, text: string) {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1 as const, conversationId: 'conv_demo_01',
    occurredAt: `2026-07-17T14:0${seq}:00Z`, type: 'message.created' as const,
    payload: { messageId: id, role: 'bot' as const, text },
  }
}
const EMPTY: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_0' }
function sseThenError(frames: string[]): Response { // emits frames, then errors the body (a real drop)
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.error(new Error('drop')) } })
  return new Response(body, { status: 200 })
}

describe('events channel — resilience & lifecycle', () => {
  it('falls back to polling after 2 consecutive stream failures and applies polled durables', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) return jsonRes({ events: [durableEvent(2, 'mp', 'desde-poll')], cursor: 'evt_v1_conv_demo_01_2' })
      if (path.includes('/events?')) { streamAttempts += 1; return sseFail() }
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('polling'))
    expect(streamAttempts).toBeGreaterThanOrEqual(2)
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mp')).toBe(true))
    ch.close()
  })

  it('recovers to live: after polling, a working stream returns the channel to live', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) return jsonRes({ events: [], cursor: null })
      if (path.includes('/events?')) {
        streamAttempts += 1
        if (streamAttempts <= 2) return sseFail()
        return sseOpen([ev(3, 'mlive', 'en-vivo')]) // stays open → parks live
      }
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mlive')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    ch.close()
  })

  it('offline sets connection=offline and stops; resume re-reconciles when online', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let online = false
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      return sseOpen([ev(2, 'm2', 'hola')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), isOnline: () => online, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('offline'))
    online = true
    ch.resume()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    ch.close()
  })

  it('suspend keeps the cursor; resume reconnects from it', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const afters: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      const m = /after=([^&]*)/.exec(path)
      if (m) afters.push(decodeURIComponent(m[1]!))
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_2'))
    ch.suspend()
    ch.resume()
    await vi.waitFor(() => expect(afters.length).toBeGreaterThanOrEqual(2))
    expect(afters.at(-1)).toBe('evt_v1_conv_demo_01_2') // reconnected from the retained cursor
    ch.close()
  })

  it('grouped resume() calls while live do not start concurrent reconciliations', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let snapshots = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) { snapshots += 1; return jsonRes(EMPTY) }
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    const before = snapshots
    ch.resume(); ch.resume(); ch.resume() // loop already running (live) → all no-ops
    await new Promise((r) => queueMicrotask(() => r(null)))
    expect(snapshots).toBe(before)
    ch.close()
  })

  it('a stream that delivers a frame then errors resets failures (never falls to polling)', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let polled = false
    let streamN = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) { polled = true; return jsonRes({ events: [], cursor: null }) }
      streamN += 1
      return sseThenError([ev(streamN + 1, `m${streamN}`, `t${streamN}`)]) // one frame, then drop
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.length).toBeGreaterThanOrEqual(3))
    expect(polled).toBe(false) // each stream progresses (resets failures) → never reaches 2
    ch.close()
  })

  it('pollOnce advances the cursor from body.cursor even with no events', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) return jsonRes({ events: [], cursor: 'evt_v1_conv_demo_01_7' })
      if (path.includes('/events?')) return sseFail() // force into polling
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_7'))
    ch.close()
  })

  it('a 409 from polling resets failures and hard-reconciles, then recovers to live', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamCall = 0
    let pollCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) { pollCall += 1; return jsonRes({ code: 'CURSOR_RESET_REQUIRED' }, 409) }
      streamCall += 1
      if (streamCall <= 2) return sseFail()          // two failures → polling
      return sseOpen([ev(2, 'mok', 'recuperado')])   // after the 409-driven hard reconcile
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mok')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    expect(pollCall).toBeGreaterThanOrEqual(1)
    ch.close()
  })
})
```

- [ ] **Step 6: Run the whole channel suite + typecheck** — `npx vitest run src/transport/__tests__/events-channel.test.ts && npm run typecheck` → PASS (12 cases), no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/transport/events-channel.ts src/transport/__tests__/events-channel.test.ts
git commit -m "feat(widget): canal de eventos — bucle único serializado por generación (reconciliación, dedup, 409 hard reset, reconexión, polling, offline, suspend/resume)"
```

---

## Task 10: Page lifecycle binding

**Files:**
- Create: `src/shell/lifecycle.ts`
- Test: `src/shell/__tests__/lifecycle.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface LifecycleHandlers { onSuspend(): void; onResume(): void }
  function bindPageLifecycle(target: Window, handlers: LifecycleHandlers): () => void // returns unbind
  ```
- Behavior: `freeze` + `offline` + `visibilitychange→hidden` → `onSuspend`; `resume` + `pageshow` + `online` + `visibilitychange→visible` → `onResume`. Nothing depends on `unload` (spec §9). Idempotency of resume and offline's `connection` update are the channel's responsibility (Task 9); `bindPageLifecycle` just translates DOM events. The returned function removes every listener.

- [ ] **Step 1: Write the failing test** — create `src/shell/__tests__/lifecycle.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { bindPageLifecycle } from '../lifecycle'

describe('bindPageLifecycle', () => {
  it('maps freeze/offline/hidden → onSuspend and resume/pageshow/online/visible → onResume', () => {
    const onSuspend = vi.fn()
    const onResume = vi.fn()
    const unbind = bindPageLifecycle(window, { onSuspend, onResume })

    window.dispatchEvent(new Event('freeze'))
    window.dispatchEvent(new Event('offline'))
    expect(onSuspend).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('resume'))
    window.dispatchEvent(new Event('pageshow'))
    window.dispatchEvent(new Event('online'))
    expect(onResume).toHaveBeenCalledTimes(3)

    unbind()
    window.dispatchEvent(new Event('freeze'))
    window.dispatchEvent(new Event('online'))
    expect(onSuspend).toHaveBeenCalledTimes(2)
    expect(onResume).toHaveBeenCalledTimes(3)
  })

  it('uses document.visibilityState for visibilitychange', () => {
    const onSuspend = vi.fn()
    const onResume = vi.fn()
    const unbind = bindPageLifecycle(window, { onSuspend, onResume })
    const spy = vi.spyOn(document, 'visibilityState', 'get')

    spy.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onSuspend).toHaveBeenCalledTimes(1)

    spy.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onResume).toHaveBeenCalledTimes(1)

    spy.mockRestore()
    unbind()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/shell/__tests__/lifecycle.test.ts` → FAIL (cannot resolve `../lifecycle`).

- [ ] **Step 3: Implement** — create `src/shell/lifecycle.ts`:

```typescript
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

  target.addEventListener('freeze', suspend)
  target.addEventListener('offline', suspend)
  target.addEventListener('resume', resume)
  target.addEventListener('pageshow', resume)
  target.addEventListener('online', resume)
  doc.addEventListener('visibilitychange', onVisibility)

  return () => {
    target.removeEventListener('freeze', suspend)
    target.removeEventListener('offline', suspend)
    target.removeEventListener('resume', resume)
    target.removeEventListener('pageshow', resume)
    target.removeEventListener('online', resume)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/shell/__tests__/lifecycle.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/shell/lifecycle.ts src/shell/__tests__/lifecycle.test.ts
git commit -m "feat(widget): binding de ciclo de vida de página (freeze/resume/online/visibilidad → suspend/resume)"
```

---

## Task 11: Transport facade + end-to-end integration

**Files:**
- Create: `src/transport/index.ts`
- Test: `src/transport/__tests__/transport.test.ts`

**Interfaces:**
- Consumes: `createMessageStore` (4–5), `createSender` (7), `createEventsChannel`/`Scheduler` (9), `bindPageLifecycle` (10), `Backoff` (8), `SessionClient` (Plan 1).
- Produces:
  ```typescript
  interface TransportOptions {
    window?: Window; scheduler?: Scheduler; backoff?: Backoff
    pollIntervalMs?: number; reconnectDelayMs?: number; uuid?: () => string; now?: () => string
  }
  interface Transport {
    store: MessageStore
    send(text: string): Promise<void>
    retry(clientId: string): Promise<void>
    cancel(): void
    openChannel(): void
    closeChannel(): void
    destroy(): void
  }
  function createTransport(client: SessionClient, opts?: TransportOptions): Transport
  ```
- Wiring: streaming is always attempted first (the sender degrades per Task 7). The sender's `onConversationStarted` → `channel.open()` (channel opens once the server accepts the first message — Codex #6). `bindPageLifecycle` maps to `channel.suspend`/`channel.resume`. `destroy()` unbinds lifecycle and closes the channel. All optional deps are passed with conditional spreads to satisfy `exactOptionalPropertyTypes`.

- [ ] **Step 1: Write the failing test** — create `src/transport/__tests__/transport.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createTransport } from '../index'
import { createBackoff } from '../backoff'
import type { Scheduler } from '../events-channel'
import type { SessionClient } from '../../shell/session'
import { fixtureConfig } from '../../contract/fixtures'
import type { MessagesSnapshot } from '../../contract/types'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sse(frames: string[]): Response { // closes after frames
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status: 200 })
}
function sseOpen(frames: string[]): Response { // parks open
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200 })
}
function sseErr(frames: string[]): Response { // emits frames, then a REAL error (network drop mid-stream)
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.error(new Error('drop')) } })
  return new Response(body, { status: 200 })
}
const immediate: Scheduler = { setTimeout: (fn) => { queueMicrotask(fn); return 0 }, clearTimeout: () => {} }
const EMPTY: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_0' }
function botEvt(seq: number, id: string, text: string): string {
  return `event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_${seq}","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:0${seq}:00Z","type":"message.created","payload":{"messageId":"${id}","role":"bot","text":"${text}"}}\n\n`
}
function fakeClient(authorizedFetch: SessionClient['authorizedFetch']): SessionClient {
  return { getConfig: () => fixtureConfig(), authorizedFetch, destroy: vi.fn() }
}
let n = 0
const uuid = () => `cid_${++n}`
const opts = () => ({ scheduler: immediate, backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }), reconnectDelayMs: 1, uuid, now: () => '2026-07-17T15:00:00Z' })

describe('createTransport (integration)', () => {
  it('send → optimistic → streamed reply; the durable replay dedups against the streamed bubble; channel opened on accepted', async () => {
    n = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)  // snapshot
      if (path.includes('/stream')) return sse([
        'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
        'event: delta\ndata: {"turnId":"t1","delta":"Sí 🙌"}\n\n',
        'event: done\ndata: {"turnId":"t1","messageId":"mbot","eventId":"evt_v1_conv_demo_01_5"}\n\n',
      ])
      if (path.includes('/events?')) return sseOpen([botEvt(5, 'mbot', 'Sí 🙌')]) // durable replay of the bot msg
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    await t.send('¿Puedo cambiar mi entrada?')
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'mbot')).toBe(true))
    expect(t.store.getState().messages.filter((m) => m.role === 'bot')).toHaveLength(1) // no duplicate
    expect(t.store.getState().messages.find((m) => m.role === 'user')).toMatchObject({ id: 'u1', status: 'sent' })
    t.destroy()
  })

  it('a server state_changed on the channel drives the client state machine', async () => {
    n = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events?')) return sseOpen([
        'event: conversation.state_changed\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:06:00Z","type":"conversation.state_changed","payload":{"state":"AGENT_ACTIVE"}}\n\n',
        'event: agent.joined\ndata: {"eventId":"evt_v1_conv_demo_01_3","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:07:00Z","type":"agent.joined","payload":{"agentName":"Laura","agentAvatarUrl":null}}\n\n',
      ])
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    t.openChannel()
    await vi.waitFor(() => expect(t.store.getState().conversationState).toBe('AGENT_ACTIVE'))
    expect(t.store.getState().agentName).toBe('Laura')
    t.destroy()
  })

  it('a stream that ERRORS after delivering an event reconciles and dedups the overlap (gap-free)', async () => {
    n = 0
    let eventsCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) {
        // after the drop, the re-snapshot returns m2 (overlap) + the missed m3
        return jsonRes(eventsCall >= 1
          ? { messages: [{ messageId: 'm2', role: 'bot', text: 'primero', createdAt: '2026-07-17T14:02:00Z' }, { messageId: 'm3', role: 'bot', text: 'segundo', createdAt: '2026-07-17T14:03:00Z' }], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_3' }
          : EMPTY)
      }
      if (path.includes('/events?')) {
        eventsCall += 1
        if (eventsCall === 1) return sseErr([botEvt(2, 'm2', 'primero')]) // delivers m2, then a real error drop
        return sseOpen([]) // subsequent stream parks quietly
      }
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    t.openChannel()
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'm3')).toBe(true))
    expect(t.store.getState().messages.filter((m) => m.id === 'm2')).toHaveLength(1) // overlap deduped
    t.destroy()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/transport/__tests__/transport.test.ts` → FAIL (cannot resolve `../index`).

- [ ] **Step 3: Implement** — create `src/transport/index.ts`:

```typescript
import type { SessionClient } from '../shell/session'
import { createMessageStore, type MessageStore } from '../store/message-store'
import { createSender } from './send'
import { createEventsChannel, type Scheduler } from './events-channel'
import { bindPageLifecycle } from '../shell/lifecycle'
import type { Backoff } from './backoff'

export interface TransportOptions {
  window?: Window
  scheduler?: Scheduler
  backoff?: Backoff
  pollIntervalMs?: number
  reconnectDelayMs?: number
  uuid?: () => string
  now?: () => string
}

export interface Transport {
  store: MessageStore
  send(text: string): Promise<void>
  retry(clientId: string): Promise<void>
  cancel(): void
  openChannel(): void
  closeChannel(): void
  destroy(): void
}

export function createTransport(client: SessionClient, opts: TransportOptions = {}): Transport {
  const store = opts.now ? createMessageStore(opts.now) : createMessageStore()

  const channel = createEventsChannel({
    client,
    store,
    ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
    ...(opts.backoff ? { backoff: opts.backoff } : {}),
    ...(opts.pollIntervalMs !== undefined ? { pollIntervalMs: opts.pollIntervalMs } : {}),
    ...(opts.reconnectDelayMs !== undefined ? { reconnectDelayMs: opts.reconnectDelayMs } : {}),
  })

  const sender = createSender({
    client,
    store,
    streaming: true, // always attempt streaming; the sender degrades on transport failure (Task 7)
    ...(opts.uuid ? { uuid: opts.uuid } : {}),
    onConversationStarted: () => channel.open(), // open once the server accepts the first message
  })

  const win = opts.window ?? (typeof window !== 'undefined' ? window : undefined)
  const unbindLifecycle = win
    ? bindPageLifecycle(win, { onSuspend: () => channel.suspend(), onResume: () => channel.resume() })
    : () => {}

  return {
    store,
    send: (text) => sender.send(text),
    retry: (clientId) => sender.retry(clientId),
    cancel: () => sender.cancel(),
    openChannel: () => channel.open(),
    closeChannel: () => channel.close(),
    destroy: () => { unbindLifecycle(); channel.close() },
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/transport/__tests__/transport.test.ts` → PASS (3 integration cases).

- [ ] **Step 5: Run the FULL widget suite + typecheck** — `npx vitest run && npm run typecheck` → every test (Plan 1 + Plan 2) green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/transport/index.ts src/transport/__tests__/transport.test.ts
git commit -m "feat(widget): fachada de transporte (store + sender + canal + ciclo de vida) e integración e2e"
```

---

## Self-Review

**1. Spec coverage (widget §4.2/4.3/5/9 + backend §4.2/4.3):**

| Requirement | Task |
|---|---|
| Immutable observable store, single source of truth | 4, 5 |
| Dedup by messageId/eventId; order by seq | 2, 4 |
| Server-only state, null until first snapshot/event, no revert on old replay | 4 |
| Optimistic send + Idempotency-Key; pending/sent/failed + retry (same key) | 5, 7 |
| Bot turn SSE accepted→delta→DONE\|ERROR; throw on incomplete drop | 3, 6 |
| Cancel = AbortController + POST /turns/{id}/cancel, no fallback | 6, 7 |
| Inbound durable channel GET /events?after=cursor (fetch SSE); agent.typing | 9 |
| Reconnect jittered/capped backoff; breaker realized via cap+jitter+poll | 8, 9 |
| Channel opens only when conversation active (on accepted/2xx) | 7, 11 |
| Reconciliation snapshot(head-first)→events?after=cursor; no gaps | 9, 11 |
| Fallback: 2 consecutive stream failures → poll /events/poll | 9 |
| `finishBotTurn` never advances the cursor (skip-prevention) | 5 |
| Cursor 409 → hard replaceSnapshot | 4, 9 |
| Generation-serialized reconciliations; no stale apply after close/suspend | 9 |
| Page lifecycle freeze/resume/pageshow/online/visibilitychange | 10, 11 |
| Reuse authorizedFetch; reuse/extend WidgetEvent types | all; 1 |
| SSE partial chunks; abort unblocks blocked read; decoder flush; CRLF; heartbeat | 3 |

Deferred (out of scope, declared): visual panel/10 states (Plan 3); theming; rich content/upload/feedback (Plan 4); i18n (Plan 4); bootstrap/session (Plan 1). Ephemeral `presence` parsed-but-ignored (forward-compat); heartbeat absorbed by the SSE layer but still counts as connection liveness in `connect()`.

**2. Codex rev.1 blockers — each closed:** (1) Task 6 throws `stream_incomplete`; Task 3 abort-unblock + decoder flush. (2) Task 5 `finishBotTurn` no-cursor; Task 4 `replaceSnapshot`; Task 9 generation guard. (3) Task 4 seq-guarded state/agent + immutable; Task 5 both race orders. (4) Task 9 progress-only failure reset + single loop + poll cursor; Task 8 breaker removed. (5) Task 4 `ConversationState | null`. (6) Task 7 no auto-resend, degrade-subsequent, `AbortError` no-fallback, open-on-accepted. (7) Task 9 chained single-loop + offline connection; every channel test `close()`s.

**2b. Codex rev.2 blockers — each closed:** (A) Task 4 `getState` deep-freezes array + every message; `applySnapshot`/`replaceSnapshot` mutate then `notify()` once (atomic). (B) Task 4 `replaceSnapshot` resets agent identity **and** `lastAgentSeq=-1` so a valid lower-seq `agent.joined` re-applies (test added). (C) Task 9 `consecutiveFailures` hoisted + zeroed on first frame (test: frame-then-error never polls); `pollOnce` applies `body.cursor` monotonically via `advanceCursorTo` (test with 0 events); 409-from-poll resets failures + hard-reconciles (test). (D) Task 9 chained `launch()` + shared per-run `AbortController` (no concurrent reconciliation after suspend→resume); Task 11 drop test uses `controller.error(...)`, not a clean `close()`.

**3. Placeholder scan:** no `TODO`/`TBD`/"add error handling"/"similar to Task N". Every code step ships complete code; every test step ships real assertions.

**4. Type/signature consistency:**
- `finishBotTurn(turnId, messageId)` — 2 args everywhere (store Task 4/5, `onDone` Task 6, sender Task 7).
- `TurnHandlers.onDone(turnId, messageId)` matches the sender's handler and the store call.
- `MessageStore` surface (Task 4 + Task 5 additions, incl. `advanceCursorTo`) — every consumer (7, 9, 11) calls only declared methods; `StoreState.conversationState` is `ConversationState | null` and consumers treat null.
- `EventsChannelDeps`/`Scheduler`/`Backoff` consistent across Tasks 9 and 11; `createBackoff` signature (Task 8, no breaker) matches all callers. Task 9's `snapshot`/`connect`/`pollOnce` all take `(gen, signal)` and share the run's single `AbortController`.
- `WidgetEvent` shape constructed identically in every fixture/test; `parseDurable` narrows on `type`.
- Facade passes optional deps via conditional spreads (`exactOptionalPropertyTypes`-safe).

Fixed inline during review: dropped `eventId` from `onDone`/`finishBotTurn`; removed the circuit-breaker object from `backoff`; unified the single-loop channel; `conversationState` null-init threaded through store, sender and integration tests. Rev.3: deep-freeze + atomic publish (`assignMessages`+single `notify`); `replaceSnapshot` resets agent watermark/identity; added `store.advanceCursorTo` and wired it into `pollOnce`; hoisted `consecutiveFailures` and reset it on first frame; chained `launch()`/`stopCurrent()` so at most one loop runs and in-flight snapshot/poll/stream are aborted on suspend/close.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-widget-transport.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks (REQUIRED SUB-SKILL: superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in-session with checkpoints (REQUIRED SUB-SKILL: superpowers:executing-plans).
