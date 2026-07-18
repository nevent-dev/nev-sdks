# Widget Transport & State Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless transport + observable state store behind the widget panel — message store (single source of truth), optimistic send with idempotency, bot-turn SSE streaming with cancel, a durable inbound events channel with reconciliation/dedup, a client-view state machine driven only by server events, polling fallback, and page-lifecycle wiring — all tested via jsdom + mocked `fetch`/`ReadableStream`.

**Architecture:** A `createMessageStore()` closure holds the only mutable state (messages, conversation state, cursor, agent identity, connection status) and is observable via `subscribe`/`getState` so the Plan 3 panel can consume it with `useSyncExternalStore`. A generic fetch-streaming SSE parser feeds two consumers: `runStreamingTurn` (POST `/stream`) and the `EventsChannel` (GET `/events`). The channel does head-first reconciliation (snapshot → tail), dedups by `eventId`/`messageId`, reconnects with backoff+jitter+circuit-breaker, and falls back to `/events/poll` after two consecutive stream failures. The state machine `BOT_ACTIVE → ESCALATED_WAITING → AGENT_ACTIVE → RESOLVED` is set **only** from server `conversation.state_changed` events and snapshots — never inferred from message contents. A `createTransport(client)` facade wires store + sender + channel + lifecycle into one object the shell (Plan 3) consumes.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), Preact (Plan 3 only — Plan 2 is headless), Vitest + jsdom, `fetch` + `ReadableStream` (WHATWG streams), `crypto.randomUUID()`.

## Global Constraints

- **Package / worktree:** `packages/widget` in worktree `/Users/mblanco/Desarrollo/nev-sdks-worktrees/widget-rewrite`. Branch `feat/widget-rewrite` (Plan 1 already merged in).
- **TS strictness:** `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. **Zero `@ts-ignore`.** Optional object properties must be omitted (not set to `undefined`); array/`Map.get` results are `T | undefined` and must be narrowed before use.
- **Reuse, do not reinvent:** all authenticated HTTP goes through `SessionClient.authorizedFetch(path, init?)` from `src/shell/session.ts` (adds `Authorization: Bearer`, refreshes+retries once on 401). Do **not** create a second auth path. `path` starts with `/widget/v1/...`; `authorizedFetch` prepends the API base.
- **Reuse contract types:** `WidgetEvent`, `WidgetConfig`, `WidgetSession` from `src/contract/types.ts`. Extend that file (additively) for wire shapes not yet defined (turn frames, ephemeral events, snapshot, poll) — Task 1 does this and notes it.
- **EventSource is banned** (cannot send `Authorization`). All SSE is consumed via `fetch` streaming + the parser in Task 3.
- **SSE parser must handle:** partial chunks split mid-event, `\r\n` and `\n` line endings, comment/heartbeat lines (`:` prefix), the `accepted`/`delta`(s)/`DONE`/`ERROR` turn vocabulary and the `message.created`/`conversation.state_changed`/`agent.joined`/`agent.typing` event vocabulary, and reconnection carrying the cursor via `?after=` query (not `Last-Event-ID`).
- **Cursor = `eventId`**, format `evt_v1_{conversationId}_{seq}` (backend spec §2.4). The client sends the full `eventId` string as `?after=`; it derives the numeric `seq` (trailing segment) only for local ordering/dedup.
- **State is server-dictated:** conversation state changes **only** on a `conversation.state_changed` event or a snapshot `state` field. The client never infers state by walking messages.
- **Testing:** Vitest + jsdom. Mock `fetch` and build `ReadableStream`s by hand. No real network, no timers left running (inject a scheduler where delays matter). Every task ends green (`npm test` for the touched files).
- **Commits:** Conventional Commits, in Castilian Spanish (e.g. `feat(widget): parser SSE por fetch-streaming`). One commit per task.
- **Run tests from the package dir:** `cd /Users/mblanco/Desarrollo/nev-sdks-worktrees/widget-rewrite/packages/widget`. Single file: `npx vitest run src/<path>.test.ts`. Typecheck: `npm run typecheck`.

### Out of scope (deferred)

- **Plan 3 (visual panel):** rendering the 10 mock states, the composer, scroll behavior, focus/a11y, theming/tokens. Plan 2 only exposes the observable store + transport API the panel binds to.
- **Plan 4:** rich content schema rendering, file upload flow, feedback 👍/👎 wire calls, i18n. (The store carries plain message text only; rich payloads are a Plan 4 concern.)
- **Bootstrap/session** (`config`/`sessions`/`refresh`) — owned by Plan 1's `session.ts`. Plan 2 consumes `SessionClient` as-is. Note: Plan 1's `WidgetSession` has `guestHandle` while the backend contract §4.1 returns `resumeSecret`; reconciling that is a bootstrap concern, not Plan 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/contract/types.ts` (modify) | Add wire types: `ConversationState`, `TurnStreamFrame`, `WidgetEphemeralEvent`, `WidgetMessage`, `MessagesSnapshot`, `EventsPollResponse`. |
| `src/contract/fixtures.ts` (modify) | Add fixtures for the new shapes so store/channel tests share one contract source. |
| `src/transport/cursor.ts` | `cursorSeq(eventId)` + `isNewerCursor(a,b)` — derive/compare `seq` from the durable cursor string. |
| `src/transport/sse.ts` | `parseSSEStream(body, signal?)` — generic fetch-streaming SSE frame parser. |
| `src/store/message-store.ts` | `createMessageStore()` — the single observable source of truth (state, dedup, optimistic, streaming buffer, connection). |
| `src/transport/turn.ts` | `runStreamingTurn(...)` — consume the POST `/stream` SSE into store handlers. |
| `src/transport/send.ts` | `createSender(...)` — optimistic send, idempotency keys, streaming↔non-streaming, retry, cancel. |
| `src/transport/backoff.ts` | `createBackoff(...)` — exponential backoff + jitter + circuit breaker. |
| `src/transport/events-channel.ts` | `createEventsChannel(...)` — reconcile, consume, dedup, reconnect, poll fallback, lifecycle. |
| `src/shell/lifecycle.ts` | `bindPageLifecycle(target, handlers)` — freeze/resume/pageshow/online/offline/visibilitychange → suspend/resume. |
| `src/transport/index.ts` | `createTransport(client, opts?)` — facade wiring store + sender + channel + lifecycle for the shell. |

Each `src/x/y.ts` has its tests in `src/x/__tests__/y.test.ts` (matching the existing convention: `vitest.config.ts` includes `src/**/__tests__/**/*.test.{ts,tsx}`).

---

## Task 1: Contract wire types + fixtures

**Files:**
- Modify: `src/contract/types.ts`
- Modify: `src/contract/fixtures.ts`
- Test: `src/contract/__tests__/fixtures.test.ts` (extend existing)

**Interfaces:**
- Consumes: existing `WidgetEvent`, `WidgetConfig`, `WidgetSession` (unchanged).
- Produces: `ConversationState`, `TurnStreamFrame`, `WidgetEphemeralEvent`, `WidgetMessage`, `MessagesSnapshot`, `EventsPollResponse`; fixtures `fixtureSnapshot()`, `fixtureTurnFrames()`, `fixturePollResponse()`.

- [ ] **Step 1: Add the wire types to `src/contract/types.ts`**

Append to the end of `src/contract/types.ts`. Also replace the inline state union in the existing `conversation.state_changed` variant with the new alias (identical literals — additive, keeps one definition):

```typescript
export type ConversationState = 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED'

// Frames of the bot-turn stream (POST /widget/v1/conversations/current/stream).
// Vocabulary per backend §4.2: accepted → delta(s) → DONE | ERROR.
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

Then edit the existing `conversation.state_changed` line so the payload references the alias:

```typescript
  | (EventBase & { type: 'conversation.state_changed'; payload: { state: ConversationState } })
```

- [ ] **Step 2: Add fixtures to `src/contract/fixtures.ts`**

Append (keep the existing `import type` line; add the new names to it):

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

- [ ] **Step 3: Write the failing test**

Append to `src/contract/__tests__/fixtures.test.ts` (add the new imports to the existing import line):

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
    const frames = fixtureTurnFrames()
    const last = frames.at(-1)
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/contract/__tests__/fixtures.test.ts`
Expected: PASS (new + existing cases green).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

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

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/cursor.test.ts`:

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/cursor.test.ts`
Expected: FAIL — cannot resolve `../cursor`.

- [ ] **Step 3: Write the implementation**

Create `src/transport/cursor.ts`:

```typescript
// The durable cursor is the eventId string `evt_v1_{conversationId}_{seq}`
// (backend §2.4). We send the whole string as `?after=`; only the trailing
// numeric seq is meaningful for local ordering/dedup.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/cursor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/cursor.ts src/transport/__tests__/cursor.test.ts
git commit -m "feat(widget): helper de cursor durable (seq + comparación)"
```

---

## Task 3: Fetch-streaming SSE parser

