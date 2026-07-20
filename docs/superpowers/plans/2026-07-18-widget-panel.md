# Widget panel visual (Preact dentro del iframe) — Plan de implementación (rev.4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**rev.4 — tercera ronda de Codex (co-CTO, xhigh): NO-GO en rev.3. Varios cierres de las dos rondas anteriores se dan por válidos (spread condicional de `welcome`, eliminación de `agentJoinedAtSeq`, allowlist hex + ambos stops del degradado, rich/upload compuestos + `FileBubble.variant` + fuentes del harness, `expect.extend(toHaveNoViolations)`, U+200B, `box-sizing:border-box`, excepción documentada de `prefers-reduced-motion`/`prefers-color-scheme`, honestidad PARTIAL del smoke), pero 5 Critical + 3 Important seguían abiertos. Todos se cierran en esta revisión — ver el mapa de cierre en Self-Review §0.** El cambio más profundo: un "latch" síncrono en `main.tsx` (`ShellBus.getLatchedViewport()`) retiene el último `viewport` del loader aunque llegue mientras `createClient()` sigue pendiente y `App` ni siquiera existe todavía — sin latch, ese mensaje se perdía y `App` montaba con un fallback `{kind:'desktop', height:0}` inventado que, en móvil, podía quedarse para siempre. Además: el loader separa `desktopPanelSize` (solo se fija con `mode==='panel' && viewportKind==='desktop'`) de un nuevo `DEFAULT_PANEL_SIZE` (430×688) que sustituye a `LAUNCHER_SIZE` como fallback de `opened` — ya no hay ningún camino que aplique un salto visible a 104×104 al abrir el panel, sea cual sea el orden real de llegada entre `opened` y `resize`; `launcherSize` deja de ser una constante y trackea el tamaño real reportado en modo launcher; el contenedor fullscreen móvil usa la caja REAL de `VisualViewport` (`offsetTop`/`offsetLeft`/`width`/`height`, recalculada también en `scroll`, no solo `resize`) en vez de un `inset:0` fijo al viewport de layout completo. El modelo de contraste se reescribe: `deriveInkColor` exige 4.5:1 real contra el color SÓLIDO `--brand-a` (nunca el degradado) y devuelve `null` si ninguna tinta lo alcanza — `applyTheme` ignora entonces el `primaryColor` del tenant y avisa por consola, en vez de aceptar "la mejor de dos opciones que no cumplen AA" (el bug real de la ronda 3: blanco sobre `--brand-b` daba ~4.04:1 y el plan lo llamaba "AA automático" de todos modos); el texto real (`.initials-avatar`) se mueve a `--brand-a` sólido. También: el test de `cssText` espiaba una copia del descriptor en vez del setter real instalado en el prototipo (falso positivo, corregido con la forma de 3 argumentos de `vi.spyOn`); `use-announcements.test.ts` (contiene JSX) pasa a `.tsx`; `shell.test.tsx` añade `afterEach` a su import de vitest; la receta de verificación siembra `inst_demo_festival_01` (lo que `host-demo.html` realmente arranca, no `inst_verify_01`) con los 10 providers reales de `ProviderService.FIRST_PARTY_INTEGRATIONS` (7 `TICKETING` + 2 `ECOMMERCE` + 1 `CASHLESS`, no 9 con `type` inventados); y `AgentJoinedSysline` se monta de verdad en el harness de fixtures (Task 16), no solo en su test unitario aislado. El plan mantiene sus 17 tareas.

**Goal:** construir la SPA Preact que vive dentro del iframe-shell de `@nevent/widget` — launcher + panel con los 10 estados visuales del mock aprobado, theming validado con contraste AA real, a11y (WCAG 2.2 AA) real y responsive real — consumiendo el `MessageStore`/`Transport` que Plan 2 ya expone, con una política de seguridad (CSP, sin avatares externos, sin `cssText`) alineada con spec §8.

**Architecture:** un directorio `packages/widget/src/panel/` con componentes Preact presentacionales + módulos puros sin dependencias de Preact (`view-state.ts`, `theme.ts`, `focus-trap.ts`). Todo el estado observable llega vía `useSyncExternalStore` (de `preact/compat`) sobre el `MessageStore` de Plan 2. `view-state.ts` deriva **tres señales ortogonales** — `conversationPhase` (dictada por el servidor, gobierna SIEMPRE qué contenido de handoff se pinta), `connectionState` (gobierna el banner y el composer) y `isStreaming` (gobierna el botón detener) — más un `ribbon` puramente visual (precedencia de color/animación de la cinta de cabecera) que nunca decide qué contenido aparece. El protocolo loader↔shell distingue dos modos — `launcher` (tamaño FIJO, anclado por posición) y `panel` (tamaño real reportado en desktop; pantalla completa SOLO mientras el panel está abierto en móvil) — con la detección de móvil resuelta ENTERAMENTE en el loader (host, vía `matchMedia` con un listener real de `change`) y comunicada al shell por un mensaje `viewport` del protocolo — el shell nunca evalúa `matchMedia` contra su propio iframe. Toda la geometría del loader se asigna propiedad a propiedad (nunca `cssText`), compatible con hosts de CSP estricta. CSS es una única hoja inyectada (`tokens.css` + `panel.css`) importada desde `main.tsx`; el modo móvil se activa por el atributo `[data-viewport="mobile"]`, nunca por una media query de ancho evaluada dentro del iframe. Sin avatares fotográficos de terceros: identidad visual del agente mediante iniciales generadas localmente (spec §8, sin proxy de imágenes en v1). CSP explícita vía `<meta>` en `shell.html`.

**Tech Stack:** Preact 10.25 + `preact/compat` (`useSyncExternalStore`) + `preact/test-utils` (`act`), TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest + jsdom, `@fontsource/poppins` + `@fontsource/inter` (fuentes autoalojadas), `vitest-axe` (Task 16).

## Global Constraints

- **Estado dictado por servidor (spec §5):** el cliente JAMÁS infiere `conversationState` recorriendo el hilo de mensajes. `conversationPhase` (Task 5) es la ÚNICA señal que gobierna qué contenido de handoff se muestra (`WaitingCard`/`AgentJoinedSysline`/`TypingDots`/`ResolvedCard`, cabecera con nombre/avatar de agente) — la conexión (`connectionState`) y el streaming (`isStreaming`) NUNCA ocultan ni sustituyen ese contenido; solo pueden superponer un banner o cambiar el texto de estado/color de la cinta. `ESCALATED_WAITING + offline` sigue mostrando `WaitingCard`; `AGENT_ACTIVE + reconnecting` sigue mostrando cabecera/typing del agente.
- **Theming solo por `setProperty` (spec §7):** todo valor de `WidgetConfig.theme` es entrada NO CONFIABLE. Se aplica exclusivamente vía `CSSStyleDeclaration.setProperty` tras validación con allowlist — JAMÁS interpolado en una plantilla HTML ni en una cadena CSS. Se aplica **antes del primer render** (en `main.tsx`, no en un `useEffect` de `Panel`) para que el launcher inicial también respete `primaryColor`/modo/posición sin parpadeo.
- **`data-mode`/`data-position` son estructurales, no theming:** reflejan qué vista está montada y en qué esquina se ancla — no son valores de config no confiables, así que usarlos como atributos CSS no contradice la regla de `setProperty`-only (esa regla es sobre COLORES/URLS del tenant, no sobre flags de layout internos del propio código).
- **Sin avatares fotográficos externos en v1 (spec §8):** ninguna imagen de terceros (agente, bot) se renderiza sin proxy propio — v1 usa un avatar de iniciales generado localmente. `agentAvatarUrl` (que el store sí trae desde `agent.joined`) se seguirá recibiendo y almacenando, pero no se pinta como `<img>` en ningún componente de este plan.
- **CSP explícita:** `shell.html` declara `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src <origen de la API>; base-uri 'none'; object-src 'none'` — ninguna tarea introduce un `<img>` de host externo, un `style=""` de cadena interpolada, ni un `eval`/inline script.
- **Texto sin markdown ni HTML en v1:** todo texto de usuario/bot/agente y toda copia de config se renderiza como hijo de texto JSX (auto-escapado por Preact) — nunca `dangerouslySetInnerHTML`. Estilos dinámicos (p.ej. barra de progreso) solo vía `CSSStyleDeclaration.setProperty` sobre una custom property consumida por CSS, nunca `style={{...}}` con valores variables (aunque Preact resuelve objetos `style` por propiedad y no por `cssText`, se evita la ambigüedad por completo, ver Task 11).
- **`prefers-reduced-motion`:** animación `pop`, parpadeo del cursor de streaming, barrido/breathe del ribbon, "hop" de los dots — todas desactivadas.
- **Contraste AA garantizado para texto, nunca "automático" incondicional (ronda 3):** `theme.ts` solo aplica el `primaryColor` de un tenant si blanco o la tinta oscura del token set alcanzan 4.5:1 REAL (WCAG 2.2 SC 1.4.3) contra el color SÓLIDO `--brand-a` — si ninguna de las dos lo alcanza, el color se ignora (se mantiene el de marca por defecto) y se avisa por consola. El texto real se pinta siempre sobre `--brand-a` sólido, nunca sobre `--brand-grad`; los usos decorativos del degradado (iconos, fondos) solo necesitan ≥3:1 (SC 1.4.11).
- **Firma visual del ribbon por fase (exacta del mock), ahora puramente visual:** ver Task 5 — el ribbon nunca gobierna contenido, solo color/animación de la cinta de 2px de la cabecera.
- **Par tipográfico:** `--font-display: 'Poppins'` / `--font-body: 'Inter'`, autoalojadas vía `@fontsource`.
- **Sin autofocus del composer en móvil, foco inicial del panel solo en desktop:** en desktop el panel recibe foco programático al abrirse (WAI-ARIA APG); en móvil el foco permanece donde el usuario lo puso (el toque que abrió el panel) — nunca se roba el foco para no disparar el teclado en pantalla sin que el usuario haya tocado el composer.
- **Acciones de rich content limitadas (spec §8):** únicamente `send_message` y `open_https_url`, URL validada `https:` antes de usarse.
- **Disciplina de tests:** todo test que monta un componente Preact usa el helper compartido `mount()`/`rerender()`/`cleanupMounted()` de `panel/__tests__/test-utils.tsx` (Task 1), que envuelve `render()` en `act()` de `preact/test-utils` y desmonta con `render(null, root)` en el cleanup — nunca `document.body.innerHTML = ''` a pelo (incluido `shell.test.tsx`, Plan 1, corregido en Task 17). Todo archivo de test con JSX usa extensión `.tsx`. `jsdom` (verificado: 25.0.1) no implementa `window.matchMedia` en absoluto — `test-setup.ts` (Task 1) define un stub base cargado por `vitest.config.ts` en TODOS los tests para que `vi.spyOn(window, 'matchMedia')` pueda envolver una función real; los tests de `loader/index.ts` que necesitan simular el breakpoint móvil lo sobrescriben explícitamente encima. Todo `trapFocus` de test se libera en `afterEach` (Task 4). Lo que jsdom NO puede cubrir con garantías (foco cruzando el iframe real, aplicación real de CSP, `env(safe-area-inset-*)`, animaciones) se deja explícitamente para la fase E2E de navegador real — no se finge cobertura con un mock.

## Brechas de contrato (evaluadas en la revisión — decisión final por cada una)

1. **Sin nombre de tenant separado del `assistantName`.** Resuelto con copia neutral: en fase `agent` la cabecera muestra el nombre del agente solo (`"Laura"`), NUNCA `"Laura · Asistente de X"`; en fases `waiting`/`resolved` (que trata el equipo humano, no el bot) la cabecera muestra `"El equipo"` — copia neutral fija, no `assistantName`, que solo se usa en fase `idle` (donde SÍ es el asistente quien responde). Ver Task 5.
2. **Sin ETA de espera.** Aceptado por la revisión: `WaitingCard` no muestra ninguna cifra, copia genérica "en breve".
3. **Sin countdown de reconexión real.** Aceptado: `ConnectionBanner` dice "Reconectando…" sin cifra.
4. **Sin timeline histórico de `conversation.state_changed`/`agent.joined`.** **rev.3: revertido al fallback pre-autorizado.** La extensión aditiva `agentJoinedAtSeq` (rev.2) no conseguía el intercalado prometido — los mensajes de snapshot llegan con `seq:null` (se ordenan al final), así que un `agent.joined` con `seq` real se intercalaba ANTES del historial restaurado, no en su posición correcta; y al reabrir tras el handoff, el canal solo pide eventos posteriores al cursor, así que ese evento histórico normalmente no vuelve a llegar. Sin `agentJoinedAtSeq`, sin slot `interleaved` en `MessageList`: la presencia del agente se comunica SOLO con el cambio de cabecera (nombre/avatar/pulso). `AgentJoinedSysline` sigue existiendo como componente (Task 10) y se usa ÚNICAMENTE en el harness de fixtures (Task 16) para paridad visual con el mock — pendiente de un timeline real en el store, trabajo de contrato futuro. `WaitingCard`/`ResolvedCard`/`TypingDots` sí siguen siendo contenido "de estado actual" al final (nunca afirmaron una cronología).
5. **Sin método `feedback` en el `Transport` facade.** Resuelto: el panel INTEGRADO (Task 13) no muestra los botones 👍/👎 en absoluto (`ResolvedCard` recibe `onFeedback` opcional; sin él, no renderiza feedback) — nunca se finge un éxito local que en realidad no persiste en ningún sitio. Los botones SÍ existen como componente y se demuestran en el harness de fixtures (Task 16), que no pretende ser el flujo real.
6. **`welcome?` opcional en `WidgetConfig`.** Aceptado como extensión, pero ahora normalizado en runtime en `shell/session.ts` (frontera de red): tipo, `title` ≤ 80, `subtitle` ≤ 200, ≤ 4 `quickReplies`, cada chip ≤ 60 — cualquier payload malformado se descarta campo a campo en vez de romper `.length`/`.map` aguas abajo. Ver Task 15.
7. **Sin `radio`/`densidad`/`logo` en el schema de theming actual.** Sin cambios respecto a rev.1: no hay una extensión aditiva de bajo riesgo obvia sin acordar unidades con nev-api primero — se deja como trabajo de contrato futuro, documentado, no inventado.

---

### Task 1: Utilidades de test compartidas, tokens de diseño, fuentes autoalojadas e iconos

**Files:**
- Create: `packages/widget/src/panel/__tests__/test-utils.tsx`
- Create: `packages/widget/src/test-setup.ts`
- Create: `packages/widget/src/panel/tokens.css`
- Create: `packages/widget/src/panel/icons.tsx`
- Create: `packages/widget/src/panel/__tests__/tokens.test.ts`
- Create: `packages/widget/src/panel/__tests__/icons.test.tsx`
- Modify: `packages/widget/package.json` (nuevas devDependencies)
- Modify: `packages/widget/vitest.config.ts` (procesado real de `tokens.css` en tests + `setupFiles`)

**Interfaces:**
- Produces: `mount(vnode): Promise<HTMLElement>`, `rerender(vnode, root): Promise<void>`, `cleanupMounted(): Promise<void>` (helper de test — Important #11, usado por TODAS las tareas siguientes). Un stub base de `window.matchMedia` (`test-setup.ts`, cargado por vitest antes de cada archivo) para que `vi.spyOn(window, 'matchMedia')` funcione en cualquier test posterior (Important #11 ronda 2: jsdom 25 NO implementa `matchMedia` — `typeof window.matchMedia` es `undefined`, así que `vi.spyOn` sobre una propiedad inexistente lanza; hace falta una implementación base real para poder espiarla). Custom properties CSS: `--brand-ink` (tinta de contraste automático, Task 2 la calcula) y `--accent-sun-a`/`--accent-sun-b` (Task 11, sustituyen el hex hardcodeado del mock). `BotIcon(): JSX.Element`, `AgentInitialsAvatar({ name }: { name: string }): JSX.Element` (spec §8: sin avatares fotográficos externos en v1 — consumido por Header/MessageBubble/handoff en Tasks 6, 7, 10).

- [ ] **Step 1: instalar las fuentes autoalojadas**

Run: `npm install --workspace=@nevent/widget --save-dev @fontsource/poppins @fontsource/inter`
Expected: `added N packages`, diff en `package-lock.json` (raíz del monorepo) y en `packages/widget/package.json`.

- [ ] **Step 2: stub base de window.matchMedia**

Verificado en este entorno: `jsdom 25.0.1` NO implementa `matchMedia` (`typeof window.matchMedia === 'undefined'`, confirmado ejecutando jsdom directamente). `vi.spyOn(window, 'matchMedia')` requiere que la propiedad YA exista para poder envolverla — sin este stub, cualquier test que la use (Task 12, `loader/index.ts`) lanza `Cannot spy on undefined` incluso en los tests que rev.1/Plan 1 ya tenían en verde, porque el loader ahora llama a `matchMedia` en `boot()` siempre, lo use el test explícitamente o no.

Crear `packages/widget/src/test-setup.ts`:

```ts
// jsdom no implementa window.matchMedia (verificado: jsdom 25.0.1). Se define
// aquí un stub base — devuelve matches:false por defecto ("desktop") — para
// que vi.spyOn(window, 'matchMedia').mockReturnValue(...) pueda envolver una
// función real en los tests que necesitan simular el breakpoint móvil
// (Important #11, ronda 2 de la revisión). Sin este stub, CUALQUIER test que
// ejercite loader/index.ts (que ahora llama matchMedia siempre en boot(),
// no solo cuando el test lo pide) lanza "Cannot spy on undefined" — incluye
// los 7 tests preexistentes de Plan 1 que no mencionan matchMedia en absoluto.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
```

- [ ] **Step 3: habilitar procesado de CSS y el setup file en vitest para este paquete**

Editar `packages/widget/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    css: { include: [/\/panel\//] },
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 4: escribir el helper de test compartido (falla primero)**

Crear `packages/widget/src/panel/__tests__/test-utils.tsx`. Envuelve `render()` en `act()` de `preact/test-utils` (Important #11: sin esto, un `useEffect` puede no haber corrido aún cuando el test hace su primera aserción) y registra cada nodo montado para desmontarlo — también con `act()`, disparando `componentWillUnmount`/cleanups de `useEffect` — en `cleanupMounted()`:

```tsx
import { render, type VNode } from 'preact'
import { act } from 'preact/test-utils'

let mountedRoots: HTMLElement[] = []

export async function mount(vnode: VNode): Promise<HTMLElement> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  await act(() => { render(vnode, root) })
  mountedRoots.push(root)
  return root
}

export async function rerender(vnode: VNode, root: HTMLElement): Promise<void> {
  await act(() => { render(vnode, root) })
}

export async function cleanupMounted(): Promise<void> {
  for (const root of mountedRoots) {
    await act(() => { render(null, root) })
    root.remove()
  }
  mountedRoots = []
}
```

Este archivo no tiene test propio (es infraestructura de test, no código de producción) — se verifica indirectamente en el Step siguiente, el primero que lo consume.

- [ ] **Step 5: escribir el test de tokens usando el helper (falla primero)**

Crear `packages/widget/src/panel/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import '../tokens.css'

describe('tokens.css', () => {
  afterEach(() => {
    delete document.documentElement.dataset['theme']
  })

  it('define --ink claro por defecto en :root', () => {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    expect(getComputedStyle(probe).getPropertyValue('--ink').trim()).toBe('#101319')
    probe.remove()
  })

  it('sobrescribe --ink en modo oscuro vía [data-theme="dark"]', () => {
    document.documentElement.dataset['theme'] = 'dark'
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    expect(getComputedStyle(probe).getPropertyValue('--ink').trim()).toBe('#f2f4f8')
    probe.remove()
  })

  it('expone --font-display (Poppins) y --font-body (Inter)', () => {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    expect(style.getPropertyValue('--font-display').trim()).toContain('Poppins')
    expect(style.getPropertyValue('--font-body').trim()).toContain('Inter')
    probe.remove()
  })

  it('--brand-ink tiene un valor por defecto (blanco) antes de que theme.ts lo recalcule', () => {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    expect(getComputedStyle(probe).getPropertyValue('--brand-ink').trim()).toBe('#ffffff')
    probe.remove()
  })

  it('expone --accent-sun-a/--accent-sun-b tokenizados (ya no hex hardcodeado en CardCarousel)', () => {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    expect(style.getPropertyValue('--accent-sun-a').trim()).toBe('#f59e0b')
    expect(style.getPropertyValue('--accent-sun-b').trim()).toBe('#ef4444')
    probe.remove()
  })
})
```

- [ ] **Step 6: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "../tokens.css"`

- [ ] **Step 7: implementar tokens.css**

Crear `packages/widget/src/panel/tokens.css`:

```css
:root {
  --ink: #101319; --ink-2: #3d4451; --muted: #667085; --faint: #98a2b3;
  --surface: #ffffff; --surface-2: #f6f7f9; --surface-3: #eef0f4;
  --line: #e6e8ee;
  --brand-a: #6d4aff; --brand-b: #975cf8; --brand-ink: #ffffff;
  --brand-grad: linear-gradient(135deg, var(--brand-a), var(--brand-b));
  --brand-soft: #f2eeff;
  --wait: #d97706; --wait-soft: #fdf2e3;
  --live: #0e9384; --live-soft: #e6f4f2;
  --danger: #d92d20; --danger-soft: #feeceb;
  --accent-sun-a: #f59e0b; --accent-sun-b: #ef4444;
  --bubble-user: var(--brand-a); --bubble-user-ink: var(--brand-ink);
  --bubble-bot: var(--surface-2); --bubble-bot-ink: var(--ink);
  --shadow-panel: 0 24px 64px rgba(16, 19, 25, .16), 0 4px 16px rgba(16, 19, 25, .08);
  --shadow-bubble: 0 8px 24px rgba(109, 74, 255, .35);
  --r-panel: 20px; --r-bubble: 14px;
  --font-display: 'Poppins', sans-serif; --font-body: 'Inter', system-ui, sans-serif;
}

[data-theme="dark"] {
  --ink: #f2f4f8; --ink-2: #c6ccd8; --muted: #8b93a3; --faint: #5d6575;
  --surface: #171a21; --surface-2: #1f232d; --surface-3: #272c38;
  --line: #2b303c;
  --brand-soft: #28224a;
  --wait-soft: #332512; --live-soft: #12312d; --danger-soft: #361b19;
  --bubble-bot: var(--surface-2); --bubble-bot-ink: var(--ink);
  --shadow-panel: 0 24px 64px rgba(0, 0, 0, .5), 0 4px 16px rgba(0, 0, 0, .4);
}

/* theme.mode === 'auto' (Task 2 no fija [data-theme] en ese caso): mismos
   valores que [data-theme="dark"], solo si nadie los fijó explícitamente. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --ink: #f2f4f8; --ink-2: #c6ccd8; --muted: #8b93a3; --faint: #5d6575;
    --surface: #171a21; --surface-2: #1f232d; --surface-3: #272c38;
    --line: #2b303c;
    --brand-soft: #28224a;
    --wait-soft: #332512; --live-soft: #12312d; --danger-soft: #361b19;
    --bubble-bot: var(--surface-2); --bubble-bot-ink: var(--ink);
    --shadow-panel: 0 24px 64px rgba(0, 0, 0, .5), 0 4px 16px rgba(0, 0, 0, .4);
  }
}
```

- [ ] **Step 8: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/tokens.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: escribir el test de iconos con el helper compartido (falla primero)**

Crear `packages/widget/src/panel/__tests__/icons.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { BotIcon, AgentInitialsAvatar } from '../icons'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('BotIcon', () => {
  it('renderiza un svg decorativo marcado aria-hidden', async () => {
    const root = await mount(<BotIcon />)
    const svg = root.querySelector('svg[data-icon=bot]')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('AgentInitialsAvatar', () => {
  it('pinta la inicial en mayúscula del nombre, sin <img> (spec §8: sin avatares externos en v1)', async () => {
    const root = await mount(<AgentInitialsAvatar name="Laura" />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  it('nombre vacío o con solo espacios: cae a "?" en vez de una cadena vacía', async () => {
    const root = await mount(<AgentInitialsAvatar name="   " />)
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('?')
  })

  it('es decorativo para lectores de pantalla (aria-hidden): el nombre real ya lo anuncia el texto de la cabecera/sysline que lo acompaña', async () => {
    const root = await mount(<AgentInitialsAvatar name="Laura" />)
    expect(root.querySelector('.initials-avatar')?.getAttribute('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 10: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/icons.test.tsx`
Expected: FAIL — `Failed to resolve import "../icons"`

- [ ] **Step 11: implementar icons.tsx**

Crear `packages/widget/src/panel/icons.tsx`:

```tsx
// Icono de "spark" del bot, reutilizado por Header, Launcher y MessageBubble.
export function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="bot">
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" fill="currentColor" />
    </svg>
  )
}

// Avatar de iniciales generado localmente — spec §8: v1 no renderiza ninguna
// imagen de avatar de terceros sin proxy propio. Sustituye por completo a
// cualquier <img src={agentAvatarUrl}> del mock/rev.1 (Critical #4 de la
// revisión). `agentAvatarUrl` se sigue recibiendo y guardando en el store
// (Plan 2) para cuando exista un proxy propio, pero ningún componente de
// este plan lo pinta como <img>.
export function AgentInitialsAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return <span class="initials-avatar" aria-hidden="true">{initial}</span>
}
```

- [ ] **Step 12: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/icons.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 13: commit**

```bash
git add packages/widget/package.json package-lock.json packages/widget/vitest.config.ts packages/widget/src/test-setup.ts packages/widget/src/panel/tokens.css packages/widget/src/panel/icons.tsx packages/widget/src/panel/__tests__/test-utils.tsx packages/widget/src/panel/__tests__/tokens.test.ts packages/widget/src/panel/__tests__/icons.test.tsx
git commit -m "feat(widget): tokens de diseño con tinta de contraste, fuentes autoalojadas, avatar de iniciales, helper de test compartido y stub de matchMedia"
```

---

### Task 2: Validación de theming, `setProperty` y tinta de contraste automática (`theme.ts`)

**Files:**
- Create: `packages/widget/src/panel/theme.ts`
- Create: `packages/widget/src/panel/__tests__/theme.test.ts`

