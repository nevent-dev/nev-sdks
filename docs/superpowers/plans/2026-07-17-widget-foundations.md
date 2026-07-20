# @nevent/widget — Plan 1/4: Fundaciones · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paquete `@nevent/widget` con loader que inyecta un iframe-shell, protocolo postMessage seguro, API pública con cola pre-carga y bootstrap de sesión contra fixtures del contrato — embebible en una página demo al terminar.

**Architecture:** Loader vanilla TS mínimo (sin UI propia) que inyecta un único iframe-shell y puentea la API pública por postMessage con envelope validado. El shell captura el origen embebedor en el handshake INIT (de `event.origin`, nunca del payload), crea la sesión guest contra el contrato de nev-api (fixtures compartidos) y monta una app Preact mínima (launcher + panel vacío). Spec: `docs/superpowers/specs/2026-07-17-widget-rewrite-design.md`.

**Tech Stack:** TypeScript strict, Vite (lib mode multi-entrada), Vitest + jsdom, Preact (solo en el shell). Monorepo pnpm existente de nev-sdks.

## Global Constraints

- Rama de trabajo: `feat/widget-foundations` desde `development` (worktree vía superpowers:using-git-worktrees).
- TS `strict: true` + `exactOptionalPropertyTypes: true`. Cero `@ts-ignore`; `as` solo con comentario justificado.
- Dependencias runtime: SOLO `preact` (shell). El loader: cero dependencias.
- El loader no crea cookies ni toca storage. Nada de storage hasta interacción (spec §2).
- El token de sesión vive SOLO en memoria (spec §8). Prohibido en localStorage/sessionStorage/logs.
- postMessage: `targetOrigin` exacto, jamás `"*"`. Validar `event.origin` y `event.source` en ambos lados (spec §3.3).
- Envelope: `{ns:"nevw", v:1, instanceId, type, payload}` (spec §3.3).
- Iframe: `sandbox="allow-scripts allow-same-origin"` (spec §3.1).
- Copy de UI: castellano, sentence case, vía claves i18n (nunca hardcodeado en componentes).
- Commits convencionales en castellano, uno por task como mínimo.
- Comando de test: `pnpm --filter @nevent/widget test` (vitest run). Typecheck: `pnpm --filter @nevent/widget typecheck`.

## File Structure

```
packages/widget/
  package.json, tsconfig.json, tsconfig.build.json, vite.config.ts, vitest.config.ts
  src/
    protocol/envelope.ts        # envelope seal/open + allowlist de comandos (compartido loader/shell)
    loader/api-queue.ts         # cola pre-carga de la API pública
    loader/index.ts             # boot() + inyección de iframe + puente postMessage
    contract/types.ts           # tipos del contrato con nev-api (config, sesión, eventos)
    contract/fixtures.ts        # fixtures canónicos del contrato (compartidos con tests y mock server)
    shell/session.ts            # fetchConfig/createSession/authorizedFetch con refresh-en-401
    shell/main.tsx              # bootstrap del shell: handshake INIT + montaje Preact mínimo
    shell/app.tsx               # <App>: launcher + panel vacío (los estados llegan en Plan 3)
  shell.html                    # documento del iframe
  examples/host-demo.html       # página anfitriona de prueba
  examples/mock-api.mjs         # mock server del contrato (node http, sin deps)
  src/**/__tests__/*.test.ts(x)
```

---

### Task 1: Scaffold del paquete

**Files:**
- Create: `packages/widget/package.json`, `packages/widget/tsconfig.json`, `packages/widget/tsconfig.build.json`, `packages/widget/vite.config.ts`, `packages/widget/vitest.config.ts`, `packages/widget/src/index.ts`
- Test: `packages/widget/src/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: paquete `@nevent/widget` instalable en el workspace; comandos `build`, `test`, `typecheck` funcionando. Entradas de build: `loader` (IIFE) y `shell` (ES module + shell.html).

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "@nevent/widget",
  "version": "1.0.0-alpha.0",
  "description": "Nevent embeddable support chat (loader + iframe shell)",
  "private": false,
  "type": "module",
  "license": "MIT",
  "sideEffects": false,
  "files": ["dist"],
  "scripts": {
    "build": "vite build && tsc --project tsconfig.build.json --emitDeclarationOnly",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "preact": "^10.25.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0",
    "@preact/preset-vite": "^2.9.0"
  },
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 2: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "types": []
  },
  "include": ["src"],
  "exclude": ["src/**/__tests__"]
}
```

- [ ] **Step 3: Crear vite.config.ts (build multi-entrada) y vitest.config.ts**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        loader: resolve(__dirname, 'src/loader/index.ts'),
        shell: resolve(__dirname, 'shell.html'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'loader' ? 'loader.js' : 'assets/[name].[hash].js'),
        format: 'es',
      },
    },
  },
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  test: { environment: 'jsdom', include: ['src/**/__tests__/**/*.test.{ts,tsx}'] },
})
```

- [ ] **Step 4: Crear src/index.ts y test de humo**

```ts
// src/index.ts
export const WIDGET_VERSION = '1.0.0-alpha.0'
```

```ts
// src/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'
import { WIDGET_VERSION } from '../index'