**Files:**
- Create: `src/transport/sse.ts`
- Test: `src/transport/__tests__/sse.test.ts`

**Interfaces:**
- Produces: `interface SSEEvent { event: string; data: string; id?: string }`, `async function* parseSSEStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SSEEvent>`.
- Consumed by: Task 6 (`turn.ts`), Task 9 (`events-channel.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/sse.test.ts`. The helper builds a stream that emits caller-controlled chunks (to exercise mid-event splits):

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
    const out = await collect(['event: accepted\ndata: {"turnId":"t1"}\n\n'])
    expect(out).toEqual([{ event: 'accepted', data: '{"turnId":"t1"}' }])
  })

  it('reassembles a frame split mid-event across chunks', async () => {
    const out = await collect(['event: del', 'ta\ndata: {"seq":', '1}\n\n'])
    expect(out).toEqual([{ event: 'delta', data: '{"seq":1}' }])
  })

  it('handles two frames arriving in one chunk and CRLF line endings', async () => {
    const out = await collect(['event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n'])
    expect(out.map((e) => e.event)).toEqual(['a', 'b'])
    expect(out.map((e) => e.data)).toEqual(['1', '2'])
  })

  it('ignores comment/heartbeat lines but keeps the surrounding frame', async () => {
    const out = await collect([': keep-alive\n\nevent: done\ndata: {}\n\n'])
    expect(out).toEqual([{ event: 'done', data: '{}' }])
  })

  it('joins multiple data: lines with newlines and reads id:', async () => {
    const out = await collect(['id: evt_v1_c_7\nevent: message.created\ndata: line1\ndata: line2\n\n'])
    expect(out[0]).toEqual({ event: 'message.created', data: 'line1\nline2', id: 'evt_v1_c_7' })
  })

  it('flushes a trailing frame that has no final blank line', async () => {
    const out = await collect(['event: x\ndata: 1'])
    expect(out).toEqual([{ event: 'x', data: '1' }])
  })

  it('stops early when the signal is aborted', async () => {
    const ac = new AbortController()
    const gen = parseSSEStream(streamOf(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n']), ac.signal)
    const first = await gen.next()
    expect((first.value as SSEEvent).event).toBe('a')
    ac.abort()
    const second = await gen.next()
    expect(second.done).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/sse.test.ts`
Expected: FAIL — cannot resolve `../sse`.

- [ ] **Step 3: Write the implementation**

Create `src/transport/sse.ts`:

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
  if (!hasField) return null // frame was only comments/heartbeat
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
  try {
    while (true) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n') // reunited across chunks before splitting
      let idx = buffer.indexOf('\n\n')
      while (idx !== -1) {
        const frame = parseFrame(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 2)
        if (frame) yield frame
        if (signal?.aborted) return
        idx = buffer.indexOf('\n\n')
      }
    }
    const tail = parseFrame(buffer)
    if (tail) yield tail
  } finally {
    try { await reader.cancel() } catch { /* stream already closed */ }
    reader.releaseLock()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/sse.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/sse.ts src/transport/__tests__/sse.test.ts
git commit -m "feat(widget): parser SSE por fetch-streaming (chunks parciales, heartbeats, CRLF)"
```

---

## Task 4: Message store — durable core

**Files:**
- Create: `src/store/message-store.ts`
- Test: `src/store/__tests__/message-store.test.ts`

**Interfaces:**
- Consumes: `WidgetEvent`, `ConversationState`, `MessagesSnapshot`, `WidgetMessage` (Task 1); `cursorSeq`, `isNewerCursor` (Task 2).
- Produces (this task defines the store's public surface; Task 5 adds the remaining mutators):
  ```typescript
  type MessageStatus = 'pending' | 'sent' | 'failed'
  type ConnectionStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'offline'
  interface StoredMessage {
    id: string; role: 'user' | 'bot' | 'agent'; text: string
    status: MessageStatus; seq: number | null; streaming: boolean
    createdAt: string; clientId: string | null
  }
  interface StoreState {
    messages: StoredMessage[]; conversationState: ConversationState; cursor: string | null
    agentName: string | null; agentAvatarUrl: string | null; agentTyping: boolean
    connection: ConnectionStatus
  }
  interface MessageStore {
    getState(): StoreState
    subscribe(listener: () => void): () => void
    applySnapshot(s: MessagesSnapshot): void
    applyDurableEvent(e: WidgetEvent): void
    // Task 5 extends: addOptimistic, ackOptimistic, failOptimistic, retryOptimistic,
    // beginBotTurn, appendBotDelta, finishBotTurn, failBotTurn, setAgentTyping, setConnection
  }
  function createMessageStore(now?: () => string): MessageStore
  ```

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/message-store.test.ts`:

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

describe('message store — durable core', () => {
  it('starts idle and empty', () => {
    const s = createMessageStore()
    expect(s.getState().messages).toEqual([])
    expect(s.getState().conversationState).toBe('BOT_ACTIVE')
    expect(s.getState().cursor).toBeNull()
    expect(s.getState().connection).toBe('idle')
  })

  it('applies a snapshot: messages, state and cursor', () => {
    const s = createMessageStore()
    s.applySnapshot(fixtureSnapshot())
    const st = s.getState()
    expect(st.messages.map((m) => m.id)).toEqual(['msg_0001'])
    expect(st.messages[0]?.role).toBe('bot')
    expect(st.conversationState).toBe('BOT_ACTIVE')
    expect(st.cursor).toBe('evt_v1_conv_demo_01_1')
  })

  it('appends durable message.created events ordered and advances the cursor', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'segundo'))
    s.applyDurableEvent(msgEvent(3, 'm3', 'user', 'tercero'))
    expect(s.getState().messages.map((m) => m.id)).toEqual(['m2', 'm3'])
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_3')
  })

  it('dedups replayed events by messageId (overlap after reconnect)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'hola'))
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'hola')) // exact replay
    expect(s.getState().messages).toHaveLength(1)
  })

  it('does not rewind the cursor on an older replayed event', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(5, 'm5', 'bot', 'nuevo'))
    s.applyDurableEvent(msgEvent(3, 'm3', 'bot', 'viejo'))
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_5')
    expect(s.getState().messages.map((m) => m.id)).toEqual(['m3', 'm5']) // ordered by seq
  })

  it('sets state ONLY from conversation.state_changed events', () => {
    const s = createMessageStore()
    s.applyDurableEvent(stateEvent(4, 'ESCALATED_WAITING'))
    expect(s.getState().conversationState).toBe('ESCALATED_WAITING')
    s.applyDurableEvent(stateEvent(6, 'AGENT_ACTIVE'))
    expect(s.getState().conversationState).toBe('AGENT_ACTIVE')
  })

  it('records agent identity from agent.joined', () => {
    const s = createMessageStore()
    s.applyDurableEvent({
      eventId: 'evt_v1_conv_demo_01_7', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-17T14:09:00Z', type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null },
    })
    expect(s.getState().agentName).toBe('Laura')
    expect(s.getState().agentAvatarUrl).toBeNull()
  })

  it('snapshot after events advances the cursor to the max and preserves order', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(5, 'm5', 'bot', 'live'))
    s.applySnapshot(fixtureSnapshot()) // snapshotCursor seq=1, message msg_0001
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_5') // not rewound to 1
    expect(s.getState().messages.map((m) => m.id)).toEqual(['msg_0001', 'm5'])
  })

  it('notifies subscribers on change and returns a stable snapshot between changes', () => {
    const s = createMessageStore()
    const listener = vi.fn()
    const unsub = s.subscribe(listener)
    const before = s.getState()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'x'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(s.getState()).not.toBe(before) // new snapshot object after a change
    const a = s.getState()
    expect(s.getState()).toBe(a) // stable reference between changes (useSyncExternalStore-safe)
    unsub()
    s.applyDurableEvent(msgEvent(3, 'm3', 'bot', 'y'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/message-store.test.ts`
Expected: FAIL — cannot resolve `../message-store`.

- [ ] **Step 3: Write the implementation**

Create `src/store/message-store.ts`:

```typescript
import type { WidgetEvent, ConversationState, MessagesSnapshot } from '../contract/types'
import { cursorSeq, isNewerCursor } from '../transport/cursor'

export type MessageStatus = 'pending' | 'sent' | 'failed'
export type ConnectionStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'offline'

export interface StoredMessage {
  id: string
  role: 'user' | 'bot' | 'agent'
  text: string
  status: MessageStatus
  seq: number | null
  streaming: boolean
  createdAt: string
  clientId: string | null
}

export interface StoreState {
  messages: StoredMessage[]
  conversationState: ConversationState
  cursor: string | null
  agentName: string | null
  agentAvatarUrl: string | null
  agentTyping: boolean
  connection: ConnectionStatus
}

export interface MessageStore {
  getState(): StoreState
  subscribe(listener: () => void): () => void
  applySnapshot(snapshot: MessagesSnapshot): void
  applyDurableEvent(event: WidgetEvent): void
}

// Display order: durable events strictly by seq among themselves; anything
// without a seq (snapshot history, optimistic, streaming) falls back to its
// server/client timestamp. Both are server-monotonic within a conversation.
function compareMessages(a: StoredMessage, b: StoredMessage): number {
  if (a.seq !== null && b.seq !== null) return a.seq - b.seq
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

export function createMessageStore(now: () => string = () => new Date().toISOString()): MessageStore {
  const messages: StoredMessage[] = []
  const byMessageId = new Map<string, StoredMessage>()
  const appliedEventIds = new Set<string>()
  let conversationState: ConversationState = 'BOT_ACTIVE'
  let cursor: string | null = null
  let agentName: string | null = null
  let agentAvatarUrl: string | null = null
  let agentTyping = false
  let connection: ConnectionStatus = 'idle'

  const listeners = new Set<() => void>()
  let snapshot: StoreState | null = null

  const invalidate = (): void => {
    snapshot = null
    for (const l of listeners) l()
  }
  const sort = (): void => { messages.sort(compareMessages) }

  const advanceCursor = (eventId: string): void => {
    if (isNewerCursor(eventId, cursor)) cursor = eventId
  }

  const applyDurableEvent = (event: WidgetEvent): void => {
    if (appliedEventIds.has(event.eventId)) return
    appliedEventIds.add(event.eventId)
    advanceCursor(event.eventId)
    if (event.type === 'message.created') {
      const existing = byMessageId.get(event.payload.messageId)
      if (existing) {
        existing.text = event.payload.text
        existing.seq = cursorSeq(event.eventId)
        existing.status = 'sent'
        sort()
      } else {
        const m: StoredMessage = {
          id: event.payload.messageId, role: event.payload.role, text: event.payload.text,
          status: 'sent', seq: cursorSeq(event.eventId), streaming: false,
          createdAt: event.occurredAt, clientId: null,
        }
        messages.push(m)
        byMessageId.set(m.id, m)
        sort()
      }
    } else if (event.type === 'conversation.state_changed') {
      conversationState = event.payload.state
    } else if (event.type === 'agent.joined') {
      agentName = event.payload.agentName
      agentAvatarUrl = event.payload.agentAvatarUrl
    }
    invalidate()
  }

  const applySnapshot = (s: MessagesSnapshot): void => {
    for (const m of s.messages) {
      if (byMessageId.has(m.messageId)) continue
      const stored: StoredMessage = {
        id: m.messageId, role: m.role, text: m.text, status: 'sent',
        seq: null, streaming: false, createdAt: m.createdAt, clientId: null,
      }
      messages.push(stored)
      byMessageId.set(stored.id, stored)
    }
    sort()
    conversationState = s.state
    advanceCursor(s.snapshotCursor)
    invalidate()
  }

  return {
    getState(): StoreState {
      snapshot ??= {
        messages: messages.slice(),
        conversationState, cursor, agentName, agentAvatarUrl, agentTyping, connection,
      }
      return snapshot
    },
    subscribe(listener): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    applySnapshot,
    applyDurableEvent,
  }
}
```

> Note for Task 5: `messages`, `byMessageId`, `appliedEventIds`, `invalidate`, `sort`, `advanceCursor`, and the mutable `agentTyping`/`connection` bindings live in this closure. Task 5 adds its mutators inside `createMessageStore` and to the returned object. The `now` param is unused here but is the injectable clock Task 5 uses for optimistic/streaming `createdAt`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/message-store.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/store/message-store.ts src/store/__tests__/message-store.test.ts
git commit -m "feat(widget): store observable núcleo (snapshot, eventos durables, dedup, cursor, estado)"
```

---

## Task 5: Message store — optimistic + streaming mutators

**Files:**
- Modify: `src/store/message-store.ts`
- Test: `src/store/__tests__/message-store-optimistic.test.ts`

**Interfaces:**
- Consumes: the Task 4 store closure.
- Produces (added to `MessageStore`):
  ```typescript
  addOptimistic(clientId: string, text: string): void
  ackOptimistic(clientId: string, messageId: string): void
  failOptimistic(clientId: string): void
  retryOptimistic(clientId: string): void
  beginBotTurn(turnId: string): void
  appendBotDelta(turnId: string, delta: string): void
  finishBotTurn(turnId: string, messageId: string, eventId: string): void
  failBotTurn(turnId: string): void
  setAgentTyping(isTyping: boolean): void
  setConnection(status: ConnectionStatus): void
  ```

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/message-store-optimistic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createMessageStore } from '../message-store'
import type { WidgetEvent } from '../../contract/types'

const clock = () => '2026-07-17T15:00:00Z'

describe('message store — optimistic + streaming', () => {
  it('optimistic user message goes pending → sent on ack', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    expect(s.getState().messages[0]).toMatchObject({ id: 'cid_1', role: 'user', status: 'pending', text: 'Hola' })
    s.ackOptimistic('cid_1', 'msg_srv_1')
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_srv_1', status: 'sent', clientId: 'cid_1' })
  })

  it('an acked optimistic message dedups against its durable message.created', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    s.ackOptimistic('cid_1', 'msg_srv_1')
    const durable: WidgetEvent = {
      eventId: 'evt_v1_conv_demo_01_2', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-17T15:00:01Z', type: 'message.created', payload: { messageId: 'msg_srv_1', role: 'user', text: 'Hola' },
    }
    s.applyDurableEvent(durable)
    expect(s.getState().messages.filter((m) => m.id === 'msg_srv_1')).toHaveLength(1)
    expect(s.getState().messages[0]?.seq).toBe(2) // reconciled with durable seq
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
    s.beginBotTurn('turn_1')
    expect(s.getState().messages[0]).toMatchObject({ role: 'bot', streaming: true, text: '' })
    s.appendBotDelta('turn_1', 'Sí, ')
    s.appendBotDelta('turn_1', 'claro.')
    expect(s.getState().messages[0]?.text).toBe('Sí, claro.')
    s.finishBotTurn('turn_1', 'msg_bot_1', 'evt_v1_conv_demo_01_5')
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_bot_1', streaming: false, seq: 5 })
  })

  it('a finished bot turn dedups against its durable replay', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('turn_1')
    s.appendBotDelta('turn_1', 'texto')
    s.finishBotTurn('turn_1', 'msg_bot_1', 'evt_v1_conv_demo_01_5')
    s.applyDurableEvent({
      eventId: 'evt_v1_conv_demo_01_5', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-17T15:00:02Z', type: 'message.created', payload: { messageId: 'msg_bot_1', role: 'bot', text: 'texto' },
    })
    expect(s.getState().messages.filter((m) => m.role === 'bot')).toHaveLength(1)
  })

  it('failBotTurn removes an empty streaming placeholder but keeps a partial one', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('turn_empty')
    s.failBotTurn('turn_empty')
    expect(s.getState().messages).toHaveLength(0)
    s.beginBotTurn('turn_partial')
    s.appendBotDelta('turn_partial', 'a medias')
    s.failBotTurn('turn_partial')
    expect(s.getState().messages[0]).toMatchObject({ streaming: false, text: 'a medias' })
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/message-store-optimistic.test.ts`
Expected: FAIL — `addOptimistic is not a function`.

- [ ] **Step 3: Extend the store implementation**

In `src/store/message-store.ts`, add the new method signatures to the `MessageStore` interface:

```typescript
export interface MessageStore {
  getState(): StoreState
  subscribe(listener: () => void): () => void
  applySnapshot(snapshot: MessagesSnapshot): void
  applyDurableEvent(event: WidgetEvent): void
  addOptimistic(clientId: string, text: string): void
  ackOptimistic(clientId: string, messageId: string): void
  failOptimistic(clientId: string): void
  retryOptimistic(clientId: string): void
  beginBotTurn(turnId: string): void
  appendBotDelta(turnId: string, delta: string): void
  finishBotTurn(turnId: string, messageId: string, eventId: string): void
  failBotTurn(turnId: string): void
  setAgentTyping(isTyping: boolean): void
  setConnection(status: ConnectionStatus): void
}
```

Inside `createMessageStore`, add a turn→placeholder index near the other `const` declarations:

```typescript
  const byTurnId = new Map<string, StoredMessage>()
  const byClientId = new Map<string, StoredMessage>()
```

In `addOptimistic`, register the message in `byClientId`. Add these functions before the `return`:

```typescript
  const addOptimistic = (clientId: string, text: string): void => {
    const m: StoredMessage = {
      id: clientId, role: 'user', text, status: 'pending', seq: null,
      streaming: false, createdAt: now(), clientId,
    }
    messages.push(m)
    byClientId.set(clientId, m)
    sort()
    invalidate()
  }
  const ackOptimistic = (clientId: string, messageId: string): void => {
    const m = byClientId.get(clientId)
    if (!m) return
    m.id = messageId
    m.status = 'sent'
    byMessageId.set(messageId, m)
    invalidate()
  }
  const failOptimistic = (clientId: string): void => {
    const m = byClientId.get(clientId)
    if (!m) return
    m.status = 'failed'
    invalidate()
  }
  const retryOptimistic = (clientId: string): void => {
    const m = byClientId.get(clientId)
    if (!m) return
    m.status = 'pending'
    invalidate()
  }
  const beginBotTurn = (turnId: string): void => {
    const m: StoredMessage = {
      id: `turn:${turnId}`, role: 'bot', text: '', status: 'sent', seq: null,
      streaming: true, createdAt: now(), clientId: null,
    }
    messages.push(m)
    byTurnId.set(turnId, m)
    sort()
    invalidate()
  }
  const appendBotDelta = (turnId: string, delta: string): void => {
    const m = byTurnId.get(turnId)
    if (!m) return
    m.text += delta
    invalidate()
  }
  const finishBotTurn = (turnId: string, messageId: string, eventId: string): void => {
    const m = byTurnId.get(turnId)
    if (!m) return
    m.id = messageId
    m.streaming = false
    m.seq = cursorSeq(eventId)
    byMessageId.set(messageId, m)
    byTurnId.delete(turnId)
    appliedEventIds.add(eventId) // durable replay of this message will dedup
    advanceCursor(eventId)
    sort()
    invalidate()
  }
  const failBotTurn = (turnId: string): void => {
    const m = byTurnId.get(turnId)
    if (!m) return
    byTurnId.delete(turnId)
    if (m.text === '') {
      const i = messages.indexOf(m)
      if (i !== -1) messages.splice(i, 1)
    } else {
      m.streaming = false
    }
    invalidate()
  }
  const setAgentTyping = (isTyping: boolean): void => {
    if (agentTyping === isTyping) return
    agentTyping = isTyping
    invalidate()
  }
  const setConnection = (status: ConnectionStatus): void => {
    if (connection === status) return
    connection = status
    invalidate()
  }
```

Add all of these to the returned object (after `applyDurableEvent`):

```typescript
    addOptimistic, ackOptimistic, failOptimistic, retryOptimistic,
    beginBotTurn, appendBotDelta, finishBotTurn, failBotTurn,
    setAgentTyping, setConnection,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/message-store-optimistic.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole store suite + typecheck**

Run: `npx vitest run src/store && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/message-store.ts src/store/__tests__/message-store-optimistic.test.ts
git commit -m "feat(widget): store — mensajes optimistas y buffer de streaming del turno"
```

---

## Task 6: Bot-turn streaming consumer

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
    onDone(turnId: string, messageId: string, eventId: string): void
    onError(code: string): void
  }
  function runStreamingTurn(
    client: Pick<SessionClient, 'authorizedFetch'>, idempotencyKey: string, text: string,
    handlers: TurnHandlers, signal: AbortSignal,
  ): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/turn.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runStreamingTurn, type TurnHandlers } from '../turn'

function sseResponse(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}
function handlers(): TurnHandlers & { log: string[] } {
  const log: string[] = []
  return {
    log,
    onAccepted: (t, u) => log.push(`accepted:${t}:${u}`),
    onDelta: (t, d) => log.push(`delta:${t}:${d}`),
    onDone: (t, m, e) => log.push(`done:${t}:${m}:${e}`),
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
    expect(h.log).toEqual(['accepted:t1:u1', 'delta:t1:Sí, ', 'delta:t1:claro.', 'done:t1:m1:evt_v1_c_5'])
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

  it('throws on a non-OK HTTP status (transport failure, caller falls back)', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([], 503))
    const h = handlers()
    await expect(runStreamingTurn({ authorizedFetch }, 'idem-1', 'Hola', h, new AbortController().signal))
      .rejects.toThrow(/stream_http:503/)
  })

  it('passes the abort signal through to authorizedFetch', async () => {
    const ac = new AbortController()
    const authorizedFetch = vi.fn(async () => sseResponse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n']))
    await runStreamingTurn({ authorizedFetch }, 'idem-1', 'Hola', handlers(), ac.signal)
    expect(authorizedFetch.mock.calls[0]![1]?.signal).toBe(ac.signal)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/turn.test.ts`
Expected: FAIL — cannot resolve `../turn`.

- [ ] **Step 3: Write the implementation**

Create `src/transport/turn.ts`:

```typescript
import type { SessionClient } from '../shell/session'
import { parseSSEStream } from './sse'

export interface TurnHandlers {
  onAccepted(turnId: string, userMessageId: string): void
  onDelta(turnId: string, delta: string): void
  onDone(turnId: string, messageId: string, eventId: string): void
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
  for await (const ev of parseSSEStream(res.body, signal)) {
    const name = ev.event.toLowerCase()
    const p = asRecord(ev.data)
    if (name === 'accepted') {
      handlers.onAccepted(str(p['turnId']), str(p['userMessageId']))
    } else if (name === 'delta' || name === 'deltas') {
      handlers.onDelta(str(p['turnId']), str(p['delta']))
    } else if (name === 'done') {
      handlers.onDone(str(p['turnId']), str(p['messageId']), str(p['eventId']))
      return
    } else if (name === 'error') {
      handlers.onError(str(p['code']) || 'stream_error')
      return
    }
    // unknown/heartbeat frames are ignored
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/turn.ts src/transport/__tests__/turn.test.ts
git commit -m "feat(widget): consumidor del turno del bot por SSE (accepted/delta/done/error)"
```

---

## Task 7: Sender — optimistic send, retry, cancel, streaming↔non-streaming

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

**Behavior notes:**
- Each send mints one `clientId = uuid()` which doubles as the `Idempotency-Key`. `retry(clientId)` re-sends with the **same** key (backend is idempotent), so a duplicate never creates a second turn.
- Streaming path: `runStreamingTurn`; on `onAccepted` → `store.ackOptimistic`; on `onDelta` → `beginBotTurn` (first delta) then `appendBotDelta`; on `onDone` → `finishBotTurn`; on `onError` → `failBotTurn`. A **transport** failure (throw) flips the sender to non-streaming for subsequent sends (degradation §9) and marks the message failed.
- Non-streaming path: POST `/messages` with `Idempotency-Key`; on 2xx → `ackOptimistic(clientId, userMessageId)`. The bot reply and any state change arrive via the events channel (Task 9), so the sender does **not** apply state from the response (single source = durable events).
- `cancel()` aborts the in-flight stream and, if a `turnId` is known, POSTs `/turns/{turnId}/cancel` (idempotent, fire-and-forget).

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/send.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createSender } from '../send'
import { createMessageStore } from '../../store/message-store'

function sse(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status })
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
    const idem = new Headers(authorizedFetch.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    expect(idem).toBe('cid_1')
  })

  it('a network failure marks the message failed; retry reuses the same Idempotency-Key', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let call = 0
    const authorizedFetch = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error('network')
      // second attempt (retry) succeeds via non-streaming fallback
      return json({ turnId: 't1', userMessageId: 'u1', state: 'BOT_ACTIVE' })
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]?.status).toBe('failed')
    await sender.retry('cid_1')
    expect(store.getState().messages[0]).toMatchObject({ id: 'u1', status: 'sent' })
    const keys = authorizedFetch.mock.calls.map((c) => new Headers(c[1]?.headers).get('Idempotency-Key'))
    expect(keys.every((k) => k === 'cid_1')).toBe(true) // same key across attempts
  })

  it('non-streaming send acks from the JSON body and does not set state from the response', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => json({ turnId: 't1', userMessageId: 'u1', state: 'AGENT_ACTIVE' }))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: false, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]).toMatchObject({ id: 'u1', status: 'sent' })
    expect(store.getState().conversationState).toBe('BOT_ACTIVE') // NOT taken from response
    expect(String(authorizedFetch.mock.calls[0]![0])).toBe('/widget/v1/conversations/current/messages')
  })

  it('cancel aborts the stream and POSTs /turns/{turnId}/cancel once the turn is known', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const cancelCalls: string[] = []
    const authorizedFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/cancel')) { cancelCalls.push(path); return json({ ok: true }, 202) }
      // a stream that stays open until aborted
      const body = new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(new TextEncoder().encode('event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n')) },
      })
      init?.signal?.addEventListener('abort', () => { try { /* controller closed by abort */ } catch { /* noop */ } })
      return new Response(body, { status: 200 })
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    const p = sender.send('Hola')
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'u1')).toBe(true))
    sender.cancel()
    await p.catch(() => { /* abort surfaces as rejection; ignore */ })
    expect(cancelCalls).toEqual(['/widget/v1/turns/t1/cancel'])
  })

  it('notifies onConversationStarted on the first send only', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => json({ turnId: 't1', userMessageId: 'u1', state: 'BOT_ACTIVE' }))
    const started = vi.fn()
    const sender = createSender({ client: { authorizedFetch }, store, streaming: false, uuid, onConversationStarted: started })
    await sender.send('uno')
    await sender.send('dos')
    expect(started).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/send.test.ts`
Expected: FAIL — cannot resolve `../send`.

- [ ] **Step 3: Write the implementation**

Create `src/transport/send.ts`:

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
  const texts = new Map<string, string>() // clientId → text (for retry)
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
    let beganTurn = false
    const handlers: TurnHandlers = {
      onAccepted: (turnId, userMessageId) => { currentTurnId = turnId; deps.store.ackOptimistic(clientId, userMessageId) },
      onDelta: (turnId, delta) => {
        if (!beganTurn) { deps.store.beginBotTurn(turnId); beganTurn = true }
        deps.store.appendBotDelta(turnId, delta)
      },
      onDone: (turnId, messageId, eventId) => { deps.store.finishBotTurn(turnId, messageId, eventId) },
      onError: (_code) => { if (currentTurnId) deps.store.failBotTurn(currentTurnId) },
    }
    try {
      await runStreamingTurn(deps.client, clientId, text, handlers, ac.signal)
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
    // state and bot reply arrive via the events channel — never inferred here.
  }

  const deliver = async (clientId: string, text: string): Promise<void> => {
    try {
      if (useStreaming) await streamOnce(clientId, text)
      else await sendNonStreaming(clientId, text)
    } catch (err) {
      if (useStreaming) {
        // transport failure on the streaming path → degrade to non-streaming
        // (spec §9) and retry this delivery once with the same idempotency key.
        useStreaming = false
        try {
          await sendNonStreaming(clientId, text)
          return
        } catch {
          deps.store.failOptimistic(clientId)
          throw err
        }
      }
      deps.store.failOptimistic(clientId)
      throw err
    }
  }

  return {
    async send(text: string): Promise<void> {
      const clientId = uuid()
      texts.set(clientId, text)
      deps.store.addOptimistic(clientId, text)
      markStarted()
      await deliver(clientId, text)
    },
    async retry(clientId: string): Promise<void> {
      const text = texts.get(clientId)
      if (text === undefined) return
      deps.store.retryOptimistic(clientId)
      await deliver(clientId, text)
    },
    cancel(): void {
      inFlight?.abort()
      const turnId = currentTurnId
      if (turnId) {
        void deps.client.authorizedFetch(`/widget/v1/turns/${turnId}/cancel`, { method: 'POST' })
      }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/send.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/send.ts src/transport/__tests__/send.test.ts
git commit -m "feat(widget): sender optimista con idempotencia, reintento, cancelación y degradación"
```