**Interfaces:**
- Consumes: `WidgetConfig['theme']` de `../contract/types`.
- Produces: `isSafeColor(value: string): boolean`, `isSafeHttpsUrl(value: string): boolean` (reutilizado por Task 11, `open_https_url` de las cards), `deriveInkColor(primaryColorHex: string): string | null` (Important #6, ronda 3), `applyTheme(root: HTMLElement, theme: WidgetConfig['theme']): void`.

Ronda 2 de la revisión encontró dos problemas reales en el diseño de rev.2: (a) `isSafeColor` aceptaba `rgb()`/`hsl()`/hex con alpha como "válidos", pero `deriveInkColor` no podía calcular contraste real sobre ellos y devolvía blanco fijo — con valores como `rgb(245,245,245)` eso deja texto blanco casi invisible; (b) el contraste se calculaba solo contra `--brand-a`, pese a que avatares/botones pintan sobre el degradado completo hasta `--brand-b`. v1 restringió el allowlist a **solo hex opaco de 3/6 dígitos** (nunca alpha, nunca funcional) — eso sigue así y es real. Pero (b) se "resolvió" en rev.3 comparando contra el PEOR de los dos extremos del degradado y **eligiendo la mejor de las dos opciones aunque ninguna llegara a 4.5:1** — con los tokens por defecto, blanco sobre `#975cf8` (`--brand-b`) da solo ~4.04:1, por debajo de AA para texto normal (WCAG 2.2 SC 1.4.3 exige ≥4.5:1 y no admite redondeo hacia arriba). El propio Self-Review de rev.3 reconocía la limitación mientras el Goal, las Global Constraints y los mensajes de commit seguían llamándolo "AA automático" — **Important, ronda 3: eso es falso, y siguió siéndolo con hex-only + dos extremos.**

**rev.4 — el modelo cambia de raíz: se garantiza AA por CONSTRUCCIÓN, no por comparación de opciones imperfectas.** `deriveInkColor` deja de comparar contra el degradado (`--brand-a`/`--brand-b`) y pasa a exigir 4.5:1 real contra el color SÓLIDO pedido (`--brand-a` únicamente) — si ni blanco ni la tinta oscura del token set lo alcanzan, devuelve `null` y `applyTheme` **ignora el `primaryColor` del tenant por completo** (mantiene el `--brand-a` por defecto del token set, que sí pasa: blanco sobre `#6d4aff` da ~5.15:1, ver Step 3) y avisa por `console.warn`. La contrapartida arquitectónica: el **TEXTO real** (las iniciales del agente, `.initials-avatar`) debe pintarse SIEMPRE sobre `--brand-a` sólido, nunca sobre `--brand-grad` — esta tarea corrige ese uso en `panel.css` (Step 3). Los usos DECORATIVOS del degradado que quedan (avatar-icono del bot, botón de enviar, ribbon de estado, fondo de imagen de card) nunca llevan texto encima — son gráficos/componentes de UI, que WCAG 2.2 SC 1.4.11 solo exige a ≥3:1, un umbral que blanco/tinta oscura superan con margen amplio sobre cualquier color de marca razonable sin necesidad de perseguirlo activamente.

- [ ] **Step 1: escribir los tests (fallan primero)**

Crear `packages/widget/src/panel/__tests__/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isSafeColor, isSafeHttpsUrl, deriveInkColor, applyTheme } from '../theme'
import type { WidgetConfig } from '../../contract/types'

describe('isSafeColor — v1 SOLO hex opaco de 3/6 dígitos (Important #6, ronda 2)', () => {
  it('acepta hex de 3 y 6 dígitos', () => {
    expect(isSafeColor('#fff')).toBe(true)
    expect(isSafeColor('#6d4aff')).toBe(true)
  })
  it('rechaza hex con canal alpha (#rgba, #rrggbbaa) — antes se aceptaban y rompían el cálculo de contraste', () => {
    expect(isSafeColor('#fff0')).toBe(false)
    expect(isSafeColor('#6d4affcc')).toBe(false)
    expect(isSafeColor('#ffffff00')).toBe(false)
  })
  it('rechaza rgb()/rgba()/hsl()/hsla() SIN excepciones, aunque sean sintácticamente válidos', () => {
    expect(isSafeColor('rgb(109, 74, 255)')).toBe(false)
    expect(isSafeColor('rgba(109, 74, 255, 0.5)')).toBe(false)
    expect(isSafeColor('hsl(255, 100%, 64%)')).toBe(false)
  })
  it('rechaza url(), javascript:, expression() y nombres de color CSS', () => {
    expect(isSafeColor('url(javascript:alert(1))')).toBe(false)
    expect(isSafeColor('javascript:alert(1)')).toBe(false)
    expect(isSafeColor('expression(alert(1))')).toBe(false)
    expect(isSafeColor('red')).toBe(false)
    expect(isSafeColor('var(--evil)')).toBe(false)
  })
  it('rechaza cadenas vacías o desproporcionadamente largas', () => {
    expect(isSafeColor('')).toBe(false)
    expect(isSafeColor('#' + '6'.repeat(200))).toBe(false)
  })
})

describe('isSafeHttpsUrl', () => {
  it('acepta https', () => { expect(isSafeHttpsUrl('https://cdn.nevent.es/x.png')).toBe(true) })
  it('rechaza http, javascript:, data: y URLs mal formadas', () => {
    expect(isSafeHttpsUrl('http://cdn.nevent.es/x.png')).toBe(false)
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpsUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHttpsUrl('no es una url')).toBe(false)
  })
})

describe('deriveInkColor — Important #6 ronda 3: 4.5:1 REAL contra el color SÓLIDO (nunca el degradado); null si ninguna tinta lo alcanza', () => {
  it('marca muy clara (#f5f5f5): elige tinta oscura — contraste con blanco 1.09:1 (pésimo) vs 17.06:1 con tinta oscura', () => {
    expect(deriveInkColor('#f5f5f5')).toBe('#101319')
  })
  it('marca de referencia del mock (#6d4aff, --brand-a por defecto): elige blanco, y AHORA pasa AA de verdad (5.15:1 real contra el color SÓLIDO, no el peor caso de un degradado)', () => {
    expect(deriveInkColor('#6d4aff')).toBe('#ffffff')
  })
  it('Important (ronda 3) — color en la "zona muerta" (#006eff): NINGUNA tinta alcanza 4.5:1 (blanco 4.49:1, tinta oscura 4.14:1) → null, nunca la mejor de dos opciones que no cumplen', () => {
    // Calculado exactamente (no una aproximación): con --ink=#101319, la
    // zona donde ni blanco ni tinta oscura llegan a 4.5:1 va de luminancia
    // relativa ~0.1833 a ~0.2041; #006eff cae justo ahí (luminancia
    // ~0.1837). Antes (ronda 2/3) esto habría devuelto '#ffffff' igualmente
    // (4.49 > 4.14) pese a no alcanzar AA — exactamente el hallazgo Important
    // de la ronda 3.
    expect(deriveInkColor('#006eff')).toBeNull()
  })
  it('formato no calculable (nunca debería llegar aquí tras isSafeColor, pero deriveInkColor no debe lanzar): null, nunca un blanco inventado', () => {
    expect(deriveInkColor('no-es-un-color')).toBeNull()
  })
  it('normaliza hex de 3 dígitos antes de calcular (#0f0 se expande a #00ff00)', () => {
    expect(deriveInkColor('#0f0')).toBe(deriveInkColor('#00ff00'))
  })
})

describe('applyTheme', () => {
  let root: HTMLElement
  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  const theme = (overrides: Partial<WidgetConfig['theme']> = {}): WidgetConfig['theme'] => ({
    primaryColor: '#6d4aff', position: 'right', mode: 'auto', ...overrides,
  })

  it('aplica un color válido vía setProperty en --brand-a (normalizado a 6 dígitos) y calcula --brand-ink', () => {
    applyTheme(root, theme({ primaryColor: '#f5f5f5' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('#f5f5f5')
    expect(root.style.getPropertyValue('--brand-ink')).toBe('#101319')
  })

  it('normaliza un hex de 3 dígitos a 6 al fijar --brand-a', () => {
    applyTheme(root, theme({ primaryColor: '#0f0' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('#00ff00')
  })

  it('ignora un color inválido (incl. rgb()/hsl()/alpha, ahora rechazados): no toca --brand-a ni --brand-ink', () => {
    applyTheme(root, theme({ primaryColor: 'javascript:alert(1)' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('')
    expect(root.style.getPropertyValue('--brand-ink')).toBe('')
    applyTheme(root, theme({ primaryColor: 'rgb(109, 74, 255)' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('')
  })

  it('Important (ronda 3) — un color sintácticamente válido que NO alcanza 4.5:1 con ninguna tinta (#006eff) se ignora igual que uno inválido, y avisa por consola', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyTheme(root, theme({ primaryColor: '#006eff' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('') // se mantiene el --brand-a por defecto del token set, nunca un texto que no cumple AA
    expect(root.style.getPropertyValue('--brand-ink')).toBe('')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('#006eff'))
    warn.mockRestore()
  })

  it('fija data-position a right/left, con fallback a right ante un valor no reconocido', () => {
    applyTheme(root, theme({ position: 'left' }))
    expect(root.dataset['position']).toBe('left')
    applyTheme(root, theme({ position: 'up' as unknown as 'left' }))
    expect(root.dataset['position']).toBe('right')
  })

  it('fija data-theme para light/dark y lo elimina para auto', () => {
    applyTheme(root, theme({ mode: 'dark' }))
    expect(root.dataset['theme']).toBe('dark')
    applyTheme(root, theme({ mode: 'light' }))
    expect(root.dataset['theme']).toBe('light')
    applyTheme(root, theme({ mode: 'auto' }))
    expect(root.dataset['theme']).toBeUndefined()
  })

  it('nunca lanza con un theme completamente hostil', () => {
    expect(() => applyTheme(root, {
      primaryColor: '</style><script>alert(1)</script>',
      position: '<img onerror=alert(1)>' as unknown as 'left',
      mode: 'ignore-me' as unknown as 'auto',
    })).not.toThrow()
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/theme.test.ts`
Expected: FAIL — `Failed to resolve import "../theme"`

- [ ] **Step 3: implementar theme.ts**

Crear `packages/widget/src/panel/theme.ts`:

```ts
import type { WidgetConfig } from '../contract/types'

const HEX3 = /^#[0-9a-fA-F]{3}$/
const HEX6 = /^#[0-9a-fA-F]{6}$/

// v1 SOLO acepta hex opaco (spec §7 + Important #6 ronda 2): rgb()/hsl() y
// hex con alpha se aceptaban en rev.2 como "sintácticamente válidos" pero
// deriveInkColor no podía calcular contraste real sobre ellos (devolvía
// blanco fijo, dejando pasar combinaciones casi invisibles). En vez de
// soportar parcialmente más formatos, el allowlist se restringe a lo que SÍ
// puede validarse Y calcularse con garantías.
export function isSafeColor(value: string): boolean {
  const v = value.trim()
  return HEX3.test(v) || HEX6.test(v)
}

export function isSafeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}
function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
function expandHex3(hex: string): string {
  return '#' + hex.slice(1).split('').map((c) => c + c).join('')
}
// Precondición: `hex` ya pasó isSafeColor (HEX3 o HEX6) — normaliza a 6 dígitos.
function normalizeHex(hex: string): string {
  return HEX3.test(hex) ? expandHex3(hex) : hex
}
function hexToRgb(hex6: string): [number, number, number] {
  const num = parseInt(hex6.slice(1), 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

const INK_HEX = '#101319' // --ink del token set
const AA_NORMAL_TEXT = 4.5 // WCAG 2.2 SC 1.4.3, texto normal — sin redondeo hacia arriba

// Devuelve la tinta (blanco o la tinta oscura del token set) que alcanza
// 4.5:1 REAL contra el color SÓLIDO pedido — nunca contra el degradado
// (Important, ronda 3: rev.3 comparaba contra el PEOR de los dos extremos de
// --brand-grad para "cubrir" avatares/botones que pintan sobre el degradado,
// pero eso hacía que el algoritmo ACEPTARA la mejor de dos opciones aunque
// NINGUNA llegara a 4.5:1 — con los tokens por defecto, blanco sobre
// --brand-b daba ~4.04:1, insuficiente, y el plan seguía llamando a esto "AA
// automático" pese a que el propio Self-Review reconocía la limitación).
//
// v1 solo garantiza AA para TEXTO real, y el texto real se pinta SIEMPRE
// sobre el color SÓLIDO --brand-a (panel.css, `.initials-avatar` — Step 5 de
// esta misma tarea corrige ese selector para que deje de heredar
// --brand-grad). Los usos del degradado que quedan (avatar-icono del bot,
// botón de enviar, ribbon de estado, fondo de imagen de card) son
// decorativos/no-texto: WCAG 2.2 SC 1.4.11 solo les exige ≥3:1, umbral que
// blanco/tinta oscura superan con margen amplio sin necesidad de perseguirlo
// aquí activamente.
//
// Devuelve `null` si NINGUNA de las dos tintas alcanza 4.5:1 real — el
// llamador (`applyTheme`) debe entonces IGNORAR el `primaryColor` pedido por
// completo, nunca aceptar un texto que no cumple AA.
export function deriveInkColor(primaryColorHex: string): string | null {
  if (!isSafeColor(primaryColorHex)) return null
  const rgb = hexToRgb(normalizeHex(primaryColorHex))
  const lum = relativeLuminance(...rgb)
  const inkLum = relativeLuminance(...hexToRgb(INK_HEX))
  const whiteContrast = contrastRatio(lum, 1)
  const inkContrast = contrastRatio(lum, inkLum)
  const best = whiteContrast >= inkContrast ? '#ffffff' : INK_HEX
  const bestContrast = Math.max(whiteContrast, inkContrast)
  return bestContrast >= AA_NORMAL_TEXT ? best : null
}

// Config del anfitrión/backend es entrada NO CONFIABLE (spec §7): SIEMPRE vía
// CSSStyleDeclaration.setProperty, JAMÁS interpolado en HTML/CSS. Se llama
// desde main.tsx ANTES del primer render (Task 15), no desde un efecto de
// Panel — así el launcher inicial también respeta el theme (Important #10).
export function applyTheme(root: HTMLElement, theme: WidgetConfig['theme']): void {
  if (isSafeColor(theme.primaryColor)) {
    const normalized = normalizeHex(theme.primaryColor.trim())
    const ink = deriveInkColor(normalized)
    if (ink) {
      root.style.setProperty('--brand-a', normalized)
      root.style.setProperty('--brand-ink', ink)
    } else {
      // Ni blanco ni la tinta oscura alcanzan 4.5:1 real contra este color:
      // en vez de aceptar un texto que no cumple AA, se ignora el override
      // y se conserva el --brand-a por defecto del token set (que sí pasa —
      // blanco sobre #6d4aff da ~5.15:1, ver el test de arriba).
      console.warn(`[nevent-widget] primaryColor "${theme.primaryColor}" no alcanza 4.5:1 de contraste con ninguna tinta disponible — se ignora, se mantiene el color de marca por defecto`)
    }
  }
  root.dataset['position'] = theme.position === 'left' ? 'left' : 'right'

  if (theme.mode === 'light' || theme.mode === 'dark') {
    root.dataset['theme'] = theme.mode
  } else {
    delete root.dataset['theme']
  }
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/theme.test.ts`
Expected: PASS (19 tests — 5 isSafeColor + 2 isSafeHttpsUrl + 5 deriveInkColor + 7 applyTheme; eran 17 en rev.3, +2 por el test de rechazo `#006eff` en cada describe afectado).

**Nota (ronda 3): esta tarea deja pendiente, a propósito, un cambio en `panel.css` que Task 6 crea más adelante** — `.initials-avatar` (las iniciales del agente, texto real) hoy hereda `background: var(--brand-grad)`; con el modelo de contraste de este Step, el texto real solo tiene AA garantizado sobre `--brand-a` SÓLIDO. Task 6, Step 5 (que es quien primero escribe esa regla) ya incorpora el fix — no hay una regla `.initials-avatar` previa que arreglar aquí porque `panel.css` todavía no existe en el árbol de tareas en este punto.

- [ ] **Step 5: commit**

```bash
git add packages/widget/src/panel/theme.ts packages/widget/src/panel/__tests__/theme.test.ts
git commit -m "fix(widget): contraste AA garantizado por construcción contra el color sólido (rechaza y avisa si ninguna tinta alcanza 4.5:1, nunca 'la mejor de dos que no cumplen')"
```

---

### Task 3: Adaptadores del store (`use-store.ts`, `use-unread-count.ts`)

**Files:**
- Create: `packages/widget/src/panel/use-store.ts`
- Create: `packages/widget/src/panel/use-unread-count.ts`
- Create: `packages/widget/src/panel/__tests__/use-store.test.tsx`
- Create: `packages/widget/src/panel/__tests__/use-unread-count.test.tsx`

**Interfaces:**
- Consumes: `MessageStore`, `StoreState` de `../store/message-store`; `mount`/`cleanupMounted` de `./test-utils` (Task 1).
- Produces: `useStoreState(store: MessageStore): StoreState`, `useUnreadCount(state: StoreState, isOpen: boolean): number`.

- [ ] **Step 1: escribir el test de use-store (falla primero)**

Crear `packages/widget/src/panel/__tests__/use-store.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { useStoreState } from '../use-store'
import { createMessageStore } from '../../store/message-store'
import { mount, cleanupMounted } from './test-utils'

function Probe({ store }: { store: ReturnType<typeof createMessageStore> }) {
  const state = useStoreState(store)
  return <div data-testid="count">{state.messages.length}</div>
}

afterEach(cleanupMounted)

describe('useStoreState', () => {
  it('lee el snapshot inicial y se re-renderiza cuando el store notifica', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe store={store} />)
    expect(root.querySelector('[data-testid=count]')?.textContent).toBe('0')
    await act(() => { store.addOptimistic('c1', 'hola') })
    expect(root.querySelector('[data-testid=count]')?.textContent).toBe('1')
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-store.test.tsx`
Expected: FAIL — `Failed to resolve import "../use-store"`

- [ ] **Step 3: implementar use-store.ts**

Crear `packages/widget/src/panel/use-store.ts`:

```ts
import { useSyncExternalStore } from 'preact/compat'
import type { MessageStore, StoreState } from '../store/message-store'

export function useStoreState(store: MessageStore): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-store.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: escribir el test de use-unread-count (falla primero)**

Crear `packages/widget/src/panel/__tests__/use-unread-count.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { useUnreadCount } from '../use-unread-count'
import { createMessageStore, type StoreState } from '../../store/message-store'
import { mount, rerender, cleanupMounted } from './test-utils'

function Probe({ state, isOpen }: { state: StoreState; isOpen: boolean }) {
  const count = useUnreadCount(state, isOpen)
  return <div data-testid="unread">{count}</div>
}

function readCount(root: HTMLElement): string {
  return root.querySelector('[data-testid=unread]')?.textContent ?? ''
}

afterEach(cleanupMounted)

describe('useUnreadCount', () => {
  it('cuenta mensajes bot/agent completos llegados con el panel cerrado, y se resetea al abrir', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe state={store.getState()} isOpen={false} />)
    expect(readCount(root)).toBe('0')

    store.beginBotTurn('t1'); store.appendBotDelta('t1', 'hola'); store.finishBotTurn('t1', 'msg_1')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('1')

    store.beginBotTurn('t2'); store.finishBotTurn('t2', 'msg_2')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('2')

    await rerender(<Probe state={store.getState()} isOpen={true} />, root)
    expect(readCount(root)).toBe('0')

    store.beginBotTurn('t3'); store.finishBotTurn('t3', 'msg_3')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('1')
  })

  it('no cuenta un turno de bot mientras sigue en streaming', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe state={store.getState()} isOpen={false} />)
    store.beginBotTurn('t1'); store.appendBotDelta('t1', 'aún escribiendo')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('0')
  })
})
```

- [ ] **Step 6: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-unread-count.test.tsx`
Expected: FAIL — `Failed to resolve import "../use-unread-count"`

- [ ] **Step 7: implementar use-unread-count.ts**

Crear `packages/widget/src/panel/use-unread-count.ts`:

```ts
import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoreState } from '../store/message-store'

// Cuenta mensajes bot/agent completos (no streaming) llegados desde la
// última vez que el panel estuvo abierto — spec §3.2. No requiere tocar
// message-store.ts para esto: se deriva comparando snapshots sucesivos.
export function useUnreadCount(state: StoreState, isOpen: boolean): number {
  const [count, setCount] = useState(0)
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      for (const m of state.messages) seenIds.current.add(m.id)
      setCount(0)
      return
    }
    let unseen = 0
    for (const m of state.messages) {
      const isCompleteReply = (m.role === 'bot' || m.role === 'agent') && m.status === 'sent' && !m.streaming
      if (isCompleteReply && !seenIds.current.has(m.id)) unseen += 1
    }
    setCount(unseen)
  }, [state.messages, isOpen])

  return count
}
```

- [ ] **Step 8: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-unread-count.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: commit**

```bash
git add packages/widget/src/panel/use-store.ts packages/widget/src/panel/use-unread-count.ts packages/widget/src/panel/__tests__/use-store.test.tsx packages/widget/src/panel/__tests__/use-unread-count.test.tsx
git commit -m "feat(widget): hooks de adaptación del MessageStore (useSyncExternalStore, contador de no leídos)"
```

---

### Task 4: Focus trap sin fugas (`focus-trap.ts`)

**Files:**
- Create: `packages/widget/src/panel/focus-trap.ts`
- Create: `packages/widget/src/panel/__tests__/focus-trap.test.tsx`

**Interfaces:**
- Produces: `trapFocus(container: HTMLElement, opts: { onEscape: () => void; autofocus: boolean }): { release(): void }`, `useFocusTrap(active: boolean, onEscape: () => void, autofocus: boolean): RefObject<HTMLElement | null>`. La decisión de móvil-vs-desktop para `autofocus` la toma el LLAMADOR (Task 13, `Panel`) vía `matchMedia` — este módulo no sabe nada de breakpoints, solo ejecuta la política que le dan.

- [ ] **Step 1: escribir los tests (fallan primero)**

Crear `packages/widget/src/panel/__tests__/focus-trap.test.tsx`:

Important #11 (ronda 2): `trapFocus` registra un listener de `focusin` en `document` (no en `panel`) — si un test no lo libera, queda vivo para el resto del archivo, apuntando a un `panel` YA DESMONTADO de tests anteriores. Cada test captura el `handle` devuelto en una variable compartida y `afterEach` lo libera SIEMPRE, incluso en los tests que no lo mencionan explícitamente (liberar dos veces es seguro — `removeEventListener` es idempotente).

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trapFocus, type FocusTrapHandle } from '../focus-trap'

function setUpPanel(): HTMLElement {
  const panel = document.createElement('section')
  panel.tabIndex = -1
  panel.innerHTML = `<button id="a">A</button><button id="b">B</button><button id="c">C</button>`
  document.body.appendChild(panel)
  return panel
}

describe('trapFocus', () => {
  let panel: HTMLElement
  let handle: FocusTrapHandle | null = null

  beforeEach(() => { panel = setUpPanel() })
  afterEach(() => {
    handle?.release() // idempotente — a salvo aunque el propio test ya lo haya liberado
    handle = null
    panel.remove()
  })

  it('Tab en el último foco-able vuelve al primero (wrap hacia adelante)', () => {
    panel.querySelector<HTMLElement>('#c')!.focus()
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('a')
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Shift+Tab en el primero vuelve al último (wrap hacia atrás)', () => {
    panel.querySelector<HTMLElement>('#a')!.focus()
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('c')
  })

  it('Important #5 — Shift+Tab justo tras el autofocus inicial (foco en el propio contenedor, no en "a") envuelve al último, no se escapa del panel', () => {
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: true })
    expect(document.activeElement).toBe(panel) // autofocus enfoca el contenedor (tabindex=-1), no "a"
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('c')
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Tab justo tras el autofocus inicial (foco en el contenedor) va al primero', () => {
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: true })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('a')
  })

  it('Escape invoca onEscape y no mueve el foco por sí mismo', () => {
    const onEscape = vi.fn()
    handle = trapFocus(panel, { onEscape, autofocus: false })
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('autofocus:true enfoca el contenedor mismo (tabindex=-1), no un hijo', () => {
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: true })
    expect(document.activeElement).toBe(panel)
  })

  it('autofocus:false no mueve el foco al crear el trap (política móvil, Task 13)', () => {
    document.body.focus()
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    expect(document.activeElement).not.toBe(panel)
  })

  it('Important #5 — si el foco se sale del panel por cualquier vía (no solo Tab), se retrapea automáticamente', () => {
    const outside = document.createElement('button')
    outside.id = 'outside'
    document.body.appendChild(outside)
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    outside.focus()
    expect(document.activeElement).toBe(panel)
    outside.remove()
  })

  it('release() quita los listeners de keydown y focusin', () => {
    const onEscape = vi.fn()
    handle = trapFocus(panel, { onEscape, autofocus: false })
    handle.release()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onEscape).not.toHaveBeenCalled()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside) // ya no se retrapea: el listener se liberó
    outside.remove()
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/focus-trap.test.tsx`
Expected: FAIL — `Failed to resolve import "../focus-trap"`

- [ ] **Step 3: implementar focus-trap.ts**

Crear `packages/widget/src/panel/focus-trap.ts`:

```ts
import { useEffect, useRef } from 'preact/hooks'

export interface FocusTrapHandle {
  release(): void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Atrapa Tab/Shift+Tab dentro de `container` y delega Escape a `onEscape` —
// spec §6. El foco inicial, cuando `autofocus` es true, cae en el propio
// `container` (requiere tabindex="-1" en el JSX que lo use) en vez de "el
// primer elemento foco-able" — patrón WAI-ARIA APG para diálogos.
export function trapFocus(container: HTMLElement, opts: { onEscape: () => void; autofocus: boolean }): FocusTrapHandle {
  const focusables = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

  const onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.preventDefault(); opts.onEscape(); return }
    if (ev.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) { ev.preventDefault(); return } // nada foco-able: no dejar escapar el foco igualmente
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    // `active === container` cubre el foco inicial del autofocus (el propio
    // <section tabindex=-1>, excluido del orden normal de Tab): sin este
    // caso, Shift+Tab desde ahí no coincidía con "first" y el navegador
    // aplicaba su comportamiento nativo, sacando el foco del panel entero —
    // fuga real corregida aquí (Important #5 de la revisión de Codex).
    if (ev.shiftKey && (active === first || active === container)) {
      ev.preventDefault(); last.focus()
    } else if (!ev.shiftKey && (active === last || active === container)) {
      ev.preventDefault(); first.focus()
    } else if (active === null || !container.contains(active)) {
      ev.preventDefault()
      ;(ev.shiftKey ? last : first).focus()
    }
  }

  // Red de seguridad para foco que se sale del panel por CUALQUIER vía, no
  // solo Tab (clic en algo no foco-able, blur programático) — Important #5:
  // "tampoco contiene el foco si cae en body o fuera del section".
  const onFocusIn = (ev: FocusEvent): void => {
    if (!container.contains(ev.target as Node)) container.focus()
  }

  container.addEventListener('keydown', onKeydown)
  document.addEventListener('focusin', onFocusIn)
  if (opts.autofocus) container.focus()

  return {
    release(): void {
      container.removeEventListener('keydown', onKeydown)
      document.removeEventListener('focusin', onFocusIn)
    },
  }
}