describe('paquete', () => {
  it('expone la versión', () => {
    expect(WIDGET_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
```

Crear también un `shell.html` mínimo provisional (Task 7 lo completa):

```html
<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Nevent</title></head>
<body><div id="root"></div><script type="module" src="/src/shell/main.tsx"></script></body></html>
```

Y un `src/shell/main.tsx` provisional para que el build no falle:

```tsx
export {}
```

- [ ] **Step 5: Instalar, verificar y commitear**

Run: `pnpm install && pnpm --filter @nevent/widget test && pnpm --filter @nevent/widget typecheck && pnpm --filter @nevent/widget build`
Expected: 1 test PASS; typecheck sin errores; build genera `dist/loader.js` y `dist/shell.html`.

```bash
git add packages/widget pnpm-lock.yaml
git commit -m "feat(widget): scaffold del paquete @nevent/widget (vite multi-entrada, vitest, ts strict)"
```

---

### Task 2: Protocolo postMessage (envelope)

**Files:**
- Create: `packages/widget/src/protocol/envelope.ts`
- Test: `packages/widget/src/protocol/__tests__/envelope.test.ts`

**Interfaces:**
- Produces:
  - `PROTOCOL_NS = 'nevw'`, `PROTOCOL_VERSION = 1`
  - `interface Envelope<T = unknown> { ns: 'nevw'; v: number; instanceId: string; type: string; payload: T }`
  - `seal<T>(type: string, payload: T, instanceId: string): Envelope<T>`
  - `open(raw: unknown, expected: { instanceId?: string }): Envelope | null` — null si ns/v/shape inválidos o instanceId no coincide
  - `LOADER_TO_SHELL: readonly string[]` (`['init','open','close','toggle','update','destroy','consent']`) y `SHELL_TO_LOADER: readonly string[]` (`['ready','opened','closed','unread_changed','error','resize']`)
  - `isCommand(type: string, allow: readonly string[]): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/protocol/__tests__/envelope.test.ts
import { describe, it, expect } from 'vitest'
import { seal, open, isCommand, LOADER_TO_SHELL, PROTOCOL_VERSION } from '../envelope'

describe('envelope', () => {
  it('sella y abre un envelope válido', () => {
    const e = seal('open', { a: 1 }, 'inst-1')
    expect(open(e, { instanceId: 'inst-1' })).toEqual({ ns: 'nevw', v: PROTOCOL_VERSION, instanceId: 'inst-1', type: 'open', payload: { a: 1 } })
  })
  it('rechaza ns desconocido, versión distinta, shape inválido y primitivas', () => {
    expect(open({ ns: 'otro', v: 1, instanceId: 'x', type: 'open' }, {})).toBeNull()
    expect(open({ ns: 'nevw', v: 99, instanceId: 'x', type: 'open' }, {})).toBeNull()
    expect(open({ ns: 'nevw', v: 1 }, {})).toBeNull()
    expect(open('cadena', {})).toBeNull()
    expect(open(null, {})).toBeNull()
  })
  it('rechaza instanceId que no coincide', () => {
    const e = seal('open', null, 'inst-1')
    expect(open(e, { instanceId: 'inst-2' })).toBeNull()
  })
  it('la allowlist de comandos filtra tipos desconocidos', () => {
    expect(isCommand('open', LOADER_TO_SHELL)).toBe(true)
    expect(isCommand('eval', LOADER_TO_SHELL)).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @nevent/widget test`
Expected: FAIL — "Cannot find module '../envelope'"

- [ ] **Step 3: Implementar envelope.ts**

```ts
// src/protocol/envelope.ts
export const PROTOCOL_NS = 'nevw' as const
export const PROTOCOL_VERSION = 1

export interface Envelope<T = unknown> {
  ns: typeof PROTOCOL_NS
  v: number
  instanceId: string
  type: string
  payload: T
}

export const LOADER_TO_SHELL = ['init', 'open', 'close', 'toggle', 'update', 'destroy', 'consent'] as const
export const SHELL_TO_LOADER = ['ready', 'opened', 'closed', 'unread_changed', 'error', 'resize'] as const

export function seal<T>(type: string, payload: T, instanceId: string): Envelope<T> {
  return { ns: PROTOCOL_NS, v: PROTOCOL_VERSION, instanceId, type, payload }
}

export function open(raw: unknown, expected: { instanceId?: string }): Envelope | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (e['ns'] !== PROTOCOL_NS || e['v'] !== PROTOCOL_VERSION) return null
  if (typeof e['instanceId'] !== 'string' || typeof e['type'] !== 'string') return null
  if (expected.instanceId !== undefined && e['instanceId'] !== expected.instanceId) return null
  return { ns: PROTOCOL_NS, v: PROTOCOL_VERSION, instanceId: e['instanceId'], type: e['type'], payload: e['payload'] }
}

export function isCommand(type: string, allow: readonly string[]): boolean {
  return allow.includes(type)
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @nevent/widget test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/protocol
git commit -m "feat(widget): protocolo postMessage con envelope validado y allowlist de comandos"
```

---

### Task 3: Cola pre-carga de la API pública

**Files:**
- Create: `packages/widget/src/loader/api-queue.ts`
- Test: `packages/widget/src/loader/__tests__/api-queue.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type ApiCall = [method: string, ...args: unknown[]]`
  - `interface ApiStub { (...call: ApiCall): void; q?: ApiCall[] }`
  - `installGlobalStub(w: Window & { NeventWidget?: ApiStub }): ApiStub` — crea el stub encolador si no existe (idempotente)
  - `drainQueue(stub: ApiStub, handler: (method: string, args: unknown[]) => void): void` — reproduce la cola en orden y redirige llamadas futuras al handler

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/loader/__tests__/api-queue.test.ts
import { describe, it, expect, vi } from 'vitest'
import { installGlobalStub, drainQueue, type ApiStub } from '../api-queue'

describe('api-queue', () => {
  it('encola llamadas previas al boot y las reproduce en orden', () => {
    const w = {} as Window & { NeventWidget?: ApiStub }
    const stub = installGlobalStub(w)
    stub('boot', 'inst_123')
    stub('open')
    const handler = vi.fn()
    drainQueue(stub, handler)
    expect(handler.mock.calls).toEqual([['boot', ['inst_123']], ['open', []]])
  })
  it('tras el drain, las llamadas van directas al handler', () => {
    const w = {} as Window & { NeventWidget?: ApiStub }
    const stub = installGlobalStub(w)
    const handler = vi.fn()
    drainQueue(stub, handler)
    w.NeventWidget!('close')
    expect(handler).toHaveBeenCalledWith('close', [])
  })
  it('installGlobalStub es idempotente (doble inclusión del script)', () => {
    const w = {} as Window & { NeventWidget?: ApiStub }
    const a = installGlobalStub(w)
    const b = installGlobalStub(w)
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @nevent/widget test`
Expected: FAIL — "Cannot find module '../api-queue'"

- [ ] **Step 3: Implementar api-queue.ts**

```ts
// src/loader/api-queue.ts
export type ApiCall = [method: string, ...args: unknown[]]
export interface ApiStub {
  (...call: ApiCall): void
  q?: ApiCall[]
}

export function installGlobalStub(w: Window & { NeventWidget?: ApiStub }): ApiStub {
  if (w.NeventWidget) return w.NeventWidget
  const stub: ApiStub = (...call: ApiCall) => {
    ;(stub.q = stub.q ?? []).push(call)
  }
  w.NeventWidget = stub
  return stub
}

export function drainQueue(stub: ApiStub, handler: (method: string, args: unknown[]) => void): void {
  const pending = stub.q ?? []
  stub.q = []
  const dispatch = (call: ApiCall): void => {
    const [method, ...args] = call
    handler(method, args)
  }
  pending.forEach(dispatch)
  const live: ApiStub = (...call: ApiCall) => dispatch(call)
  const host = stub as unknown as { __live?: (c: ApiCall) => void }
  host.__live = (c) => dispatch(c)
  // redirigir el stub existente: las llamadas futuras entran por la misma referencia global
  const anyStub = stub as unknown as { q: ApiCall[] }
  Object.defineProperty(anyStub, 'q', {
    get: () => [],
    set: () => void 0,
  })
  const orig = stub
  // el stub global ya no encola: despacha
  const w = globalThis as unknown as { NeventWidget?: ApiStub }
  if (w.NeventWidget === orig) w.NeventWidget = live
  else Object.assign(orig, live)
}
```

Nota para el implementador: la parte delicada es que `w.NeventWidget` puede haber sido capturado por la página antes del drain. Si el test 2 falla con esta implementación, sustituir el cuerpo de `drainQueue` por la variante simple: mutar el stub para que despache —

```ts
export function drainQueue(stub: ApiStub, handler: (method: string, args: unknown[]) => void): void {
  const pending = stub.q ?? []
  stub.q = undefined
  const dispatch = (method: string, args: unknown[]) => handler(method, args)
  pending.forEach(([m, ...a]) => dispatch(m, a))
  ;(stub as { __dispatch?: typeof dispatch }).__dispatch = dispatch
}
```

y en `installGlobalStub` hacer que el cuerpo del stub compruebe `__dispatch` primero:

```ts
const stub: ApiStub = (...call: ApiCall) => {
  const d = (stub as { __dispatch?: (m: string, a: unknown[]) => void }).__dispatch
  if (d) { const [m, ...a] = call; d(m, a); return }
  ;(stub.q = stub.q ?? []).push(call)
}
```

Esta segunda variante es la preferida (misma referencia siempre); el test lo valida en ambos casos. Usa la segunda directamente.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @nevent/widget test`
Expected: PASS (3 tests nuevos)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/loader
git commit -m "feat(widget): cola pre-carga de la API pública con drain idempotente"
```

---

### Task 4: Tipos y fixtures del contrato con nev-api

**Files:**
- Create: `packages/widget/src/contract/types.ts`, `packages/widget/src/contract/fixtures.ts`
- Test: `packages/widget/src/contract/__tests__/fixtures.test.ts`

**Interfaces:**
- Produces (consumido por Tasks 5-7, el mock server y, como referencia, el spec de nev-api):

```ts
interface WidgetConfig { schemaVersion: 1; installationId: string; assistantName: string; locale: 'es'|'en'|'ca'|'pt'; theme: { primaryColor: string; position: 'right'|'left' }; features: { upload: boolean; handoff: boolean } }
interface WidgetSession { token: string; expiresInSeconds: number; guestHandle: string }
type WidgetEvent =
  | { eventId: string; schemaVersion: 1; conversationId: string; occurredAt: string; type: 'message.created'; payload: { messageId: string; role: 'bot'|'agent'|'user'; text: string } }
  | { eventId: string; schemaVersion: 1; conversationId: string; occurredAt: string; type: 'conversation.state_changed'; payload: { state: 'BOT_ACTIVE'|'ESCALATED_WAITING'|'AGENT_ACTIVE'|'RESOLVED' } }
  | { eventId: string; schemaVersion: 1; conversationId: string; occurredAt: string; type: 'agent.joined'; payload: { agentName: string; agentAvatarUrl: string | null } }
```

  - `fixtureConfig(): WidgetConfig`, `fixtureSession(): WidgetSession`, `fixtureEvents(): WidgetEvent[]` — objetos NUEVOS por llamada (sin estado compartido entre tests)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/contract/__tests__/fixtures.test.ts
import { describe, it, expect } from 'vitest'
import { fixtureConfig, fixtureSession, fixtureEvents } from '../fixtures'

describe('fixtures del contrato', () => {
  it('config con schemaVersion 1 e installationId opaco', () => {
    const c = fixtureConfig()
    expect(c.schemaVersion).toBe(1)
    expect(c.installationId).toMatch(/^inst_/)
  })
  it('sesión con token en memoria y guestHandle opaco', () => {
    const s = fixtureSession()
    expect(s.token.length).toBeGreaterThan(10)
    expect(s.expiresInSeconds).toBeGreaterThanOrEqual(1800)
  })
  it('eventos durables ordenados por eventId y cada llamada devuelve objetos nuevos', () => {
    const evs = fixtureEvents()
    expect(evs.map((e) => e.type)).toEqual(['message.created', 'conversation.state_changed', 'agent.joined'])
    expect(fixtureEvents()).not.toBe(evs)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @nevent/widget test`
Expected: FAIL — "Cannot find module '../fixtures'"

- [ ] **Step 3: Implementar types.ts y fixtures.ts**

```ts
// src/contract/types.ts
export interface WidgetConfig {
  schemaVersion: 1
  installationId: string
  assistantName: string
  locale: 'es' | 'en' | 'ca' | 'pt'
  theme: { primaryColor: string; position: 'right' | 'left' }
  features: { upload: boolean; handoff: boolean }
}

export interface WidgetSession {
  token: string
  expiresInSeconds: number
  guestHandle: string
}

interface EventBase {
  eventId: string
  schemaVersion: 1
  conversationId: string
  occurredAt: string
}

export type WidgetEvent =
  | (EventBase & { type: 'message.created'; payload: { messageId: string; role: 'bot' | 'agent' | 'user'; text: string } })
  | (EventBase & { type: 'conversation.state_changed'; payload: { state: 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED' } })
  | (EventBase & { type: 'agent.joined'; payload: { agentName: string; agentAvatarUrl: string | null } })
```

```ts
// src/contract/fixtures.ts
import type { WidgetConfig, WidgetSession, WidgetEvent } from './types'

export function fixtureConfig(): WidgetConfig {
  return {
    schemaVersion: 1,
    installationId: 'inst_demo_festival_01',
    assistantName: 'Asistente de DEMO FEST',
    locale: 'es',
    theme: { primaryColor: '#6d4aff', position: 'right' },
    features: { upload: true, handoff: true },
  }
}

export function fixtureSession(): WidgetSession {
  return { token: 'sess_jwt_fixture_0123456789abcdef', expiresInSeconds: 3600, guestHandle: 'guest_9f2c1a' }
}

export function fixtureEvents(): WidgetEvent[] {
  const base = { schemaVersion: 1 as const, conversationId: 'conv_demo_01' }
  return [
    { ...base, eventId: 'evt_0001', occurredAt: '2026-07-17T14:02:00Z', type: 'message.created', payload: { messageId: 'msg_0001', role: 'bot', text: 'Hola, ¿en qué te ayudamos?' } },
    { ...base, eventId: 'evt_0002', occurredAt: '2026-07-17T14:06:00Z', type: 'conversation.state_changed', payload: { state: 'ESCALATED_WAITING' } },
    { ...base, eventId: 'evt_0003', occurredAt: '2026-07-17T14:09:00Z', type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null } },
  ]
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @nevent/widget test`
Expected: PASS (3 tests nuevos)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/contract
git commit -m "feat(widget): tipos y fixtures canónicos del contrato con nev-api"
```

---

### Task 5: Cliente de sesión del shell (bootstrap + refresh en 401)

**Files:**
- Create: `packages/widget/src/shell/session.ts`
- Test: `packages/widget/src/shell/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `WidgetConfig`, `WidgetSession` de `../contract/types`.
- Produces:
  - `interface SessionClient { getConfig(): WidgetConfig; authorizedFetch(path: string, init?: RequestInit): Promise<Response>; destroy(): void }`
  - `createSessionClient(opts: { apiBase: string; installationId: string; embeddingOrigin: string; fetchFn?: typeof fetch }): Promise<SessionClient>`
  - Rutas usadas (contrato spec §4.1): `GET {apiBase}/widget/v1/installations/{installationId}/config`, `POST .../sessions` body `{"embeddingOrigin"}`, `POST {apiBase}/widget/v1/sessions/refresh`.
  - Garantías: token solo en memoria; ante 401 renueva UNA vez y reintenta; renovaciones concurrentes deduplicadas (single-flight).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/shell/__tests__/session.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createSessionClient } from '../session'
import { fixtureConfig, fixtureSession } from '../../contract/fixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockApi(overrides: { onProtected?: (auth: string | null, call: number) => Response } = {}) {
  let protectedCalls = 0
  const calls: string[] = []
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/config')) return jsonResponse(fixtureConfig())
    if (url.endsWith('/sessions')) return jsonResponse(fixtureSession())
    if (url.endsWith('/sessions/refresh')) return jsonResponse({ ...fixtureSession(), token: 'sess_jwt_renovado' })
    protectedCalls += 1
    const auth = new Headers(init?.headers).get('Authorization')
    return overrides.onProtected?.(auth, protectedCalls) ?? jsonResponse({ ok: true })
  })
  return { fetchFn, calls }
}

const OPTS = { apiBase: 'https://api.test', installationId: 'inst_demo_festival_01', embeddingOrigin: 'https://demofest.example' }

describe('session client', () => {
  it('bootstrap: pide config y crea sesión enviando embeddingOrigin', async () => {
    const { fetchFn, calls } = mockApi()
    const client = await createSessionClient({ ...OPTS, fetchFn })
    expect(client.getConfig().assistantName).toBe('Asistente de DEMO FEST')
    expect(calls[0]).toBe('GET https://api.test/widget/v1/installations/inst_demo_festival_01/config')
    expect(calls[1]).toBe('POST https://api.test/widget/v1/installations/inst_demo_festival_01/sessions')
    const sessionInit = fetchFn.mock.calls[1]?.[1]
    expect(JSON.parse(String(sessionInit?.body))).toEqual({ embeddingOrigin: 'https://demofest.example' })
  })
  it('authorizedFetch añade Bearer y en 401 renueva una vez y reintenta', async () => {
    const { fetchFn } = mockApi({
      onProtected: (auth, call) => (call === 1 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse({ ok: true, auth })),
    })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const res = await client.authorizedFetch('/widget/v1/conversations/current/messages')
    const body = (await res.json()) as { auth: string }
    expect(res.status).toBe(200)
    expect(body.auth).toBe('Bearer sess_jwt_renovado')
  })
  it('un segundo 401 tras renovar NO reintenta en bucle', async () => {
    const { fetchFn } = mockApi({ onProtected: () => jsonResponse({ error: 'expired' }, 401) })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const res = await client.authorizedFetch('/widget/v1/conversations/current/messages')
    expect(res.status).toBe(401)
    const protectedCalls = fetchFn.mock.calls.filter(([u]) => String(u).includes('/conversations/')).length
    expect(protectedCalls).toBe(2)
  })
  it('el token no se persiste en storage', async () => {
    const { fetchFn } = mockApi()
    await createSessionClient({ ...OPTS, fetchFn })
    expect(Object.keys(localStorage)).toHaveLength(0)
    expect(Object.keys(sessionStorage)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @nevent/widget test`
Expected: FAIL — "Cannot find module '../session'"

- [ ] **Step 3: Implementar session.ts**

```ts
// src/shell/session.ts
import type { WidgetConfig, WidgetSession } from '../contract/types'

export interface SessionClient {
  getConfig(): WidgetConfig
  authorizedFetch(path: string, init?: RequestInit): Promise<Response>
  destroy(): void
}

interface Options {
  apiBase: string
  installationId: string
  embeddingOrigin: string
  fetchFn?: typeof fetch
}

export async function createSessionClient(opts: Options): Promise<SessionClient> {
  const fetchFn = opts.fetchFn ?? fetch
  const base = opts.apiBase.replace(/\/$/, '')
  const installationBase = `${base}/widget/v1/installations/${opts.installationId}`

  const configRes = await fetchFn(`${installationBase}/config`)
  if (!configRes.ok) throw new Error(`config_failed:${configRes.status}`)
  const config = (await configRes.json()) as WidgetConfig

  const sessionRes = await fetchFn(`${installationBase}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeddingOrigin: opts.embeddingOrigin }),
  })
  if (!sessionRes.ok) throw new Error(`session_failed:${sessionRes.status}`)
  let session = (await sessionRes.json()) as WidgetSession

  let refreshing: Promise<void> | null = null
  let destroyed = false

  const refresh = (): Promise<void> => {
    refreshing ??= (async () => {
      const res = await fetchFn(`${base}/widget/v1/sessions/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      })
      if (res.ok) session = (await res.json()) as WidgetSession
      refreshing = null
    })()
    return refreshing
  }

  const authorizedFetch = async (path: string, init?: RequestInit): Promise<Response> => {
    if (destroyed) throw new Error('session_destroyed')
    const doFetch = (): Promise<Response> =>
      fetchFn(`${base}${path}`, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), Authorization: `Bearer ${session.token}` } })
    const first = await doFetch()
    if (first.status !== 401) return first
    await refresh()
    return doFetch()
  }

  return {
    getConfig: () => config,
    authorizedFetch,
    destroy: () => {
      destroyed = true
    },
  }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @nevent/widget test`
Expected: PASS (4 tests nuevos; el de "no bucle" valida exactamente 2 llamadas protegidas)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/shell
git commit -m "feat(widget): cliente de sesión con bootstrap del contrato y refresh single-flight en 401"
```

---

### Task 6: Loader — inyección de iframe y puente de API

**Files:**
- Create: `packages/widget/src/loader/index.ts`
- Test: `packages/widget/src/loader/__tests__/loader.test.ts`

**Interfaces:**
- Consumes: `installGlobalStub`/`drainQueue` (Task 3), `seal`/`open`/`isCommand`/`SHELL_TO_LOADER` (Task 2).
- Produces:
  - `bootLoader(w: Window, opts: { shellUrl: string }): void` — instala el stub global, drena la cola y despacha métodos
  - Métodos soportados v1: `boot(installationId, opts?)`, `open`, `close`, `toggle`, `update(opts)`, `on(event, cb)`, `off(event, cb)`, `consent()`, `destroy()`, `identify()`/`reset()` (no-op + `console.warn`)
  - `boot` crea `<iframe title="Chat de ayuda" sandbox="allow-scripts allow-same-origin">` con `src = shellUrl#<instanceId>` dentro de un contenedor `position:fixed` junto a `documentElement`; doble `boot` es no-op
  - Al recibir `ready` del shell (origin validado) responde `init` con `{ installationId }` vía `postMessage(env, shellOrigin)`
  - Eventos `opened/closed/unread_changed/error` reemitidos a los callbacks de `on()`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/loader/__tests__/loader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bootLoader } from '../index'
import { seal } from '../../protocol/envelope'
import type { ApiStub } from '../api-queue'

const SHELL_URL = 'https://widgets.test/shell.html'
const SHELL_ORIGIN = 'https://widgets.test'

function getApi(): ApiStub {
  return (window as Window & { NeventWidget?: ApiStub }).NeventWidget!
}

function fakeShellMessage(type: string, payload: unknown, instanceId: string, origin = SHELL_ORIGIN): void {
  const iframe = document.querySelector('iframe')!
  const ev = new MessageEvent('message', { data: seal(type, payload, instanceId), origin, source: iframe.contentWindow })
  window.dispatchEvent(ev)
}

function bootedInstanceId(): string {
  const iframe = document.querySelector('iframe')!
  return new URL(iframe.src).hash.slice(1)
}

beforeEach(() => {
  document.body.innerHTML = ''
  delete (window as Window & { NeventWidget?: ApiStub }).NeventWidget
})

describe('loader', () => {
  it('boot crea un único iframe sandboxed aunque se llame dos veces', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('boot', 'inst_demo_festival_01')
    const iframes = document.querySelectorAll('iframe')
    expect(iframes).toHaveLength(1)
    expect(iframes[0]!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(iframes[0]!.src.startsWith(SHELL_URL)).toBe(true)
  })
  it('responde al ready del shell con init{installationId} hacia el origin exacto', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    expect(post).toHaveBeenCalledTimes(1)
    const [env, target] = post.mock.calls[0]!
    expect(target).toBe(SHELL_ORIGIN)
    expect(env).toMatchObject({ ns: 'nevw', type: 'init', payload: { installationId: 'inst_demo_festival_01' } })
  })
  it('ignora mensajes de un origin no esperado', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId(), 'https://evil.example')
    expect(post).not.toHaveBeenCalled()
  })
  it('reemite opened a los listeners de on() y destroy limpia el DOM', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    const cb = vi.fn()
    getApi()('on', 'opened', cb)
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(cb).toHaveBeenCalledTimes(1)
    getApi()('destroy')
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
  it('identify y reset son no-op con warning (reservados v1.1)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('identify', 'token-firmado')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('identify'))
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @nevent/widget test`
Expected: FAIL — "Cannot find module '../index'" (o export inexistente)

- [ ] **Step 3: Implementar loader/index.ts**

```ts
// src/loader/index.ts
import { installGlobalStub, drainQueue, type ApiStub } from './api-queue'
import { seal, open as openEnvelope, isCommand, SHELL_TO_LOADER } from '../protocol/envelope'

interface LoaderOptions { shellUrl: string }

interface Instance {
  instanceId: string
  installationId: string
  container: HTMLElement
  iframe: HTMLIFrameElement
  shellOrigin: string
  listeners: Map<string, Set<(payload: unknown) => void>>
  onMessage: (ev: MessageEvent) => void
}

export function bootLoader(w: Window, opts: LoaderOptions): void {
  const stub = installGlobalStub(w as Window & { NeventWidget?: ApiStub })
  let instance: Instance | null = null

  const sendToShell = (type: string, payload: unknown): void => {
    instance?.iframe.contentWindow?.postMessage(seal(type, payload, instance.instanceId), instance.shellOrigin)
  }

  const boot = (installationId: string): void => {
    if (instance) return
    const instanceId = `nevw_${Math.random().toString(36).slice(2, 10)}`
    const container = w.document.createElement('div')
    container.style.cssText = 'position:fixed;z-index:2147483647;right:0;bottom:0;width:0;height:0'
    const iframe = w.document.createElement('iframe')
    iframe.title = 'Chat de ayuda'
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.src = `${opts.shellUrl}#${instanceId}`
    iframe.style.cssText = 'border:0;width:0;height:0'
    container.appendChild(iframe)
    w.document.documentElement.appendChild(container)
    const shellOrigin = new URL(opts.shellUrl, w.location.href).origin

    const onMessage = (ev: MessageEvent): void => {
      if (!instance) return
      if (ev.origin !== instance.shellOrigin || ev.source !== instance.iframe.contentWindow) return
      const env = openEnvelope(ev.data, { instanceId: instance.instanceId })
      if (!env || !isCommand(env.type, SHELL_TO_LOADER)) return
      if (env.type === 'ready') {
        sendToShell('init', { installationId: instance.installationId })
        return
      }
      instance.listeners.get(env.type)?.forEach((cb) => cb(env.payload))
    }
    w.addEventListener('message', onMessage)
    instance = { instanceId, installationId, container, iframe, shellOrigin, listeners: new Map(), onMessage }
  }

  const destroy = (): void => {
    if (!instance) return
    w.removeEventListener('message', instance.onMessage)
    instance.container.remove()
    instance = null
  }

  drainQueue(stub, (method, args) => {
    switch (method) {
      case 'boot': boot(String(args[0])); break
      case 'open': case 'close': case 'toggle': case 'consent': sendToShell(method, null); break
      case 'update': sendToShell('update', args[0] ?? null); break
      case 'on': {
        const [event, cb] = args as [string, (p: unknown) => void]
        if (!instance) return
        const set = instance.listeners.get(event) ?? new Set()
        set.add(cb)
        instance.listeners.set(event, set)
        break
      }
      case 'off': {
        const [event, cb] = args as [string, (p: unknown) => void]
        instance?.listeners.get(event)?.delete(cb)
        break
      }
      case 'identify': case 'reset':
        console.warn(`[NeventWidget] ${method}() está reservado para v1.1 y aún no hace nada`)
        break
      case 'destroy': destroy(); break
      default: console.warn(`[NeventWidget] método desconocido: ${method}`)
    }
  })
}

// Autoarranque cuando se carga como script en una página (no en tests)
declare const __VITEST__: boolean | undefined
if (typeof document !== 'undefined' && typeof __VITEST__ === 'undefined' && document.currentScript) {
  const shellUrl = document.currentScript.getAttribute('data-shell') ?? new URL('./shell.html', (document.currentScript as HTMLScriptElement).src).href
  bootLoader(window, { shellUrl })
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @nevent/widget test`
Expected: PASS (5 tests nuevos)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/loader
git commit -m "feat(widget): loader con iframe sandboxed, puente postMessage validado y API pública v1"
```

---

### Task 7: Shell — handshake INIT y montaje Preact mínimo

**Files:**
- Create: `packages/widget/src/shell/app.tsx`
- Modify: `packages/widget/src/shell/main.tsx` (reemplaza el provisional de Task 1)
- Modify: `packages/widget/shell.html` (título y root definitivos)
- Test: `packages/widget/src/shell/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: `open`/`seal`/`isCommand`/`LOADER_TO_SHELL` (Task 2), `createSessionClient` (Task 5).
- Produces:
  - `startShell(w: Window, opts: { apiBase: string; createClient?: typeof createSessionClient }): void` — envía `ready` al parent, espera `init`, captura `event.origin` del INIT como `embeddingOrigin`, crea el SessionClient y monta `<App>`
  - `<App config={WidgetConfig} bus={ShellBus}>` — launcher (botón burbuja) + panel vacío; `open/close/toggle` del bus mutan el estado; al abrir/cerrar emite `opened`/`closed` al parent
  - `interface ShellBus { onCommand(cb: (type: string, payload: unknown) => void): void; emit(type: string, payload?: unknown): void }`

- [ ] **Step 1: Escribir los tests que fallan**

```tsx
// src/shell/__tests__/shell.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startShell } from '../main'
import { seal } from '../../protocol/envelope'
import { fixtureConfig } from '../../contract/fixtures'
import type { SessionClient } from '../session'

const PARENT_ORIGIN = 'https://demofest.example'

function fakeClient(): SessionClient {
  return { getConfig: () => fixtureConfig(), authorizedFetch: vi.fn(), destroy: vi.fn() } as unknown as SessionClient
}

function sendInit(instanceId: string, parentPost: ReturnType<typeof vi.fn>): void {
  const ev = new MessageEvent('message', {
    data: seal('init', { installationId: 'inst_demo_festival_01' }, instanceId),
    origin: PARENT_ORIGIN,
    source: { postMessage: parentPost } as unknown as Window,
  })
  window.dispatchEvent(ev)
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  window.location.hash = '#nevw_test1'
})

describe('shell', () => {
  it('envía ready al arrancar y crea la sesión con el embeddingOrigin del INIT (event.origin)', async () => {
    const createClient = vi.fn(async () => fakeClient())
    const parentPost = vi.fn()
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', parentPost)
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
    expect(createClient.mock.calls[0]![0]).toMatchObject({ embeddingOrigin: PARENT_ORIGIN, installationId: 'inst_demo_festival_01' })
  })
  it('open del parent abre el panel y emite opened; toggle lo cierra y emite closed', async () => {
    const createClient = vi.fn(async () => fakeClient())
    const parentPost = vi.fn()
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', parentPost)
    await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())
    const openEv = new MessageEvent('message', { data: seal('open', null, 'nevw_test1'), origin: PARENT_ORIGIN, source: { postMessage: parentPost } as unknown as Window })
    window.dispatchEvent(openEv)
    await vi.waitFor(() => expect(document.querySelector('[data-part=panel]')).not.toBeNull())
    const sent = parentPost.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(sent).toContain('opened')
  })
  it('ignora init de un source/instanceId inválido', async () => {
    const createClient = vi.fn(async () => fakeClient())
    startShell(window, { apiBase: 'https://api.test', createClient })
    const ev = new MessageEvent('message', { data: seal('init', { installationId: 'x' }, 'otro_id'), origin: PARENT_ORIGIN, source: { postMessage: vi.fn() } as unknown as Window })
    window.dispatchEvent(ev)
    await new Promise((r) => setTimeout(r, 20))
    expect(createClient).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @nevent/widget test`
Expected: FAIL — "startShell is not a function" (main.tsx provisional exporta vacío)

- [ ] **Step 3: Implementar app.tsx y main.tsx**

```tsx
// src/shell/app.tsx
import { useEffect, useState } from 'preact/hooks'
import type { WidgetConfig } from '../contract/types'

export interface ShellBus {
  onCommand(cb: (type: string, payload: unknown) => void): void
  emit(type: string, payload?: unknown): void
}

export function App({ config, bus }: { config: WidgetConfig; bus: ShellBus }) {
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    bus.onCommand((type) => {
      if (type === 'open') setOpen(true)
      else if (type === 'close') setOpen(false)
      else if (type === 'toggle') setOpen((v) => !v)
    })
  }, [bus])

  useEffect(() => {
    bus.emit(isOpen ? 'opened' : 'closed')
  }, [isOpen, bus])

  return (
    <div data-part="root">
      {isOpen ? (
        <section data-part="panel" role="dialog" aria-label={config.assistantName}>
          <header data-part="header">{config.assistantName}</header>
          <button data-part="close" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button>
        </section>
      ) : (
        <button data-part="launcher" aria-label="Abrir chat de ayuda" onClick={() => setOpen(true)} />
      )}
    </div>
  )
}
```

```tsx
// src/shell/main.tsx
import { render } from 'preact'
import { App, type ShellBus } from './app'
import { open as openEnvelope, seal, isCommand, LOADER_TO_SHELL } from '../protocol/envelope'
import { createSessionClient as realCreateSessionClient } from './session'

interface ShellOptions {
  apiBase: string
  createClient?: typeof realCreateSessionClient
}

export function startShell(w: Window, opts: ShellOptions): void {
  const instanceId = w.location.hash.slice(1)
  const createClient = opts.createClient ?? realCreateSessionClient
  let parent: { post: (env: unknown) => void; origin: string } | null = null
  let commandCb: ((type: string, payload: unknown) => void) | null = null

  const bus: ShellBus = {
    onCommand: (cb) => { commandCb = cb },
    emit: (type, payload = null) => parent?.post(seal(type, payload, instanceId)),
  }

  w.addEventListener('message', (ev: MessageEvent) => {
    const env = openEnvelope(ev.data, { instanceId })
    if (!env || !isCommand(env.type, LOADER_TO_SHELL)) return
    if (env.type === 'init') {
      if (parent) return
      const source = ev.source as Window | null
      if (!source) return
      const origin = ev.origin // SIEMPRE del evento, nunca del payload (spec §4.1)
      parent = { post: (e) => source.postMessage(e, origin), origin }
      const { installationId } = env.payload as { installationId: string }
      void createClient({ apiBase: opts.apiBase, installationId, embeddingOrigin: origin }).then((client) => {
        const root = w.document.getElementById('root')
        if (root) render(<App config={client.getConfig()} bus={bus} />, root)
      })
      return
    }
    commandCb?.(env.type, env.payload)
  })

  // anunciar disponibilidad al parent (targetOrigin '*' SOLO para el ready:
  // aún no conocemos el origin del anfitrión y el envelope no lleva secretos)
  w.parent.postMessage(seal('ready', null, instanceId), '*')
}

declare const __VITEST__: boolean | undefined
if (typeof document !== 'undefined' && typeof __VITEST__ === 'undefined' && document.getElementById('root')) {
  startShell(window, { apiBase: (document.querySelector('meta[name="nevw-api"]') as HTMLMetaElement | null)?.content ?? 'https://api.nevent.es' })
}
```

`shell.html` definitivo:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="nevw-api" content="https://api.nevent.es">
  <title>Chat de ayuda</title>
</head>
<body><div id="root"></div><script type="module" src="/src/shell/main.tsx"></script></body>
</html>
```

Nota: el test 2 emite `closed` inicial antes del `open` — el assert usa `toContain('opened')`, no orden estricto.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @nevent/widget test`
Expected: PASS (3 tests nuevos; suite completa verde)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/shell packages/widget/shell.html
git commit -m "feat(widget): shell con handshake INIT (origin del evento), sesión y App Preact mínima"
```

---

### Task 8: Demo funcional — página anfitriona + mock server del contrato

**Files:**
- Create: `packages/widget/examples/host-demo.html`, `packages/widget/examples/mock-api.mjs`, `packages/widget/examples/README.md`

**Interfaces:**
- Consumes: `dist/loader.js` + `dist/shell.html` (build), fixtures (Task 4, duplicadas como JSON literal en el mock server para no depender del build TS).

- [ ] **Step 1: Crear mock-api.mjs (node puro, sin deps)**

```js
// examples/mock-api.mjs — mock del contrato spec §4.1 (puerto 4310)
import { createServer } from 'node:http'

const config = { schemaVersion: 1, installationId: 'inst_demo_festival_01', assistantName: 'Asistente de DEMO FEST', locale: 'es', theme: { primaryColor: '#6d4aff', position: 'right' }, features: { upload: true, handoff: true } }
const session = { token: 'sess_jwt_demo', expiresInSeconds: 3600, guestHandle: 'guest_demo' }

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  const send = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.url?.endsWith('/config')) return send(config)
  if (req.url?.endsWith('/sessions')) return send(session)
  if (req.url?.endsWith('/sessions/refresh')) return send(session)
  send({ error: 'not_found' }, 404)
}).listen(4310, () => console.log('mock nev-api en http://localhost:4310'))
```

- [ ] **Step 2: Crear host-demo.html**

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Demo anfitrión — DEMO FEST</title>
<style>body{font-family:system-ui;background:#f6f7f9;display:grid;place-items:center;height:100vh;margin:0}h1{font-size:48px}</style>
</head>
<body>
<h1>DEMO FEST</h1>
<script>
  window.NeventWidget = window.NeventWidget || function(){(window.NeventWidget.q=window.NeventWidget.q||[]).push(arguments)}
  window.NeventWidget('boot', 'inst_demo_festival_01')
</script>
<script async src="/dist/loader.js" data-shell="/dist/shell.html"></script>
</body>
</html>
```

- [ ] **Step 3: Crear examples/README.md con el procedimiento de verificación**

```markdown
# Demo local

1. `pnpm --filter @nevent/widget build`
2. `node packages/widget/examples/mock-api.mjs` (deja el mock del API en :4310)
3. Editar `dist/shell.html` generado: `<meta name="nevw-api" content="http://localhost:4310">`
   (temporal: el Plan 4 parametriza el apiBase por entorno de build)
4. Servir el paquete: `cd packages/widget && python3 -m http.server 4311`
5. Abrir `http://localhost:4311/examples/host-demo.html`

Verificación esperada: aparece la burbuja del launcher; al pulsarla se abre el panel
con la cabecera "Asistente de DEMO FEST" (config servida por el mock) y el botón ×
lo cierra. En la pestaña Red: GET /config, POST /sessions con {"embeddingOrigin":
"http://localhost:4311"}.
```

- [ ] **Step 4: Ejecutar la verificación manual del README**

Run: los 5 pasos del README.
Expected: burbuja visible, panel abre/cierra, y en la pestaña Red del navegador las llamadas `GET /config` y `POST /sessions` con el `embeddingOrigin` correcto. Capturar pantalla para el informe (norma de Martín: informe con capturas antes de merge).

- [ ] **Step 5: Commit y verificación final de la suite**

Run: `pnpm --filter @nevent/widget test && pnpm --filter @nevent/widget typecheck && pnpm --filter @nevent/widget build`
Expected: suite completa PASS, typecheck limpio, build OK.

```bash
git add packages/widget/examples
git commit -m "feat(widget): demo anfitriona funcional con mock server del contrato"
```

---

## Self-Review (ejecutada)

1. **Cobertura del spec (para este plan de fundaciones):** §3.1 loader+iframe-shell (Tasks 6-7), §3.2 API pública con cola y reservados (Tasks 3, 6), §3.3 protocolo postMessage (Task 2), §4.1 bootstrap sesión/origin-binding/refresh (Tasks 5, 7), fixtures de contrato para desbloquear sin backend (Tasks 4, 8). Quedan explícitamente para planes 2-4: transporte/eventos (§4.2-4.4), máquina de estados (§5), UI de estados del mock (§6), theming (§7), CSP/sandbox ampliado y proxy de imágenes (§8), observabilidad (§10), CDN/versionado (§11), a11y completa y Playwright (§12).
2. **Placeholders:** ninguno — todo step con código o comando concreto. La única deuda declarada (apiBase por meta tag editable en demo) está marcada como temporal con su plan de resolución (Plan 4).
3. **Consistencia de tipos:** `Envelope`/`seal`/`open`/`isCommand` (Task 2) usados idénticos en Tasks 6-7; `ApiStub` (Task 3) en Task 6; `WidgetConfig`/`WidgetSession` (Task 4) en Tasks 5, 7; `createSessionClient` (Task 5) inyectable en Task 7 como `createClient`. Rutas del contrato idénticas en Task 5, mock server (Task 8) y spec §4.1.