---

## Task 8: Backoff + circuit breaker

**Files:**
- Create: `src/transport/backoff.ts`
- Test: `src/transport/__tests__/backoff.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface BackoffOptions { baseMs?: number; maxMs?: number; factor?: number; jitter?: number; breakerThreshold?: number; rng?: () => number }
  interface Backoff {
    nextDelay(): number     // ms for the current attempt; advances the attempt counter
    reset(): void           // back to attempt 0 (call on a successful connect)
    isOpen(): boolean       // circuit breaker tripped (>= breakerThreshold failures)
    attempts(): number
  }
  function createBackoff(opts?: BackoffOptions): Backoff
  ```

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/backoff.test.ts`:

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
    // rng=1 → +50% of base delay: 100 * (1 + 0.5)
    expect(b.nextDelay()).toBe(150)
  })

  it('reset returns to the first delay and clears the breaker', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 800, jitter: 0, breakerThreshold: 3 })
    b.nextDelay(); b.nextDelay(); b.nextDelay()
    expect(b.isOpen()).toBe(true)
    b.reset()
    expect(b.attempts()).toBe(0)
    expect(b.isOpen()).toBe(false)
    expect(b.nextDelay()).toBe(100)
  })

  it('opens the breaker at or beyond the threshold', () => {
    const b = createBackoff({ breakerThreshold: 2, jitter: 0 })
    expect(b.isOpen()).toBe(false)
    b.nextDelay()
    expect(b.isOpen()).toBe(false)
    b.nextDelay()
    expect(b.isOpen()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/backoff.test.ts`