// `autofocus` es una decisión tomada UNA VEZ al crear el trap (no reactiva):
// si el viewport cruza el breakpoint móvil/desktop mientras el panel ya está
// abierto, no se le roba el foco al usuario a mitad de sesión. Por eso NO
// está en el array de deps — solo `active` recrea el trap.
export function useFocusTrap(active: boolean, onEscape: () => void, autofocus: boolean) {
  const containerRef = useRef<HTMLElement | null>(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active || !containerRef.current) return
    const handle = trapFocus(containerRef.current, { onEscape: () => onEscapeRef.current(), autofocus })
    return () => handle.release()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return containerRef
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/focus-trap.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: commit**

```bash
git add packages/widget/src/panel/focus-trap.ts packages/widget/src/panel/__tests__/focus-trap.test.tsx
git commit -m "fix(widget): corrige fuga de foco en Shift+Tab tras autofocus y añade red de seguridad focusin"
```

---

### Task 5: Derivación pura del estado visual — fase/conexión/actividad ortogonales (`view-state.ts`)

Esta tarea reescribe por completo el enfoque de rev.1: en vez de un único `ribbon` de 7 valores que MEZCLABA conexión, streaming y fase de conversación (y que `Panel` usaba para decidir qué contenido de handoff pintar), ahora hay **tres señales independientes** — `conversationPhase` (servidor, gobierna contenido), `connectionState` (conexión, gobierna banner/composer) e `isStreaming` (gobierna el botón detener). El `ribbon` se sigue calculando, pero es SOLO un valor visual derivado para la cinta de 2px de la cabecera — ninguna tarea posterior lo usa para decidir si se pinta `WaitingCard`/`AgentJoinedSysline`/`TypingDots`/`ResolvedCard`.

**Files:**
- Create: `packages/widget/src/panel/view-state.ts`
- Create: `packages/widget/src/panel/__tests__/view-state.test.ts`

**Interfaces:**
- Consumes: `ConversationState` de `../contract/types`, `ConnectionStatus` de `../store/message-store`.
- Produces: `ConversationPhase`, `RibbonKind`, `ConnectionBanner`, `ViewStateInput`, `PanelViewState`, `computeViewState(input: ViewStateInput): PanelViewState` — consumido por `Header` (Task 6), `Composer` (Task 9), `ConnectionBanner` component (Task 10) y `Panel` (Task 13, que lee `conversationPhase` — NUNCA `ribbon` — para decidir qué handoff renderizar).

- [ ] **Step 1: escribir los tests (fallan primero)**

Crear `packages/widget/src/panel/__tests__/view-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeViewState, type ViewStateInput } from '../view-state'

const base: ViewStateInput = {
  conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
  assistantName: 'Asistente de DEMO FEST', isStreaming: false,
}

describe('computeViewState — conversationPhase es SIEMPRE la fase dictada por el servidor (Critical #1)', () => {
  it('idle: BOT_ACTIVE sin streaming', () => {
    const v = computeViewState(base)
    expect(v.conversationPhase).toBe('idle')
    expect(v.headerName).toBe('Asistente de DEMO FEST')
    expect(v.headerStatus).toBe('Respuesta al instante')
    expect(v.ribbon).toBe('idle')
  })

  it('idle + streaming: la fase sigue idle, streaming solo afecta ribbon/botón/estado de cabecera', () => {
    const v = computeViewState({ ...base, isStreaming: true })
    expect(v.conversationPhase).toBe('idle')
    expect(v.ribbon).toBe('bot-streaming')
    expect(v.headerStatus).toBe('Escribiendo…')
    expect(v.showStopButton).toBe(true)
  })

  it('waiting: ESCALATED_WAITING → fase waiting, cabecera neutral "El equipo" (gap #1, nunca assistantName)', () => {
    const v = computeViewState({ ...base, conversationState: 'ESCALATED_WAITING' })
    expect(v.conversationPhase).toBe('waiting')
    expect(v.headerName).toBe('El equipo')
    expect(v.headerStatus).toBe('El equipo te atenderá en breve')
    expect(v.headerPulse).toBe('wait')
    expect(v.composerPlaceholder).toBe('Escribe al equipo…')
  })

  it('CRÍTICO — ESCALATED_WAITING + offline: la fase SIGUE siendo waiting (WaitingCard no desaparece), solo cambia conexión/banner', () => {
    const v = computeViewState({ ...base, conversationState: 'ESCALATED_WAITING', connection: 'offline' })
    expect(v.conversationPhase).toBe('waiting')
    expect(v.connectionState).toBe('offline')
    expect(v.connectionBanner).toBe('offline')
    expect(v.composerDisabled).toBe(true)
  })

  it('agent: AGENT_ACTIVE + agentName → cabecera = SOLO el nombre del agente (gap #1, nunca "Laura · Asistente de X")', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura' })
    expect(v.conversationPhase).toBe('agent')
    expect(v.headerName).toBe('Laura')
    expect(v.headerStatus).toBe('En línea ahora')
    expect(v.headerPulse).toBe('live')
    expect(v.composerPlaceholder).toBe('Escribe a Laura…')
    expect(v.showAgentAvatar).toBe(true)
  })

  it('AGENT_ACTIVE sin agentName aún (agent.joined no ha llegado): cabecera neutral, sin avatar de agente', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: null })
    expect(v.headerName).toBe('El equipo')
    expect(v.showAgentAvatar).toBe(false)
  })

  it('CRÍTICO — AGENT_ACTIVE + reconnecting: la fase SIGUE siendo agent (cabecera/avatar no desaparecen), solo se superpone el banner', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura', connection: 'reconnecting' })
    expect(v.conversationPhase).toBe('agent')
    expect(v.headerName).toBe('Laura')
    expect(v.showAgentAvatar).toBe(true)
    expect(v.connectionBanner).toBe('reconnect')
    expect(v.ribbon).toBe('reconnect') // la cinta SÍ refleja la conexión — es visual, no gobierna contenido
  })

  it('resolved: RESOLVED → cabecera neutral', () => {
    const v = computeViewState({ ...base, conversationState: 'RESOLVED' })
    expect(v.conversationPhase).toBe('resolved')
    expect(v.headerName).toBe('El equipo')
    expect(v.headerStatus).toBe('Conversación resuelta')
  })

  it('CRÍTICO — streaming nunca oculta una fase de servidor más reciente: RESOLVED + isStreaming true mantiene la fase resolved', () => {
    const v = computeViewState({ ...base, conversationState: 'RESOLVED', isStreaming: true })
    expect(v.conversationPhase).toBe('resolved')
  })

  it('polling se trata visualmente igual que reconnecting en ribbon/banner, sin tocar la fase', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura', connection: 'polling' })
    expect(v.conversationPhase).toBe('agent')
    expect(v.ribbon).toBe('reconnect')
    expect(v.connectionBanner).toBe('reconnect')
  })

  it('offline: prioridad visual sobre streaming en el ribbon, pero el botón detener sigue disponible', () => {
    const v = computeViewState({ ...base, connection: 'offline', isStreaming: true, conversationState: 'ESCALATED_WAITING' })
    expect(v.ribbon).toBe('offline')
    expect(v.connectionBanner).toBe('offline')
    expect(v.composerDisabled).toBe(true)
    expect(v.showStopButton).toBe(true)
  })

  it('conversationState null (sesión recién creada, snapshot aún no llega): fase idle', () => {
    const v = computeViewState({ ...base, conversationState: null })
    expect(v.conversationPhase).toBe('idle')
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/view-state.test.ts`
Expected: FAIL — `Failed to resolve import "../view-state"`

- [ ] **Step 3: implementar view-state.ts**

Crear `packages/widget/src/panel/view-state.ts`:

```ts
import type { ConversationState } from '../contract/types'
import type { ConnectionStatus } from '../store/message-store'

export type ConversationPhase = 'idle' | 'waiting' | 'agent' | 'resolved'
export type RibbonKind = 'idle' | 'bot-streaming' | 'waiting' | 'agent' | 'resolved' | 'reconnect' | 'offline'
export type ConnectionBanner = 'reconnect' | 'offline' | null

export interface ViewStateInput {
  conversationState: ConversationState | null
  connection: ConnectionStatus
  agentName: string | null
  assistantName: string
  isStreaming: boolean
}

export interface PanelViewState {
  conversationPhase: ConversationPhase
  connectionState: ConnectionStatus
  isStreaming: boolean
  ribbon: RibbonKind
  headerName: string
  headerStatus: string
  headerPulse: 'wait' | 'live' | null
  composerPlaceholder: string
  composerDisabled: boolean
  showStopButton: boolean
  connectionBanner: ConnectionBanner
  showAgentAvatar: boolean
}

export function computeViewState(input: ViewStateInput): PanelViewState {
  const { conversationState, connection, agentName, assistantName, isStreaming } = input

  // 1) Fase — dictada EXCLUSIVAMENTE por el servidor (spec §5). Nunca se
  // recalcula ni se oculta por conexión o streaming (Critical #1).
  const conversationPhase: ConversationPhase =
    conversationState === 'ESCALATED_WAITING' ? 'waiting' :
    conversationState === 'AGENT_ACTIVE' ? 'agent' :
    conversationState === 'RESOLVED' ? 'resolved' : 'idle'

  const hasAgent = conversationPhase === 'agent' && agentName !== null

  // 2) Nombre/avatar de cabecera — reflejan la fase, NUNCA la conexión.
  // Copia neutral "El equipo" para waiting/resolved/agent-sin-nombre-aún
  // (gap #1 de contrato: sin campo de tenant separado de assistantName;
  // reutilizarlo ahí producía "Laura · Asistente de X" — rechazado en revisión).
  const headerName =
    conversationPhase === 'agent' ? (hasAgent ? (agentName as string) : 'El equipo') :
    conversationPhase === 'waiting' || conversationPhase === 'resolved' ? 'El equipo' :
    assistantName

  const phaseStatus =
    conversationPhase === 'waiting' ? 'El equipo te atenderá en breve' :
    conversationPhase === 'agent' ? 'En línea ahora' :
    conversationPhase === 'resolved' ? 'Conversación resuelta' :
    isStreaming ? 'Escribiendo…' : 'Respuesta al instante'

  const headerPulse: 'wait' | 'live' | null =
    conversationPhase === 'waiting' ? 'wait' : conversationPhase === 'agent' ? 'live' : null

  // 3) La conexión SOLO se superpone al texto de estado y al banner — nunca
  // sustituye nombre/avatar ni fase.
  const connectionOverlayStatus =
    connection === 'offline' ? 'Sin conexión' :
    connection === 'reconnecting' || connection === 'polling' ? 'Reconectando…' : null

  // 4) Ribbon — PURAMENTE visual (color/animación de la cinta de 2px).
  // Ningún consumidor debe usar este valor para decidir qué contenido de
  // handoff pintar — para eso está conversationPhase (Critical #1).
  const ribbon: RibbonKind =
    connection === 'offline' ? 'offline' :
    connection === 'reconnecting' || connection === 'polling' ? 'reconnect' :
    isStreaming ? 'bot-streaming' :
    conversationPhase === 'waiting' ? 'waiting' :
    conversationPhase === 'agent' ? 'agent' :
    conversationPhase === 'resolved' ? 'resolved' : 'idle'

  const composerPlaceholder =
    conversationPhase === 'agent' ? (hasAgent ? `Escribe a ${agentName}…` : 'Escribe al equipo…') :
    conversationPhase === 'waiting' ? 'Escribe al equipo…' : 'Escribe tu pregunta…'

  return {
    conversationPhase,
    connectionState: connection,
    isStreaming,
    ribbon,
    headerName,
    headerStatus: connectionOverlayStatus ?? phaseStatus,
    headerPulse,
    composerPlaceholder,
    composerDisabled: connection === 'offline',
    showStopButton: isStreaming,
    connectionBanner: connection === 'offline' ? 'offline' : (connection === 'reconnecting' || connection === 'polling') ? 'reconnect' : null,
    showAgentAvatar: hasAgent,
  }
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/view-state.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: commit**

```bash
git add packages/widget/src/panel/view-state.ts packages/widget/src/panel/__tests__/view-state.test.ts
git commit -m "refactor(widget): separa fase de conversación/conexión/streaming en señales ortogonales (fix Critical #1)"
```

---

### Task 6: Cabecera (`Header.tsx`)

**Files:**
- Create: `packages/widget/src/panel/Header.tsx`
- Create: `packages/widget/src/panel/panel.css` (arranca aquí con `.head`/`.avatar`/`.state-ribbon`/`.iconbtn`/`.initials-avatar`; tareas siguientes le añaden reglas al mismo archivo)
- Create: `packages/widget/src/panel/__tests__/Header.test.tsx`

**Interfaces:**
- Consumes: `PanelViewState` de `./view-state` (Task 5), `BotIcon`/`AgentInitialsAvatar` de `./icons` (Task 1).
- Produces: `HeaderProps`, `Header(props: HeaderProps)` — consumido por `Panel` (Task 13). `viewState.headerName` ya trae la copia neutral resuelta (Task 5) — `Header` no decide nombres, solo los muestra.

- [ ] **Step 1: escribir el test (falla primero)**

Crear `packages/widget/src/panel/__tests__/Header.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Header } from '../Header'
import { computeViewState } from '../view-state'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Header', () => {
  it('estado idle: nombre/estado del assistant, sin pulse, icono de bot (no avatar de agente)', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onMinimize={vi.fn()} onClose={vi.fn()} />)
    expect(root.querySelector('.name')?.textContent).toBe('Asistente de DEMO FEST')
    expect(root.querySelector('.state')?.textContent).toBe('Respuesta al instante')
    expect(root.querySelector('.pulse')).toBeNull()
    expect(root.querySelector('svg[data-icon=bot]')).not.toBeNull()
    expect(root.querySelector('.initials-avatar')).toBeNull()
    expect(root.querySelector('.state-ribbon')?.getAttribute('data-ribbon')).toBe('idle')
  })

  it('estado agent: avatar de iniciales del agente (nunca <img>, spec §8), punto "en línea" y nombre solo (gap #1)', async () => {
    const viewState = computeViewState({
      conversationState: 'AGENT_ACTIVE', connection: 'live', agentName: 'Laura',
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onMinimize={vi.fn()} onClose={vi.fn()} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
    expect(root.querySelector('.dot-live')).not.toBeNull()
    expect(root.querySelector('.pulse')).not.toBeNull()
    expect(root.querySelector('.name')?.textContent).toBe('Laura')
  })

  it('minimizar y cerrar disparan sus callbacks', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const onMinimize = vi.fn()
    const onClose = vi.fn()
    const root = await mount(<Header viewState={viewState} onMinimize={onMinimize} onClose={onClose} />)
    root.querySelector<HTMLButtonElement>('[aria-label="Minimizar"]')!.click()
    root.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click()
    expect(onMinimize).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Header.test.tsx`
Expected: FAIL — `Failed to resolve import "../Header"`

- [ ] **Step 3: implementar Header.tsx**

Crear `packages/widget/src/panel/Header.tsx`:

```tsx
import type { PanelViewState } from './view-state'
import { AgentInitialsAvatar, BotIcon } from './icons'

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
          {viewState.showAgentAvatar ? <AgentInitialsAvatar name={viewState.headerName} /> : <BotIcon />}
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
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Header.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: crear panel.css con las reglas de cabecera/ribbon/avatar de iniciales**

Crear `packages/widget/src/panel/panel.css`:

```css
/* ===== Cabecera + cinta de estado (elemento firma, spec §6) ===== */
.head { display: flex; align-items: center; gap: 11px; padding: 10px 12px 10px 16px; }
.avatar { position: relative; width: 38px; height: 38px; border-radius: 50%; background: var(--brand-grad); color: var(--brand-ink); display: grid; place-items: center; flex-shrink: 0; }
.avatar svg { width: 19px; height: 19px; }
.avatar .dot-live { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; background: var(--live); border: 2px solid var(--surface); }

/* Avatar de iniciales (spec §8: sin imágenes de terceros en v1). Fondo
   --brand-a SÓLIDO, nunca --brand-grad (Important, ronda 3): esto pinta
   TEXTO real (la inicial del agente) — el modelo de contraste de theme.ts
   (Task 2) solo garantiza 4.5:1 real contra el color sólido, no contra el
   degradado. .avatar (arriba) sí puede quedarse en --brand-grad porque ahí
   dentro solo hay un icono SVG decorativo (BotIcon) cuando no hay iniciales
   — WCAG 2.2 SC 1.4.11 le exige ≥3:1, no 4.5:1. */
.initials-avatar { width: 100%; height: 100%; border-radius: 50%; display: grid; place-items: center; font: 600 14px var(--font-display); color: var(--brand-ink); background: var(--brand-a); }

.head .id { flex: 1; min-width: 0; }
.head .name { font: 600 14.5px/1.2 var(--font-display); color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head .state { font-size: 12px; color: var(--muted); margin-top: 1px; display: flex; align-items: center; gap: 5px; }
.head .pulse { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.head .pulse-wait { background: var(--wait); }
.head .pulse-live { background: var(--live); }
.iconbtn { width: 32px; height: 32px; border-radius: 9px; border: none; background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center; }
.iconbtn:hover { background: var(--surface-2); color: var(--ink); }
.iconbtn:focus-visible { outline: 2px solid var(--brand-a); outline-offset: 1px; }
.iconbtn svg { width: 17px; height: 17px; }

.state-ribbon { height: 2px; flex-shrink: 0; background: var(--line); position: relative; overflow: hidden; }
.state-ribbon[data-ribbon="idle"] { background: var(--brand-grad); }
.state-ribbon[data-ribbon="bot-streaming"] { background: var(--brand-soft); }
.state-ribbon[data-ribbon="bot-streaming"]::after {
  content: ""; position: absolute; inset: 0; background: var(--brand-grad); animation: sweep 1.4s ease-in-out infinite;
}
@keyframes sweep { 0% { transform: translateX(-100%); } 55%, 100% { transform: translateX(100%); } }
.state-ribbon[data-ribbon="waiting"] { background: var(--wait); animation: breathe 2s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .35; } }
.state-ribbon[data-ribbon="agent"] { background: var(--live); }
.state-ribbon[data-ribbon="reconnect"] { background: repeating-linear-gradient(90deg, var(--faint) 0 8px, transparent 8px 16px); }
.state-ribbon[data-ribbon="offline"] { background: var(--faint); }
.state-ribbon[data-ribbon="resolved"] { background: var(--line); }

@media (prefers-reduced-motion: reduce) {
  .state-ribbon[data-ribbon="bot-streaming"]::after,
  .state-ribbon[data-ribbon="waiting"] { animation: none !important; }
}
```

- [ ] **Step 6: commit**

```bash
git add packages/widget/src/panel/Header.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/Header.test.tsx
git commit -m "feat(widget): cabecera del panel con avatar de iniciales (sin fotos externas, spec §8)"
```

---

### Task 7: Burbuja de mensaje (`MessageBubble.tsx`)

**Files:**
- Create: `packages/widget/src/panel/MessageBubble.tsx`
- Modify: `packages/widget/src/panel/panel.css` (añade `.msgs`/`.m`/`.bubble`/`.meta`/`.stream-caret`/`.thinking`)
- Create: `packages/widget/src/panel/__tests__/MessageBubble.test.tsx`

**Interfaces:**
- Consumes: `StoredMessage` de `../store/message-store`, `BotIcon`/`AgentInitialsAvatar` de `./icons`.
- Produces: `MessageBubbleProps`, `MessageBubble(props: MessageBubbleProps)` — consumido por `MessageList` (Task 9). Nota: el prop se llama `agentName` (no `agentAvatarUrl` como en rev.1) — spec §8, sin fotos de terceros.

- [ ] **Step 1: escribir el test (falla primero)**

Crear `packages/widget/src/panel/__tests__/MessageBubble.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageBubble } from '../MessageBubble'
import type { StoredMessage } from '../../store/message-store'
import { mount, cleanupMounted } from './test-utils'

function msg(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: 'Hola', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T14:02:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

afterEach(cleanupMounted)

describe('MessageBubble', () => {
  it('mensaje de usuario: alineado a la derecha, sin avatar, con hora y check de enviado', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'sent' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.m.user')).not.toBeNull()
    expect(root.querySelector('.b-avatar')).toBeNull()
    expect(root.querySelector('.meta')?.textContent).toContain('14:02')
  })

  it('renderiza el texto como nodo de texto plano — nunca interpreta HTML/markdown embebido (XSS)', async () => {
    const hostile = '<img src=x onerror="window.__pwned=true">'
    const root = await mount(<MessageBubble message={msg({ role: 'bot', text: hostile })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.bubble img')).toBeNull()
    expect(root.querySelector('.bubble')?.textContent).toBe(hostile)
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('bot en streaming CON texto: añade el cursor parpadeante marcado aria-hidden', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot', streaming: true, text: 'Escribiendo' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    const caret = root.querySelector('.stream-caret')
    expect(caret).not.toBeNull()
    expect(caret?.getAttribute('aria-hidden')).toBe('true')
  })

  it('streaming sin texto aún (turno recién empezado): muestra el indicador "pensando" en vez de una burbuja vacía (spec §2)', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot', streaming: true, text: '' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.thinking')).not.toBeNull()
    expect(root.querySelector('.thinking')?.textContent).toContain('Pensando')
    expect(root.querySelector('.bubble')).toBeNull()
  })

  it('mensaje fallido: muestra "No enviado" y un enlace Reintentar que llama onRetry con el clientId', async () => {
    const onRetry = vi.fn()
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'failed', clientId: 'c1' })} agentName={null} onRetry={onRetry} compact={false} />)
    expect(root.querySelector('.meta .fail')?.textContent).toBe('No enviado')
    root.querySelector<HTMLElement>('.meta .retry')!.click()
    expect(onRetry).toHaveBeenCalledWith('c1')
  })

  it('mensaje pendiente: no muestra check ni fallo', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'pending' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.meta .fail')).toBeNull()
  })

  it('agente con agentName: avatar de iniciales, nunca <img> (spec §8)', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'agent' })} agentName="Laura" onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  it('agente sin agentName aún (edge: mensaje ya llegó como agent pero agent.joined todavía no): recae en BotIcon', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'agent' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('svg[data-icon=bot]')).not.toBeNull()
    expect(root.querySelector('.initials-avatar')).toBeNull()
  })

  it('compact:true oculta el avatar visualmente (ghost) para agrupar burbujas consecutivas', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot' })} agentName={null} onRetry={vi.fn()} compact={true} />)
    expect(root.querySelector('.b-avatar.ghost')).not.toBeNull()
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/MessageBubble.test.tsx`
Expected: FAIL — `Failed to resolve import "../MessageBubble"`

- [ ] **Step 3: implementar MessageBubble.tsx**

Nota: spec §2 pide explícitamente un indicador "pensando" — un turno con `streaming:true` pero `text:''` (antes del primer delta) no debe pintar una burbuja vacía con solo el cursor.

Crear `packages/widget/src/panel/MessageBubble.tsx`:

```tsx
import type { StoredMessage } from '../store/message-store'
import { AgentInitialsAvatar, BotIcon } from './icons'

export interface MessageBubbleProps {
  message: StoredMessage
  agentName: string | null
  onRetry: (clientId: string) => void
  compact: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({ message, agentName, onRetry, compact }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const showAgentInitials = message.role === 'agent' && agentName !== null

  return (
    <div class={`m${isUser ? ' user' : ''}${compact ? ' compact' : ''}`}>
      {!isUser && (
        <div class={`b-avatar${compact ? ' ghost' : ''}`}>
          {showAgentInitials ? <AgentInitialsAvatar name={agentName as string} /> : <BotIcon />}
        </div>
      )}
      <div>
        {/* `{message.text}` es un hijo de texto JSX: Preact lo asigna como
            nodo de texto (no innerHTML) — sin markdown en v1 (Global Constraints). */}
        {message.streaming && message.text === '' ? (
          <div class="thinking">
            <svg class="spark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" fill="currentColor" />
            </svg>
            Pensando…
          </div>
        ) : (
          <div class="bubble">
            {message.text}
            {message.streaming && <span class="stream-caret" aria-hidden="true" />}
          </div>
        )}
        {isUser && (
          <div class="meta">
            {formatTime(message.createdAt)}
            {message.status === 'sent' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 13l4 4L15 7" /><path d="M9 13l4 4 8-10" />
              </svg>
            )}
            {message.status === 'failed' && message.clientId !== null && (
              <>
                <span class="fail">No enviado</span>
                <span class="retry" role="button" tabIndex={0}
                  onClick={() => onRetry(message.clientId as string)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onRetry(message.clientId as string) }}>
                  Reintentar
                </span>
              </>
            )}
          </div>
        )}
        {!isUser && !message.streaming && (
          <div class="meta">{formatTime(message.createdAt)}</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/MessageBubble.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: añadir las reglas de mensajes a panel.css**

Añadir al final de `packages/widget/src/panel/panel.css`:

```css
/* ===== Zona de mensajes ===== */
.msgs { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 3px; background: var(--surface); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.msgs::-webkit-scrollbar { width: 5px; }
.msgs::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
.day { align-self: center; font-size: 11px; color: var(--faint); margin: 2px 0 10px; }
.m { display: flex; gap: 8px; max-width: 86%; }
.m + .m { margin-top: 10px; }
.m.compact { margin-top: 2px; }
.m .b-avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--brand-grad); color: var(--brand-ink); display: grid; place-items: center; flex-shrink: 0; align-self: flex-end; }
.m .b-avatar svg { width: 13px; height: 13px; }
.m .b-avatar .initials-avatar { font-size: 11px; }
.m .b-avatar.ghost { visibility: hidden; }
.bubble { padding: 9px 13px; border-radius: var(--r-bubble); font-size: 13.8px; line-height: 1.5; color: var(--bubble-bot-ink); background: var(--bubble-bot); border-bottom-left-radius: 5px; white-space: pre-wrap; word-break: break-word; }
.m.user { align-self: flex-end; flex-direction: row-reverse; }
.m.user .bubble { background: var(--bubble-user); color: var(--bubble-user-ink); border-radius: var(--r-bubble); border-bottom-right-radius: 5px; }
.meta { font-size: 10.5px; color: var(--faint); margin-top: 3px; display: flex; gap: 4px; align-items: center; font-variant-numeric: tabular-nums; }
.m.user .meta { justify-content: flex-end; }
.meta svg { width: 12px; height: 12px; }
.meta .fail { color: var(--danger); font-weight: 500; }
.meta .retry { color: var(--brand-a); font-weight: 500; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.meta .retry:focus-visible { outline: 2px solid var(--brand-a); outline-offset: 2px; }

.stream-caret { display: inline-block; width: 7px; height: 14px; background: var(--brand-a); border-radius: 2px; vertical-align: -2px; animation: blink .9s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .stream-caret { animation: none !important; opacity: 1; } }

.thinking { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); padding: 9px 13px; }
.thinking .spark { width: 14px; height: 14px; animation: spin 2.4s linear infinite; }
/* @keyframes spin: también la usa/declara Task 10 (ConnectionBanner) — CSS
   resuelve @keyframes por nombre en toda la hoja sin importar el orden. */
@media (prefers-reduced-motion: reduce) { .thinking .spark { animation: none !important; } }
```

- [ ] **Step 6: commit**

```bash
git add packages/widget/src/panel/MessageBubble.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/MessageBubble.test.tsx
git commit -m "feat(widget): burbuja de mensaje con avatar de iniciales del agente (sin fotos externas)"
```

---

### Task 8: Lista de mensajes, bienvenida y autoscroll (`MessageList.tsx`)

**rev.3 — gap #4 revertido al fallback pre-autorizado.** La ronda 2 de la revisión encontró que la extensión aditiva de `agentJoinedAtSeq` (rev.2) NO consigue el intercalado histórico prometido: los mensajes recuperados por snapshot llegan con `seq:null` (que `MessageList` convertía en `Infinity` para ordenarlos al final), así que un `agent.joined` con `seq` real se intercalaba ANTES de todo el historial restaurado, no en su posición correcta; y al reabrir tras el handoff, el canal solo pide eventos posteriores al cursor, así que ese `agent.joined` histórico normalmente no vuelve a llegar. Se revierte al fallback ya pre-autorizado en la adjudicación: **sin `agentJoinedAtSeq`, sin slot `interleaved` en `MessageList`, sin `AgentJoinedSysline` en el `Panel` integrado**. La presencia del agente se comunica SOLO con el cambio de cabecera (nombre/avatar/pulso — ya resuelto por `view-state.ts`, Task 5, sin cambios ahí). `AgentJoinedSysline` (Task 10) sigue existiendo como componente y se usa ÚNICAMENTE en el harness de fixtures (Task 16) para paridad visual con el mock — documentado ahí como pendiente de un cambio de contrato futuro (backend + store) que exponga un timeline real.

**Files:**
- Modify: `packages/widget/src/contract/types.ts` (campo opcional `welcome` en `WidgetConfig` — gap #6)
- Modify: `packages/widget/src/contract/fixtures.ts` (`fixtureConfig()` incluye `welcome`)
- Modify: `packages/widget/src/contract/__tests__/fixtures.test.ts`
- Create: `packages/widget/src/panel/Welcome.tsx`
- Create: `packages/widget/src/panel/use-announcements.ts`
- Create: `packages/widget/src/panel/MessageList.tsx`
- Modify: `packages/widget/src/panel/panel.css` (reglas `.welcome`/`.chips`/`.chip`/`.sr-only`)
- Create: `packages/widget/src/panel/__tests__/Welcome.test.tsx`
- Create: `packages/widget/src/panel/__tests__/use-announcements.test.tsx`
- Create: `packages/widget/src/panel/__tests__/MessageList.test.tsx`

**Interfaces:**
- Consumes: `StoredMessage`/`StoreState` de `../store/message-store` (SIN tocar — Plan 2 congelado, sin extensión aditiva en esta revisión), `WidgetConfig` de `../contract/types`, `MessageBubble` de `./MessageBubble` (Task 7).
- Produces: `WidgetConfig['welcome']` (nuevo, opcional), `useAnnouncement(messages): string` (baseline silenciosa + ráfagas + re-anuncio de texto repetido, Important #6/#9), `MessageListProps` con un único slot `trailing` (contenido sin posición histórica: `WaitingCard`/`TypingDots`/`ResolvedCard` — `Panel`, Task 13, lo construye; NO hay slot `interleaved`).

- [ ] **Step 1: extender el contrato con `welcome` opcional (test primero)**

Añadir a `packages/widget/src/contract/__tests__/fixtures.test.ts`, dentro del primer `describe`:

```ts
  it('config incluye welcome opcional con quickReplies (spec §7 / gap #6)', () => {
    const c = fixtureConfig()
    expect(c.welcome?.title.length).toBeGreaterThan(0)
    expect(Array.isArray(c.welcome?.quickReplies)).toBe(true)
  })
```

Run: `cd packages/widget && npx vitest run src/contract/__tests__/fixtures.test.ts`
Expected: FAIL — `c.welcome` es `undefined`.

Editar `packages/widget/src/contract/types.ts`:

```ts
export interface WidgetConfig {
  schemaVersion: 1
  installationId: string
  assistantName: string
  locale: 'es' | 'en' | 'ca' | 'pt'
  theme: { primaryColor: string; position: 'right' | 'left'; mode: 'light' | 'dark' | 'auto' }
  features: { upload: boolean; handoff: boolean }
  // Opcional: normalizado en runtime en shell/session.ts (Task 15) — nunca
  // se confía en el shape tal cual llega de red. Ver "Brechas de contrato" #6.
  welcome?: { title: string; subtitle: string; quickReplies: string[] }
}
```

Editar `packages/widget/src/contract/fixtures.ts`:

```ts
export function fixtureConfig(): WidgetConfig {
  return {
    schemaVersion: 1,
    installationId: 'inst_demo_festival_01',
    assistantName: 'Asistente de DEMO FEST',
    locale: 'es',
    theme: { primaryColor: '#6d4aff', position: 'right', mode: 'auto' },
    features: { upload: true, handoff: true },
    welcome: {
      title: 'Hola 👋 ¿en qué te ayudamos?',
      subtitle: 'Respondemos al momento sobre entradas, accesos y cualquier duda del festival.',
      quickReplies: ['Cambiar el nombre de mi entrada', 'Horarios y artistas', 'Cómo llegar', 'No me llegó el email'],
    },
  }
}
```

Run: `cd packages/widget && npx vitest run src/contract/__tests__/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 2: commit parcial del contrato**

```bash
git add packages/widget/src/contract/types.ts packages/widget/src/contract/fixtures.ts packages/widget/src/contract/__tests__/fixtures.test.ts
git commit -m "feat(widget): campo opcional welcome en WidgetConfig (validación en runtime en Task 15)"
```

- [ ] **Step 3: escribir el test de Welcome (falla primero)**

Crear `packages/widget/src/panel/__tests__/Welcome.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Welcome } from '../Welcome'
import { fixtureConfig } from '../../contract/fixtures'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Welcome', () => {
  it('pinta título, subtítulo y un chip por quick reply de la config', async () => {
    const root = await mount(<Welcome config={fixtureConfig()} onChip={vi.fn()} />)
    expect(root.querySelector('h3')?.textContent).toBe('Hola 👋 ¿en qué te ayudamos?')
    expect(root.querySelectorAll('.chip').length).toBe(4)
  })

  it('clicar un chip llama a onChip con su texto exacto', async () => {
    const onChip = vi.fn()
    const root = await mount(<Welcome config={fixtureConfig()} onChip={onChip} />)
    root.querySelectorAll<HTMLButtonElement>('.chip')[1]!.click()
    expect(onChip).toHaveBeenCalledWith('Horarios y artistas')
  })

  it('sin config.welcome: cae a copia ES genérica sin chips inventados', async () => {
    const configSinWelcome = { ...fixtureConfig() }
    delete configSinWelcome.welcome
    const root = await mount(<Welcome config={configSinWelcome} onChip={vi.fn()} />)
    expect((root.querySelector('h3')?.textContent ?? '').length).toBeGreaterThan(0)
    expect(root.querySelectorAll('.chip').length).toBe(0)
  })
})
```

- [ ] **Step 4: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Welcome.test.tsx`
Expected: FAIL — `Failed to resolve import "../Welcome"`

- [ ] **Step 5: implementar Welcome.tsx**

Crear `packages/widget/src/panel/Welcome.tsx`:

```tsx
import type { WidgetConfig } from '../contract/types'

const DEFAULT_WELCOME = {
  title: 'Hola 👋 ¿en qué te ayudamos?',
  subtitle: 'Escríbenos y te respondemos al momento.',
  quickReplies: [] as string[],
}

export interface WelcomeProps {
  config: WidgetConfig
  onChip: (text: string) => void
}

export function Welcome({ config, onChip }: WelcomeProps) {
  const welcome = config.welcome ?? DEFAULT_WELCOME
  return (
    <div class="welcome">
      <h3>{welcome.title}</h3>
      <p>{welcome.subtitle}</p>
      {welcome.quickReplies.length > 0 && (
        <div class="chips">
          {welcome.quickReplies.map((text) => (
            <button key={text} class="chip" onClick={() => onChip(text)}>{text}</button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Welcome.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: escribir el test de use-announcements (falla primero)**

Crear `packages/widget/src/panel/__tests__/use-announcements.test.tsx`. Cubre Important #6 (baseline silenciosa al montar, ráfaga sin pérdidas) e Important #9 ronda 2 (un mensaje nuevo con texto IDÉNTICO al último anunciado debe seguir mutando la región `aria-live` — de lo contrario el lector de pantalla no lo re-anuncia porque el string no cambió):

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { useAnnouncement } from '../use-announcements'
import type { StoredMessage } from '../../store/message-store'
import { mount, rerender, cleanupMounted } from './test-utils'

function msg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: '', status: 'sent', seq: null, streaming: false,
    createdAt: '2026-07-18T10:00:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

function Probe({ messages }: { messages: StoredMessage[] }) {
  const announcement = useAnnouncement(messages)
  return <div data-testid="ann">{announcement}</div>
}

function read(root: HTMLElement): string {
  return root.querySelector('[data-testid=ann]')?.textContent ?? ''
}

// El fix de Important #9 (ronda 2) alterna un espacio de ancho cero (U+200B)
// al final del string — invisible y silencioso para lectores de pantalla,
// pero garantiza que la comparación de igualdad de Preact nunca bloquee la
// mutación del DOM. Los tests que verifican el texto "hablado" lo quitan
// antes de comparar.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
function stripZeroWidth(s: string): string {
  return s.split(ZERO_WIDTH_SPACE).join('')
}

afterEach(cleanupMounted)

describe('useAnnouncement', () => {
  it('Important #6 — baseline silenciosa: historial ya presente al montar (apertura/reapertura) NO se anuncia', async () => {
    const root = await mount(<Probe messages={[msg({ id: 'h1', text: 'Hola, ¿en qué te ayudamos?' })]} />)
    expect(read(root)).toBe('')
  })

  it('no anuncia mientras el mensaje sigue en streaming (evita spam de deltas)', async () => {
    const root = await mount(<Probe messages={[msg({ id: 't1', streaming: true, text: 'Ho' })]} />)
    await rerender(<Probe messages={[msg({ id: 't1', streaming: true, text: 'Hola' })]} />, root)
    expect(read(root)).toBe('')
  })

  it('anuncia el texto completo en cuanto un mensaje NUEVO (no visto en el montaje) deja de estar en streaming', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[msg({ id: 't1', streaming: false, text: 'Hola, ¿en qué ayudo?' })]} />, root)
    expect(stripZeroWidth(read(root))).toBe('Hola, ¿en qué ayudo?')
  })

  it('Important #6 — ráfaga: dos mensajes completos nuevos en el mismo cambio de props se anuncian juntos, no se pierde el primero', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[
      msg({ id: 'a', text: 'Primero' }),
      msg({ id: 'b', text: 'Segundo' }),
    ]} />, root)
    expect(stripZeroWidth(read(root))).toBe('Primero. Segundo')
  })

  it('no repite el anuncio de un mensaje ya anunciado en un cambio posterior', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[msg({ id: 't1', text: 'Hola' })]} />, root)
    await rerender(<Probe messages={[msg({ id: 't1', text: 'Hola' }), msg({ id: 'u1', role: 'user', text: 'gracias' })]} />, root)
    expect(stripZeroWidth(read(root))).toBe('Hola')
  })

  it('Important #9 (ronda 2) — un mensaje nuevo con texto IDÉNTICO al último anunciado sigue mutando el string, para que el lector de pantalla lo re-anuncie', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[msg({ id: 'a', text: 'Un momento' })]} />, root)
    const first = read(root)
    expect(stripZeroWidth(first)).toBe('Un momento')

    await rerender(<Probe messages={[msg({ id: 'a', text: 'Un momento' }), msg({ id: 'b', text: 'Un momento' })]} />, root)
    const second = read(root)
    expect(stripZeroWidth(second)).toBe('Un momento') // el texto "hablado" es el mismo...
    expect(second).not.toBe(first) // ...pero el string completo mutó de verdad (el DOM cambió)
  })
})
```

- [ ] **Step 8: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-announcements.test.tsx`
Expected: FAIL — `Failed to resolve import "../use-announcements"`

- [ ] **Step 9: implementar use-announcements.ts**

Crear `packages/widget/src/panel/use-announcements.ts`:

```ts
import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoredMessage } from '../store/message-store'

// Región aria-live separada de la lista visible (Task 8, MessageList): un
// delta de streaming por token saturaría al lector de pantalla. Resuelve tres
// problemas: (a) baseline silenciosa — el primer paso del efecto (montaje o
// REMONTAJE, ya que MessageList se desmonta con el panel cerrado, D7) solo
// marca como visto lo que YA está ahí, sin anunciar nada; (b) ráfaga — todos
// los mensajes nuevos completos de un mismo pase se acumulan en UN solo
// setState (unidos con ". "), nunca N llamadas sucesivas que se pisarían
// entre sí; (c) texto repetido (Important #9, ronda 2) — si el nuevo anuncio
// es un string IDÉNTICO al anterior, un setState con el mismo valor no muta
// el DOM (Preact hace bail-out por igualdad referencial de primitivos) y el
// lector de pantalla NO vuelve a anunciarlo. Se alterna un espacio de ancho
// cero (U+200B, invisible y silencioso) al final del string para garantizar
// que SIEMPRE cambia, incluso ante texto visualmente repetido.
// Carácter invisible vía código, nunca pegado literal en el archivo — un
// U+200B tecleado directamente en el código fuente es indistinguible a
// simple vista y se puede perder/corromper en un copy-paste sin que nadie lo
// note (exactamente el tipo de fragilidad a evitar en un paso ejecutable).
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

export function useAnnouncement(messages: readonly StoredMessage[]): string {
  const [announcement, setAnnouncement] = useState('')
  const announcedIds = useRef<Set<string> | null>(null)
  const toggleRef = useRef(false)

  useEffect(() => {
    const isCompleteReply = (m: StoredMessage): boolean =>
      (m.role === 'bot' || m.role === 'agent') && !m.streaming && m.text !== ''

    if (announcedIds.current === null) {
      announcedIds.current = new Set(messages.filter(isCompleteReply).map((m) => m.id))
      return
    }
    const fresh: string[] = []
    for (const m of messages) {
      if (isCompleteReply(m) && !announcedIds.current.has(m.id)) {
        announcedIds.current.add(m.id)
        fresh.push(m.text)
      }
    }
    if (fresh.length > 0) {
      toggleRef.current = !toggleRef.current
      setAnnouncement(fresh.join('. ') + (toggleRef.current ? ZERO_WIDTH_SPACE : ''))
    }
  }, [messages])

  return announcement
}
```

- [ ] **Step 10: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-announcements.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 11: escribir el test de MessageList (falla primero)**

Crear `packages/widget/src/panel/__tests__/MessageList.test.tsx`. El autoscroll usa un `ResizeObserver` real (Important #7) — jsdom no lo implementa, así que se stubea con un fake controlable, y `scrollHeight`/`scrollTop`/`clientHeight` se simulan con `Object.defineProperty` (jsdom tampoco calcula layout real):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageList } from '../MessageList'
import { fixtureConfig } from '../../contract/fixtures'
import type { StoredMessage } from '../../store/message-store'
import { mount, rerender, cleanupMounted } from './test-utils'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: () => void
  constructor(cb: () => void) { this.cb = cb; FakeResizeObserver.instances.push(this) }
  observe(): void {}
  disconnect(): void {}
  trigger(): void { this.cb() }
}

function msg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: 'hola', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T10:00:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

let originalRO: unknown
beforeEach(() => {
  originalRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  FakeResizeObserver.instances = []
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver
})
afterEach(async () => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalRO
  await cleanupMounted()
})

describe('MessageList', () => {
  it('showWelcome:true y sin mensajes: muestra Welcome, no el divisor "Hoy"', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={true} />,
    )
    expect(root.querySelector('.welcome')).not.toBeNull()
    expect(root.querySelector('.day')).toBeNull()
  })

  it('Important #9 — showWelcome:false aunque no haya mensajes (p.ej. fase waiting recién escalada sin historial visible): NO muestra Welcome', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.welcome')).toBeNull()
  })

  it('con mensajes: muestra el divisor "Hoy" y una burbuja por mensaje, sin Welcome', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' }), msg({ id: 'b', role: 'user' })]}
        agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.day')?.textContent).toBe('Hoy')
    expect(root.querySelector('.welcome')).toBeNull()
    expect(root.querySelectorAll('.m').length).toBe(2)
  })

  it('agrupa como compact las burbujas consecutivas del mismo rol', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()}
        messages={[msg({ id: 'a', role: 'bot' }), msg({ id: 'b', role: 'bot' }), msg({ id: 'c', role: 'user' })]}
        agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const ms = root.querySelectorAll('.m')
    expect(ms[0]?.classList.contains('compact')).toBe(false)
    expect(ms[1]?.classList.contains('compact')).toBe(true)
    expect(ms[2]?.classList.contains('compact')).toBe(false)
  })

  it('clicar un chip de Welcome llama a onQuickReply', async () => {
    const onQuickReply = vi.fn()
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} onRetry={vi.fn()} onQuickReply={onQuickReply} showWelcome={true} />,
    )
    root.querySelectorAll<HTMLButtonElement>('.chip')[0]!.click()
    expect(onQuickReply).toHaveBeenCalledWith('Cambiar el nombre de mi entrada')
  })

  it('trailing: se pinta tras todos los mensajes', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false}
        trailing={<div data-testid="trail">Resuelto</div>} />,
    )
    const inner = root.querySelector('.msgs-inner')!
    expect(inner.lastElementChild?.getAttribute('data-testid')).toBe('trail')
  })

  it('Important #7 — autoscroll: si estaba cerca del fondo, CUALQUIER crecimiento del contenido interior (no solo el último mensaje) mueve scrollTop al fondo', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true })
    container.scrollTop = 480 // a 20px del fondo: "cerca"
    container.dispatchEvent(new Event('scroll'))

    Object.defineProperty(container, 'scrollHeight', { value: 560, configurable: true })
    FakeResizeObserver.instances[0]!.trigger() // simula que .msgs-inner creció (p.ej. TypingDots apareció)
    expect(container.scrollTop).toBe(560)
  })

  it('autoscroll: si el usuario había subido a leer historial, el crecimiento del contenido NO le arrastra al fondo', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true })
    container.scrollTop = 0
    container.dispatchEvent(new Event('scroll'))

    Object.defineProperty(container, 'scrollHeight', { value: 560, configurable: true })
    FakeResizeObserver.instances[0]!.trigger()
    expect(container.scrollTop).toBe(0)
  })
})
```

- [ ] **Step 12: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/MessageList.test.tsx`
Expected: FAIL — `Failed to resolve import "../MessageList"`

- [ ] **Step 13: implementar MessageList.tsx**

rev.3: sin slot `interleaved` ni tipo `InterleavedItem` — revertido al fallback pre-autorizado (gap #4, ver cabecera de esta tarea). Solo queda `trailing`.

Crear `packages/widget/src/panel/MessageList.tsx`:

```tsx
import { useEffect, useRef } from 'preact/hooks'
import type { ComponentChildren, RefObject } from 'preact'
import type { StoredMessage } from '../store/message-store'
import type { WidgetConfig } from '../contract/types'
import { MessageBubble } from './MessageBubble'
import { Welcome } from './Welcome'
import { useAnnouncement } from './use-announcements'

export interface MessageListProps {
  config: WidgetConfig
  messages: readonly StoredMessage[]
  agentName: string | null
  onRetry: (clientId: string) => void
  onQuickReply: (text: string) => void
  trailing?: ComponentChildren
  showWelcome: boolean
}

const NEAR_BOTTOM_THRESHOLD_PX = 48

// Ancla el scroll observando un SENTINEL (`.msgs-inner`, el wrapper de TODO
// el contenido) con ResizeObserver: reacciona a cualquier cambio de altura
// real — mensaje nuevo, delta de streaming, dots de typing, tarjeta final —
// a diferencia de una dependencia de string basada en longitud/último
// mensaje (Important #7). La decisión de "estaba cerca del fondo" se toma
// SOLO en el listener de scroll, nunca dentro del callback de resize, para
// reflejar siempre el estado justo ANTES de la mutación.
function useBottomAnchoredScroll(containerRef: RefObject<HTMLDivElement>, innerRef: RefObject<HTMLDivElement>): void {
  const nearBottomRef = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = (): void => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const inner = innerRef.current
    const el = containerRef.current
    if (!inner || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])
}

export function MessageList({ config, messages, agentName, onRetry, onQuickReply, trailing, showWelcome }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  useBottomAnchoredScroll(containerRef, innerRef)
  const announcement = useAnnouncement(messages)

  return (
    <div class="msgs" ref={containerRef}>
      <div class="msgs-inner" ref={innerRef}>
        {showWelcome && <Welcome config={config} onChip={onQuickReply} />}
        {messages.length > 0 && <div class="day">Hoy</div>}
        {messages.map((m, i) => (
          <MessageBubble key={m.id} message={m} agentName={agentName} onRetry={onRetry}
            compact={i > 0 && messages[i - 1]?.role === m.role} />
        ))}
        {trailing}
      </div>
      <div aria-live="polite" class="sr-only">{announcement}</div>
    </div>
  )
}
```

- [ ] **Step 14: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/MessageList.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 15: añadir las reglas de bienvenida/chips/sr-only/msgs-inner a panel.css**

Añadir al final de `packages/widget/src/panel/panel.css`:

```css
.msgs-inner { display: flex; flex-direction: column; gap: 3px; }

/* ===== Bienvenida + quick replies ===== */
.welcome { padding: 6px 4px 14px; }
.welcome h3 { font: 600 19px/1.25 var(--font-display); color: var(--ink); letter-spacing: -.01em; }
.welcome p { font-size: 13.5px; color: var(--muted); margin-top: 5px; }
.chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.chip {
  font: 500 12.5px var(--font-body); color: var(--brand-a); background: transparent;
  border: 1px solid color-mix(in srgb, var(--brand-a) 35%, transparent);
  padding: 7px 13px; border-radius: 99px; cursor: pointer; transition: background .15s;
}
.chip:hover { background: var(--brand-soft); }
.chip:focus-visible { outline: 2px solid var(--brand-a); outline-offset: 2px; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 16: commit**

```bash
git add packages/widget/src/panel/Welcome.tsx packages/widget/src/panel/use-announcements.ts packages/widget/src/panel/MessageList.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/Welcome.test.tsx packages/widget/src/panel/__tests__/use-announcements.test.tsx packages/widget/src/panel/__tests__/MessageList.test.tsx
git commit -m "feat(widget): lista de mensajes sin slot interleaved (fallback gap #4), anuncios sin ráfaga ni texto repetido perdidos, autoscroll por sentinel"
```

---

### Task 9: Composer (`Composer.tsx`)

Sin cambios de lógica respecto a rev.1 (`viewState.composerDisabled`/`composerPlaceholder`/`showStopButton` conservan el mismo significado tras la reescritura de Task 5) — se reescribe aquí solo para aplicar la disciplina de test compartida (Important #11).

**Files:**
- Create: `packages/widget/src/panel/Composer.tsx`
- Modify: `packages/widget/src/panel/panel.css` (reglas `.composer`/`.c-row`/`.send`/`.stopbtn`/`.powered`)
- Create: `packages/widget/src/panel/__tests__/Composer.test.tsx`

**Interfaces:**
- Consumes: `PanelViewState` de `./view-state` (Task 5).
- Produces: `ComposerProps`, `Composer(props: ComposerProps)` — consumido por `Panel` (Task 13).

- [ ] **Step 1: escribir el test (falla primero)**

Crear `packages/widget/src/panel/__tests__/Composer.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Composer } from '../Composer'
import { computeViewState } from '../view-state'
import { mount, cleanupMounted } from './test-utils'