Expected: FAIL — cannot resolve `../backoff`.

- [ ] **Step 3: Write the implementation**

Create `src/transport/backoff.ts`:

```typescript
export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  factor?: number
  jitter?: number // fraction of the base delay, e.g. 0.5 = ±50% (one-sided, additive)
  breakerThreshold?: number
  rng?: () => number
}

export interface Backoff {
  nextDelay(): number
  reset(): void
  isOpen(): boolean
  attempts(): number
}

export function createBackoff(opts: BackoffOptions = {}): Backoff {
  const baseMs = opts.baseMs ?? 500
  const maxMs = opts.maxMs ?? 15000
  const factor = opts.factor ?? 2
  const jitter = opts.jitter ?? 0.3
  const breakerThreshold = opts.breakerThreshold ?? 6
  const rng = opts.rng ?? Math.random

  let attempt = 0

  return {
    nextDelay(): number {
      const raw = Math.min(maxMs, baseMs * Math.pow(factor, attempt))
      attempt += 1
      const extra = raw * jitter * rng()
      return Math.round(Math.min(maxMs, raw + extra))
    },
    reset(): void { attempt = 0 },
    isOpen(): boolean { return attempt >= breakerThreshold },
    attempts(): number { return attempt },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/backoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/backoff.ts src/transport/__tests__/backoff.test.ts
git commit -m "feat(widget): backoff exponencial con jitter y circuit breaker"
```