const idleViewState = computeViewState({
  conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
  assistantName: 'Asistente de DEMO FEST', isStreaming: false,
})

afterEach(cleanupMounted)

async function mountComposer(props: Parameters<typeof Composer>[0]): Promise<{ root: HTMLElement; textarea: HTMLTextAreaElement }> {
  const root = await mount(<Composer {...props} />)
  return { root, textarea: root.querySelector('textarea') as HTMLTextAreaElement }
}

describe('Composer', () => {
  it('usa el placeholder del viewState', async () => {
    const { textarea } = await mountComposer({ viewState: idleViewState, onSend: vi.fn(), onStop: vi.fn() })
    expect(textarea.placeholder).toBe('Escribe tu pregunta…')
  })

  it('Enter sin Shift envía el texto recortado y limpia el textarea', async () => {
    const onSend = vi.fn()
    const { textarea } = await mountComposer({ viewState: idleViewState, onSend, onStop: vi.fn() })
    textarea.value = '  hola  '
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onSend).toHaveBeenCalledWith('hola')
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter NO envía (deja insertar el salto de línea nativo)', async () => {
    const onSend = vi.fn()
    const { textarea } = await mountComposer({ viewState: idleViewState, onSend, onStop: vi.fn() })
    textarea.value = 'hola'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('texto vacío o solo espacios: el botón enviar está disabled y Enter no llama a onSend', async () => {
    const onSend = vi.fn()
    const { root, textarea } = await mountComposer({ viewState: idleViewState, onSend, onStop: vi.fn() })
    textarea.value = '   '
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    expect(root.querySelector<HTMLButtonElement>('.send')!.disabled).toBe(true)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('composerDisabled (offline): textarea y botón enviar quedan disabled', async () => {
    const offlineViewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'offline', agentName: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const { root, textarea } = await mountComposer({ viewState: offlineViewState, onSend: vi.fn(), onStop: vi.fn() })
    expect(textarea.disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.send')!.disabled).toBe(true)
  })

  it('el botón detener solo aparece cuando showStopButton es true, y llama a onStop', async () => {
    const streamingViewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: true,
    })
    const onStop = vi.fn()
    const { root: withStop } = await mountComposer({ viewState: streamingViewState, onSend: vi.fn(), onStop })
    withStop.querySelector<HTMLButtonElement>('.stopbtn')!.click()
    expect(onStop).toHaveBeenCalledTimes(1)

    const { root: withoutStop } = await mountComposer({ viewState: idleViewState, onSend: vi.fn(), onStop: vi.fn() })
    expect(withoutStop.querySelector('.stopbtn')).toBeNull()
  })

  it('el botón adjuntar está siempre disabled con tooltip "Próximamente" (subida real es Plan 4)', async () => {
    const { root } = await mountComposer({ viewState: idleViewState, onSend: vi.fn(), onStop: vi.fn() })
    const attach = root.querySelector<HTMLButtonElement>('[aria-label="Adjuntar archivo"]')!
    expect(attach.disabled).toBe(true)
    expect(attach.title).toBe('Próximamente')
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Composer.test.tsx`
Expected: FAIL — `Failed to resolve import "../Composer"`

- [ ] **Step 3: implementar Composer.tsx**

Crear `packages/widget/src/panel/Composer.tsx`:

```tsx
import { useState } from 'preact/hooks'
import type { PanelViewState } from './view-state'

export interface ComposerProps {
  viewState: PanelViewState
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({ viewState, onSend, onStop }: ComposerProps) {
  const [draft, setDraft] = useState('')

  const trySend = (): void => {
    const text = draft.trim()
    if (text.length === 0 || viewState.composerDisabled) return
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault()
      trySend()
    }
  }

  const sendDisabled = draft.trim().length === 0 || viewState.composerDisabled

  return (
    <div class="composer">
      {viewState.showStopButton && (
        <button class="stopbtn" onClick={onStop}>
          <i aria-hidden="true" /> Detener respuesta
        </button>
      )}
      <div class="c-row">
        {/* Sin autofocus a propósito (Global Constraints) — este textarea
            nunca recibe foco por código, solo por interacción real del
            usuario. El focus-trap del panel (Task 4) decide su propia
            política de foco inicial en Task 13, ajena a este componente. */}
        <textarea
          rows={1}
          value={draft}
          placeholder={viewState.composerPlaceholder}
          aria-label="Escribe tu mensaje"
          disabled={viewState.composerDisabled}
          onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          onKeyDown={onKeyDown}
        />
        <button class="iconbtn" aria-label="Adjuntar archivo" title="Próximamente" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.5l-8.5 8.5a6 6 0 0 1-8.5-8.5L12.5 4a4 4 0 0 1 5.7 5.7L9.7 18.2a2 2 0 0 1-2.9-2.9l8-8" />
          </svg>
        </button>
        <button class="send" aria-label="Enviar" disabled={sendDisabled} onClick={trySend}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 12l16-7-4.5 14L11 13z" /><path d="M20 5L11 13" />
          </svg>
        </button>
      </div>
      <div class="powered">Con la tecnología de <b>Nevent</b></div>
    </div>
  )
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Composer.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: añadir las reglas del composer a panel.css**

Añadir al final de `packages/widget/src/panel/panel.css`:

```css
/* ===== Composer ===== */
.composer { flex-shrink: 0; padding: 10px 12px 8px; border-top: 1px solid var(--line); background: var(--surface); }
.c-row { display: flex; align-items: flex-end; gap: 6px; background: var(--surface-2); border: 1.5px solid transparent; border-radius: 14px; padding: 6px 6px 6px 14px; transition: border-color .15s; }
.c-row:focus-within { border-color: var(--brand-a); background: var(--surface); }
.c-row textarea { flex: 1; border: none; background: transparent; resize: none; font: 400 13.8px/1.45 var(--font-body); color: var(--ink); outline: none; max-height: 96px; padding: 6px 0; }
.c-row textarea::placeholder { color: var(--faint); }
.c-row textarea:disabled { opacity: .6; }
.send { width: 34px; height: 34px; border-radius: 11px; border: none; background: var(--brand-grad); color: var(--brand-ink); cursor: pointer; display: grid; place-items: center; flex-shrink: 0; }
.send svg { width: 16px; height: 16px; }
.send:disabled { background: var(--surface-3); color: var(--faint); cursor: default; }
.iconbtn:disabled { opacity: .45; cursor: default; }
.stopbtn { display: flex; align-items: center; gap: 6px; margin: 0 auto 8px; font: 500 12px var(--font-body); color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-radius: 99px; padding: 6px 14px; cursor: pointer; }
.stopbtn:hover { border-color: var(--danger); color: var(--danger); }
.stopbtn i { width: 8px; height: 8px; background: currentColor; border-radius: 2px; display: block; }
.powered { text-align: center; font-size: 10.5px; color: var(--faint); padding: 5px 0 3px; }
.powered b { font-weight: 600; color: var(--muted); }
```

- [ ] **Step 6: commit**

```bash
git add packages/widget/src/panel/Composer.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/Composer.test.tsx
git commit -m "feat(widget): composer (envío Enter/Shift+Enter, detener respuesta, adjuntar deshabilitado)"
```

---

### Task 10: Visuales de handoff y banners de conexión (`handoff.tsx`, `ConnectionBanner.tsx`)

**Files:**
- Create: `packages/widget/src/panel/handoff.tsx`
- Create: `packages/widget/src/panel/ConnectionBanner.tsx`
- Modify: `packages/widget/src/panel/panel.css` (reglas `.sysline`/`.syscard`/`.feedback`/`.dots`/`.conn`)
- Create: `packages/widget/src/panel/__tests__/handoff.test.tsx`
- Create: `packages/widget/src/panel/__tests__/ConnectionBanner.test.tsx`

**Interfaces:**
- Consumes: `AgentInitialsAvatar` de `./icons` (Task 1), `ConnectionBanner` (tipo) de `./view-state` (Task 5).
- Produces: `WaitingCard`, `AgentJoinedSysline`, `TypingDots`, `ResolvedCard`, `ConnectionBanner` (componente). `WaitingCard`/`TypingDots`/`ResolvedCard`/`ConnectionBanner` los consume `Panel` (Task 13) vía el slot `trailing` de `MessageList` (Task 8), decididos por `viewState.conversationPhase` (Critical #1) — nunca por `ribbon`. **`AgentJoinedSysline` NO se monta en el `Panel` integrado** (rev.3, gap #4 revertido al fallback — ver cabecera de Task 8): la presencia del agente se comunica solo con el cambio de cabecera. `AgentJoinedSysline` sigue existiendo y se testea aquí como componente aislado porque el harness de fixtures (Task 16) SÍ lo monta, para paridad visual con el mock — documentado ahí como pendiente de un timeline real en el store (trabajo futuro).

- [ ] **Step 1: escribir los tests de handoff.tsx (fallan primero)**

Crear `packages/widget/src/panel/__tests__/handoff.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { WaitingCard, AgentJoinedSysline, TypingDots, ResolvedCard } from '../handoff'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('WaitingCard', () => {
  it('sin props (gap #1: sin nombre de tenant) — no inventa una cifra de ETA (gap #2) ni un nombre', async () => {
    const root = await mount(<WaitingCard />)
    expect(root.textContent).not.toMatch(/\d+\s*min/)
    expect(root.querySelector('.ttl')?.textContent).toBe('Te pasamos con el equipo')
  })
})

describe('AgentJoinedSysline', () => {
  it('usa el avatar de iniciales, nunca <img> (spec §8)', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })
  it('el texto incluye el nombre del agente', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" />)
    expect(root.textContent).toContain('Laura')
    expect(root.textContent).toContain('se ha unido')
  })
})

describe('TypingDots', () => {
  it('expone una alternativa textual para lectores de pantalla (role=status)', async () => {
    const root = await mount(<TypingDots />)
    const status = root.querySelector('[role=status]')
    expect(status?.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('ResolvedCard', () => {
  it('Important #8 gap#5 — sin onFeedback (panel integrado, Task 13): NO renderiza los botones de feedback (nunca finge un éxito local)', async () => {
    const root: HTMLElement = await mount(<ResolvedCard agentName="Laura" /> as VNode)
    expect(root.querySelector('.feedback')).toBeNull()
    expect(root.querySelector('.ttl')?.textContent).toBe('Conversación resuelta')
  })
  it('con onFeedback (solo el harness de fixtures, Task 16): los botones llaman a onFeedback con up/down y marcan aria-pressed', async () => {
    const onFeedback = vi.fn()
    const root = await mount(<ResolvedCard agentName="Laura" onFeedback={onFeedback} />)
    const up = root.querySelector<HTMLButtonElement>('[aria-label="Valorar positivamente"]')!
    up.click()
    expect(onFeedback).toHaveBeenCalledWith('up')
    expect(up.getAttribute('aria-pressed')).toBe('true')
  })
  it('sin agentName (edge: resuelto sin handoff), no rompe y no muestra "undefined"', async () => {
    const root = await mount(<ResolvedCard agentName={null} />)
    expect(root.textContent).not.toContain('undefined')
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/handoff.test.tsx`
Expected: FAIL — `Failed to resolve import "../handoff"`

- [ ] **Step 3: implementar handoff.tsx**

Crear `packages/widget/src/panel/handoff.tsx`:

```tsx
import { useState } from 'preact/hooks'
import { AgentInitialsAvatar } from './icons'

// Sin props: ni cifra de ETA (gap #2) ni nombre de tenant (gap #1) — el
// contrato actual no trae ninguno de los dos y nunca se fabrican.
export function WaitingCard() {
  return (
    <div class="syscard waiting" role="status">
      <div class="ttl">Te pasamos con el equipo</div>
      <div class="dsc">El equipo te atenderá en breve. Puedes seguir escribiendo mientras tanto.</div>
    </div>
  )
}

export interface AgentJoinedSyslineProps {
  agentName: string
}

export function AgentJoinedSysline({ agentName }: AgentJoinedSyslineProps) {
  return (
    <div class="sysline">
      <span class="who">
        <AgentInitialsAvatar name={agentName} />
        <span><b>{agentName}</b> se ha unido</span>
      </span>
    </div>
  )
}

export function TypingDots() {
  return (
    <div class="dots" role="status" aria-label="El agente está escribiendo">
      <span class="dot" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
    </div>
  )
}

export interface ResolvedCardProps {
  agentName: string | null
  // Opcional A PROPÓSITO (gap #5): el panel INTEGRADO (Task 13) no lo pasa —
  // sin transport.feedback() real, mostrar botones que "funcionan" sería
  // fingir un éxito que no persiste en ningún sitio. Solo el harness de
  // fixtures (Task 16) lo pasa, para demostrar la interacción visual.
  onFeedback?: (value: 'up' | 'down') => void
}

export function ResolvedCard({ agentName, onFeedback }: ResolvedCardProps) {
  const [selected, setSelected] = useState<'up' | 'down' | null>(null)
  const handle = (value: 'up' | 'down'): void => {
    if (!onFeedback) return
    setSelected(value)
    onFeedback(value)
  }
  return (
    <div class="syscard resolved" role="status">
      <div class="ttl">Conversación resuelta</div>
      <div class="dsc">
        {agentName !== null ? `${agentName} resolvió tu consulta.` : 'Tu consulta ha sido resuelta.'} Si necesitas algo más, escribe y volvemos al momento.
      </div>
      {onFeedback && (
        <div class="feedback">
          <button aria-label="Valorar positivamente" aria-pressed={selected === 'up'} onClick={() => handle('up')}>👍</button>
          <button aria-label="Valorar negativamente" aria-pressed={selected === 'down'} onClick={() => handle('down')}>👎</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/handoff.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: escribir el test de ConnectionBanner (falla primero)**

Crear `packages/widget/src/panel/__tests__/ConnectionBanner.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { ConnectionBanner } from '../ConnectionBanner'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('ConnectionBanner', () => {
  it('kind null: no renderiza nada', async () => {
    const root = await mount(<ConnectionBanner kind={null} />)
    expect(root.querySelector('.conn')).toBeNull()
  })
  it('kind reconnect: banner con role=status, sin cuenta atrás inventada (gap #3)', async () => {
    const root = await mount(<ConnectionBanner kind="reconnect" />)
    const conn = root.querySelector('.conn.reconnect')
    expect(conn?.getAttribute('role')).toBe('status')
    expect(conn?.textContent).not.toMatch(/\d+\s*s/)
  })
  it('kind offline: banner distinto, sin animación de spin', async () => {
    const root = await mount(<ConnectionBanner kind="offline" />)
    expect(root.querySelector('.conn.offline')).not.toBeNull()
    expect(root.querySelector('.conn.offline .spin')).toBeNull()
  })
})
```

- [ ] **Step 6: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/ConnectionBanner.test.tsx`
Expected: FAIL — `Failed to resolve import "../ConnectionBanner"`

- [ ] **Step 7: implementar ConnectionBanner.tsx**

Crear `packages/widget/src/panel/ConnectionBanner.tsx`:

```tsx
import type { ConnectionBanner as ConnectionBannerKind } from './view-state'

export interface ConnectionBannerProps {
  kind: ConnectionBannerKind
}

export function ConnectionBanner({ kind }: ConnectionBannerProps) {
  if (kind === null) return null
  return kind === 'reconnect' ? (
    <div class="conn reconnect" role="status"><span class="spin" aria-hidden="true" /> Reconectando…</div>
  ) : (
    <div class="conn offline" role="status">Sin conexión. Reintentando…</div>
  )
}
```

- [ ] **Step 8: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/ConnectionBanner.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: añadir las reglas de handoff/conexión a panel.css**

Añadir al final de `packages/widget/src/panel/panel.css`:

```css
/* ===== Divider y tarjetas de sistema (handoff) ===== */
.sysline { display: flex; align-items: center; gap: 10px; margin: 16px 0 10px; }
.sysline::before, .sysline::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.sysline .who { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--muted); }
.sysline .who .initials-avatar { width: 22px; height: 22px; font-size: 10px; }
.sysline .who b { color: var(--ink); font-weight: 600; }
.syscard { align-self: center; text-align: center; max-width: 270px; border-radius: 14px; padding: 14px 18px; margin: 10px auto; }
.syscard.waiting { background: var(--wait-soft); }
.syscard.waiting .ttl { color: var(--wait); }
.syscard.resolved { background: var(--surface-2); }
.syscard .ttl { font: 600 13px var(--font-display); color: var(--ink); }
.syscard .dsc { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
.feedback { display: flex; gap: 8px; justify-content: center; margin-top: 11px; }
.feedback button { width: 38px; height: 34px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-size: 15px; }
.feedback button:hover { border-color: var(--brand-a); background: var(--brand-soft); }
.feedback button[aria-pressed="true"] { border-color: var(--brand-a); background: var(--brand-soft); }

.dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); animation: hop 1.2s ease-in-out infinite; }
.dot:nth-child(2) { animation-delay: .15s; }
.dot:nth-child(3) { animation-delay: .3s; }
@keyframes hop { 30% { transform: translateY(-4px); opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .dot { animation: none !important; } }

/* ===== Banners de conexión ===== */
.conn { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; padding: 7px; flex-shrink: 0; }
.conn.reconnect { background: var(--wait-soft); color: var(--wait); }
.conn.offline { background: var(--surface-3); color: var(--muted); }
.conn .spin { width: 12px; height: 12px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .conn .spin { animation: none !important; } }
```

- [ ] **Step 10: commit**

```bash
git add packages/widget/src/panel/handoff.tsx packages/widget/src/panel/ConnectionBanner.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/handoff.test.tsx packages/widget/src/panel/__tests__/ConnectionBanner.test.tsx
git commit -m "feat(widget): tarjetas de handoff con avatar de iniciales y sin feedback fingido en el panel integrado (fix gap #1/#5)"
```

---

### Task 11: Rich content presentacional (`CardCarousel.tsx`, `FileBubble.tsx`)

**Files:**
- Create: `packages/widget/src/panel/CardCarousel.tsx`
- Create: `packages/widget/src/panel/FileBubble.tsx`
- Modify: `packages/widget/src/panel/panel.css` (reglas `.cards`/`.card`/`.file`)
- Create: `packages/widget/src/panel/__tests__/CardCarousel.test.tsx`
- Create: `packages/widget/src/panel/__tests__/FileBubble.test.tsx`

**Interfaces:**
- Consumes: `isSafeHttpsUrl` de `./theme` (Task 2).
- Produces: `CardAction`, `CardItem`, `CardCarouselProps`, `CardCarousel(props)`, `FileBubbleProps`, `FileBubble(props)` — **presentacionales únicamente**: `StoredMessage` no trae un campo de rich content todavía; Task 16 (harness de fixtures) los monta con datos fijos. El schema completo de rich content es Plan 4.

- [ ] **Step 1: escribir los tests de CardCarousel (fallan primero)**

Crear `packages/widget/src/panel/__tests__/CardCarousel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CardCarousel, type CardItem } from '../CardCarousel'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

const items: CardItem[] = [
  { id: '1', title: 'Abono 3 días', description: 'Acceso general · vie–dom', priceLabel: '89 €', imageVariant: 'brand', action: { kind: 'send_message', label: 'Ver abono', text: 'Quiero el abono 3 días' } },
  { id: '2', title: 'Abono VIP', description: 'Front stage + zona lounge', priceLabel: '149 €', imageVariant: 'sun', action: { kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' } },
]

describe('CardCarousel', () => {
  it('renderiza una card por item, con precio y acción como <button> real (no span, a diferencia del mock)', async () => {
    const root = await mount(<CardCarousel items={items} onAction={vi.fn()} />)
    const cards = root.querySelectorAll('.card')
    expect(cards.length).toBe(2)
    expect(cards[0]?.querySelector('.price')?.textContent).toBe('89 €')
    expect(cards[0]?.querySelector('.act')?.tagName).toBe('BUTTON')
  })

  it('acción send_message: onAction recibe la acción completa', async () => {
    const onAction = vi.fn()
    const root = await mount(<CardCarousel items={items} onAction={onAction} />)
    root.querySelectorAll<HTMLButtonElement>('.act')[0]!.click()
    expect(onAction).toHaveBeenCalledWith({ kind: 'send_message', label: 'Ver abono', text: 'Quiero el abono 3 días' })
  })

  it('acción open_https_url con URL https válida: onAction se llama', async () => {
    const onAction = vi.fn()
    const root = await mount(<CardCarousel items={items} onAction={onAction} />)
    root.querySelectorAll<HTMLButtonElement>('.act')[1]!.click()
    expect(onAction).toHaveBeenCalledWith({ kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' })
  })

  it('acción open_https_url con protocolo hostil: onAction NUNCA se llama (spec §8)', async () => {
    const onAction = vi.fn()
    const hostile: CardItem[] = [{ id: '3', title: 'x', description: 'x', priceLabel: null, imageVariant: 'brand', action: { kind: 'open_https_url', label: 'Ir', url: 'javascript:alert(1)' } }]
    const root = await mount(<CardCarousel items={hostile} onAction={onAction} />)
    root.querySelector<HTMLButtonElement>('.act')!.click()
    expect(onAction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/CardCarousel.test.tsx`
Expected: FAIL — `Failed to resolve import "../CardCarousel"`

- [ ] **Step 3: implementar CardCarousel.tsx**

Crear `packages/widget/src/panel/CardCarousel.tsx`:

```tsx
import { isSafeHttpsUrl } from './theme'

export type CardAction =
  | { kind: 'send_message'; label: string; text: string }
  | { kind: 'open_https_url'; label: string; url: string }

export interface CardItem {
  id: string
  title: string
  description: string
  priceLabel: string | null
  imageVariant: 'brand' | 'sun'
  action: CardAction
}

export interface CardCarouselProps {
  items: CardItem[]
  onAction: (action: CardAction) => void
}

export function CardCarousel({ items, onAction }: CardCarouselProps) {
  const handle = (action: CardAction): void => {
    if (action.kind === 'open_https_url' && !isSafeHttpsUrl(action.url)) return
    onAction(action)
  }
  return (
    <div class="cards">
      {items.map((item) => (
        <div class="card" key={item.id}>
          <div class={`img${item.imageVariant === 'sun' ? ' sun' : ''}`}>
            {item.priceLabel !== null && <span class="price">{item.priceLabel}</span>}
          </div>
          <div class="bd">
            <div class="t">{item.title}</div>
            <div class="d">{item.description}</div>
            {/* <button>, no el <span class="act"> del mock — sin teclado
                accesible en origen (spec §6: navegable 100% por teclado). */}
            <button class="act" onClick={() => handle(item.action)}>{item.action.label}</button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/CardCarousel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: escribir el test de FileBubble (falla primero)**

Crítico #4 de la revisión: sin atributos `style=""` (problemáticos bajo una CSP sin `style-src-attr 'unsafe-inline'`, ver Task 15) — la barra de progreso se pinta con una custom property fijada vía `setProperty`, consumida por una regla CSS `width: var(--progress, 0%)`.

Crear `packages/widget/src/panel/__tests__/FileBubble.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { FileBubble } from '../FileBubble'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('FileBubble', () => {
  it('con progressPercent: fija --progress vía setProperty, nunca un atributo style="width:..."', async () => {
    const root = await mount(<FileBubble fileName="entrada.pdf" fileSizeLabel="184 KB · subiendo…" progressPercent={64} variant="user" />)
    expect(root.querySelector('.fn')?.textContent).toBe('entrada.pdf')
    const bar = root.querySelector<HTMLElement>('.bar i')
    expect(bar?.style.getPropertyValue('--progress')).toBe('64%')
    expect(bar?.getAttribute('style')).not.toContain('width')
  })

  it('progressPercent null (ya enviado): no muestra barra', async () => {
    const root = await mount(<FileBubble fileName="entrada.pdf" fileSizeLabel="184 KB" progressPercent={null} variant="bot" />)
    expect(root.querySelector('.bar')).toBeNull()
  })

  it('recorta un progressPercent fuera de rango a [0,100]', async () => {
    const root = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={140} variant="user" />)
    expect(root.querySelector<HTMLElement>('.bar i')?.style.getPropertyValue('--progress')).toBe('100%')
  })

  it('ningún nodo del componente lleva el atributo style (Critical #4: CSP sin style-src-attr unsafe-inline)', async () => {
    const root = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={50} variant="user" />)
    const withStyleAttr = Array.from(root.querySelectorAll('*')).filter((el) => el.hasAttribute('style') && el.getAttribute('style') !== '')
    // El único nodo con `style` es el propio `<i>` de la barra, y solo porque
    // setProperty lo escribe vía CSSOM (permitido, ver Task 2/theme.ts) —
    // nunca un `style="width:64%"` de cadena interpolada por JSX.
    expect(withStyleAttr.length).toBeLessThanOrEqual(1)
  })

  it('Important #8 (ronda 2) — variant realmente cambia la clase raíz: "user" pinta sobre el degradado de marca, "bot" no', async () => {
    const user = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={null} variant="user" />)
    expect(user.querySelector('.file')?.classList.contains('file-user')).toBe(true)
    const bot = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={null} variant="bot" />)
    expect(bot.querySelector('.file')?.classList.contains('file-user')).toBe(false)
  })
})
```

- [ ] **Step 6: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/FileBubble.test.tsx`
Expected: FAIL — `Failed to resolve import "../FileBubble"`

- [ ] **Step 7: implementar FileBubble.tsx**

Important #8 (ronda 2): en rev.2, `variant` se declaraba en `FileBubbleProps` pero se desestructuraba fuera del cuerpo del componente sin usarse en ningún sitio — el mock lo resolvía con un selector `.m.user .file` (dependiente del padre), pero `FileBubble` no vive anidado dentro de un `.m.user` real en este plan (es presentacional, se monta suelto) — así que ese selector era CSS muerto. Se corrige aplicando una clase propia (`file-user`) directamente sobre la raíz del componente.

Crear `packages/widget/src/panel/FileBubble.tsx`:

```tsx
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
```

- [ ] **Step 8: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/FileBubble.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 9: añadir las reglas de cards/file a panel.css (colores tokenizados, Important #10 — sin hex hardcodeado fuera del token set)**

Añadir al final de `packages/widget/src/panel/panel.css`:

```css
/* ===== Rich content: carrusel de cards ===== */
.cards { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 6px; scroll-snap-type: x mandatory; max-width: 100%; scrollbar-width: none; }
.cards::-webkit-scrollbar { display: none; }
.card { scroll-snap-align: start; flex: 0 0 200px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--surface); }
.card .img { height: 78px; background: var(--brand-grad); position: relative; }
.card .img.sun { background: linear-gradient(135deg, var(--accent-sun-a), var(--accent-sun-b)); }
.card .img .price { position: absolute; right: 8px; bottom: 8px; background: rgba(12, 13, 16, .75); color: #fff; font: 600 11.5px var(--font-body); padding: 3px 8px; border-radius: 99px; }
.card .bd { padding: 10px 12px 12px; }
.card .bd .t { font: 600 13px var(--font-display); color: var(--ink); }
.card .bd .d { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.card .bd .act {
  margin-top: 9px; display: block; width: 100%; text-align: center; font: 600 12px var(--font-body);
  color: var(--brand-a); background: transparent; border: 1px solid color-mix(in srgb, var(--brand-a) 35%, transparent);
  border-radius: 8px; padding: 6px 0; cursor: pointer;
}
.card .bd .act:hover { background: var(--brand-soft); }
.card .bd .act:focus-visible { outline: 2px solid var(--brand-a); outline-offset: 2px; }

/* ===== Adjuntos / upload =====
   Variante por CLASE PROPIA (`.file-user`, fijada por el componente vía la
   prop `variant`) — no por selector dependiente de un padre `.m.user` (el
   mock lo hacía así, pero FileBubble no vive anidado en una burbuja real en
   este plan; era CSS muerto — Important #8, ronda 2). */
.file { display: flex; align-items: center; gap: 9px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 11px; padding: 9px 11px; min-width: 210px; }
.file-meta { flex: 1; }
.file-user { background: color-mix(in srgb, #fff 14%, var(--brand-a)); border-color: transparent; color: var(--brand-ink); }
.file .fi { width: 32px; height: 32px; border-radius: 8px; background: var(--brand-soft); color: var(--brand-a); display: grid; place-items: center; flex-shrink: 0; }
.file-user .fi { background: rgba(255, 255, 255, .2); color: #fff; }
.file .fi svg { width: 15px; height: 15px; }
.file .fn { font: 500 12.5px var(--font-body); color: inherit; }
.file .fs { font-size: 11px; opacity: .72; margin-top: 1px; font-variant-numeric: tabular-nums; }
.file .bar { height: 3px; border-radius: 2px; background: rgba(255, 255, 255, .28); margin-top: 5px; overflow: hidden; }
.file .bar i { display: block; height: 100%; width: var(--progress, 0%); background: #fff; border-radius: 2px; transition: width .2s; }
```

- [ ] **Step 10: commit**

```bash
git add packages/widget/src/panel/CardCarousel.tsx packages/widget/src/panel/FileBubble.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/CardCarousel.test.tsx packages/widget/src/panel/__tests__/FileBubble.test.tsx
git commit -m "feat(widget): rich content presentacional sin atributos style ni colores fuera del token set (fix Critical #4/Important #10)"
```

---

### Task 12: Rediseño del protocolo de resize/anclaje del loader — detección móvil en el host, sin `cssText`, tamaños por modo (`loader/index.ts`)

**rev.3 — la ronda 2 encontró que rev.2 no cerraba ninguno de los tres Critical que decía cerrar.** Tres bugs reales, independientes entre sí:

1. **El bucle 104×104 en desktop (Critical, el más profundo).** `Panel.isMobileViewport()` (rev.2) y las media queries de layout evaluaban `(max-width: 480px)` contra el viewport del PROPIO IFRAME, no contra el host. Nada más arrancar, el iframe mide 104px (el launcher); el panel completo en desktop mide 430px — AMBOS satisfacen `(max-width: 480px)`. Secuencia real: el loader deja el contenedor en 104×104 → el shell se autoconsidera móvil → `.panel{width:100vw}` da 104px (el 100% del iframe, que sigue en 104px) → `useResizeReport` vuelve a informar 104×104 → bucle cerrado sobre el valor equivocado. Esto también rompía Important #5: el panel se autoconsideraba móvil en desktop y nunca recibía autofocus. **Solución: la detección de "¿es móvil?" se mueve ENTERAMENTE al lado del host — el loader ya tiene un listener de `matchMedia` real (rev.2, sigue aquí) — y se comunica al shell vía un mensaje `viewport` nuevo del protocolo. El shell NUNCA vuelve a evaluar `matchMedia` de ancho contra su propio iframe.**
2. **`lastSize` mezclaba launcher y panel.** Tras un `resize{430,688}` con el panel abierto, `lastSize` quedaba en 430×688; al recibir `closed`, `applySizing()` reutilizaba ESE mismo valor — el launcher quedaba en 430×688 en vez de 104×104, contradiciendo el propio test de cierre de rev.2. **Solución: `launcherSize` es "el último resize recibido mientras el modo era launcher"; `panelSize` es "el último resize recibido mientras el modo era panel" — cada uno vive en su propia clave y ninguno se lee desde el modo del otro.**
3. **`style.cssText` es incompatible con hosts de CSP estricta.** La CSP de `shell.html` no gobierna el DOM del HOST — ahí el loader fijaba toda la geometría con `container.style.cssText = "..."`/`iframe.style.cssText = "..."`. Una política del host con `style-src-attr 'none'` bloquea específicamente `cssText` (se interpreta como fijar el atributo `style` completo desde una cadena) pero permite la asignación de propiedades CSSOM individuales — [MDN documenta la diferencia explícitamente](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr). **Solución: `setBoxStyle()` asigna cada propiedad por separado, nunca `cssText`, resetando primero para no dejar geometría de un modo anterior a medio pisar.**

**rev.4 — la ronda 3 encontró que los tres bugs de rev.3 seguían sin cerrarse en la práctica, más dos nuevos en el mismo módulo:**

4. **`opened`/`resize` seguían formando una máquina de estados dependiente del ORDEN de llegada.** `Panel` reporta su tamaño desde un efecto HIJO (`useResizeReport`, Task 13) mientras `App` emite `opened` desde un efecto PADRE (Task 17); con el orden real de efectos de Preact, el `resize` hijo puede llegar ANTES que `opened`. rev.3 ignoraba ese `resize` (mode seguía siendo `launcher`) y luego procesaba `opened` con `panelSize === null`, aplicando 104×104 — un salto visible que un `ResizeObserver` posterior corregía, pero solo después de ser visible. Los tests de rev.3 forzaban siempre el orden `opened → resize` y nunca probaban el real. **Solución: `DEFAULT_PANEL_SIZE` (430×688, el tamaño desktop típico) sustituye a `LAUNCHER_SIZE` como fallback de `opened` — ya no hay ningún camino que aplique 104×104 al abrir el panel, exista o no ya un `desktopPanelSize` medido. Además, cualquier `resize` en modo panel sobrescribía `panelSize` SIN mirar de qué viewport venía — abrir el teclado, rotar o cruzar a móvil con el panel abierto contaminaba el tamaño desktop con dimensiones fullscreen. El payload de `resize` gana un campo `viewportKind` (lo rellena el shell con su propio estado ya latcheado, Task 17) y el loader solo promociona a `desktopPanelSize` un resize que llega `mode==='panel' && viewportKind==='desktop'`.**
5. **`VisualViewport` incompleto: solo se transmitía `height`.** El loader escuchaba únicamente `resize` de `w.visualViewport` y el contenedor fullscreen móvil quedaba fijo en `inset:0` (el viewport de LAYOUT completo) — el teclado en iOS puede reducir Y desplazar lo realmente visible (`offsetTop`) sin mover el layout viewport, así que un `inset:0` estático puede dejar el panel tapado por el teclado o desplazado fuera de la zona visible. Tampoco se escuchaba el evento `scroll` de `visualViewport`, que es como WebKit reporta un desplazamiento sin cambio de tamaño (ver [`VisualViewport`](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport); WebKit documenta además actualizaciones tardías de estos valores durante la animación del teclado, [WebKit #265578](https://bugs.webkit.org/show_bug.cgi?id=265578)). Relacionado: el launcher móvil (56px + 16px de aire por lado + `env(safe-area-inset-bottom)`, panel.css Task 14) puede medir más de 104px de alto en un dispositivo con home indicator, pero el contenedor quedaba fijo en el `LAUNCHER_SIZE` constante — el launcher podía desbordar o recortar esa reserva inferior. **Solución: el contenedor fullscreen móvil usa la caja REAL de `w.visualViewport` (`offsetTop`/`offsetLeft`/`width`/`height`), recalculada tanto en `resize` como en `scroll`; y el launcher deja de ser un tamaño fijo — `launcherSize` trackea el último resize real reportado en modo launcher, con `LAUNCHER_SIZE` (104×104) solo como valor inicial antes de la primera medición.**

También arreglado en esta revisión (mecánico, no arquitectónico): el test de `cssText` (Step 3 más abajo) espiaba una COPIA del descriptor del setter en vez del setter real instalado en `CSSStyleDeclaration.prototype` — pasaba aunque producción volviera a usar `cssText`. Corregido con la forma de 3 argumentos de `vi.spyOn`.

**Decisión de diseño explícita — `offsetTop`/`offsetLeft`/`width` de `VisualViewport` NUNCA cruzan al protocolo `viewport` hacia el shell.** Se consumen enteramente aquí, en el loader, para posicionar el CONTENEDOR (DOM del host). Una vez que el contenedor coincide exactamente con la caja visible real, el iframe (100%/100% de ese contenedor) y el layout flex de `.panel` (columna, con el composer al final) quedan por encima del teclado sin que el shell necesite saber nada de `offsetTop` — reenviarlo de todos modos sin ningún consumidor real dentro del iframe sería exactamente el tipo de dato "decorativo" que la ronda 3 señaló en otros puntos de este mismo plan (`agentJoinedAtSeq`, contraste). Solo `height` sigue viajando en el mensaje `viewport` (payload sin cambio de forma), porque `useViewportHeight` (Task 14) sí lo consume de verdad para `--viewport-h`.

**Files:**
- Modify: `packages/widget/src/protocol/envelope.ts` (aditivo: `'viewport'` en `LOADER_TO_SHELL`)
- Modify: `packages/widget/src/loader/index.ts`
- Modify: `packages/widget/src/loader/__tests__/loader.test.ts`

**Interfaces:**
- Consumes: el protocolo `resize`/`opened`/`closed` ya existente en `SHELL_TO_LOADER` (sin cambios de forma en el envelope — el payload de `resize` gana los campos opcionales `position` y `viewportKind: 'mobile' | 'desktop'`, este último rellenado por `App`, Task 17, con su propio viewport ya latcheado).
- Produces: `LOADER_TO_SHELL` con `'viewport'` añadido — payload `{ kind: 'mobile' | 'desktop', height: number }` (sin cambio de forma respecto a rev.3), enviado al `ready`, en cada cambio de `matchMedia` y en cada `resize`/`scroll` del propio `visualViewport` del host (unificados en un mismo handler). El loader queda anclado en dos modos reales (`launcher`, tamaño trackeado por `launcherSize`; `panel`, tamaño trackeado por `desktopPanelSize` en desktop / caja real del `VisualViewport` en pantalla completa móvil) sin usar nunca `cssText`. Consumido por `App`/`Panel` (Task 17/13): `App` guarda `{kind, height}` de cada mensaje `viewport` y lo pasa a `Panel` como props — `Panel` deja de llamar a `matchMedia` en absoluto.

- [ ] **Step 1: extender el protocolo (test primero)**

Añadir a `packages/widget/src/protocol/__tests__/envelope.test.ts` (archivo existente, Plan 1 — se añade un test, no se tocan los que pasan):

```ts
  it('LOADER_TO_SHELL incluye viewport (rev.3: detección móvil la envía el loader, el shell nunca evalúa matchMedia)', () => {
    expect(LOADER_TO_SHELL).toContain('viewport')
  })
```

Run: `cd packages/widget && npx vitest run src/protocol/__tests__/envelope.test.ts`
Expected: FAIL — `viewport` no está en `LOADER_TO_SHELL`.

Editar `packages/widget/src/protocol/envelope.ts` — una línea:

```ts
export const LOADER_TO_SHELL = ['init', 'open', 'close', 'toggle', 'update', 'destroy', 'consent', 'viewport'] as const
```

Run: `cd packages/widget && npx vitest run src/protocol/__tests__/envelope.test.ts`
Expected: PASS.

- [ ] **Step 2: commit parcial del protocolo**

```bash
git add packages/widget/src/protocol/envelope.ts packages/widget/src/protocol/__tests__/envelope.test.ts
git commit -m "feat(widget): añade el mensaje viewport al protocolo loader→shell (detección móvil movida al host)"
```

- [ ] **Step 3: escribir los tests nuevos del loader (fallan primero)**

Añadir a `packages/widget/src/loader/__tests__/loader.test.ts` un helper nuevo, **por encima** del `describe('loader', ...)` existente, junto a `fakeShellMessage`/`bootedInstanceId` (los **7** tests que ya pasan — boot/ready/origin/opened-y-destroy/identify/opts/on-sin-callback — no se tocan):

```ts
// jsdom no define window.visualViewport en absoluto (a diferencia de
// matchMedia, que SÍ existe como función stub) — vi.spyOn(window,
// 'visualViewport', 'get') fallaría porque no hay ningún accessor previo que
// espiar. Se instala con Object.defineProperty, igual que ya hace este mismo
// archivo con iframe.contentWindow, y se retira con Reflect.deleteProperty.
function makeFakeVisualViewport(initial: Partial<{ offsetTop: number; offsetLeft: number; width: number; height: number }> = {}) {
  const handlers: Record<'resize' | 'scroll', Set<() => void>> = { resize: new Set(), scroll: new Set() }
  const addEventListener = vi.fn((type: string, cb: () => void) => { handlers[type as 'resize' | 'scroll']?.add(cb) })
  const removeEventListener = vi.fn((type: string, cb: () => void) => { handlers[type as 'resize' | 'scroll']?.delete(cb) })
  const vv = {
    offsetTop: initial.offsetTop ?? 0, offsetLeft: initial.offsetLeft ?? 0,
    width: initial.width ?? 400, height: initial.height ?? 800,
    addEventListener, removeEventListener,
  }
  return {
    vv: vv as unknown as VisualViewport,
    removeEventListener,
    // noUncheckedIndexedAccess (Tech Stack): handlers[type] tipa como
    // Set<...> | undefined pese a que Record garantiza la clave — el
    // optional chaining es obligatorio para compilar, no solo defensivo.
    trigger: (type: 'resize' | 'scroll') => handlers[type]?.forEach((h) => h()),
  }
}
```

Y estos tests, dentro del `describe('loader', ...)`:

```ts
  it('boot: arranca en modo launcher, anclado a la derecha, con el tamaño INICIAL por defecto del launcher (antes de cualquier medición real)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const container = document.querySelector('iframe')!.parentElement as HTMLElement
    expect(container.style.right).toBe('0px')
    expect(container.style.left).toBe('')
    expect(container.style.width).toBe('104px') // 56px launcher + 24px de aire por lado — solo el valor INICIAL, ver launcherSize más abajo
  })

  it('Critical (DEFAULT_PANEL_SIZE) — opened SIN ningún resize previo aplica el tamaño desktop por defecto (430×688), nunca 104×104 (cierra el salto visible de la ronda 3)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')
  })

  it('Critical (desktopPanelSize, orden opened→resize) — un resize del shell (desktop) tras opened redimensiona el CONTENEDOR y el iframe juntos, con números realistas incl. el padding (430×688, no 382×640)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId()) // el panel está abierto: modo panel
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')
    expect(iframe.style.width).toBe('100%') // el iframe SIEMPRE rellena al contenedor, nunca lleva su propio px
    expect(iframe.style.height).toBe('100%')
  })

  it('resize incluye position: ancla el contenedor a la izquierda si el theme lo pide', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('resize', { width: 104, height: 104, position: 'left' }, bootedInstanceId())
    expect(container.style.left).toBe('0px')
    expect(container.style.right).toBe('')
  })

  it('Critical (desktopPanelSize) — cerrar el panel (closed) vuelve SIEMPRE al tamaño del launcher, nunca al desktopPanelSize', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())
    expect(container.style.width).toBe('104px')
    expect(container.style.height).toBe('104px')
  })

  it('Critical (orden resize→opened) — un resize recibido EN MODO LAUNCHER nunca se promociona a desktopPanelSize; opened aplica DEFAULT_PANEL_SIZE, no el resize que quedó atrás', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    // resize ANTES de 'opened' (p.ej. el efecto hijo de Panel corre antes que
    // el padre de App, ronda 3): el modo sigue siendo launcher, así que se
    // guarda como launcherSize (ver test dedicado más abajo) y se aplica de
    // inmediato al contenedor.
    fakeShellMessage('resize', { width: 96, height: 96, position: 'right' }, bootedInstanceId())
    expect(container.style.width).toBe('96px')
    fakeShellMessage('opened', null, bootedInstanceId())
    // Sin un resize NUEVO recibido YA en modo panel, desktopPanelSize sigue
    // null: el bug de la ronda 3 aplicaba aquí 104×104 (un salto visible);
    // ahora aplica el tamaño desktop por defecto, nunca el resize de launcher
    // que quedó atrás.
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')
  })

  it('Critical (cruce desktop↔móvil con el panel abierto) — un resize con viewportKind:"mobile" NUNCA contamina desktopPanelSize; al volver a desktop se recupera el tamaño original', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: false, media: '(max-width: 480px)',
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    expect(container.style.width).toBe('430px') // desktopPanelSize fijado

    // Cruce a móvil A MITAD DE SESIÓN, con el panel TODAVÍA abierto: el
    // propio Panel (Task 13) reporta su tamaño fullscreen vía resize; ese
    // resize NUNCA debe sobrescribir desktopPanelSize (bug "lastSize" de la
    // ronda 2, ahora a prueba de cruces, Critical ronda 3).
    mql.matches = true
    changeHandler!()
    expect(container.style.inset).toBe('0px') // fullscreen móvil (sin VisualViewport mockeado aquí — ver el test dedicado de geometría real más abajo)
    fakeShellMessage('resize', { width: 400, height: 780, position: 'right', viewportKind: 'mobile' }, bootedInstanceId())

    // Vuelta a desktop: el panel sigue abierto, sin ningún resize desktop
    // nuevo — debe recuperar el desktopPanelSize ORIGINAL (430×688), no los
    // 400×780 móviles.
    mql.matches = false
    changeHandler!()
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')

    matchMedia.mockRestore()
  })

  it('Critical (reapertura desktop tras sesión móvil) — cerrar tras una sesión fullscreen en móvil y reabrir ya en desktop aplica DEFAULT_PANEL_SIZE, nunca la geometría fullscreen residual', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: true, media: '(max-width: 480px)', // arranca en móvil
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('opened', null, bootedInstanceId()) // fullscreen móvil, desktopPanelSize nunca se fija
    fakeShellMessage('resize', { width: 400, height: 780, position: 'right', viewportKind: 'mobile' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())

    mql.matches = false
    changeHandler!() // el host cambia a desktop con el panel YA cerrado
    fakeShellMessage('opened', null, bootedInstanceId()) // reapertura en desktop

    // desktopPanelSize nunca se fijó (la única sesión previa fue móvil): debe
    // aplicar DEFAULT_PANEL_SIZE, no los 400×780 móviles (filtrados por
    // viewportKind, nunca llegaron a guardarse ahí) ni un 104×104 residual.
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')

    matchMedia.mockRestore()
  })

  it('Critical (mobile) — en viewport móvil, boot arranca en modo launcher SIN pantalla completa (el launcher cerrado nunca secuestra la página anfitriona)', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const container = document.querySelector('iframe')!.parentElement as HTMLElement
    expect(container.style.width).toBe('104px')
    expect(container.style.inset).not.toBe('0px')
    matchMedia.mockRestore()
  })

  it('Critical (VisualViewport real) — SOLO con el panel abierto pasa a la caja REAL del VisualViewport (offsetTop/offsetLeft/width/height), nunca un inset:0 fijo al viewport de layout completo', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    // Simula el teclado abierto: el visual viewport es más bajo y está
    // desplazado hacia abajo respecto al viewport de layout.
    const { vv } = makeFakeVisualViewport({ offsetTop: 40, offsetLeft: 0, width: 390, height: 500 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })

    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('opened', null, bootedInstanceId())
    expect(container.style.inset).toBe('') // NUNCA inset:0 — cubriría el viewport de layout completo, incl. el área tapada por el teclado
    expect(container.style.top).toBe('40px')
    expect(container.style.left).toBe('0px')
    expect(container.style.width).toBe('390px')
    expect(container.style.height).toBe('500px')

    matchMedia.mockRestore()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('Critical (VisualViewport "scroll") — un evento scroll (sin cambiar height) reposiciona el contenedor mobile fullscreen, no solo "resize"', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    const { vv, trigger } = makeFakeVisualViewport({ offsetTop: 0, width: 390, height: 700 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })

    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(container.style.top).toBe('0px')

    // El teclado desplaza lo visible SIN disparar 'resize' (el layout
    // viewport no cambia, solo el scroll interno) — WebKit lo reporta vía
    // 'scroll' (https://bugs.webkit.org/show_bug.cgi?id=265578 documenta
    // además actualizaciones tardías durante la animación).
    vv.offsetTop = 120
    trigger('scroll')
    expect(container.style.top).toBe('120px')

    matchMedia.mockRestore()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('Critical (mobile) — matchMedia es un listener real: un cambio de breakpoint DESPUÉS de arrancar en desktop reacciona (no una detección de una sola vez)', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: false, media: '(max-width: 480px)',
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(container.style.inset).not.toBe('0px') // arrancó en desktop: tamaño real, no fullscreen

    mql.matches = true
    expect(changeHandler).not.toBeNull()
    changeHandler!()
    expect(container.style.inset).toBe('0px') // el listener reaccionó a mitad de sesión

    matchMedia.mockRestore()
  })

  it('destroy() limpia los listeners de matchMedia Y de visualViewport (resize + scroll)', () => {
    const removeMatchMediaListener = vi.fn()
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: removeMatchMediaListener,
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    const { vv, removeEventListener: removeVvListener } = makeFakeVisualViewport()
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })

    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('destroy')

    expect(removeMatchMediaListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(removeVvListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeVvListener).toHaveBeenCalledWith('scroll', expect.any(Function))

    matchMedia.mockRestore()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('el nuevo protocolo — envía viewport{kind,height} justo tras el init, en respuesta a ready', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    const types = post.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toEqual(['init', 'viewport'])
    const viewportCall = post.mock.calls[1]![0] as { payload: { kind: string; height: number } }
    expect(viewportCall.payload.kind).toBe('desktop')
    expect(typeof viewportCall.payload.height).toBe('number')
  })

  it('el nuevo protocolo — reenvía viewport{kind:"mobile"} cuando matchMedia cambia a mitad de sesión', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: false, media: '(max-width: 480px)',
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    post.mockClear()

    mql.matches = true
    changeHandler!()
    const types = post.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toContain('viewport')
    const last = post.mock.calls.find((c) => (c[0] as { type: string }).type === 'viewport')![0] as { payload: { kind: string } }
    expect(last.payload.kind).toBe('mobile')

    matchMedia.mockRestore()
  })

  it('Critical (launcherSize) — el launcher trackea su tamaño REAL reportado por resize en modo launcher, no un 104px fijo eterno (p.ej. 56px + margen + safe-area en móvil)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    expect(container.style.width).toBe('104px') // valor inicial por defecto, antes de cualquier medición real

    fakeShellMessage('resize', { width: 88, height: 120, position: 'right' }, bootedInstanceId())
    expect(container.style.width).toBe('88px')
    expect(container.style.height).toBe('120px')
  })

  it('Critical (launcherSize aislado) — un resize de modo panel (desktop) nunca sobrescribe launcherSize; cerrar el panel conserva el ÚLTIMO launcherSize medido, no el valor inicial de 104px', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('resize', { width: 88, height: 120, position: 'right' }, bootedInstanceId()) // launcherSize medido
    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())

    expect(container.style.width).toBe('88px') // launcherSize sobrevive, no 104px inicial ni 430px del panel
    expect(container.style.height).toBe('120px')
  })

  it('Critical (cssText) — NUNCA asigna CSSStyleDeclaration.cssText; toda la geometría se fija por propiedad individual', () => {
    // Ronda 3: espiar Object.getOwnPropertyDescriptor(...).set espía el
    // setter de una COPIA del descriptor — nunca el que de verdad está
    // instalado en el prototipo, así que el test pasaba incluso si el
    // código volviera a usar cssText (falso positivo). La forma correcta de
    // espiar un accessor de un prototipo es la forma de 3 argumentos de
    // vi.spyOn (objeto, nombre de propiedad, 'get'|'set').
    const cssTextSetter = vi.spyOn(CSSStyleDeclaration.prototype, 'cssText', 'set')
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())
    expect(cssTextSetter).not.toHaveBeenCalled()
    cssTextSetter.mockRestore()
  })
```

- [ ] **Step 4: ejecutar y confirmar que fallan**

Run: `cd packages/widget && npx vitest run src/loader/__tests__/loader.test.ts`
Expected: FAIL — los 18 tests nuevos fallan; los 7 preexistentes siguen en PASS (25 en total una vez arreglado).

- [ ] **Step 5: reescribir el módulo de sizing/anclaje/viewport en loader/index.ts**

Editar `packages/widget/src/loader/index.ts` — sustituir la interfaz `Instance`, añadir `setBoxStyle`/`applySizing`/`sendViewport`, y reescribir `boot`/`onMessage`/`destroy`. El resto del archivo (`sendToShell`, `drainQueue`/switch de métodos públicos) no cambia.

```ts
import { installGlobalStub, drainQueue, type ApiStub } from './api-queue'
import { seal, open as openEnvelope, isCommand, SHELL_TO_LOADER } from '../protocol/envelope'

interface LoaderOptions { shellUrl: string }

// Valores INICIALES por defecto, antes de la primera medición real — nunca
// constantes inmutables (fix ronda 4: rev.3 fijaba LAUNCHER_SIZE para
// siempre, lo que dejaba el launcher desalineado en móviles con
// safe-area-inset-bottom, cuya caja real supera 104px). DEFAULT_PANEL_SIZE
// evita el salto visible a 104×104 al abrir el panel antes de que llegue el
// primer resize real (Critical ronda 3, "opened"/"resize" dependiente del
// orden de llegada) — 430×688 es el tamaño desktop típico del propio panel
// (panel.css, Task 13).
const LAUNCHER_SIZE = { width: 104, height: 104 }
const DEFAULT_PANEL_SIZE = { width: 430, height: 688 }
const MOBILE_QUERY = '(max-width: 480px)'

interface Instance {
  instanceId: string
  installationId: string
  opts: unknown
  container: HTMLElement
  iframe: HTMLIFrameElement
  shellOrigin: string
  listeners: Map<string, Set<(payload: unknown) => void>>
  onMessage: (ev: MessageEvent) => void
  mode: 'launcher' | 'panel'
  isMobile: boolean
  position: 'left' | 'right'
  desktopPanelSize: { width: number; height: number } | null
  launcherSize: { width: number; height: number } | null
  mobileQuery: MediaQueryList
  onMobileChange: () => void
  onVisualViewportChange: (() => void) | null
}

const RESET_STYLE: Record<string, string> = {
  position: '', zIndex: '', inset: '', top: '', right: '', bottom: '', left: '', width: '', height: '',
}

// Asigna geometría PROPIEDAD A PROPIEDAD — nunca `cssText`. Un host con CSP
// `style-src-attr 'none'` bloquea `element.style.cssText = "..."` (se trata
// como fijar el atributo `style` completo desde una cadena) pero SÍ permite
// la asignación de propiedades CSSOM individuales (`el.style.position = ...`),
// igual que `CSSStyleDeclaration.setProperty` en theme.ts (spec §7). Ver
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr
// Siempre se resetea primero para no dejar una propiedad de un modo anterior
// (p.ej. `inset:0` de pantalla completa) a medio pisar tras un cambio de modo.
function setBoxStyle(el: HTMLElement, style: Record<string, string>): void {
  for (const [prop, value] of Object.entries(RESET_STYLE)) (el.style as unknown as Record<string, string>)[prop] = value
  for (const [prop, value] of Object.entries(style)) (el.style as unknown as Record<string, string>)[prop] = value
}

export function bootLoader(w: Window, opts: LoaderOptions): void {
  const stub = installGlobalStub(w as Window & { NeventWidget?: ApiStub })
  let instance: Instance | null = null

  const sendToShell = (type: string, payload: unknown): void => {
    if (!instance) return
    instance.iframe.contentWindow?.postMessage(seal(type, payload, instance.instanceId), instance.shellOrigin)
  }

  // Pantalla completa SOLO con mode==='panel' && isMobile — el launcher
  // cerrado en móvil NUNCA ocupa toda la página (bug "104×104 en bucle" de
  // la ronda 2, cerrado moviendo la detección de móvil aquí, al host, en vez
  // de dentro del iframe — ver sendViewport). El contenedor sigue la caja
  // REAL de w.visualViewport (offsetTop/offsetLeft/width/height) — NUNCA un
  // inset:0 fijo al viewport de LAYOUT completo: en iOS el teclado puede
  // reducir Y desplazar lo visible sin mover el viewport de layout, y un
  // inset:0 dejaría el panel tapado por el teclado o fuera de la zona
  // visible (Critical, ronda 3 — WebKit documenta actualizaciones tardías de
  // estos valores durante la animación del teclado:
  // https://bugs.webkit.org/show_bug.cgi?id=265578). Sin VisualViewport
  // (navegador sin soporte), el viewport de layout es la mejor aproximación
  // disponible. En cualquier otro caso, ancla por `position` con el
  // `launcherSize`/`desktopPanelSize` reportado EN CADA MODO — nunca uno
  // contaminado por el otro.
  const applySizing = (): void => {
    if (!instance) return
    if (instance.mode === 'panel' && instance.isMobile) {
      const vv = w.visualViewport
      if (vv) {
        setBoxStyle(instance.container, {
          position: 'fixed', zIndex: '2147483647',
          top: `${Math.round(vv.offsetTop)}px`, left: `${Math.round(vv.offsetLeft)}px`,
          width: `${Math.round(vv.width)}px`, height: `${Math.round(vv.height)}px`,
        })
      } else {
        setBoxStyle(instance.container, { position: 'fixed', zIndex: '2147483647', inset: '0', width: '100vw', height: '100dvh' })
      }
      setBoxStyle(instance.iframe, { border: '0', width: '100%', height: '100%' })
      return
    }
    const size = instance.mode === 'panel' ? (instance.desktopPanelSize ?? DEFAULT_PANEL_SIZE) : (instance.launcherSize ?? LAUNCHER_SIZE)
    setBoxStyle(instance.container, {
      position: 'fixed', zIndex: '2147483647', bottom: '0', width: `${size.width}px`, height: `${size.height}px`,
      ...(instance.position === 'left' ? { left: '0' } : { right: '0' }),
    })
    setBoxStyle(instance.iframe, { border: '0', width: '100%', height: '100%' })
  }

  // Detección de móvil ENTERAMENTE del lado del host (fix del bug "104×104 en
  // bucle": el shell, dentro del iframe, no puede distinguir de forma fiable
  // "soy 104px porque soy el launcher" de "soy 104px porque el host es un
  // móvil estrecho" — ambos casos satisfacen la misma media query de ancho).
  // Se envía tras el `init`, en cada cambio de `matchMedia`, y en cada
  // resize/scroll del propio VisualViewport del host (para --viewport-h en
  // Task 14) — el payload sigue siendo solo {kind, height}: offsetTop se
  // consume enteramente en applySizing(), nunca cruza al shell (ver nota de
  // diseño al principio de esta tarea).
  const sendViewport = (): void => {
    if (!instance) return
    const height = w.visualViewport?.height ?? w.innerHeight
    sendToShell('viewport', { kind: instance.isMobile ? 'mobile' : 'desktop', height })
  }

  const boot = (installationId: string, bootOpts?: unknown): void => {
    if (instance) return
    const instanceId = `nevw_${Math.random().toString(36).slice(2, 10)}`
    const container = w.document.createElement('div')
    const iframe = w.document.createElement('iframe')
    iframe.title = 'Chat de ayuda'
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.src = `${opts.shellUrl}#${instanceId}`
    container.appendChild(iframe)
    // Fallback a documentElement: un <script> clásico en <head> puede ejecutarse
    // antes de que exista document.body.
    ;(w.document.body ?? w.document.documentElement).appendChild(container)
    const shellOrigin = new URL(opts.shellUrl, w.location.href).origin

    const mobileQuery = w.matchMedia(MOBILE_QUERY)
    const onMobileChange = (): void => {
      if (!instance) return
      instance.isMobile = mobileQuery.matches
      applySizing()
      sendViewport()
    }
    mobileQuery.addEventListener('change', onMobileChange)

    // Un mismo handler para 'resize' Y 'scroll': el teclado en iOS puede
    // reducir el visual viewport (resize) o solo desplazarlo (scroll) sin
    // cambiar su tamaño — ambos casos exigen recalcular la geometría del
    // contenedor fullscreen móvil (Critical, ronda 3).
    const onVisualViewportChange = (): void => { applySizing(); sendViewport() }
    w.visualViewport?.addEventListener('resize', onVisualViewportChange)
    w.visualViewport?.addEventListener('scroll', onVisualViewportChange)

    const onMessage = (ev: MessageEvent): void => {
      if (!instance) return
      if (ev.origin !== instance.shellOrigin || ev.source !== instance.iframe.contentWindow) return
      const env = openEnvelope(ev.data, { instanceId: instance.instanceId })
      if (!env || !isCommand(env.type, SHELL_TO_LOADER)) return
      if (env.type === 'ready') {
        sendToShell('init', { installationId: instance.installationId, opts: instance.opts })
        sendViewport()
        return
      }
      if (env.type === 'opened') {
        instance.mode = 'panel'
        applySizing()
      } else if (env.type === 'closed') {
        instance.mode = 'launcher'
        applySizing()
      } else if (env.type === 'resize') {
        const payload = env.payload as { width?: unknown; height?: unknown; position?: unknown; viewportKind?: unknown } | null | undefined
        const width = typeof payload?.width === 'number' ? payload.width : null
        const height = typeof payload?.height === 'number' ? payload.height : null
        if (payload?.position === 'left' || payload?.position === 'right') instance.position = payload.position
        // Filtrado por el MODO PROPIO del loader (nunca solo por
        // viewportKind, que el shell podría reportar mal): un resize solo se
        // promociona a desktopPanelSize si el loader está EN modo panel Y el
        // shell dice que su propio viewport es desktop — así un resize del
        // panel fullscreen móvil (Panel también llama a useResizeReport,
        // Task 13) nunca contamina el tamaño desktop guardado (fix "lastSize"
        // de la ronda 2, ahora también a prueba de cruces desktop↔móvil,
        // Critical ronda 3). En modo launcher, CUALQUIER resize se guarda
        // como launcherSize — el Launcher (Task 13) es lo único que puede
        // estar reportando su tamaño en ese modo.
        if (width !== null && height !== null) {
          if (instance.mode === 'panel' && payload?.viewportKind === 'desktop') instance.desktopPanelSize = { width, height }
          else if (instance.mode === 'launcher') instance.launcherSize = { width, height }
        }
        applySizing()
      }
      // El forward genérico sigue: un anfitrión suscrito a on('resize'/'opened'/'closed', cb)
      // (API pública, spec §3.2) lo recibe igual, además del efecto interno de arriba.
      instance.listeners.get(env.type)?.forEach((cb) => cb(env.payload))
    }
    w.addEventListener('message', onMessage)
    instance = {
      instanceId, installationId, opts: bootOpts, container, iframe, shellOrigin, listeners: new Map(), onMessage,
      mode: 'launcher', isMobile: mobileQuery.matches, position: 'right', desktopPanelSize: null, launcherSize: null,
      mobileQuery, onMobileChange, onVisualViewportChange: w.visualViewport ? onVisualViewportChange : null,
    }
    applySizing()
  }

  const destroy = (): void => {
    if (!instance) return
    w.removeEventListener('message', instance.onMessage)
    instance.mobileQuery.removeEventListener('change', instance.onMobileChange)
    if (instance.onVisualViewportChange) {
      w.visualViewport?.removeEventListener('resize', instance.onVisualViewportChange)
      w.visualViewport?.removeEventListener('scroll', instance.onVisualViewportChange)
    }
    instance.container.remove()
    instance = null
  }

  drainQueue(stub, (method, args) => {
    switch (method) {
      case 'boot':
        boot(String(args[0]), args[1])
        break
      case 'open':
      case 'close':
      case 'toggle':
      case 'consent':
        sendToShell(method, null)
        break
      case 'update':
        sendToShell('update', args[0] ?? null)
        break
      case 'on': {
        const [event, cb] = args as [string, ((p: unknown) => void) | undefined]
        if (!instance || typeof cb !== 'function') return
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
      case 'identify':
      case 'reset':
        console.warn(`[NeventWidget] ${method}() está reservado para v1.1 y aún no hace nada`)
        break
      case 'destroy':
        destroy()
        break
      default:
        console.warn(`[NeventWidget] método desconocido: ${method}`)
    }
  })
}
```

- [ ] **Step 6: ejecutar y confirmar que TODO el archivo pasa**

Run: `cd packages/widget && npx vitest run src/loader/__tests__/loader.test.ts`
Expected: PASS (25 tests — los 7 preexistentes + los 18 nuevos).

- [ ] **Step 7: commit**

```bash
git add packages/widget/src/loader/index.ts packages/widget/src/loader/__tests__/loader.test.ts
git commit -m "fix(widget): cierra la carrera opened/resize (desktopPanelSize+DEFAULT_PANEL_SIZE+viewportKind), geometría real de VisualViewport (offsetTop/scroll) y launcherSize dinámico (Critical ronda 3)"
```

---

### Task 13: Ensamblado `Panel.tsx` + `Launcher.tsx`

**Files:**
- Create: `packages/widget/src/panel/use-resize-report.ts`
- Create: `packages/widget/src/panel/Panel.tsx`
- Create: `packages/widget/src/panel/Launcher.tsx`
- Modify: `packages/widget/src/panel/panel.css` (estructura raíz `[data-part="root"]`/`.launcher`/`.panel`)
- Create: `packages/widget/src/panel/__tests__/use-resize-report.test.tsx`
- Create: `packages/widget/src/panel/__tests__/Panel.test.tsx`
- Create: `packages/widget/src/panel/__tests__/Launcher.test.tsx`

**Interfaces:**
- Consumes: `Transport` de `../transport` (Plan 2), `useStoreState` (Task 3), `useFocusTrap` (Task 4), `computeViewState` (Task 5), `Header`/`MessageList`/`Composer`/`ConnectionBanner`/`handoff` (Tasks 6-11), el loader rediseñado (Task 12).
- Produces: `useResizeReport(onResize: (width: number, height: number) => void): void`, `PanelProps`, `Panel(props)`, `LauncherProps`, `Launcher(props)` — consumidos por `App` (Task 17). `Panel` YA NO recibe `onFeedback` (gap #5: el panel integrado nunca pasa esa prop a `ResolvedCard`) ni `agentAvatarUrl`/aplica `theme` (movido a `main.tsx`, Task 15).

- [ ] **Step 1: escribir el test de use-resize-report (falla primero)**

Crítico #2 de la revisión: medir `document.body` dentro de un iframe de ancho cero mide su viewport (colapsado a 0), no el overflow real del panel — `body` es block, llena su containing block. `[data-part="root"]` (el div que `App.tsx` renderiza) es `display:inline-flex` con padding propio (Step 6 de esta tarea): se dimensiona a su contenido real (shrink-to-fit) sin que lo comprima un iframe diminuto.

Crear `packages/widget/src/panel/__tests__/use-resize-report.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useResizeReport } from '../use-resize-report'
import { mount, cleanupMounted } from './test-utils'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: () => void
  constructor(cb: () => void) { this.cb = cb; FakeResizeObserver.instances.push(this) }
  observe(): void {}
  disconnect(): void {}
  trigger(): void { this.cb() }
}

function Probe({ onResize }: { onResize: (w: number, h: number) => void }) {
  useResizeReport(onResize)
  return null
}

describe('useResizeReport', () => {
  let originalRO: unknown
  let rootEl: HTMLElement

  beforeEach(() => {
    originalRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    FakeResizeObserver.instances = []
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver
    rootEl = document.createElement('div')
    rootEl.setAttribute('data-part', 'root')
    document.body.appendChild(rootEl)
    vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue({ width: 430, height: 688 } as DOMRect)
  })
  afterEach(async () => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalRO
    rootEl.remove()
    await cleanupMounted()
  })

  it('Critical #2 — mide [data-part="root"] (nunca document.body) al montar, con números realistas (430×688, no 382×640)', async () => {
    const onResize = vi.fn()
    await mount(<Probe onResize={onResize} />)
    expect(onResize).toHaveBeenCalledWith(430, 688)
  })

  it('vuelve a reportar cuando ResizeObserver dispara (p.ej. el panel cambia de tamaño)', async () => {
    const onResize = vi.fn()
    await mount(<Probe onResize={onResize} />)
    onResize.mockClear()
    vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue({ width: 104, height: 104 } as DOMRect)
    FakeResizeObserver.instances[0]!.trigger()
    expect(onResize).toHaveBeenCalledWith(104, 104)
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-resize-report.test.tsx`
Expected: FAIL — `Failed to resolve import "../use-resize-report"`

- [ ] **Step 3: implementar use-resize-report.ts**

Crear `packages/widget/src/panel/use-resize-report.ts`:

```ts
import { useEffect } from 'preact/hooks'

// Mide `[data-part="root"]` — el div que App.tsx renderiza vía JSX — NUNCA
// document.body (Critical #2: body es block y llena su containing block, que
// dentro de un iframe recién arrancado en 0px de ancho colapsa a 0 SIN
// IMPORTAR el ancho real de sus hijos). [data-part="root"] es
// display:inline-flex con padding propio (panel.css, Step 6 de esta tarea):
// un elemento shrink-to-fit se dimensiona a su contenido real aunque su
// contenedor sea más estrecho — el mismo motivo por el que .panel{width:382px}
// nunca se comprime pese a vivir dentro de un iframe diminuto.
export function useResizeReport(onResize: (width: number, height: number) => void): void {
  useEffect(() => {
    const target = document.querySelector<HTMLElement>('[data-part="root"]')
    if (!target || typeof ResizeObserver === 'undefined') return
    const report = (): void => {
      const rect = target.getBoundingClientRect()
      onResize(Math.ceil(rect.width), Math.ceil(rect.height))
    }
    const ro = new ResizeObserver(report)
    ro.observe(target)
    report()
    return () => ro.disconnect()
  }, [])
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-resize-report.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: escribir el test de Launcher (falla primero)**

Crear `packages/widget/src/panel/__tests__/Launcher.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Launcher } from '../Launcher'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Launcher', () => {
  it('sin no leídos: no pinta badge; con no leídos: pinta el número (9+ si supera 9)', async () => {
    let root = await mount(<Launcher unreadCount={0} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(root.querySelector('.badge')).toBeNull()
    await cleanupMounted()
    root = await mount(<Launcher unreadCount={3} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(root.querySelector('.badge')?.textContent).toBe('3')
    await cleanupMounted()
    root = await mount(<Launcher unreadCount={15} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(root.querySelector('.badge')?.textContent).toBe('9+')
  })

  it('clicar el launcher llama a onOpen; conserva data-part=launcher (contrato del shell, Plan 1 shell.test.tsx)', async () => {
    const onOpen = vi.fn()
    const root = await mount(<Launcher unreadCount={0} autofocus={false} onOpen={onOpen} onResize={vi.fn()} />)
    const btn = root.querySelector<HTMLButtonElement>('[data-part=launcher]')!
    btn.click()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('autofocus:true se enfoca a sí mismo al montar (retorno de foco tras cerrar el panel en desktop, spec §6)', async () => {
    const root = await mount(<Launcher unreadCount={0} autofocus={true} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(document.activeElement).toBe(root.querySelector('[data-part=launcher]'))
  })

  it('autofocus:false (p.ej. carga inicial, o cierre en móvil) no roba el foco', async () => {
    document.body.focus()
    await mount(<Launcher unreadCount={0} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(document.activeElement).not.toBe(document.querySelector('[data-part=launcher]'))
  })
})
```

- [ ] **Step 6: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Launcher.test.tsx`
Expected: FAIL — `Failed to resolve import "../Launcher"`

- [ ] **Step 7: implementar Launcher.tsx**

Crear `packages/widget/src/panel/Launcher.tsx`:

```tsx
import { useEffect, useRef } from 'preact/hooks'
import { BotIcon } from './icons'
import { useResizeReport } from './use-resize-report'

export interface LauncherProps {
  unreadCount: number
  autofocus: boolean
  onOpen: () => void
  onResize: (width: number, height: number) => void
}

export function Launcher({ unreadCount, autofocus, onOpen, onResize }: LauncherProps) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useResizeReport(onResize)

  useEffect(() => {
    if (autofocus) ref.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <button class="launcher" data-part="launcher" ref={ref} aria-label="Abrir chat de ayuda" onClick={onOpen}>
      <BotIcon />
      {unreadCount > 0 && <span class="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
  )
}
```

- [ ] **Step 8: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Launcher.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 9: escribir el test de Panel (falla primero)**

`Panel` ya no llama a `matchMedia` en absoluto (fix del bucle 104×104, ronda 2) — recibe `viewportKind`/`viewportHeight` como props, que `App` (Task 17) rellena a partir del mensaje `viewport` del loader (Task 12). Tampoco intercala `AgentJoinedSysline` (gap #4 revertido, ver Task 8).

Crear `packages/widget/src/panel/__tests__/Panel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Panel } from '../Panel'
import { createMessageStore } from '../../store/message-store'
import { fixtureConfig } from '../../contract/fixtures'
import type { Transport } from '../../transport'
import { mount, cleanupMounted } from './test-utils'

function fakeTransport(store = createMessageStore(() => '2026-07-18T14:00:00.000Z')): Transport {
  return {
    store,
    send: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    cancel: vi.fn(),
    openChannel: vi.fn(),
    closeChannel: vi.fn(),
    destroy: vi.fn(),
  }
}

afterEach(cleanupMounted)

async function mountPanel(overrides: Partial<Parameters<typeof Panel>[0]> = {}): Promise<{ root: HTMLElement; transport: Transport }> {
  const transport = overrides.transport ?? fakeTransport()
  const root = await mount(
    <Panel config={fixtureConfig()} transport={transport} onMinimize={vi.fn()} onClose={vi.fn()} onResize={vi.fn()}
      viewportKind="desktop" viewportHeight={900} {...overrides} />,
  )
  return { root, transport }
}

describe('Panel', () => {
  it('conserva data-part=panel (contrato del shell, Plan 1 shell.test.tsx)', async () => {
    const { root } = await mountPanel()
    expect(root.querySelector('[data-part=panel]')).not.toBeNull()
  })

  it('sin mensajes en fase idle: pinta Welcome dentro de MessageList', async () => {
    const { root } = await mountPanel()
    expect(root.querySelector('.welcome')).not.toBeNull()
  })

  it('Critical #1 — fase ESCALATED_WAITING: pinta WaitingCard aunque la conexión esté offline (no depende de ribbon)', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({ messages: [], state: 'ESCALATED_WAITING', snapshotCursor: 'evt_v1_c_1' })
    store.setConnection('offline')
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.syscard.waiting')).not.toBeNull()
    expect(root.querySelector('.welcome')).toBeNull() // Important #9: nunca Welcome fuera de fase idle
  })

  it('gap #5 — fase RESOLVED: ResolvedCard se pinta SIN botones de feedback (Panel no pasa onFeedback)', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_c_1' })
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.syscard.resolved')).not.toBeNull()
    expect(root.querySelector('.feedback')).toBeNull()
  })

  it('gap #4 (revertido) — la presencia del agente NO se muestra como divider intercalado en el panel integrado, solo como cambio de cabecera', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({
      messages: [{ messageId: 'm1', role: 'user', text: 'hola', createdAt: '2026-07-18T14:00:00.000Z' }],
      state: 'AGENT_ACTIVE', snapshotCursor: 'evt_v1_c_1',
    })
    store.applyDurableEvent({
      eventId: 'evt_v1_c_5', schemaVersion: 1, conversationId: 'c', occurredAt: '2026-07-18T14:09:00.000Z',
      type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null },
    })
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.sysline')).toBeNull() // AgentJoinedSysline NO se monta aquí (solo en el harness, Task 16)
    expect(root.querySelector('.name')?.textContent).toBe('Laura') // la presencia SÍ se ve en la cabecera
  })

  it('cerrar el panel llama a onClose; Escape también (focus trap, Task 4)', async () => {
    const onClose = vi.fn()
    const { root } = await mountPanel({ onClose })
    root.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
    onClose.mockClear()
    root.querySelector('.panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Important #5 (ronda 2, fix del bucle 104×104) — viewportKind="desktop": el panel recibe autofocus al abrir, SIN llamar a matchMedia', async () => {
    const { root } = await mountPanel({ viewportKind: 'desktop', viewportHeight: 900 })
    expect(document.activeElement).toBe(root.querySelector('.panel'))
  })

  it('Important #5 — viewportKind="mobile": el panel NO roba el foco al abrir', async () => {
    document.body.focus()
    await mountPanel({ viewportKind: 'mobile', viewportHeight: 640 })
    expect(document.activeElement).not.toBe(document.querySelector('.panel'))
  })

  it('enviar desde el composer llama a transport.send', async () => {
    const { root, transport } = await mountPanel()
    const textarea = root.querySelector('textarea')!
    textarea.value = 'hola'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(transport.send).toHaveBeenCalledWith('hola')
  })
})
```

- [ ] **Step 10: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Panel.test.tsx`
Expected: FAIL — `Failed to resolve import "../Panel"`

- [ ] **Step 11: implementar Panel.tsx**

Crear `packages/widget/src/panel/Panel.tsx`:

```tsx
import type { WidgetConfig } from '../contract/types'
import type { Transport } from '../transport'
import { useStoreState } from './use-store'
import { useFocusTrap } from './focus-trap'
import { useResizeReport } from './use-resize-report'
import { computeViewState } from './view-state'
import { Header } from './Header'
import { ConnectionBanner } from './ConnectionBanner'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { WaitingCard, TypingDots, ResolvedCard } from './handoff'

export interface PanelProps {
  config: WidgetConfig
  transport: Transport
  onMinimize: () => void
  onClose: () => void
  onResize: (width: number, height: number) => void
  // Rellenados por App (Task 17) a partir del mensaje `viewport` del loader
  // (Task 12) — Panel NUNCA llama a matchMedia por sí mismo (Critical, ronda
  // 2: el viewport del propio iframe no distingue de forma fiable "soy
  // pequeño porque soy el launcher" de "soy pequeño porque el host es
  // estrecho", y eso producía un bucle de 104×104 en desktop).
  viewportKind: 'mobile' | 'desktop'
  viewportHeight: number
}

export function Panel({ config, transport, onMinimize, onClose, onResize, viewportKind, viewportHeight }: PanelProps) {
  const state = useStoreState(transport.store)
  const isStreaming = state.messages.some((m) => m.streaming)
  const viewState = computeViewState({
    conversationState: state.conversationState,
    connection: state.connection,
    agentName: state.agentName,
    assistantName: config.assistantName,
    isStreaming,
  })

  // Foco inicial SOLO en desktop (Important #5 / Global Constraints) — el
  // trap en sí (Tab/Shift+Tab/Escape) sigue activo en ambos, decidido en
  // Task 4; aquí solo se decide si el AUTOFOCUS inicial se dispara, y se
  // decide con la señal del HOST (viewportKind), nunca con matchMedia local.
  const containerRef = useFocusTrap(true, onClose, viewportKind === 'desktop')
  useResizeReport(onResize)
  // useViewportHeight(viewportKind === 'mobile' ? viewportHeight : null) se
  // añade en Task 14 (Responsive) — mantener el orden de tareas evita una
  // referencia a un módulo que aún no existe.

  const trailing = (
    <>
      {viewState.conversationPhase === 'waiting' && <WaitingCard />}
      {state.agentTyping && viewState.conversationPhase === 'agent' && <TypingDots />}
      {/* Sin AgentJoinedSysline (gap #4 revertido, ver Task 8) y sin
          onFeedback en ResolvedCard (gap #5): el panel integrado nunca
          finge una cronología o un éxito que no persiste en ningún sitio —
          la presencia del agente ya se ve en el cambio de cabecera. */}
      {viewState.conversationPhase === 'resolved' && <ResolvedCard agentName={state.agentName} />}
    </>
  )

  return (
    <section class="panel" data-part="panel" role="dialog" aria-label={config.assistantName} tabIndex={-1} ref={containerRef}>
      <Header viewState={viewState} onMinimize={onMinimize} onClose={onClose} />
      <ConnectionBanner kind={viewState.connectionBanner} />
      <MessageList
        config={config}
        messages={state.messages}
        agentName={state.agentName}
        onRetry={(clientId) => transport.retry(clientId)}
        onQuickReply={(text) => transport.send(text)}
        trailing={trailing}
        showWelcome={viewState.conversationPhase === 'idle' && state.messages.length === 0}
      />
      <Composer viewState={viewState} onSend={(text) => transport.send(text)} onStop={() => transport.cancel()} />
    </section>
  )
}
```

- [ ] **Step 12: ejecutar y confirmar que pasa, luego verificar tipos**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Panel.test.tsx`
Expected: PASS (9 tests) — Important (ronda 3): el archivo declaraba 8 pero contenía 9 (conserva data-part / sin mensajes Welcome / Critical#1 ESCALATED_WAITING / gap#5 RESOLVED / gap#4 sin sysline / cerrar+Escape / Important#5 desktop autofocus / Important#5 mobile sin autofocus / enviar desde el composer) — recuento corregido en todo el resto de esta tarea y en Task 14.

Run: `cd packages/widget && npx tsc --noEmit`
Expected: sin errores. Si `ref={containerRef}` en el `<section>` da un error de varianza de tipos, envolver con `ref={containerRef as unknown as import('preact').RefObject<HTMLSectionElement>}` en el sitio de uso, documentando por qué con un comentario.

- [ ] **Step 13: añadir la estructura raíz y las reglas base de launcher/panel a panel.css**

Añadir **al principio** de `packages/widget/src/panel/panel.css`:

```css
/* ===== Estructura raíz del shell =====
   El padding de "aire" respecto al borde de pantalla vive en [data-part="root"]
   (el div que App.tsx renderiza), NUNCA en .launcher/.panel — así
   useResizeReport (Step 3) puede medirlo con getBoundingClientRect() en un
   único elemento, y el modo (launcher/panel) se decide declarativamente en
   App.tsx (Task 17) sin necesitar un efecto en este componente. */
html, body { margin: 0; }
[data-part="root"] { display: inline-flex; padding: 24px; box-sizing: border-box; }

/* ===== Launcher ===== */
.launcher {
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--brand-grad); box-shadow: var(--shadow-bubble); color: var(--brand-ink);
  display: grid; place-items: center; transition: transform .18s ease; position: relative;
}
.launcher:hover { transform: scale(1.06); }
.launcher:focus-visible { outline: 2px solid var(--brand-ink); outline-offset: 2px; }
.launcher svg { width: 26px; height: 26px; }
.launcher .badge {
  position: absolute; top: -2px; right: -2px; min-width: 19px; height: 19px; padding: 0 5px;
  border-radius: 99px; background: var(--danger); color: #fff; font: 600 11px/19px var(--font-body);
  text-align: center; border: 2px solid var(--surface);
}
@media (prefers-reduced-motion: reduce) { .launcher { transition: none; } }

/* ===== Panel =====
   Alto fijo (640px) en desktop en vez de un min(640px, 100vh) real como el
   mock: el iframe no puede leer el viewport del anfitrión de forma fiable
   (cross-origin) sin ampliar el handshake INIT de Plan 1 — fuera de scope,
   documentado como limitación conocida en el Self-Review. `box-sizing:
   border-box` (Important safe-area, ronda 2) para que Task 14 pueda sumar
   `padding-bottom: env(safe-area-inset-bottom)` en móvil SIN que la caja
   exterior crezca por encima de `--viewport-h` — si creciera, el iframe
   (dimensionado exactamente a esa altura por el loader) recortaría la
   protección inferior justo donde más falta hace. */
.panel {
  width: 382px; height: 640px; background: var(--surface); border-radius: var(--r-panel);
  box-shadow: var(--shadow-panel); display: flex; flex-direction: column; overflow: hidden;
  box-sizing: border-box;
  transform-origin: calc(100% - 28px) calc(100% - 28px);
  animation: pop .28s cubic-bezier(.21, 1.02, .55, 1) both;
}
@keyframes pop { from { opacity: 0; transform: scale(.92) translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
```

- [ ] **Step 14: commit**

```bash
git add packages/widget/src/panel/use-resize-report.ts packages/widget/src/panel/Launcher.tsx packages/widget/src/panel/Panel.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/use-resize-report.test.tsx packages/widget/src/panel/__tests__/Launcher.test.tsx packages/widget/src/panel/__tests__/Panel.test.tsx
git commit -m "fix(widget): Panel recibe viewportKind/viewportHeight del host en vez de llamar a matchMedia (fix bucle 104x104, Critical ronda 2)"
```

---

### Task 14: Responsive real — modo por atributo, `use-viewport-height.ts` alimentado por el host

**rev.3 — el layout móvil ya NUNCA se decide con `@media (max-width: ...)` dentro del iframe.** La ronda 2 encontró que evaluar el ancho DEL PROPIO IFRAME para decidir "¿soy móvil?" es circular: el iframe mide 104px cuando es el launcher, y el panel completo en desktop mide solo 430px — ambos casos "parecen" móviles según esa media query, produciendo el bucle 104×104 del Critical (cerrado en Task 12/13 moviendo la detección al host). Esta tarea es la contraparte de CSS: el layout móvil se activa por el atributo `[data-viewport="mobile"]` que `App.tsx` (Task 17) fija en `[data-part="root"]` a partir del mensaje `viewport` del loader — nunca por una media query de ancho evaluada dentro del iframe.

**Excepción explícita, documentada:** `@media (prefers-reduced-motion: reduce)` y `@media (prefers-color-scheme: dark)` (tokens.css, Task 1) SÍ siguen siendo media queries reales dentro del iframe — no sufren el mismo problema porque reflejan una preferencia del SISTEMA/navegador (accesibilidad, tema), no el tamaño de la caja del propio iframe; un iframe de 104px de ancho y su documento padre comparten exactamente la misma respuesta a "¿el usuario prefiere menos movimiento?" o "¿el SO está en modo oscuro?", así que no hay ninguna circularidad que resolver ahí.

**Files:**
- Create: `packages/widget/src/panel/use-viewport-height.ts`
- Modify: `packages/widget/src/panel/Panel.tsx` (usa el hook)
- Modify: `packages/widget/src/panel/panel.css` (bloque `[data-viewport="mobile"]` al final del archivo, sustituye `@media (max-width: 480px)` para modo de layout)
- Create: `packages/widget/src/panel/__tests__/use-viewport-height.test.tsx`
- Modify: `packages/widget/src/panel/__tests__/Panel.test.tsx` (verificación de que el hook no rompe nada tras cablearlo)

**Interfaces:**
- Produces: `useViewportHeight(heightPx: number | null): void` — un SETTER puro, no un listener: recibe el número ya resuelto por el host (loader → mensaje `viewport` → `App`, Task 17) en vez de escuchar `window.visualViewport` desde dentro del iframe (rev.2 lo hacía así; rev.3 lo simplifica porque el host YA reenvía cada cambio de `VisualViewport` vía el mismo mensaje `viewport`, Task 12 — duplicar el listener dentro del iframe sería redundante y, peor, mediría el viewport del iframe en vez del real del host antes de que el loader lo haya dimensionado). Consumido por `Panel` (esta tarea completa el marcador de Task 13).

- [ ] **Step 1: escribir el test (falla primero)**

Crear `packages/widget/src/panel/__tests__/use-viewport-height.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { useViewportHeight } from '../use-viewport-height'
import { mount, rerender, cleanupMounted } from './test-utils'

function Probe({ heightPx }: { heightPx: number | null }) {
  useViewportHeight(heightPx)
  return null
}

afterEach(async () => {
  document.documentElement.style.removeProperty('--viewport-h')
  await cleanupMounted()
})

describe('useViewportHeight', () => {
  it('heightPx null (desktop): no fija la custom property', async () => {
    await mount(<Probe heightPx={null} />)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('')
  })

  it('heightPx numérico (móvil): fija --viewport-h en px', async () => {
    await mount(<Probe heightPx={640} />)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('640px')
  })

  it('un cambio de heightPx (p.ej. el teclado en pantalla abre) actualiza la custom property', async () => {
    const root = await mount(<Probe heightPx={640} />)
    await rerender(<Probe heightPx={420} />, root)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('420px')
  })

  it('volver a null (p.ej. cambio a desktop a mitad de sesión) quita la custom property', async () => {
    const root = await mount(<Probe heightPx={640} />)
    await rerender(<Probe heightPx={null} />, root)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('')
  })
})
```

- [ ] **Step 2: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-viewport-height.test.tsx`
Expected: FAIL — `Failed to resolve import "../use-viewport-height"`

- [ ] **Step 3: implementar use-viewport-height.ts**

Crear `packages/widget/src/panel/use-viewport-height.ts`:

```ts
import { useEffect } from 'preact/hooks'

// Setter puro — NO escucha window.visualViewport dentro del iframe (rev.2 lo
// hacía así). El host (loader, Task 12) ya reenvía cada cambio de SU PROPIO
// VisualViewport vía el mensaje `viewport`; escuchar aquí además sería
// redundante y, antes de que el loader dimensione el iframe a pantalla
// completa en móvil, mediría el viewport (pequeño, aún sin redimensionar)
// del propio iframe en vez del real del host.
export function useViewportHeight(heightPx: number | null): void {
  useEffect(() => {
    if (heightPx === null) {
      document.documentElement.style.removeProperty('--viewport-h')
      return
    }
    document.documentElement.style.setProperty('--viewport-h', `${heightPx}px`)
  }, [heightPx])
}
```

- [ ] **Step 4: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/use-viewport-height.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: cablear el hook en Panel.tsx**

Editar `packages/widget/src/panel/Panel.tsx` — añadir el import junto a los demás:

```tsx
import { useViewportHeight } from './use-viewport-height'
```

Y sustituir el comentario marcador de Task 13 por la llamada real:

```tsx
  const containerRef = useFocusTrap(true, onClose, viewportKind === 'desktop')
  useResizeReport(onResize)
  useViewportHeight(viewportKind === 'mobile' ? viewportHeight : null)
```

- [ ] **Step 6: confirmar que Panel.test.tsx (Task 13) sigue en verde tras el cambio**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/Panel.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 7: añadir el bloque responsive al final de panel.css**

`[data-viewport]` lo fija `App.tsx` (Task 17) en `[data-part="root"]` a partir del mensaje `viewport` del loader — NUNCA una media query de ancho (ver nota de cabecera de esta tarea sobre por qué `prefers-reduced-motion`/`prefers-color-scheme` sí pueden seguir siendo `@media` reales).

Añadir **al final** de `packages/widget/src/panel/panel.css`:

```css
/* ===== Responsive real (spec §9: 100dvh + safe-area + VisualViewport —
   NO una media query de ancho dentro del iframe, ver cabecera de Task 14).
   [data-viewport] y [data-mode] los fija App.tsx declarativamente en
   [data-part="root"] (Task 17) — Panel/Launcher no los tocan. ===== */
[data-part="root"][data-viewport="mobile"][data-mode="launcher"] {
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
[data-part="root"][data-viewport="mobile"][data-mode="panel"] { padding: 0; }

[data-viewport="mobile"] .panel {
  width: 100vw;
  height: var(--viewport-h, 100dvh);
  border-radius: 0;
  animation: none;
  /* box-sizing:border-box (Task 13, .panel base) incluye este padding DENTRO
     de --viewport-h en vez de sumarlo por encima (Important safe-area, ronda
     2) — si sumara, la caja exterior superaría la altura que el loader dio
     al iframe y la protección inferior quedaría recortada justo donde más
     falta hace. Idéntico razonamiento se aplica a left/right (Important
     safe-area landscape, ronda 3): 100vw ya es el ancho exacto del CSS
     viewport, así que sumar padding lateral DENTRO de la caja (border-box)
     nunca desborda — un móvil apaisado con notch lateral (p.ej. iPhone en
     landscape) necesita esa reserva para que el contenido no quede debajo
     del recorte físico de la pantalla. */
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
[data-viewport="mobile"] .head { padding-top: calc(10px + env(safe-area-inset-top)); }
```

- [ ] **Step 8: commit**

```bash
git add packages/widget/src/panel/use-viewport-height.ts packages/widget/src/panel/Panel.tsx packages/widget/src/panel/panel.css packages/widget/src/panel/__tests__/use-viewport-height.test.tsx
git commit -m "fix(widget): responsive por atributo [data-viewport] alimentado por el host, no por media query de ancho dentro del iframe (fix Critical mobile-loop)"
```

---

### Task 15: CSP explícita, normalización de `welcome` en la frontera de red, theming antes del primer render

**Files:**
- Modify: `packages/widget/shell.html` (CSP vía `<meta>`)
- Modify: `packages/widget/examples/README.md` (instrucción de dev local: editar TAMBIÉN el `connect-src` de la CSP, no solo `nevw-api`)
- Create: `packages/widget/src/contract/normalize-welcome.ts`
- Create: `packages/widget/src/contract/__tests__/normalize-welcome.test.ts`
- Modify: `packages/widget/src/shell/session.ts` (aplica la normalización a `config.welcome`)
- Modify: `packages/widget/src/shell/main.tsx` (importa CSS/fuentes, aplica `applyTheme` ANTES del primer render — Important #10)

**Interfaces:**
- Consumes: `applyTheme` de `../panel/theme` (Task 2).
- Produces: `normalizeWelcome(raw: unknown): { title: string; subtitle: string; quickReplies: string[] } | undefined` — consumido por `createSessionClient` (`shell/session.ts`).

- [ ] **Step 1: añadir la CSP a shell.html**

Editar `packages/widget/shell.html` — reemplazo completo del archivo:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <!-- Critical #4: default-src 'none' + allowlist explícita. img-src 'self'
       queda para compatibilidad futura (logo propio/proxy) — HOY ningún
       componente de este plan pinta un <img>, todo avatar es de iniciales
       (spec §8). connect-src apunta al origen de producción; para dev local
       contra el mock-api o nev-api local hay que editar TAMBIÉN esta línea
       en el dist/shell.html generado, igual que ya se hace con la meta
       nevw-api (ver examples/README.md, Step 2 de esta tarea). frame-ancestors
       NO se puede fijar aquí — los navegadores ignoran esa directiva en un
       <meta> (solo aplica vía cabecera HTTP); el aislamiento de qué
       orígenes pueden embeber el widget lo hace el servidor validando
       embeddingOrigin contra la allowlist de la instalación (spec §4.1),
       no esta CSP. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://api.nevent.es; base-uri 'none'; object-src 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="nevw-api" content="https://api.nevent.es">
  <title>Chat de ayuda</title>
</head>
<body><div id="root"></div><script type="module" src="/src/shell/main.tsx"></script></body>
</html>
```

- [ ] **Step 2: actualizar la nota de dev local en examples/README.md**

Editar `packages/widget/examples/README.md` — en el paso que instruye editar `dist/shell.html` para apuntar la meta `nevw-api` a `http://localhost:4310`, añadir la misma instrucción para la CSP:

```
3. Editar `dist/shell.html` generado:
   - `<meta name="nevw-api" content="http://localhost:4310">`
   - En la CSP: `connect-src 'self' http://localhost:4310` (si no se edita
     también esta línea, el navegador bloquea las llamadas a la API local
     aunque nevw-api ya apunte ahí — Critical #4 de la revisión).
```

- [ ] **Step 3: escribir el test de normalize-welcome (falla primero)**

Crear `packages/widget/src/contract/__tests__/normalize-welcome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeWelcome } from '../normalize-welcome'

describe('normalizeWelcome — Important #8 gap#6: config es entrada no confiable, se normaliza en la frontera de red', () => {
  it('payload válido pasa tal cual', () => {
    const w = normalizeWelcome({ title: 'Hola', subtitle: 'Te ayudamos', quickReplies: ['Uno', 'Dos'] })
    expect(w).toEqual({ title: 'Hola', subtitle: 'Te ayudamos', quickReplies: ['Uno', 'Dos'] })
  })

  it('title > 80 chars: se recorta, no se descarta el welcome entero', () => {
    const w = normalizeWelcome({ title: 'x'.repeat(200), subtitle: 'y', quickReplies: [] })
    expect(w?.title.length).toBe(80)
  })

  it('subtitle > 200 chars: se recorta', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y'.repeat(400), quickReplies: [] })
    expect(w?.subtitle.length).toBe(200)
  })

  it('más de 4 quickReplies: se recorta a 4', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: ['1', '2', '3', '4', '5', '6'] })
    expect(w?.quickReplies).toEqual(['1', '2', '3', '4'])
  })

  it('un chip individual > 60 chars: se descarta ESE chip, los demás sobreviven', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: ['ok', 'z'.repeat(100), 'ok2'] })
    expect(w?.quickReplies).toEqual(['ok', 'ok2'])
  })

  it('quickReplies con tipos mezclados (número, objeto, null): se descartan los no-string', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: ['ok', 42, { evil: true }, null, 'ok2'] })
    expect(w?.quickReplies).toEqual(['ok', 'ok2'])
  })

  it('falta title o subtitle: devuelve undefined (welcome completo descartado, Welcome.tsx cae a su copia genérica)', () => {
    expect(normalizeWelcome({ subtitle: 'y', quickReplies: [] })).toBeUndefined()
    expect(normalizeWelcome({ title: 'x', quickReplies: [] })).toBeUndefined()
  })

  it('quickReplies ausente o de tipo incorrecto: cae a array vacío, no lanza', () => {
    expect(normalizeWelcome({ title: 'x', subtitle: 'y' })?.quickReplies).toEqual([])
    expect(normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: 'no-es-un-array' })?.quickReplies).toEqual([])
  })

  it('payload no-objeto (null, string, número, array): undefined, nunca lanza', () => {
    expect(normalizeWelcome(null)).toBeUndefined()
    expect(normalizeWelcome('hola')).toBeUndefined()
    expect(normalizeWelcome(42)).toBeUndefined()
    expect(normalizeWelcome(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 4: ejecutar y confirmar que falla**

Run: `cd packages/widget && npx vitest run src/contract/__tests__/normalize-welcome.test.ts`
Expected: FAIL — `Failed to resolve import "../normalize-welcome"`

- [ ] **Step 5: implementar normalize-welcome.ts**

Crear `packages/widget/src/contract/normalize-welcome.ts`:

```ts
export interface NormalizedWelcome {
  title: string
  subtitle: string
  quickReplies: string[]
}

const MAX_TITLE = 80
const MAX_SUBTITLE = 200
const MAX_CHIPS = 4
const MAX_CHIP = 60

// `welcome` llega de red (GET /widget/v1/installations/{id}/config) — entrada
// NO CONFIABLE (spec §7), se normaliza aquí, en la frontera, en vez de
// confiar en el cast `as WidgetConfig` que session.ts ya hacía (gap #6:
// un payload malformado podía romper `.length`/`.map` aguas abajo, en
// Welcome.tsx). Recortar en vez de rechazar: un title/subtitle largos siguen
// siendo un welcome válido, solo se acotan; un chip inválido se descarta
// SOLO ese chip, no arrastra a los demás.
export function normalizeWelcome(raw: unknown): NormalizedWelcome | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r['title'] !== 'string' || typeof r['subtitle'] !== 'string') return undefined
  const rawChips = Array.isArray(r['quickReplies']) ? r['quickReplies'] : []
  const quickReplies = rawChips
    .filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= MAX_CHIP)
    .slice(0, MAX_CHIPS)
  return {
    title: r['title'].slice(0, MAX_TITLE),
    subtitle: r['subtitle'].slice(0, MAX_SUBTITLE),
    quickReplies,
  }
}
```

- [ ] **Step 6: ejecutar y confirmar que pasa**

Run: `cd packages/widget && npx vitest run src/contract/__tests__/normalize-welcome.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 7: cablear la normalización en session.ts**

Editar `packages/widget/src/shell/session.ts`. Añadir el import:

```ts
import { normalizeWelcome } from '../contract/normalize-welcome'
```

Y sustituir la línea que parsea `config` (el resto de la función no cambia). **Critical (exactOptionalPropertyTypes), ronda 2:** `packages/widget/tsconfig.json` fija `exactOptionalPropertyTypes: true` — bajo ese flag, `welcome?: T` en la interfaz NO acepta un `welcome: undefined` explícito (distingue "la propiedad está ausente" de "está presente con valor `undefined`"). Se resuelve con spread condicional, **excluyendo primero la clave `welcome` cruda del objeto base** — si solo se AÑADIERA la versión validada encima sin excluir la cruda, un `welcome` malformado que `normalizeWelcome` rechaza (devuelve `undefined`) dejaría pasar igualmente el valor sin validar del primer spread:

```ts
  const configRes = await fetchFn(`${installationBase}/config`)
  if (!configRes.ok) throw new Error(`config_failed:${configRes.status}`)
  const rawConfig = (await configRes.json()) as Record<string, unknown>
  const { welcome: _rawWelcome, ...rawConfigWithoutWelcome } = rawConfig
  const welcome = normalizeWelcome(rawConfig['welcome'])
  const config: WidgetConfig = { ...(rawConfigWithoutWelcome as unknown as WidgetConfig), ...(welcome ? { welcome } : {}) }
```

- [ ] **Step 8: ejecutar la suite de session.ts y confirmar que sigue en verde**

Run: `cd packages/widget && npx vitest run src/shell/__tests__/session.test.ts`
Expected: PASS (6 tests, sin cambios de comportamiento — `mockApi()` ya devuelve `fixtureConfig()`, que ya trae un `welcome` válido desde Task 8; `normalizeWelcome` lo deja pasar intacto).

- [ ] **Step 9: aplicar el theme ANTES del primer render en main.tsx (Important #10)**

Editar `packages/widget/src/shell/main.tsx`. Añadir al principio del archivo, antes de los imports existentes:

```tsx
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../panel/tokens.css'
import '../panel/panel.css'
```

Añadir el import de `applyTheme` junto a los demás:

```tsx
import { applyTheme } from '../panel/theme'
```

Y en el callback `.then((client) => {...})`, aplicar el theme ANTES de `render(...)` — Important #10: rev.1 lo hacía en un `useEffect` de `Panel`, así que el launcher inicial (que se monta ANTES de que el usuario abra el panel por primera vez) nunca veía `primaryColor`/modo/posición del tenant. `App` todavía recibe `config` en este paso (Task 17 lo cambia a `client` completo para poder construir el `Transport`; ese cambio de firma y esta línea de `render` se tocan juntos ahí, no aquí):

```tsx
        .then((client) => {
          applyTheme(document.documentElement, client.getConfig().theme)
          const root = w.document.getElementById('root')
          if (root) render(<App config={client.getConfig()} bus={bus} />, root)
        })
```

- [ ] **Step 10: ejecutar la suite de shell y confirmar que sigue en verde**

Run: `cd packages/widget && npx vitest run src/shell/__tests__/shell.test.tsx`
Expected: PASS (6 tests) — `applyTheme` con el theme de `fixtureConfig()` (`{primaryColor:'#6d4aff', position:'right', mode:'auto'}`) no lanza; los imports de CSS bajo `/panel/` se procesan de verdad (Task 1 lo habilitó en `vitest.config.ts`) pero no afectan ninguna aserción del archivo, que solo mira `data-part`/mensajes postMessage.

- [ ] **Step 11: commit**

```bash
git add packages/widget/shell.html packages/widget/examples/README.md packages/widget/src/contract/normalize-welcome.ts packages/widget/src/contract/__tests__/normalize-welcome.test.ts packages/widget/src/shell/session.ts packages/widget/src/shell/main.tsx
git commit -m "feat(widget): CSP explícita, normalización de welcome en la frontera de red y theming antes del primer render (fix Critical #4/Important #10)"
```

---

### Task 16: Harness de fixtures visuales (los 10 estados) + pase de axe completo

Tarea propia, pedida explícitamente por la revisión ("harness de fixtures reales para los diez estados"). rev.1 solo cubría 8 de los 10 estados con axe (sin `rich`/`upload`, sustituidos por un mensaje fallido) y `CardCarousel`/`FileBubble` quedaban sin montar en ningún sitio verificable (Important #9). Esta tarea añade (a) un pase de axe automatizado sobre las 10 configuraciones reales de `Panel`, y (b) una página de desarrollo — dev-only, nunca se publica — que monta los mismos componentes REALES para revisión visual rápida, sirviendo también de evidencia para el informe con capturas del pipeline de Martín.

**Files:**
- Create: `packages/widget/src/panel/__tests__/a11y-fixtures.test.tsx`
- Modify: `packages/widget/package.json` (nueva devDependency `vitest-axe`, nuevo script `fixtures`)
- Create: `packages/widget/vite.fixtures.config.ts`
- Create: `packages/widget/examples/fixtures.html`
- Create: `packages/widget/examples/fixtures-main.tsx`
- Create: `packages/widget/examples/fixtures-app.tsx`

**Interfaces:**
- Consumes: `Panel`/`Launcher` (Task 13), `Header`/`ConnectionBanner`/`MessageList`/`Composer` (Tasks 6, 8, 9, 10 — usados directamente para componer los estados `rich`/`upload`, ver Important #8 ronda 2), `CardCarousel`/`FileBubble` (Task 11), `ResolvedCard` (Task 10, único sitio del repo donde se le pasa `onFeedback` — gap #5), `computeViewState` (Task 5), `createMessageStore` (Plan 2), `fixtureConfig` (Plan 1).
- Produces: nada consumido por otras tareas — es una hoja del árbol (verificación + herramienta de revisión).

- [ ] **Step 1: instalar vitest-axe**

Run: `npm install --workspace=@nevent/widget --save-dev vitest-axe`
Expected: `added N packages`.

- [ ] **Step 2: escribir el pase de axe sobre los 10 estados (falla primero)**

Crear `packages/widget/src/panel/__tests__/a11y-fixtures.test.tsx`. Important #8/#9 ronda 2: `rich`/`upload` YA NO se montan como `CardCarousel`/`FileBubble` aislados — se componen DENTRO de un panel completo (cabecera + ribbon + mensajes + composer, igual que el mock), reutilizando `Header`/`ConnectionBanner`/`MessageList`/`Composer` reales e inyectando la card/archivo vía el slot `trailing` de `MessageList` (Task 8) — el mismo mecanismo público que ya usa `Panel`, sin tocar su contrato. Y `expect.extend(toHaveNoViolations)` se llama explícitamente (rev.2 lo omitía, así que `.toHaveNoViolations()` no existía como matcher):

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { axe, toHaveNoViolations } from 'vitest-axe'
import { Panel } from '../Panel'
import { Launcher } from '../Launcher'
import { Header } from '../Header'
import { ConnectionBanner } from '../ConnectionBanner'
import { MessageList } from '../MessageList'
import { Composer } from '../Composer'
import { CardCarousel, type CardItem } from '../CardCarousel'
import { FileBubble } from '../FileBubble'
import { AgentJoinedSysline } from '../handoff'
import { computeViewState } from '../view-state'
import { createMessageStore, type MessageStore, type StoredMessage } from '../../store/message-store'
import { fixtureConfig } from '../../contract/fixtures'
import type { Transport } from '../../transport'
import { mount, cleanupMounted } from './test-utils'

expect.extend(toHaveNoViolations)

function fakeTransport(store: MessageStore): Transport {
  return { store, send: async () => {}, retry: async () => {}, cancel: () => {}, openChannel: () => {}, closeChannel: () => {}, destroy: () => {} }
}

async function mountPanel(configure: (store: MessageStore) => void): Promise<HTMLElement> {
  const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
  configure(store)
  return mount(
    <Panel config={fixtureConfig()} transport={fakeTransport(store)} onMinimize={() => {}} onClose={() => {}} onResize={() => {}}
      viewportKind="desktop" viewportHeight={900} />,
  )
}

function idleMsg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: '', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T14:00:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

const demoCards: CardItem[] = [
  { id: '1', title: 'Abono 3 días', description: 'Acceso general · vie–dom', priceLabel: '89 €', imageVariant: 'brand', action: { kind: 'send_message', label: 'Ver abono', text: 'x' } },
  { id: '2', title: 'Abono VIP', description: 'Front stage + zona lounge', priceLabel: '149 €', imageVariant: 'sun', action: { kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' } },
]

// Composición manual (mismas piezas que Panel.tsx ensambla internamente)
// para los dos estados presentacionales — Panel.tsx NO expone un slot para
// rich content en su contrato real (eso es Plan 4), así que aquí se
// construye la MISMA estructura a mano con los componentes reales.
async function mountRichPreview(): Promise<HTMLElement> {
  const config = fixtureConfig()
  const viewState = computeViewState({ conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, assistantName: config.assistantName, isStreaming: false })
  return mount(
    <section class="panel" role="dialog" aria-label="Vista previa: contenido rico">
      <Header viewState={viewState} onMinimize={() => {}} onClose={() => {}} />
      <ConnectionBanner kind={null} />
      <MessageList config={config} messages={[idleMsg({ text: '¡Hecho! El cambio de titular es gratuito. Y ya que estás, quedan pocas unidades 👇' })]}
        agentName={null} onRetry={() => {}} onQuickReply={() => {}} showWelcome={false}
        trailing={<CardCarousel items={demoCards} onAction={() => {}} />} />
      <Composer viewState={viewState} onSend={() => {}} onStop={() => {}} />
    </section>,
  )
}

async function mountUploadPreview(): Promise<HTMLElement> {
  const config = fixtureConfig()
  const viewState = computeViewState({ conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, assistantName: config.assistantName, isStreaming: false })
  return mount(
    <section class="panel" role="dialog" aria-label="Vista previa: subida de archivo">
      <Header viewState={viewState} onMinimize={() => {}} onClose={() => {}} />
      <ConnectionBanner kind={null} />
      <MessageList config={config} messages={[idleMsg({ role: 'user', text: 'Aquí tienes mi entrada' })]}
        agentName={null} onRetry={() => {}} onQuickReply={() => {}} showWelcome={false}
        trailing={<FileBubble fileName="entrada-demofest.pdf" fileSizeLabel="184 KB · subiendo…" progressPercent={64} variant="user" />} />
      <Composer viewState={viewState} onSend={() => {}} onStop={() => {}} />
    </section>,
  )
}

afterEach(cleanupMounted)

describe('a11y — los 10 estados del mock, componentes reales (Important #9)', () => {
  it('1. launcher (cerrado)', async () => {
    const root = await mount(<Launcher unreadCount={1} autofocus={false} onOpen={() => {}} onResize={() => {}} />)
    expect(await axe(root)).toHaveNoViolations()
  })

  it('2. welcome', async () => {
    const root = await mountPanel(() => {})
    expect(await axe(root)).toHaveNoViolations()
  })

  it('3. bot-streaming', async () => {
    const root = await mountPanel((store) => {
      store.addOptimistic('c1', 'Hola, ¿puedo cambiar el nombre de mi entrada?')
      store.beginBotTurn('t1')
      store.appendBotDelta('t1', 'Sí 🙌 Puedes cambiarlo hasta 48h antes.')
    })
    expect(await axe(root)).toHaveNoViolations()
  })

  it('4. rich — compuesto dentro de un panel completo (Important #8 ronda 2), no un CardCarousel aislado', async () => {
    const root = await mountRichPreview()
    expect(await axe(root)).toHaveNoViolations()
  })

  it('5. upload — compuesto dentro de un panel completo, no un FileBubble aislado', async () => {
    const root = await mountUploadPreview()
    expect(await axe(root)).toHaveNoViolations()
  })

  it('6. waiting', async () => {
    const root = await mountPanel((store) => {
      store.applySnapshot({
        messages: [{ messageId: 'm1', role: 'user', text: 'Mi caso es raro', createdAt: '2026-07-18T14:06:00.000Z' }],
        state: 'ESCALATED_WAITING', snapshotCursor: 'evt_v1_demo_1',
      })
    })
    expect(await axe(root)).toHaveNoViolations()
  })

  it('7. agent (con typing)', async () => {
    const root = await mountPanel((store) => {
      store.applySnapshot({ messages: [], state: 'AGENT_ACTIVE', snapshotCursor: 'evt_v1_demo_1' })
      store.applyDurableEvent({
        eventId: 'evt_v1_demo_2', schemaVersion: 1, conversationId: 'demo', occurredAt: '2026-07-18T14:09:00.000Z',
        type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null },
      })
      store.setAgentTyping(true)
    })
    expect(await axe(root)).toHaveNoViolations()
  })

  it('8. reconnect (con mensaje fallido + Reintentar)', async () => {
    const root = await mountPanel((store) => {
      store.addOptimistic('c1', '¿Sigues ahí?')
      store.failOptimistic('c1')
      store.setConnection('reconnecting')
    })
    expect(await axe(root)).toHaveNoViolations()
  })

  it('9. offline', async () => {
    const root = await mountPanel((store) => { store.setConnection('offline') })
    expect(await axe(root)).toHaveNoViolations()
  })

  it('10. resolved', async () => {
    const root = await mountPanel((store) => {
      store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_1' })
    })
    expect(await axe(root)).toHaveNoViolations()
  })

  it('11. AgentJoinedSysline — Important (ronda 3): el componente vive SOLO aquí (harness) y en su test unitario aislado (Task 10), NUNCA dentro del Panel integrado (gap #4 revertido) — se monta de verdad, no solo se afirma en el Self-Review', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" />)
    expect(await axe(root)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: ejecutar y confirmar que pasa (o corregir violaciones reales)**

Run: `cd packages/widget && npx vitest run src/panel/__tests__/a11y-fixtures.test.tsx`
Expected: PASS (11 tests). Si axe reporta una violación real, se corrige en el componente señalado por el `id` de la regla — nunca se silencia con `axe(root, { rules: {...} })` sin justificar por qué esa regla concreta no aplica.

- [ ] **Step 4: crear la página de desarrollo del harness (dev-only, nunca se publica)**

Crear `packages/widget/vite.fixtures.config.ts` — config de Vite separada de `vite.config.ts` (el build real del shell) para que `examples/fixtures.html` no acabe nunca en `dist/` ni en el paquete npm:

```ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

// Config dedicada al harness de fixtures (Task 16) — SOLO para `npm run
// fixtures` en local, nunca se ejecuta en CI ni se publica. Separada de
// vite.config.ts para que este HTML jamás acabe en dist/.
export default defineConfig({
  plugins: [preact()],
  root: resolve(__dirname, 'examples'),
  server: { port: 4311 },
})
```

Crear `packages/widget/examples/fixtures.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Harness de fixtures — @nevent/widget</title></head>
<body><div id="fixtures-root"></div><script type="module" src="./fixtures-main.tsx"></script></body>
</html>
```

Crear `packages/widget/examples/fixtures-main.tsx` — importa las fuentes `@fontsource` (Important #8 ronda 2: rev.2 no las traía, así que las capturas del harness no representaban la tipografía final):

```tsx
import { render } from 'preact'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../src/panel/tokens.css'
import '../src/panel/panel.css'
import { FixturesApp } from './fixtures-app'

const root = document.getElementById('fixtures-root')
if (root) render(<FixturesApp />, root)
```

Crear `packages/widget/examples/fixtures-app.tsx` — monta los mismos componentes reales que el test de axe (Step 2), con un selector de los 10 estados; `rich`/`upload` se componen dentro de un panel completo (Header+ConnectionBanner+MessageList+Composer, igual que el test), no como componentes aislados. Añade una sección aparte para lo que queda fuera del set de 10: el ÚNICO sitio del repo donde `ResolvedCard` recibe `onFeedback` (el panel integrado nunca lo hace, gap #5):

```tsx
import { useState } from 'preact/hooks'
import { Panel } from '../src/panel/Panel'
import { Launcher } from '../src/panel/Launcher'
import { Header } from '../src/panel/Header'
import { ConnectionBanner } from '../src/panel/ConnectionBanner'
import { MessageList } from '../src/panel/MessageList'
import { Composer } from '../src/panel/Composer'
import { CardCarousel, type CardItem } from '../src/panel/CardCarousel'
import { FileBubble } from '../src/panel/FileBubble'
import { ResolvedCard, AgentJoinedSysline } from '../src/panel/handoff'
import { computeViewState } from '../src/panel/view-state'
import { createMessageStore, type MessageStore, type StoredMessage } from '../src/store/message-store'
import { fixtureConfig } from '../src/contract/fixtures'
import type { Transport } from '../src/transport'

const STATES = [
  ['launcher', 'Burbuja (cerrado)'],
  ['welcome', 'Bienvenida'],
  ['bot-streaming', 'Bot respondiendo'],
  ['rich', 'Contenido rico'],
  ['upload', 'Subida de archivo'],
  ['waiting', 'Escalado · esperando'],
  ['agent', 'Agente activo'],
  ['reconnect', 'Reconectando'],
  ['offline', 'Sin conexión'],
  ['resolved', 'Resuelto'],
] as const

function fakeTransport(configure: (store: MessageStore) => void): Transport {
  const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
  configure(store)
  return { store, send: async () => {}, retry: async () => {}, cancel: () => {}, openChannel: () => {}, closeChannel: () => {}, destroy: () => {} }
}

function buildTransport(state: string): Transport {
  if (state === 'bot-streaming') {
    return fakeTransport((store) => {
      store.addOptimistic('c1', 'Hola, ¿puedo cambiar el nombre de mi entrada?')
      store.beginBotTurn('t1')
      store.appendBotDelta('t1', 'Sí 🙌 Puedes cambiarlo hasta 48h antes. Te explico cómo:')
    })
  }
  if (state === 'waiting') {
    return fakeTransport((store) => {
      store.applySnapshot({
        messages: [{ messageId: 'm1', role: 'user', text: 'Mi caso es raro: lo compré con el DNI antiguo', createdAt: '2026-07-18T14:06:00.000Z' }],
        state: 'ESCALATED_WAITING', snapshotCursor: 'evt_v1_demo_1',
      })
    })
  }
  if (state === 'agent') {
    return fakeTransport((store) => {
      store.applySnapshot({
        messages: [{ messageId: 'm1', role: 'user', text: 'Necesito ayuda con mi entrada', createdAt: '2026-07-18T14:06:00.000Z' }],
        state: 'AGENT_ACTIVE', snapshotCursor: 'evt_v1_demo_1',
      })
      store.applyDurableEvent({
        eventId: 'evt_v1_demo_2', schemaVersion: 1, conversationId: 'demo', occurredAt: '2026-07-18T14:09:00.000Z',
        type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null },
      })
      store.setAgentTyping(true)
    })
  }
  if (state === 'reconnect') {
    return fakeTransport((store) => {
      store.addOptimistic('c1', '¿Sigues ahí? Se me ha cortado el wifi del festival')
      store.failOptimistic('c1')
      store.setConnection('reconnecting')
    })
  }
  if (state === 'offline') return fakeTransport((store) => { store.setConnection('offline') })
  if (state === 'resolved') return fakeTransport((store) => { store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_1' }) })
  return fakeTransport(() => {})
}

const demoCards: CardItem[] = [
  { id: '1', title: 'Abono 3 días', description: 'Acceso general · vie–dom', priceLabel: '89 €', imageVariant: 'brand', action: { kind: 'send_message', label: 'Ver abono', text: 'demo' } },
  { id: '2', title: 'Abono VIP', description: 'Front stage + zona lounge', priceLabel: '149 €', imageVariant: 'sun', action: { kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' } },
]

function idleMsg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: '', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T14:00:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

// Composición manual (mismas piezas que Panel.tsx ensambla internamente,
// Important #8 ronda 2) — Panel.tsx no expone un slot de rich content en su
// contrato real (eso es Plan 4), así que rich/upload se arman a mano aquí
// con los componentes reales, dentro de un panel completo, no sueltos.
function RichPreview() {
  const config = fixtureConfig()
  const viewState = computeViewState({ conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, assistantName: config.assistantName, isStreaming: false })
  return (
    <section class="panel" role="dialog" aria-label="Vista previa: contenido rico">
      <Header viewState={viewState} onMinimize={() => {}} onClose={() => {}} />
      <ConnectionBanner kind={null} />
      <MessageList config={config} messages={[idleMsg({ text: '¡Hecho! El cambio de titular es gratuito. Y ya que estás, quedan pocas unidades 👇' })]}
        agentName={null} onRetry={() => {}} onQuickReply={() => {}} showWelcome={false}
        trailing={<CardCarousel items={demoCards} onAction={() => {}} />} />
      <Composer viewState={viewState} onSend={() => {}} onStop={() => {}} />
    </section>
  )
}

function UploadPreview() {
  const config = fixtureConfig()
  const viewState = computeViewState({ conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, assistantName: config.assistantName, isStreaming: false })
  return (
    <section class="panel" role="dialog" aria-label="Vista previa: subida de archivo">
      <Header viewState={viewState} onMinimize={() => {}} onClose={() => {}} />
      <ConnectionBanner kind={null} />
      <MessageList config={config} messages={[idleMsg({ role: 'user', text: 'Aquí tienes mi entrada' })]}
        agentName={null} onRetry={() => {}} onQuickReply={() => {}} showWelcome={false}
        trailing={<FileBubble fileName="entrada-demofest.pdf" fileSizeLabel="184 KB · subiendo…" progressPercent={64} variant="user" />} />
      <Composer viewState={viewState} onSend={() => {}} onStop={() => {}} />
    </section>
  )
}

export function FixturesApp() {
  const [state, setState] = useState<string>('welcome')
  return (
    <div style={{ display: 'flex', gap: '32px', padding: '24px', fontFamily: 'sans-serif', alignItems: 'flex-start' }}>
      <aside>
        <h1>Harness de fixtures — @nevent/widget</h1>
        <p style={{ maxWidth: '260px', fontSize: '13px', color: '#555' }}>
          Los 10 estados del mock, montados con los componentes REALES (Tasks 1-14).
          No sustituye la verificación manual contra el nev-api real (Task 17) —
          es para revisión visual rápida y evidencia del pase de axe (Step 2/3).
        </p>
        {STATES.map(([id, label]) => (
          <label key={id} style={{ display: 'block', margin: '4px 0' }}>
            <input type="radio" name="state" checked={state === id} onChange={() => setState(id)} /> {label}
          </label>
        ))}
      </aside>
      <main style={{ position: 'relative', width: '440px', height: '700px', border: '1px dashed #ccc' }}>
        {state === 'launcher' && <Launcher unreadCount={2} autofocus={false} onOpen={() => {}} onResize={() => {}} />}
        {state === 'rich' && <RichPreview />}
        {state === 'upload' && <UploadPreview />}
        {state !== 'launcher' && state !== 'rich' && state !== 'upload' && (
          <Panel config={fixtureConfig()} transport={buildTransport(state)} onMinimize={() => {}} onClose={() => {}} onResize={() => {}}
            viewportKind="desktop" viewportHeight={900} />
        )}
      </main>
      <section style={{ maxWidth: '320px' }}>
        <h2>Fuera del set de 10 estados</h2>
        <p style={{ fontSize: '13px', color: '#555' }}>
          El feedback de ResolvedCard SOLO existe aquí: el panel integrado no
          le pasa <code>onFeedback</code> (gap #5) porque no hay
          `transport.feedback()` real que lo persista.
        </p>
        <h3>resolved + feedback (demo, no en producción)</h3>
        <ResolvedCard agentName="Laura" onFeedback={(v) => console.log('feedback demo:', v)} />
        <p style={{ fontSize: '13px', color: '#555', marginTop: '16px' }}>
          AgentJoinedSysline (gap #4 revertido, Important ronda 3): el
          componente sigue existiendo para paridad visual con el mock, pero
          el Panel integrado NUNCA lo intercala en el hilo — la presencia del
          agente se comunica solo con el cambio de cabecera (ver el estado
          "Agente activo"). Se monta aquí de verdad, no solo se afirma.
        </p>
        <h3>AgentJoinedSysline (harness-only, demo)</h3>
        <AgentJoinedSysline agentName="Laura" />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: añadir el script de conveniencia**

Editar `packages/widget/package.json`, dentro de `"scripts"`:

```json
    "fixtures": "vite --config vite.fixtures.config.ts"
```

- [ ] **Step 6: verificación manual del harness**

Run: `cd packages/widget && npm run fixtures`
Expected: servidor de desarrollo en `http://localhost:4311`. Abrir en el navegador, recorrer los 10 estados con el selector y confirmar visualmente que cada uno coincide con el mock aprobado (`docs/mocks/widget-v1-mock.html`) en luz/oscuro (alternar `prefers-color-scheme` desde DevTools, no hay botón de tema en el harness — usa el theme real de `fixtureConfig()`, modo `auto`). Confirmar también, en la sección "Fuera del set de 10 estados", que `AgentJoinedSysline` se ve renderizada de verdad (Important, ronda 3) — no solo el feedback de `ResolvedCard`.

- [ ] **Step 7: commit**

```bash
git add packages/widget/package.json package-lock.json packages/widget/vite.fixtures.config.ts packages/widget/examples/fixtures.html packages/widget/examples/fixtures-main.tsx packages/widget/examples/fixtures-app.tsx packages/widget/src/panel/__tests__/a11y-fixtures.test.tsx
git commit -m "test(widget): harness de fixtures visuales y pase de axe sobre los 10 estados reales + AgentJoinedSysline montado de verdad (fix Important #9, Important #8 ronda 3)"
```

---

### Task 17: Integración final — `App`/`main.tsx` y verificación contra el nev-api local real

**Files:**
- Modify: `packages/widget/src/shell/app.tsx` (reemplaza el placeholder por el ensamblado real — `App` pasa a recibir el `SessionClient` completo, no solo su config resuelta)
- Modify: `packages/widget/src/shell/main.tsx` (`render(<App .../>)` pasa a `client`, no `config`; `startShell` gana el latch de `viewport` — Critical, ronda 3, ver Step 2)
- Modify: `packages/widget/src/shell/__tests__/shell.test.tsx` (verificación de regresión — ver Step 3)
- No se modifica `packages/widget/examples/mock-api.mjs`: Important #12 de la revisión bajó su alcance a "solo fixtures offline" — sirve config/sesión (lo que ya hace bien: el loader lo usa para verificar su propio handshake de arranque en aislamiento), pero NUNCA emula streaming SSE real, así que no es la vía de verificación de mensajería — esa es el nev-api local (Step 5).

**Interfaces:**
- Consumes: TODO lo de Tasks 1-16.
- Produces: el widget completo, integrado y verificable en un navegador real contra un backend real.

- [ ] **Step 1: reescribir app.tsx — latch de viewport (Critical, ronda 3)**

`createTransport` (Plan 2) necesita el `SessionClient` completo (`authorizedFetch`), no solo el `WidgetConfig` que `main.tsx` extraía hasta ahora. `App` ahora también recibe el mensaje `viewport` del loader (Task 12) — es la ÚNICA fuente de `viewportKind`/`viewportHeight` que llega a `Panel` (Task 13); el shell nunca evalúa `matchMedia` por sí mismo (fix del bucle 104×104, Critical ronda 2).

**El viewport inicial se perdía durante el bootstrap asíncrono (Critical, ronda 3).** El loader envía `init` y `viewport` seguidos (Task 12); el shell fija `parent`, arranca `createClient()` (fetch de red, async) y, mientras espera, `viewport` llega con el bus SIN NINGÚN suscriptor todavía — `App` ni siquiera existe como VNode, así que `bus.onCommand(cb)` no se ha llamado nunca y el mensaje se perdía sin más. Cuando `createClient()` por fin resolvía y `App` montaba, arrancaba con el fallback `{kind:'desktop', height:0}` inventado — si el host no volvía a cambiar de breakpoint ni de `VisualViewport`, ese fallback quedaba para siempre y un visitante en móvil recibía layout y autofocus de desktop.

**Solución — latch síncrono en `main.tsx` (Step 2) + `useState` con inicializador perezoso aquí.** `startShell` retiene el ÚLTIMO `viewport` recibido en una variable de closure, exista o no un suscriptor (`ShellBus.getLatchedViewport()`, síncrono, nunca una promesa). `App` lee ese valor en el inicializador de `useState`, que Preact ejecuta síncronamente en el PRIMER render — sin ningún render extra ni parpadeo, y sin ninguna carrera: para cuando `App` existe, `createClient()` ya resolvió, así que cualquier `viewport` que haya llegado durante la espera (uno o varios) ya está latcheado y el último gana.

Editar `packages/widget/src/shell/app.tsx` — reemplazo completo del archivo:

```tsx
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { WidgetConfig } from '../contract/types'
import type { SessionClient } from './session'
import { createTransport } from '../transport'
import { useStoreState } from '../panel/use-store'
import { useUnreadCount } from '../panel/use-unread-count'
import { Panel } from '../panel/Panel'
import { Launcher } from '../panel/Launcher'

interface ViewportState {
  kind: 'mobile' | 'desktop'
  height: number
}

export interface ShellBus {
  onCommand(cb: (type: string, payload: unknown) => void): void
  emit(type: string, payload?: unknown): void
  // Último mensaje `viewport` recibido, RETENIDO por main.tsx (Step 2)
  // incluso si nadie estaba escuchando todavía — nunca una promesa: App lo
  // lee de forma síncrona en su useState perezoso (Critical, ronda 3).
  getLatchedViewport(): ViewportState | null
}

export function App({ client, bus }: { client: SessionClient; bus: ShellBus }) {
  const config: WidgetConfig = client.getConfig()
  const [isOpen, setOpen] = useState(false)
  // Inicializador perezoso: se ejecuta UNA vez, síncronamente, en el primer
  // render — nunca un valor inventado si el loader ya reportó el viewport
  // real mientras createClient() seguía pendiente (Critical, ronda 3).
  const [viewport, setViewport] = useState<ViewportState>(() => bus.getLatchedViewport() ?? { kind: 'desktop', height: 0 })
  const openedBeforeRef = useRef(false)
  const transport = useMemo(() => createTransport(client), [client])
  const storeState = useStoreState(transport.store)
  const unread = useUnreadCount(storeState, isOpen)

  useEffect(() => {
    bus.onCommand((type, payload) => {
      if (type === 'open') setOpen(true)
      else if (type === 'close') setOpen(false)
      else if (type === 'toggle') setOpen((v) => !v)
      else if (type === 'viewport') {
        // Mensaje del loader (Task 12) — única fuente de "¿es móvil?": el
        // shell NUNCA llama a matchMedia contra su propio iframe (Critical
        // ronda 2: eso producía el bucle 104×104 en desktop). El latch
        // (arriba) ya cubrió el mensaje inicial recibido antes de este
        // efecto; a partir de aquí, cada `viewport` NUEVO sigue este camino.
        const p = payload as { kind?: unknown; height?: unknown } | null
        if (p?.kind === 'mobile' || p?.kind === 'desktop') {
          setViewport({ kind: p.kind, height: typeof p.height === 'number' ? p.height : 0 })
        }
      }
    })
  }, [bus])

  useEffect(() => {
    bus.emit(isOpen ? 'opened' : 'closed')
  }, [isOpen, bus])

  useEffect(() => {
    // D7 (spec, decisión #7): el canal de eventos vive solo con el panel
    // abierto — se cierra al cerrarlo, nunca queda en background.
    if (isOpen) transport.openChannel()
    else transport.closeChannel()
  }, [isOpen, transport])

  useEffect(() => () => transport.destroy(), [transport])

  const close = (): void => { openedBeforeRef.current = true; setOpen(false) }
  // position viaja en CADA resize — el loader (Task 12) lo usa para anclar
  // el contenedor a la esquina correcta. viewportKind viaja también (Critical
  // ronda 3, Task 12): el shell es quien sabe su propio viewport ya latcheado
  // — el loader lo usa para no confundir un resize del panel fullscreen móvil
  // con uno del panel real de escritorio.
  const onResize = (width: number, height: number): void =>
    bus.emit('resize', { width, height, position: config.theme.position === 'left' ? 'left' : 'right', viewportKind: viewport.kind })

  return (
    <div data-part="root" data-mode={isOpen ? 'panel' : 'launcher'} data-viewport={viewport.kind}>
      {isOpen ? (
        <Panel config={config} transport={transport} onMinimize={close} onClose={close} onResize={onResize}
          viewportKind={viewport.kind} viewportHeight={viewport.height} />
      ) : (
        <Launcher unreadCount={unread} autofocus={openedBeforeRef.current} onOpen={() => setOpen(true)} onResize={onResize} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: reescribir main.tsx — retener el viewport en un latch síncrono**

`startShell` ya guardaba `commandCb` en una variable de closure; se añade una segunda, `latchedViewport`, actualizada DIRECTAMENTE en el listener de `message` (nunca a través de `commandCb`, que puede seguir siendo `null`) cada vez que llega un `viewport` válido del parent ya vinculado. Editar `packages/widget/src/shell/main.tsx` — reemplazo completo de `startShell` y de su bloque de imports (el resto del archivo — imports de CSS/fuentes ya presentes desde antes de Task 15, y el auto-arranque final — no cambia). **Nota de autoconsistencia (self-check): `import { applyTheme } from '../panel/theme'` lo añadió Task 15 — se repite aquí explícitamente en vez de asumirlo implícito, porque el bloque de imports de abajo SÍ se muestra completo y omitirlo sería justo el tipo de "import que falta" que la ronda 3 encontró en `shell.test.tsx`:**

```tsx
import { render } from 'preact'
import { App, type ShellBus } from './app'
import { open as openEnvelope, seal, isCommand, LOADER_TO_SHELL } from '../protocol/envelope'
import { createSessionClient as realCreateSessionClient } from './session'
import { applyTheme } from '../panel/theme'

interface ShellOptions {
  apiBase: string
  createClient?: typeof realCreateSessionClient
}

interface ViewportPayload { kind: 'mobile' | 'desktop'; height: number }

export function startShell(w: Window, opts: ShellOptions): void {
  const instanceId = w.location.hash.slice(1)
  const createClient = opts.createClient ?? realCreateSessionClient
  let parent: { post: (env: unknown) => void; origin: string; source: Window } | null = null
  let commandCb: ((type: string, payload: unknown) => void) | null = null
  let latchedViewport: ViewportPayload | null = null

  const bus: ShellBus = {
    onCommand: (cb) => { commandCb = cb },
    emit: (type, payload = null) => parent?.post(seal(type, payload, instanceId)),
    getLatchedViewport: () => latchedViewport,
  }

  w.addEventListener('message', (ev: MessageEvent) => {
    const env = openEnvelope(ev.data, { instanceId })
    if (!env || !isCommand(env.type, LOADER_TO_SHELL)) return
    if (env.type === 'init') {
      if (parent) return
      const source = ev.source as Window | null
      if (!source) return
      const payload = env.payload as Record<string, unknown> | null | undefined
      const installationId = payload?.['installationId']
      // Validar ANTES de fijar `parent`: un init con envelope válido pero
      // payload basura no debe comprometer el guard `if (parent) return` de
      // arriba, o un init real posterior del anfitrión quedaría bloqueado
      // para siempre (brick/DoS).
      if (typeof installationId !== 'string' || installationId.length === 0) return
      const origin = ev.origin // SIEMPRE del evento, nunca del payload (spec §4.1)
      parent = { post: (e) => source.postMessage(e, origin), origin, source }
      void createClient({ apiBase: opts.apiBase, installationId, embeddingOrigin: origin })
        .then((client) => {
          applyTheme(document.documentElement, client.getConfig().theme)
          const root = w.document.getElementById('root')
          if (root) render(<App client={client} bus={bus} />, root)
        })
        .catch((err: unknown) => {
          console.error('[nevent-widget] fallo al arrancar la sesión', err)
        })
      return
    }
    // Comandos post-init: exigir el MISMO source y el MISMO origin que el
    // parent vinculado en init (spec §3.3), igual que hace el loader con el
    // shell. El instanceId no es secreto (va en el hash del src del iframe,
    // legible por cualquier script co-residente en la página), así que sin
    // esta comprobación cualquier tercero en la página podría pilotar el
    // widget suplantando al anfitrión real.
    if (!parent || ev.source !== parent.source || ev.origin !== parent.origin) return
    // Retener el ÚLTIMO viewport SIEMPRE, exista o no ya un App montado
    // escuchando (commandCb puede seguir siendo null: createClient() es
    // async). Sin este latch, un viewport que llega durante esa espera se
    // pierde y App monta con el fallback {kind:'desktop', height:0} inventado
    // — en móvil, sin otro cambio de breakpoint ni de VisualViewport, nunca
    // se corrige (Critical, ronda 3).
    if (env.type === 'viewport') {
      const p = env.payload as { kind?: unknown; height?: unknown } | null
      if (p?.kind === 'mobile' || p?.kind === 'desktop') {
        latchedViewport = { kind: p.kind, height: typeof p.height === 'number' ? p.height : 0 }
      }
    }
    commandCb?.(env.type, env.payload)
  })

  // anunciar disponibilidad al parent (targetOrigin '*' SOLO para el ready:
  // aún no conocemos el origin del anfitrión y el envelope no lleva secretos)
  w.parent.postMessage(seal('ready', null, instanceId), '*')
}
```

(El bloque de auto-arranque final del archivo real —`declare const process`, el guard `isVitest`, la llamada a `startShell` cuando `#root` existe— no se muestra aquí porque no cambia; sigue tal cual Plan 1 lo dejó, DEBAJO de `startShell`.)

- [ ] **Step 3: desmontar Preact de verdad entre tests en shell.test.tsx (Important #11, ronda 2) + test del latch (Critical, ronda 3)**

`App` ahora llama a `transport.openChannel()` en cuanto `isOpen` pasa a `true`, arrancando el loop async de `EventsChannel` (Plan 2). El archivo hacía `document.body.innerHTML = '<div id="root"></div>'` en `beforeEach` SIN desmontar el árbol de Preact del test anterior (nunca se llamaba `render(null, root)`) — Preact nunca ejecutaba los cleanups de esos `useEffect` (incluido `transport.destroy()`), así que el loop del canal de un test podía seguir vivo durante el siguiente. Se corrige con un `afterEach` que desmonta de verdad.

Editar `packages/widget/src/shell/__tests__/shell.test.tsx`. El import existente es `import { describe, it, expect, vi, beforeEach } from 'vitest'` — **Important (ronda 3): el `afterEach` de más abajo no sirve de nada si no se añade también a este import** (rev.3 lo omitió). Sustituirlo por:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
```

Y sustituir el `beforeEach` (única función tocada, más un `afterEach` nuevo):

```ts
let currentRoot: HTMLElement

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  currentRoot = document.getElementById('root')!
  window.location.hash = '#nevw_test1'
})

afterEach(() => {
  render(null, currentRoot) // desmonta de verdad: ejecuta los cleanups de useEffect (incl. transport.destroy())
})
```

Añadir el test del latch (Critical, ronda 3), dentro del `describe('shell', ...)` existente, junto a los 6 tests que ya pasan:

```ts
  it('Critical (latch) — un viewport que llega DURANTE el createClient() async se retiene y App monta con el ÚLTIMO valor recibido, nunca con el fallback desktop inventado', async () => {
    let resolveClient!: (c: SessionClient) => void
    const createClient = vi.fn(() => new Promise<SessionClient>((resolve) => { resolveClient = resolve }))
    const parentPost = vi.fn()
    const parentSource = makeParentSource(parentPost)
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', parentSource)
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))

    // Dos viewport llegan MIENTRAS createClient() sigue pendiente — la
    // ventana de carrera exacta que perdía el mensaje: el bus no tiene NINGÚN
    // suscriptor todavía (App ni siquiera existe como VNode).
    window.dispatchEvent(new MessageEvent('message', {
      data: seal('viewport', { kind: 'desktop', height: 700 }, 'nevw_test1'), origin: PARENT_ORIGIN, source: parentSource,
    }))
    window.dispatchEvent(new MessageEvent('message', {
      data: seal('viewport', { kind: 'mobile', height: 640 }, 'nevw_test1'), origin: PARENT_ORIGIN, source: parentSource,
    }))

    resolveClient(fakeClient())
    await vi.waitFor(() => expect(document.querySelector('[data-part=root]')).not.toBeNull())
    // data-viewport refleja el ÚLTIMO mensaje latcheado (mobile), no el
    // fallback {kind:'desktop', height:0} inventado ni el primero de los dos.
    expect(document.querySelector('[data-part=root]')?.getAttribute('data-viewport')).toBe('mobile')
  })
```

Run: `cd packages/widget && npx vitest run src/shell/__tests__/shell.test.tsx`
Expected: PASS (7 tests — los 6 preexistentes + el test del latch), salida limpia sin warnings de timers/promesas colgando.

- [ ] **Step 4: verificar la suite completa del paquete y los tipos**

Run: `cd packages/widget && npx vitest run`
Expected: PASS en todos los archivos (Plan 1/2 preexistentes + Tasks 1-16 de este plan).

Run: `cd packages/widget && npx tsc --noEmit`
Expected: sin errores. **Critical (exactOptionalPropertyTypes), ronda 2:** este plan auditó cada asignación de una prop opcional (`?:`) en todo el árbol de tareas buscando el mismo patrón que rompía `session.ts` (Task 15) — ninguna otra tarea construye un objeto literal asignando `undefined` explícito a una clave opcional (`ResolvedCard`/`MessageList` omiten la prop entera vía JSX cuando no aplica, que bajo `exactOptionalPropertyTypes` es siempre válido — la clave sencillamente no existe en el objeto de props resultante). Si `tsc` encuentra un caso nuevo aquí, aplicar el mismo patrón de spread condicional que `normalize-welcome`/`session.ts` (Task 15).

- [ ] **Step 5: build + verificación manual contra el nev-api local real**

El plano de conversación (bootstrap, mensajería, streaming, canal de eventos, handoff) tiene un smoke real ejecutado sobre nev-api rama `feat/widget-channel` (evidencia: `nev-api-worktrees/widget-channel/.superpowers/sdd/p2/suite-smoke-report.md`) — **estado real: PARTIAL, no un PASS limpio** (Important #11/#12 ronda 2: no citarlo como "9/9 sin matices"). El informe encontró y documentó tres cosas que hace falta saber ANTES de intentarlo:

1. **Bug real de arranque, ya corregido en `fbbeb82b2`** (posterior al smoke): `WidgetEventStreamService`/`WidgetTurnStreamController` pedían un bean con `@Qualifier("applicationTaskExecutor")` que ningún `AsyncConfig` registraba — la rama no arrancaba en NINGÚN entorno hasta ese commit (que añade el bean `widgetStreamExecutor` y valores locales por defecto para `widget.cors.shell-origins`). **Requisito: usar `feat/widget-channel` en `fbbeb82b2` o posterior.** Si por lo que sea se trabaja contra un commit anterior, el arranque falla con `UnsatisfiedDependencyException` y hace falta el bean temporal que documenta el propio informe del smoke (no reproducido aquí — leer el informe si ese caso llega a darse).
2. **Una base Mongo vacía no arranca la app en absoluto** (no es específico del widget): `ShopifyIntegration`/`OneboxIntegration`/etc. (`BaseProviderIntegration`) hacen `providerService.getIntegrationProvider(code).orElseThrow(...)` en el arranque del contexto — sin esos documentos en la colección `providers`, el boot entero falla antes de llegar al widget. **Sembrar los 10 primero** — la lista y los `type` exactos vienen de `ProviderService.FIRST_PARTY_INTEGRATIONS` en `nev-api` (leído directamente del código, no inferido — **Critical, ronda 3**: rev.3 usaba 9 providers con `type` inventados, literalmente el propio `code` en mayúsculas, p.ej. `{code:"shopify", type:"SHOPIFY"}`; la clase real define 10, con solo tres valores de `type`, y ninguno coincide con esos códigos):

   | `code` | `type` |
   |---|---|
   | `enterticket` | `TICKETING` |
   | `fourvenues` | `TICKETING` |
   | `dice` | `TICKETING` |
   | `onebox` | `TICKETING` |
   | `xceed` | `TICKETING` |
   | `fever` | `TICKETING` |
   | `covermanager` | `TICKETING` |
   | `shopify` | `ECOMMERCE` |
   | `shopify2` | `ECOMMERCE` |
   | `casfid` | `CASHLESS` |
3. **El Mongo local estándar no es replica set** — el código transaccional del widget lo necesita. El intento obvio (`-p 27027:27017`, puerto interno/externo distintos) **falla**: el host anunciado por el miembro del replica set debe resolver también DESDE DENTRO del contenedor, así que puerto interno y externo tienen que coincidir.

```bash
cd packages/widget
npm run build
```

Levantar nev-api en local — secuencia exacta que SÍ funcionó en el smoke (puerto interno = externo, `rs.initiate` con el host explícito, no un `rs.initiate()` a secas):

```bash
docker run --rm -d --name widget-verify-mongo -p 27027:27027 mongo:7 --replSet rs0 --port 27027 --bind_ip_all
sleep 3
mongosh --port 27027 --eval 'rs.initiate({_id:"rs0", members:[{_id:0, host:"localhost:27027"}]})'
```

Sembrar los 10 providers de primera parte (doc mínimo `{name, code, type}` por cada uno, `type` exacto según la tabla de arriba) y la instalación de prueba en `widget_installations` con **`publicId: "inst_demo_festival_01"`** — **Critical, ronda 3**: rev.3 sembraba `inst_verify_01`, pero `examples/host-demo.html` (que este mismo Step usa "sin cambios de contenido", más abajo) llama a `boot('inst_demo_festival_01')` — con `inst_verify_01` el primer `GET /config` del handshake da 404 antes de llegar a probar nada del widget. `tenantId` con forma de ObjectId (no hace falta sembrar tier/subscription, `TierAuthorizationService.hasCapability` falla abierto a `true` sin datos de plan), en la MISMA base Mongo desechable:

```bash
mongosh --port 27027 nevent_widget_verify --eval '
db.providers.insertMany([
  {name:"Enterticket", code:"enterticket", type:"TICKETING"},
  {name:"Fourvenues", code:"fourvenues", type:"TICKETING"},
  {name:"Dice", code:"dice", type:"TICKETING"},
  {name:"Onebox", code:"onebox", type:"TICKETING"},
  {name:"Xceed", code:"xceed", type:"TICKETING"},
  {name:"Fever", code:"fever", type:"TICKETING"},
  {name:"Covermanager", code:"covermanager", type:"TICKETING"},
  {name:"Shopify", code:"shopify", type:"ECOMMERCE"},
  {name:"Shopify2", code:"shopify2", type:"ECOMMERCE"},
  {name:"Casfid", code:"casfid", type:"CASHLESS"},
]);
db.widget_installations.insertOne({
  publicId: "inst_demo_festival_01",
  tenantId: "656565656565656565656565",
  allowedOrigins: ["http://localhost:5500"],
});
'
```

Puerto 8080 suele estar ocupado por el `bootRun` de otro worktree — usar 18080, como en el smoke:

```bash
./gradlew bootRun --args='--spring.profiles.active=local --widget.ai.fake=true \
  --spring.data.redis.enabled=true --server.port=18080 \
  --spring.mongodb.uri=mongodb://localhost:27027/?replicaSet=rs0 \
  --spring.mongodb.database=nevent_widget_verify \
  --widget.cors.shell-origins=http://localhost:5500'
```

(`spring.mongodb.uri`, no `spring.data.mongodb.uri` — esa segunda clave solo existe en `application-test.properties` y no la lee el bean real. `widget.cors.shell-origins` puede que YA tenga un valor local por defecto desde `fbbeb82b2` — pasarlo explícito de todos modos es inofensivo y no depende de esa suposición.)

Al terminar: `docker stop widget-verify-mongo` (lleva `--rm`, se autoelimina); NO tocar los contenedores `mongo`/`redis` persistentes del resto del entorno local.

Editar `packages/widget/dist/shell.html` (build output, nunca el `shell.html` fuente) para apuntar al nev-api local — misma mecánica que `examples/README.md` ya documenta para `nevw-api`, extendida a la CSP (Task 15, Step 2):
- `<meta name="nevw-api" content="http://localhost:18080">`
- CSP: `connect-src 'self' http://localhost:18080`

Servir `dist/` y `examples/host-demo.html` (sin cambios de contenido, ver Plan 1) desde `http://localhost:5500` (o el puerto que se use — debe coincidir con `widget.cors.shell-origins` y con `allowedOrigins` del doc de instalación sembrado arriba), y abrir `host-demo.html` en el navegador. Pasos de verificación manual (documentar el resultado real de cada uno, con capturas — norma del pipeline de Martín — antes de dar la tarea por cerrada):

1. **Launcher visible** en la esquina inferior derecha, círculo de 56px con gradiente — confirma que el auto-resize (Task 12/13) funcionó.
2. Clic en el launcher → el panel se abre con la animación `pop`, foco en el propio panel en desktop.
3. Escribir un mensaje real y enviarlo → aparece con check de "enviado"; el bot (respuesta simulada por `widget.ai.fake=true`) responde en streaming con el indicador "pensando" primero y el cursor parpadeante después.
4. Tab repetido dentro del panel → el foco nunca sale (focus trap, Task 4); Escape cierra y el foco vuelve al launcher.
5. Reducir la ventana a <480px de ancho (o modo dispositivo de DevTools) y reabrir → pantalla completa, sin bordes redondeados; el launcher CERRADO en el mismo viewport móvil sigue siendo pequeño, nunca pantalla completa (Critical, ronda 2). Confirmar en DevTools → Console que NO hay ningún log de `matchMedia` evaluado dentro del iframe (no debería haber ninguno: Panel ya no lo llama).
6. DevTools → `prefers-color-scheme: dark` → reabrir el panel → paleta oscura sin flash de color incorrecto (el theme se aplica antes del primer render, Task 15).
7. DevTools → pestaña Network/Console → confirmar que NINGUNA petición ni recurso viola la CSP (sin errores `Refused to...`) y que no hay ningún `<img>` de host externo cargado (spec §8).
8. Lighthouse o axe DevTools sobre la página con el panel abierto → 0 violaciones críticas (complementa, no sustituye, el pase automatizado de Task 16).

El escalado a agente (`WaitingCard`, cambio de cabecera con nombre del agente) depende de qué mecanismo de handoff exponga esta instalación de prueba en concreto — no está cubierto por este plan de frontend; verificar con quien mantenga la rama `feat/widget-channel` cómo disparar un escalado de prueba antes de tachar este punto.

- [ ] **Step 6: commit**

```bash
git add packages/widget/src/shell/app.tsx packages/widget/src/shell/main.tsx packages/widget/src/shell/__tests__/shell.test.tsx
git commit -m "feat(widget): integra el panel real en App/main.tsx (SessionClient completo, viewport del host, resize con posición, D7)"
```

---

## Self-Review

### 0. Mapa de cierre — ronda 1 (13 hallazgos, rev.2) + ronda 2 (12 hallazgos, rev.3) + ronda 3 (8 hallazgos, rev.4)

**Ronda 1 (Codex, rev.1 → rev.2) — histórico, referenciado por la ronda 2 para verificar qué de esto seguía roto:**

| # | Hallazgo | Estado tras rev.2 (según ronda 2) | Cerrado de verdad en rev.3 |
|---|---|---|---|
| Critical 1 | `ribbon` mezclaba conexión/streaming/fase | **Cerrado** (confirmado en ronda 2) | Sin cambios — Task 5. |
| Critical 2 | Medir `document.body` en iframe 0px; solo se tocaba el iframe | No cerrado — `useResizeReport` medía bien, pero el CONSUMIDOR (`Panel.isMobileViewport()`) evaluaba `matchMedia` contra el propio iframe, produciendo el bucle 104×104 | Task 12/13/14/17 (ver ronda 2, fila "mobile-loop") |
| Critical 3 | Móvil: fullscreen desde `boot()`, `matchMedia` de una sola vez | Parcial — el listener de `change` sí era real, pero el bucle 104×104 lo hacía irrelevante en la práctica | Task 12/13/14/17 |
| Critical 4 | Sin CSP; avatares; `style=""` | Parcial — CSP/avatares resueltos, pero el loader seguía usando `cssText` (bloqueado por `style-src-attr` estricto) | Task 12 (`setBoxStyle` propiedad a propiedad) |
| Important 5 | Fuga de foco Shift+Tab; sin autofocus móvil | Parcial — el wrap se corrigió, pero la detección desktop/móvil (`matchMedia` interno) estaba rota por el mismo bucle | Task 12/13 (`viewportKind` del host) |
| Important 6 | `aria-live` reanunciaba historial; ráfaga se perdía | Cerrado, con una regresión nueva (texto repetido no se re-anunciaba) | Task 8 (espacio de ancho cero) |
| Important 7 | Autoscroll con dependencia de string | **Cerrado** (confirmado en ronda 2) | Sin cambios — Task 8. |
| Important 8 | Evaluación de las 6 brechas de contrato | Parcial — gap #4 (`agentJoinedAtSeq`) no funcionaba de verdad | Task 8 (revertido al fallback) |
| Important 9 | Cobertura real de los 10 estados | No cerrado — el harness seguía sin componer rich/upload dentro de un panel completo, y `FileBubble` ignoraba `variant` | Task 16 |
| Important 10 | Theming: launcher sin theme inicial, contraste, `position`, colores `sun` | No cerrado — `deriveInkColor` solo miraba `--brand-a`, y `isSafeColor` aceptaba formatos que rompían el cálculo | Task 2 |
| Important 11 | Disciplina de tests (`act`, unmount, `.tsx`, `matchMedia`) | No cerrado — `matchMedia` no estaba definido en jsdom en absoluto, `use-announcements.test.ts` seguía con extensión `.ts`, `trapFocus` no liberaba listeners, `shell.test.tsx` no desmontaba | Task 1/4/8/17 |
| Important 12 | Verificación manual reproducible | No cerrado — el propio informe citado decía PARTIAL, con un comando de Mongo que era precisamente el intento fallido | Task 17 |
| Minor 13 | Mecánicos (conteo, lockfile, `VNode`) | Parcial — lockfile y `VNode` sí, el conteo de tareas seguía mal ("18" en vez de 17) | Cabecera del plan |

**Ronda 2 (Codex, rev.2 → rev.3):**

| # | Hallazgo | Cerrado en | Cómo |
|---|---|---|---|
| Crítico "mobile-loop" | Bucle 104×104 en desktop: `matchMedia` evaluado contra el iframe, no el host | Task 12 (protocolo `viewport`) + Task 13 (`Panel` recibe `viewportKind`/`viewportHeight` como props) + Task 14 (`useViewportHeight` deja de escuchar `visualViewport` dentro del iframe) + Task 17 (`App` reenvía el mensaje) | El shell NUNCA vuelve a llamar `matchMedia`; el loader es la única fuente, con un listener de `change` real. |
| Crítico "lastSize" | `lastSize` mezclaba tamaño de launcher y panel; el cierre no volvía al tamaño correcto | Task 12 | `LAUNCHER_SIZE` constante fija (nunca se sobrescribe); `panelSize` solo se actualiza con un resize recibido EN MODO PANEL; test dedicado a la mezcla. |
| Crítico "cssText" | `style.cssText` incompatible con CSP `style-src-attr` estricta del host | Task 12 | `setBoxStyle()` asigna cada propiedad por separado, con reset previo; test que espía el setter de `cssText` y confirma que nunca se llama. |
| Crítico "exactOptionalPropertyTypes" | `normalizeWelcome` no compila bajo ese flag | Task 15 | Spread condicional excluyendo primero la clave cruda (`{welcome: _rawWelcome, ...rest}`), añadiendo la validada solo si existe. Task 17 Step 4 documenta la auditoría del mismo patrón en el resto del plan (sin más casos). |
| Importante "agentJoinedAtSeq" | El intercalado histórico no funciona (snapshot con `seq:null`, el evento no vuelve a llegar tras reabrir) | Task 8 | Revertido al fallback pre-autorizado: sin `agentJoinedAtSeq`, sin slot `interleaved`; presencia del agente = solo cabecera; `AgentJoinedSysline` queda como componente de harness únicamente. |
| Importante "contraste" | `deriveInkColor` solo miraba `--brand-a`; `isSafeColor` aceptaba `rgb()`/`hsl()`/alpha que rompían el cálculo | Task 2 | `isSafeColor` restringido a hex opaco 3/6 dígitos; `deriveInkColor` calcula el PEOR contraste entre `--brand-a` y `--brand-b` (fijo) contra blanco/tinta oscura. |
| Importante "tests" | `matchMedia` no definido en jsdom; `.ts` con JSX; `expect.extend` ausente; `trapFocus` sin liberar; `shell.test.tsx` sin desmontar | Task 1 (`test-setup.ts`) + Task 8 (`.tsx`, ya lo tenía bien) + Task 16 (`expect.extend`) + Task 4 (liberación en `afterEach`) + Task 17 (`render(null, root)`) | Cada bug tiene su fix puntual, sin tocar nada más de cada archivo. |
| Importante "harness" | `rich`/`upload` aislados, no 10 estados reales; `FileBubble` ignoraba `variant` | Task 16 + Task 11 | `RichPreview`/`UploadPreview` componen Header+ConnectionBanner+MessageList+Composer reales con la card/archivo en el slot `trailing`; `FileBubble` aplica `variant` como clase (`file-user`), con CSS real detrás. |
| Importante "aria-live repetido" | Texto idéntico consecutivo no mutaba el DOM, no se re-anunciaba | Task 8 | Espacio de ancho cero (`String.fromCharCode(0x200b)`, nunca pegado literal) alternado en cada anuncio nuevo. |
| Importante "safe-area" | `.panel` sin `box-sizing:border-box`; el `padding-bottom` de seguridad sumaba por encima de `--viewport-h` | Task 13 (`.panel{box-sizing:border-box}`) | El iframe, dimensionado exactamente a `--viewport-h` por el loader, ya no recorta la protección inferior. |
| Importante "verificación" | El informe citado era PARTIAL, no PASS; el comando de Mongo transcrito era el intento fallido | Task 17 | Secuencia real (puerto interno=externo, `rs.initiate` con host explícito), los 9 providers a sembrar, el bug de `applicationTaskExecutor` y su commit de fix, el estado real (PARTIAL) explícitos. |
| Menor | Conteo "18 tareas" cuando hay 17 | Cabecera del plan | Corregido; nunca hubo una tarea 18 (era un error de redacción de rev.2, no una tarea perdida). |

**Ronda 3 (Codex, rev.3 → rev.4):**

| # | Hallazgo | Cerrado en | Cómo |
|---|---|---|---|
| Crítico "viewport latch" | El `viewport` inicial se pierde durante el bootstrap async (`createClient()` pendiente, `App` sin montar) — `App` monta con el fallback `{kind:'desktop', height:0}` inventado | Task 17 | `ShellBus.getLatchedViewport()` retiene el último `viewport` en una variable de closure de `main.tsx`, actualizada DIRECTAMENTE en el listener de `message` (nunca vía `commandCb`, que puede seguir siendo `null`); `App` lo lee con un `useState` de inicializador perezoso — sin render extra, sin carrera. Test dedicado: `createClient` deliberadamente bloqueado, dos `viewport` llegan durante la espera, resuelve → `App` monta con el ÚLTIMO valor latcheado. |
| Crítico "opened/resize dependiente del orden" | `opened` con `panelSize===null` aplicaba 104×104 si el `resize` hijo llegaba antes que el `opened` padre (orden real de efectos de Preact); cualquier `resize` en modo panel contaminaba el tamaño incluso viniendo de un fullscreen móvil | Task 12 (+ Task 17, `onResize` añade `viewportKind`) | `desktopPanelSize` solo se fija con `mode==='panel' && viewportKind==='desktop'`; `DEFAULT_PANEL_SIZE` (430×688) sustituye a `LAUNCHER_SIZE` como fallback de `opened` — nunca hay salto a 104×104 sea cual sea el orden real de llegada. Tests: ambos órdenes (`opened→resize` y `resize→opened`), cruce desktop↔móvil con el panel abierto, reapertura desktop tras una sesión móvil. |
| Crítico "VisualViewport incompleto" | Solo se transmitía `height`; el contenedor fullscreen móvil quedaba fijo en `inset:0` (viewport de LAYOUT completo), sin reaccionar a `offsetTop` ni a `scroll`; el launcher medía siempre 104px fijo pese a que su caja real puede superarlo con `safe-area-inset-bottom` | Task 12 (+ Task 14, safe-area lateral) | El contenedor fullscreen móvil usa `offsetTop`/`offsetLeft`/`width`/`height` REALES de `w.visualViewport` (nunca `inset:0`), recalculados tanto en `resize` como en `scroll`; `launcherSize` deja de ser una constante fija y trackea el último resize real reportado en modo launcher; `env(safe-area-inset-left/right)` añadido a `.panel` móvil para landscape. |
| Crítico "suite no ejecutable tal como está escrita" | `use-announcements.test.ts` con JSX pero extensión `.ts`; `shell.test.tsx` usa `afterEach` sin importarlo de vitest; `Panel.test.tsx` declarado en 8 tests con 9 reales; `loader.test.ts` con recuentos desactualizados | Task 8 (rename a `.tsx`) + Task 17 (`afterEach` en el import) + Task 13/12 (recuentos corregidos) | `use-announcements.test.ts` → `.tsx`; `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'` en `shell.test.tsx`; `Panel.test.tsx` declarado en 9 tests; `loader.test.ts` declarado en 25 (7 preexistentes + 18 nuevos). |
| Crítico "verificación no reproducible" | Se sembraba `publicId:"inst_verify_01"`, pero `host-demo.html` arranca `boot('inst_demo_festival_01')` (404 antes de probar nada); el seed de providers usaba 9 documentos con `type` inventado (el propio `code` en mayúsculas) | Task 17 | `publicId: "inst_demo_festival_01"` (verificado contra `host-demo.html`); los 10 providers reales de `ProviderService.FIRST_PARTY_INTEGRATIONS` (leídos del código, no inferidos) con sus `type` exactos: 7 `TICKETING`, 2 `ECOMMERCE` (`shopify`/`shopify2`), 1 `CASHLESS` (`casfid`). |
| Importante "contraste AA" | `deriveInkColor` comparaba contra los dos extremos del degradado y elegía "la mejor de dos opciones" aunque ninguna llegara a 4.5:1 (blanco sobre `--brand-b` da ~4.04:1) — el plan seguía llamándolo "AA automático" pese a que el propio Self-Review reconocía la limitación | Task 2 (+ Task 6, `.initials-avatar`) | `deriveInkColor` exige 4.5:1 real contra el color SÓLIDO `--brand-a` (nunca el degradado) y devuelve `null` si ninguna tinta lo alcanza — `applyTheme` ignora entonces el `primaryColor` del tenant (avisa por `console.warn`) en vez de aceptar un texto que no cumple AA. El texto real (`.initials-avatar`) se mueve a `--brand-a` sólido; los usos decorativos del degradado (avatar-icono, botón de enviar, ribbon, fondo de card) documentados como ≥3:1 (SC 1.4.11), nunca 4.5:1. |
| Importante "falso positivo cssText" | `vi.spyOn(Object.getOwnPropertyDescriptor(...).set)` espía una COPIA del descriptor, no el setter real instalado en el prototipo — el test pasaría aunque producción volviera a usar `cssText` | Task 12 | `vi.spyOn(CSSStyleDeclaration.prototype, 'cssText', 'set')` (forma de 3 argumentos), la única que espía el accessor de verdad instalado en el prototipo. |
| Importante "AgentJoinedSysline no está en el harness" | Task 10, el mapa de cierre y el Self-Review afirmaban que Task 16 lo montaba, pero ni `a11y-fixtures.test.tsx` ni `fixtures-app.tsx` lo importaban — solo existía en su test unitario aislado | Task 16 | `a11y-fixtures.test.tsx` (test 11, con axe) y `fixtures-app.tsx` (sección "Fuera del set de 10 estados") importan y montan `AgentJoinedSysline` de verdad — la afirmación ahora tiene código real detrás. |

### 1. Cobertura del spec

**§5 (handoff, servidor manda):** `conversationPhase` (Task 5) es la única señal que gobierna contenido, y la fase se comunica igual de fielmente ahora que la presencia del agente vive solo en la cabecera (gap #4 revertido) — el servidor sigue siendo la única fuente, solo cambia DÓNDE se ve.
**§6 (a11y):** foco gestionado (Task 4/13, fuga de Shift+Tab cerrada, `trapFocus` libera sus listeners en test), Escape cierra, trap sin `aria-modal` falso, navegable 100% por teclado, contraste AA GARANTIZADO por construcción para texto (Task 2, ronda 3: 4.5:1 real contra el color sólido `--brand-a`, con rechazo + fallback si ningún tenant lo alcanza — nunca "la mejor de dos opciones que no cumplen"), foco desktop-only decidido por una señal del host (Task 13/17), nunca `matchMedia` interno.
**§7 (theming):** `setProperty`-only con allowlist más estricto (Task 2), aplicado ANTES del primer render (Task 15), `position` comunicado al loader en cada resize (Task 12).
**§8 (seguridad):** CSP explícita (Task 15), sin avatares externos (Task 1/6/7/10), acciones de card limitadas con validación (Task 11), sin `style=""` interpolado NI `cssText` en ningún punto del plan (Task 11/12).
**Mock states 1-10 → tareas:** el mapeo se mantiene; `rich`/`upload` ahora se demuestran DENTRO de un panel completo en el harness (Task 16), no aislados — más fiel al mock que en cualquier revisión anterior.

### 2. Barrido de placeholders

Sin `TODO`/`TBD`/"implementar luego" en ningún paso de código. El único `// TODO` preexistente en el repo (`main.tsx`, sobre reenviar errores de sesión al parent) es de Plan 1 y no se toca. Las simplificaciones deliberadas (gaps #1-#3/#6/#7, alto fijo del panel en desktop, `mock-api.mjs` degradado a fixtures offline, estado PARTIAL del smoke de nev-api documentado tal cual) están todas con su motivo — no son placeholders.

### 3. Consistencia de tipos entre tareas (re-verificada tras la segunda reescritura)

- `PanelViewState` (Task 5) — sin cambios de forma respecto a rev.2; sigue consumido igual por `Header`/`Composer`/`Panel`.
- `MessageBubbleProps.agentName`/`AgentJoinedSyslineProps.agentName` — sin cambios; `AgentJoinedSysline` ahora se importa SOLO en `handoff.test.tsx` (Task 10) y `fixtures-app.tsx`/`a11y-fixtures.test.tsx` (Task 16) — verificado que `Panel.tsx` (Task 13) no la importa en absoluto.
- `MessageListProps` — ya NO tiene `interleaved` ni el tipo `InterleavedItem` (gap #4 revertido); solo `trailing`. Verificado en Task 8 (definición), Task 13 (`Panel`, único consumidor real vía `trailing`) y Task 16 (`RichPreview`/`UploadPreview`, que también usan `trailing` para inyectar `CardCarousel`/`FileBubble`).
- `PanelProps` gana `viewportKind: 'mobile' | 'desktop'` y `viewportHeight: number` (Task 13) — verificado que los tres consumidores (`Panel.test.tsx` Task 13, `a11y-fixtures.test.tsx`/`fixtures-app.tsx` Task 16, `App.tsx` Task 17) los pasan con la misma forma y que ningún sitio los sigue tratando como opcionales.
- `LOADER_TO_SHELL` gana `'viewport'` (Task 12, `protocol/envelope.ts`) — el payload `{kind, height}` tiene la misma forma en el emisor (`loader/index.ts`) y el receptor (`App.tsx`, Task 17).
- `ResolvedCardProps.onFeedback?` — sin cambios; `Panel` no lo pasa, el harness sí.
- `FileBubbleProps.variant` — ahora SÍ se usa dentro del componente (antes se desestructuraba fuera del cuerpo, Important "harness" ronda 2); la clase CSS resultante (`file-user`) y la prop viajan juntas en Task 11 y se verifican en Task 16.
- `mount`/`rerender`/`cleanupMounted` (Task 1) — sin cambios de forma; sigue `async` en todo el plan.
- `Transport` (Plan 2) — sin cambios; los `fakeTransport()` de Tasks 13/16/17 lo replican exacto.
- `ShellBus` (Task 17, ronda 3) gana `getLatchedViewport(): { kind: 'mobile' | 'desktop'; height: number } | null` — verificado que `main.tsx` es el ÚNICO productor (la variable `latchedViewport` vive en el closure de `startShell`) y `App.tsx` el único consumidor (inicializador perezoso de `useState`); la forma coincide con `ViewportState`/`ViewportPayload`, mismo shape en ambos archivos.
- El payload de `resize` (`SHELL_TO_LOADER`, sin cambio de forma en el envelope) gana el campo opcional `viewportKind: 'mobile' | 'desktop'` — verificado que `App.tsx` (Task 17, único emisor vía `onResize`) y `loader/index.ts` (Task 12, único consumidor) están de acuerdo en el nombre y que ningún otro emisor de `resize` existe en el plan.
- `Instance` (loader, Task 12) — `panelSize` se divide en `desktopPanelSize`/`launcherSize`; `onVisualViewportResize` se renombra a `onVisualViewportChange` (ahora también escucha `scroll`) — verificado que ningún test ni ninguna otra tarea referenciaba los nombres viejos fuera de `loader/index.ts` y `loader.test.ts` (ambos en la misma Task 12).
- `deriveInkColor(primaryColorHex: string): string | null` (Task 2, ronda 3) — cambia de `string` a `string | null`; verificado que su ÚNICO consumidor (`applyTheme`, mismo archivo) maneja el `null` con el fallback documentado, y que ningún otro archivo del plan importa `deriveInkColor` directamente.

### 4. Riesgos que quedan abiertos tras esta revisión (para quien la ejecute, no para resolverlos aquí)

- Alto fijo de 640px del panel en desktop — requeriría ampliar el handshake `INIT` de Plan 1 para transportar el viewport real del anfitrión. Sin cambios respecto a revisiones anteriores.
- `radio`/`densidad`/`logo` del schema de theming (spec §7) siguen sin estar en `WidgetConfig` — gap #7, sin resolver a propósito.
- **Límite conocido de `deriveInkColor` (Task 2, ronda 3):** el rechazo silencioso no tiene superficie en el panel de admin del tenant — si un `primaryColor` cae en la "zona muerta" (ni blanco ni tinta oscura alcanzan 4.5:1 contra `--brand-a`, p.ej. `#006eff`), el widget simplemente ignora el color y usa el de marca por defecto, avisando solo por `console.warn` del navegador del VISITANTE (nadie del tenant lo ve nunca). Una solución completa necesitaría que el backend/admin validaran el color en el momento de guardarlo y lo rechazaran ahí, con feedback real — fuera de scope de este plan de frontend, gap #7.
- Gap #4 (timeline histórico de `agent.joined`) queda sin resolver de verdad — `AgentJoinedSysline` solo vive en el harness. Una solución real necesitaría que el backend/store expusieran los eventos durables con su posición, no solo el escalar más reciente — trabajo de contrato futuro, no de este plan de frontend.
- El estado del smoke de nev-api es PARTIAL a fecha de este plan — Task 17 documenta el bug de `applicationTaskExecutor` y su commit de fix (`fbbeb82b2`), pero quien ejecute la verificación debe confirmar que la rama sigue en ese commit o posterior antes de asumir que arranca limpio.
- `mock-api.mjs` queda deliberadamente limitado a config/sesión — si en el futuro se quiere CI sin dependencia de un nev-api local, haría falta un mock SSE real, fuera de scope aquí.

---

**Plan rev.4 completo y guardado en `docs/superpowers/plans/2026-07-18-widget-panel.md`. Dos opciones de ejecución:**

1. **Subagent-Driven (recomendado)** — un subagente nuevo por tarea, revisión entre tareas, iteración rápida.
2. **Ejecución inline** — ejecutar las tareas en la sesión actual con `executing-plans`, por lotes con checkpoints.