---

## Task 9: Events channel — reconcile, consume, dedup, cursor reset

**Files:**
- Create: `src/transport/events-channel.ts`
- Test: `src/transport/__tests__/events-channel.test.ts`

**Interfaces:**
- Consumes: `MessageStore` (Tasks 4–5); `parseSSEStream` (Task 3); `SessionClient.authorizedFetch` (Plan 1); `WidgetEvent`, `MessagesSnapshot`, `EventsPollResponse` (Task 1).
- Produces (Task 10 adds the resilience methods):
  ```typescript
  interface EventsChannelDeps {
    client: Pick<SessionClient, 'authorizedFetch'>
    store: MessageStore
    scheduler?: Scheduler          // injectable timers (Task 10 uses it; default = globalThis)
    backoff?: Backoff              // Task 10
    pollIntervalMs?: number        // Task 10
    isOnline?: () => boolean       // Task 10
  }
  interface Scheduler { setTimeout(fn: () => void, ms: number): number; clearTimeout(id: number): void }
  interface EventsChannel {
    open(): void
    close(): void
    // Task 10 adds: suspend(), resume(), isActive()
  }
  function createEventsChannel(deps: EventsChannelDeps): EventsChannel
  ```

**Behavior (this task — happy path + cursor reset):**
- `open()` runs `reconcile()`: GET `/messages` (head-first snapshot) → `store.applySnapshot` → open GET `/events?after={cursor}` and consume durable/ephemeral frames into the store. Idempotent: a second `open()` while active is a no-op.
- A `409 {code:"CURSOR_RESET_REQUIRED"}` from `/events` (or a stale cursor) drops the cursor and re-reconciles from a fresh snapshot.
- `close()` aborts the stream and marks the channel closed.

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/events-channel.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createEventsChannel } from '../events-channel'
import { createMessageStore } from '../../store/message-store'
import type { MessagesSnapshot } from '../../contract/types'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sseRes(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}
const SNAP: MessagesSnapshot = {
  messages: [{ messageId: 'm1', role: 'bot', text: 'Hola', createdAt: '2026-07-17T14:00:00Z' }],
  state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_1',
}

describe('events channel — reconcile + consume', () => {
  it('open: snapshot then tail events, with ?after=snapshotCursor and dedup', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const calls: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      calls.push(path)
      if (path.includes('/messages')) return jsonRes(SNAP)
      // /events?after=... : one overlapping replay (m1 again) + one new + a state change
      return sseRes([
        'event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_1","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:00:00Z","type":"message.created","payload":{"messageId":"m1","role":"bot","text":"Hola"}}\n\n',
        'event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:05:00Z","type":"message.created","payload":{"messageId":"m2","role":"user","text":"Quiero cambiarla"}}\n\n',
        'event: conversation.state_changed\ndata: {"eventId":"evt_v1_conv_demo_01_3","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:06:00Z","type":"conversation.state_changed","payload":{"state":"ESCALATED_WAITING"}}\n\n',
      ])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store })
    ch.open()
    await vi.waitFor(() => expect(store.getState().conversationState).toBe('ESCALATED_WAITING'))
    expect(store.getState().messages.map((m) => m.id)).toEqual(['m1', 'm2']) // m1 deduped
    expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_3')
    expect(calls[0]).toContain('/widget/v1/conversations/current/messages')
    expect(calls[1]).toContain('/widget/v1/events?after=evt_v1_conv_demo_01_1')
  })

  it('routes agent.typing (ephemeral) to the store without touching the cursor', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseRes(['event: agent.typing\ndata: {"isTyping":true}\n\n'])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store })
    ch.open()
    await vi.waitFor(() => expect(store.getState().agentTyping).toBe(true))
    expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_1') // unchanged by ephemeral
  })

  it('a 409 CURSOR_RESET_REQUIRED drops the cursor and re-reconciles from a fresh snapshot', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let eventsCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      eventsCall += 1
      if (eventsCall === 1) return jsonRes({ code: 'CURSOR_RESET_REQUIRED' }, 409)
      return sseRes(['event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:05:00Z","type":"message.created","payload":{"messageId":"m2","role":"bot","text":"reanudado"}}\n\n'])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    const messagesCalls = authorizedFetch.mock.calls.filter((c) => String(c[0]).includes('/messages')).length
    expect(messagesCalls).toBe(2) // re-snapshotted after the 409
  })

  it('close aborts the stream and open is idempotent while active', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let opens = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      opens += 1
      return sseRes(['event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:05:00Z","type":"message.created","payload":{"messageId":"m2","role":"bot","text":"x"}}\n\n'])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store })
    ch.open()
    ch.open() // second call must not start a second reconcile
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    ch.close()
    expect(opens).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/events-channel.test.ts`
Expected: FAIL — cannot resolve `../events-channel`.

- [ ] **Step 3: Write the implementation (core; resilience hooks stubbed for Task 10)**

Create `src/transport/events-channel.ts`:

```typescript
import type { SessionClient } from '../shell/session'
import type { MessageStore } from '../store/message-store'
import type { WidgetEvent, MessagesSnapshot } from '../contract/types'
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

function parseEvent(data: string): WidgetEvent | null {
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
  const isOnline = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true)

  let active = false
  let suspended = false
  let streamAc: AbortController | null = null
  let timer: number | null = null
  let polling = false
  let consecutiveFailures = 0
  let cursorReset = false

  const clearTimer = (): void => {
    if (timer !== null) { scheduler.clearTimeout(timer); timer = null }
  }

  const routeFrame = (event: string, data: string): void => {
    if (DURABLE_TYPES.has(event)) {
      const parsed = parseEvent(data)
      if (parsed) deps.store.applyDurableEvent(parsed)
    } else if (event === 'agent.typing') {
      try {
        const v = JSON.parse(data) as { isTyping?: unknown }
        deps.store.setAgentTyping(v.isTyping === true)
      } catch { /* ignore malformed ephemeral */ }
    }
    // presence / heartbeat: ignored (forward-compat)
  }

  const consumeStream = async (body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> => {
    for await (const ev of parseSSEStream(body, signal)) {
      routeFrame(ev.event, ev.data)
    }
  }

  const connectStream = async (): Promise<void> => {
    const after = deps.store.getState().cursor ?? ''
    const ac = new AbortController()
    streamAc = ac
    const res = await deps.client.authorizedFetch(
      `/widget/v1/events?after=${encodeURIComponent(after)}`,
      { signal: ac.signal },
    )
    if (res.status === 409) {
      cursorReset = true
      throw new Error('cursor_reset')
    }
    if (!res.ok || !res.body) throw new Error(`events_http:${res.status}`)
    deps.store.setConnection('live')
    backoff.reset()
    consecutiveFailures = 0
    await consumeStream(res.body, ac.signal)
    // stream ended cleanly (server closed) → treat as a disconnect to reconnect.
    throw new Error('events_closed')
  }

  // reconcile() and the failure/reconnect/poll machinery are completed in Task 10.
  // Task 9 provides a straight-line version: snapshot → connect → (on 409) retry once.
  const snapshot = async (): Promise<void> => {
    const res = await deps.client.authorizedFetch('/widget/v1/conversations/current/messages?limit=50')
    if (!res.ok) throw new Error(`snapshot_http:${res.status}`)
    const snap = (await res.json()) as MessagesSnapshot
    deps.store.applySnapshot(snap)
  }

  const runCore = async (): Promise<void> => {
    await snapshot()
    try {
      await connectStream()
    } catch (err) {
      if (cursorReset) {
        cursorReset = false
        // drop cursor by re-snapshotting from scratch, then reconnect once.
        await snapshot()
        await connectStream().catch(() => onFailure())
        return
      }
      onFailure()
    }
  }

  // onFailure is filled in by Task 10 (reconnect/poll). Task 9 keeps it minimal.
  let onFailure = (): void => {
    deps.store.setConnection('reconnecting')
  }
  // Exposed for Task 10 to replace with the full resilience policy.
  const internals = { get onFailure() { return onFailure }, set onFailure(fn: () => void) { onFailure = fn } }
  void internals
  void backoff; void pollIntervalMs; void isOnline; void polling; void consecutiveFailures; void clearTimer; void suspended

  return {
    open(): void {
      if (active) return
      active = true
      suspended = false
      void runCore()
    },
    close(): void {
      active = false
      streamAc?.abort()
      streamAc = null
      clearTimer()
      deps.store.setConnection('idle')
    },
    suspend(): void { /* completed in Task 10 */ },
    resume(): void { /* completed in Task 10 */ },
    isActive(): boolean { return active },
  }
}
```

> Note: Task 9 leaves `suspend`/`resume`/reconnect/poll deliberately minimal (the tests above don't exercise them). Task 10 rewrites `onFailure`, `suspend`, `resume`, and adds the poll loop against the SAME file. The `void ...` lines silence `noUnusedLocals` for bindings Task 10 will use; remove them in Task 10 as each is wired.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/events-channel.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/transport/events-channel.ts src/transport/__tests__/events-channel.test.ts
git commit -m "feat(widget): canal de eventos — reconciliación head-first, consumo, dedup, cursor reset"
```

---

## Task 10: Events channel — reconnect backoff, polling fallback, lifecycle

**Files:**
- Modify: `src/transport/events-channel.ts`
- Test: `src/transport/__tests__/events-channel-resilience.test.ts`

**Interfaces:**
- Consumes: everything from Task 9 (same file); `createBackoff` (Task 8); `EventsPollResponse` (Task 1).
- Produces: completes `suspend()`, `resume()`; adds reconnect-with-backoff and the `/events/poll` fallback (2 consecutive stream failures → poll every `pollIntervalMs`, retry stream after a poll cycle); sets `connection` to `reconnecting`/`polling`/`offline`/`live` accordingly.

**Behavior:**
- On a stream failure that is **not** a cursor reset: increment `consecutiveFailures`, set `connection = 'reconnecting'`, and after `backoff.nextDelay()` re-run `reconcile()` (snapshot → connect). Reconciliation on every reconnect keeps the store gap-free (dedup absorbs the overlap).
- After **2** consecutive failures: switch to polling. `connection = 'polling'`. Every `pollIntervalMs`, GET `/events/poll?after={cursor}` → apply all durables. A `409` on poll re-snapshots. After each successful poll cycle, attempt `connectStream()` again; on success, stop polling (`backoff.reset()`, `connection = 'live'`).
- `isOnline()` false → `connection = 'offline'`, stop timers; `resume()` (called by lifecycle on `online`) re-reconciles.
- `suspend()` aborts the stream, keeps the cursor, clears timers, does not go offline. `resume()` re-reconciles from the retained cursor if active.

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/events-channel-resilience.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createEventsChannel, type Scheduler } from '../events-channel'
import { createBackoff } from '../backoff'
import { createMessageStore } from '../../store/message-store'
import type { MessagesSnapshot, EventsPollResponse } from '../../contract/types'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sseRes(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}
const SNAP: MessagesSnapshot = {
  messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_1',
}
function eventFrame(seq: number, id: string, text: string): string {
  return `event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_${seq}","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:0${seq}:00Z","type":"message.created","payload":{"messageId":"${id}","role":"bot","text":"${text}"}}\n\n`
}

// A scheduler that runs every scheduled callback immediately (drains delays).
function immediateScheduler(): Scheduler {
  return { setTimeout: (fn) => { queueMicrotask(fn); return 0 }, clearTimeout: () => {} }
}

describe('events channel — resilience', () => {
  it('falls back to polling after 2 consecutive stream failures and applies polled durables', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    let polled = false
    const poll: EventsPollResponse = { events: [], cursor: 'evt_v1_conv_demo_01_2' }
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      if (path.includes('/events/poll')) {
        polled = true
        return jsonRes({
          events: [JSON.parse(eventFrame(2, 'mp', 'desde-poll').replace(/^event: .*\ndata: /, '').trim())],
          cursor: poll.cursor,
        })
      }
      if (path.includes('/events?')) { streamAttempts += 1; return sseRes([], 503) } // always fail the stream
      return jsonRes({})
    })
    const ch = createEventsChannel({
      client: { authorizedFetch }, store,
      scheduler: immediateScheduler(),
      backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }),
      pollIntervalMs: 1,
    })
    ch.open()
    await vi.waitFor(() => expect(polled).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('polling'))
    expect(streamAttempts).toBeGreaterThanOrEqual(2)
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mp')).toBe(true))
    ch.close()
  })

  it('recovers to live: after a polled cycle a working stream stops polling', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      if (path.includes('/events/poll')) return jsonRes({ events: [], cursor: null })
      if (path.includes('/events?')) {
        streamAttempts += 1
        if (streamAttempts <= 2) return sseRes([], 503)          // fail twice → poll
        return sseRes([eventFrame(3, 'mlive', 'en-vivo')])        // then a good stream
      }
      return jsonRes({})
    })
    const ch = createEventsChannel({
      client: { authorizedFetch }, store,
      scheduler: immediateScheduler(),
      backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }),
      pollIntervalMs: 1,
    })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mlive')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    ch.close()
  })

  it('offline stops the channel; resume re-reconciles', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let online = false
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseRes([eventFrame(2, 'm2', 'hola')])
    })
    const ch = createEventsChannel({
      client: { authorizedFetch }, store,
      scheduler: immediateScheduler(),
      backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }),
      isOnline: () => online,
    })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('offline'))
    online = true
    ch.resume()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    ch.close()
  })

  it('suspend aborts the stream but keeps the cursor; resume reconnects from it', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const seenAfter: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      const m = /after=([^&]*)/.exec(path)
      if (m) seenAfter.push(decodeURIComponent(m[1]!))
      return sseRes([eventFrame(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({
      client: { authorizedFetch }, store,
      scheduler: immediateScheduler(),
      backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }),
    })
    ch.open()
    await vi.waitFor(() => expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_2'))
    ch.suspend()
    ch.resume()
    await vi.waitFor(() => expect(seenAfter.length).toBeGreaterThanOrEqual(2))
    expect(seenAfter.at(-1)).toBe('evt_v1_conv_demo_01_2') // reconnected from the retained cursor
    ch.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/events-channel-resilience.test.ts`
Expected: FAIL — `suspend`/`resume` are no-ops and there is no poll loop.

- [ ] **Step 3: Rewrite the resilience machinery in `src/transport/events-channel.ts`**

Add the `EventsPollResponse` import to the existing type import:

```typescript
import type { WidgetEvent, MessagesSnapshot, EventsPollResponse } from '../contract/types'
```

Replace everything from the `runCore` definition down to the `return { ... }` block (i.e. from `const runCore = async` through the end of `createEventsChannel`) with the full policy:

```typescript
  const startPolling = (): void => {
    if (!active || suspended) return
    polling = true
    deps.store.setConnection('polling')
    const tick = async (): Promise<void> => {
      if (!active || suspended || !polling) return
      if (!isOnline()) { goOffline(); return }
      try {
        const after = deps.store.getState().cursor ?? ''
        const res = await deps.client.authorizedFetch(`/widget/v1/events/poll?after=${encodeURIComponent(after)}`)
        if (res.status === 409) { await reconcile(); return }
        if (res.ok) {
          const body = (await res.json()) as EventsPollResponse
          for (const e of body.events) deps.store.applyDurableEvent(e)
        }
      } catch { /* keep polling; the stream retry below may recover */ }
      // after a poll cycle, try to re-establish the live stream
      try {
        await connectStream()
        polling = false // connectStream throws on close/failure; reaching here won't happen,
      } catch (err) {
        if (cursorReset) { cursorReset = false; await reconcile(); return }
        if (!active || suspended) return
        // stream still down → schedule the next poll tick
        timer = scheduler.setTimeout(() => { void tick() }, pollIntervalMs)
      }
    }
    timer = scheduler.setTimeout(() => { void tick() }, pollIntervalMs)
  }

  const goOffline = (): void => {
    clearTimer()
    polling = false
    streamAc?.abort()
    streamAc = null
    deps.store.setConnection('offline')
  }

  onFailure = (): void => {
    if (!active || suspended) return
    if (!isOnline()) { goOffline(); return }
    consecutiveFailures += 1
    if (consecutiveFailures >= 2) { startPolling(); return }
    deps.store.setConnection('reconnecting')
    timer = scheduler.setTimeout(() => { void reconcile() }, backoff.nextDelay())
  }

  async function reconcile(): Promise<void> {
    if (!active || suspended) return
    if (!isOnline()) { goOffline(); return }
    clearTimer()
    try {
      await snapshot()
    } catch { onFailure(); return }
    try {
      await connectStream()
    } catch (err) {
      if (cursorReset) {
        cursorReset = false
        try { await snapshot() } catch { onFailure(); return }
        try { await connectStream() } catch { onFailure() }
        return
      }
      onFailure()
    }
  }

  return {
    open(): void {
      if (active) return
      active = true
      suspended = false
      consecutiveFailures = 0
      polling = false
      backoff.reset()
      void reconcile()
    },
    close(): void {
      active = false
      suspended = false
      polling = false
      streamAc?.abort()
      streamAc = null
      clearTimer()
      deps.store.setConnection('idle')
    },
    suspend(): void {
      if (!active) return
      suspended = true
      polling = false
      streamAc?.abort()
      streamAc = null
      clearTimer()
    },
    resume(): void {
      if (!active) return
      suspended = false
      consecutiveFailures = 0
      backoff.reset()
      void reconcile()
    },
    isActive(): boolean { return active },
  }
```

Then delete the now-obsolete Task 9 stubs from the file: the straight-line `runCore`, the `let onFailure = ...` minimal assignment (keep a forward declaration `let onFailure: () => void = () => {}` near the other `let` bindings so `connectStream`/`startPolling` can reference it before assignment), the `internals` shim, and every `void ...;` guard line. `connectStream`, `snapshot`, `routeFrame`, `consumeStream`, `parseEvent`, and the top `let` state remain as written in Task 9.

> Wiring note: `onFailure` and `reconcile` are mutually recursive with `connectStream`/`startPolling`. Declare `let onFailure: () => void = () => {}` and `function reconcile()` (hoisted) so ordering type-checks. `startPolling` calls `connectStream`; on its throw the `catch` reschedules — a successful stream never returns (it ends by throwing `events_closed`, which routes back through `onFailure` → reconnect), so the `polling = false` line after `connectStream()` is unreachable-by-design but kept for clarity; guard it as shown.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/events-channel-resilience.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Re-run the Task 9 suite (no regressions) + typecheck**

Run: `npx vitest run src/transport/__tests__/events-channel.test.ts src/transport/__tests__/events-channel-resilience.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/transport/events-channel.ts src/transport/__tests__/events-channel-resilience.test.ts
git commit -m "feat(widget): canal de eventos — reconexión con backoff, fallback a polling y ciclo suspend/resume"
```

---

## Task 11: Page lifecycle binding

**Files:**
- Create: `src/shell/lifecycle.ts`
- Test: `src/shell/__tests__/lifecycle.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface LifecycleHandlers { onSuspend(): void; onResume(): void }
  function bindPageLifecycle(target: Window, handlers: LifecycleHandlers): () => void  // returns unbind
  ```
- Behavior: `freeze` + `visibilitychange→hidden` + `offline` → `onSuspend`; `resume` + `pageshow` + `visibilitychange→visible` + `online` → `onResume`. Nothing depends on `unload` (spec §9). The returned function removes every listener.

- [ ] **Step 1: Write the failing test**

Create `src/shell/__tests__/lifecycle.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { bindPageLifecycle } from '../lifecycle'

describe('bindPageLifecycle', () => {
  it('maps freeze/offline/hidden to onSuspend and resume/pageshow/online/visible to onResume', () => {
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
    expect(onSuspend).toHaveBeenCalledTimes(2) // no more after unbind
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shell/__tests__/lifecycle.test.ts`
Expected: FAIL — cannot resolve `../lifecycle`.

- [ ] **Step 3: Write the implementation**

Create `src/shell/lifecycle.ts`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shell/__tests__/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/shell/lifecycle.ts src/shell/__tests__/lifecycle.test.ts
git commit -m "feat(widget): binding de ciclo de vida de página (freeze/resume/online/visibilidad)"
```

---

## Task 12: Transport facade + end-to-end integration

**Files:**
- Create: `src/transport/index.ts`
- Test: `src/transport/__tests__/transport.test.ts`

**Interfaces:**
- Consumes: `createMessageStore` (4–5), `createSender` (7), `createEventsChannel` (9–10), `bindPageLifecycle` (11), `SessionClient` (Plan 1).
- Produces:
  ```typescript
  interface TransportOptions {
    window?: Window
    scheduler?: Scheduler
    backoff?: Backoff
    pollIntervalMs?: number
    uuid?: () => string
    now?: () => string
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
- Wiring: the store is built with `opts.now`; the sender uses `client.getConfig().features.handoff` **is not** the streaming signal — streaming is always attempted first (degrades per Task 7). The sender's `onConversationStarted` calls `channel.open()` (opening the durable channel when the conversation becomes active, spec §4.3 lifecycle). `bindPageLifecycle` maps to `channel.suspend`/`channel.resume`. `destroy()` closes the channel and unbinds lifecycle.

- [ ] **Step 1: Write the failing test**

Create `src/transport/__tests__/transport.test.ts`:

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
function sseRes(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}
const immediate: Scheduler = { setTimeout: (fn) => { queueMicrotask(fn); return 0 }, clearTimeout: () => {} }
const EMPTY_SNAP: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_0' }

function fakeClient(authorizedFetch: SessionClient['authorizedFetch']): SessionClient {
  return { getConfig: () => fixtureConfig(), authorizedFetch, destroy: vi.fn() }
}
let n = 0
const uuid = () => `cid_${++n}`

describe('createTransport (integration)', () => {
  it('send → optimistic → streamed bot reply; durable replay dedups against the streamed bubble', async () => {
    n = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('?')) return jsonRes(EMPTY_SNAP)          // snapshot
      if (path.includes('/stream')) return sseRes([
        'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
        'event: delta\ndata: {"turnId":"t1","delta":"Sí 🙌"}\n\n',
        'event: done\ndata: {"turnId":"t1","messageId":"mbot","eventId":"evt_v1_conv_demo_01_5"}\n\n',
      ])
      if (path.includes('/events?')) return sseRes([
        // durable replay of the same bot message the stream already showed
        'event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_5","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:05:00Z","type":"message.created","payload":{"messageId":"mbot","role":"bot","text":"Sí 🙌"}}\n\n',
      ])
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), { scheduler: immediate, backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }), uuid, now: () => '2026-07-17T15:00:00Z' })
    await t.send('¿Puedo cambiar mi entrada?')
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'mbot')).toBe(true))
    // sending opened the channel (conversation active); the replay must not duplicate the bot bubble
    expect(t.store.getState().messages.filter((m) => m.role === 'bot')).toHaveLength(1)
    expect(t.store.getState().messages.find((m) => m.role === 'user')).toMatchObject({ id: 'u1', status: 'sent' })
    t.destroy()
  })

  it('a server state_changed on the channel drives the client state machine', async () => {
    n = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('?')) return jsonRes(EMPTY_SNAP)
      if (path.includes('/events?')) return sseRes([
        'event: conversation.state_changed\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:06:00Z","type":"conversation.state_changed","payload":{"state":"AGENT_ACTIVE"}}\n\n',
        'event: agent.joined\ndata: {"eventId":"evt_v1_conv_demo_01_3","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:07:00Z","type":"agent.joined","payload":{"agentName":"Laura","agentAvatarUrl":null}}\n\n',
      ])
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), { scheduler: immediate, backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }), uuid, now: () => '2026-07-17T15:00:00Z' })
    t.openChannel()
    await vi.waitFor(() => expect(t.store.getState().conversationState).toBe('AGENT_ACTIVE'))
    expect(t.store.getState().agentName).toBe('Laura')
    t.destroy()
  })

  it('stream drop mid-channel triggers reconcile (re-snapshot) and stays gap-free', async () => {
    n = 0
    let eventsCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('?')) {
        // second snapshot includes the message that the dropped stream missed
        return jsonRes(eventsCall >= 1
          ? { messages: [{ messageId: 'mgap', role: 'bot', text: 'recuperado', createdAt: '2026-07-17T14:08:00Z' }], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_4' }
          : EMPTY_SNAP)
      }
      if (path.includes('/events?')) {
        eventsCall += 1
        if (eventsCall === 1) return sseRes([], 503) // drop immediately
        return sseRes([]) // subsequent stream stays quiet
      }
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), { scheduler: immediate, backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }), uuid, now: () => '2026-07-17T15:00:00Z' })
    t.openChannel()
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'mgap')).toBe(true))
    t.destroy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/__tests__/transport.test.ts`
Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Write the implementation**

Create `src/transport/index.ts`:

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

  const channelDeps = {
    client,
    store,
    ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
    ...(opts.backoff ? { backoff: opts.backoff } : {}),
    ...(opts.pollIntervalMs !== undefined ? { pollIntervalMs: opts.pollIntervalMs } : {}),
  }
  const channel = createEventsChannel(channelDeps)

  const sender = createSender({
    client,
    store,
    streaming: true, // always attempt streaming; Task 7 degrades to non-streaming on transport failure
    ...(opts.uuid ? { uuid: opts.uuid } : {}),
    onConversationStarted: () => channel.open(), // open the durable channel once the conversation is active
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
    destroy: () => {
      unbindLifecycle()
      channel.close()
    },
  }
}
```

> `exactOptionalPropertyTypes` note: build `channelDeps` and the sender options with conditional spreads (`...(x ? { k: x } : {})`) so optional keys are **omitted** when unset rather than set to `undefined`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/__tests__/transport.test.ts`
Expected: PASS (3 integration cases).

- [ ] **Step 5: Run the FULL widget suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: every test (Plan 1 + Plan 2) green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/transport/index.ts src/transport/__tests__/transport.test.ts
git commit -m "feat(widget): fachada de transporte (store + sender + canal + ciclo de vida) e integración e2e"
```

---

## Self-Review

**1. Spec coverage (this slice: widget-rewrite §4.2, §4.3, §5, §9; backend contract §4.2, §4.3):**

| Requirement | Task |
|---|---|
| Message store, single source of truth, observable | 4, 5 |
| Dedup by messageId/eventId; order by seq | 2, 4 |
| Send with Idempotency-Key (UUID/send); optimistic pending/sent/failed + retry | 5, 7 |
| Bot turn SSE: accepted→delta→DONE\|ERROR; fetch-based (no EventSource) | 3, 6 |
| Cancel via AbortController + POST /turns/{id}/cancel | 7 |
| Inbound durable channel: GET /events?after=cursor (fetch SSE); agent.joined/state_changed/typing | 9 |
| Reconnect with backoff+jitter (+circuit breaker) | 8, 10 |
| Channel open only when conversation active (opened on first send) | 12 |
| Reconciliation: snapshot (head-first cursor) → events?after=snapshotCursor; no gaps | 9, 12 |
| Fallback: 2 consecutive stream failures → poll /events/poll (2–5s, backoff) | 10 |
| State machine BOT_ACTIVE→ESCALATED_WAITING→AGENT_ACTIVE→RESOLVED, server-dictated only | 4, 12 |
| Page lifecycle: freeze/resume/pageshow/online/visibilitychange → suspend/reconcile | 11, 12 |
| Cursor protocol: 409 CURSOR_RESET_REQUIRED → fresh snapshot | 9, 10 |
| Reuse SessionClient.authorizedFetch; reuse WidgetEvent types (extend + note) | all; 1 |
| Partial-chunk SSE parse; heartbeats; CRLF | 3 |

Deferred (declared out of scope): visual panel/10 states (Plan 3), theming, rich content schema rendering + upload + feedback wire calls (Plan 4), i18n (Plan 4), bootstrap/session (Plan 1). Ephemeral `presence` is parsed-but-ignored (forward-compat) since no v1 state consumes it; heartbeat is absorbed at the SSE layer.

**2. Placeholder scan:** No `TODO`/`TBD`/"add error handling"/"similar to Task N"/"write tests for the above". Every code step contains complete code; every test step contains real assertions. The two `console.error`/comment-only spots inherited from Plan 1 are untouched.

**3. Type/signature consistency:**
- `SessionClient.authorizedFetch(path, init?)` — used identically in Tasks 6, 7, 9, 10; each passes `path` starting `/widget/v1/...` (matches Plan 1's `${base}${path}`).
- `MessageStore` surface defined in Task 4, extended in Task 5; every consumer (7, 9, 10, 12) calls only methods declared there: `applySnapshot`, `applyDurableEvent`, `addOptimistic`, `ackOptimistic`, `failOptimistic`, `retryOptimistic`, `beginBotTurn`, `appendBotDelta`, `finishBotTurn(turnId, messageId, eventId)`, `failBotTurn`, `setAgentTyping`, `setConnection`, `getState`, `subscribe`. Consistent.
- `WidgetEvent` shape (`eventId`, `schemaVersion`, `conversationId`, `occurredAt`, `type`, `payload`) — the fixtures/tests construct exactly this; `parseEvent` narrows on `type`.
- `TurnStreamFrame.done` carries `turnId` + `messageId` + `eventId`; `runStreamingTurn.onDone(turnId, messageId, eventId)` and `store.finishBotTurn(turnId, messageId, eventId)` agree.
- `Scheduler`/`Backoff` injected consistently across Tasks 9, 10, 12; `createBackoff` signature matches its callers.
- `cursorSeq`/`isNewerCursor` from Task 2 used by the store (Task 4) and the eventId parsing — consistent.

Fixed inline during review: unified `finishBotTurn` to a 3-arg form everywhere; made channel option passing use conditional spreads to satisfy `exactOptionalPropertyTypes`; declared `let onFailure` as a forward reference in Task 10 to resolve the mutual recursion with `connectStream`/`reconcile`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-widget-transport.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (REQUIRED SUB-SKILL: superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in-session with checkpoints (REQUIRED SUB-SKILL: superpowers:executing-plans).
