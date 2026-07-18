import { describe, it, expect, afterEach } from 'vitest'
import { axe } from 'vitest-axe'
// vitest-axe@0.1.0 no reexporta `toHaveNoViolations` desde el entry
// principal (solo `axe`/`configureAxe`) — el matcher vive en el subpath
// `vitest-axe/matchers` (ver su README: `import * as matchers from
// 'vitest-axe/matchers'`).
import * as axeMatchers from 'vitest-axe/matchers'
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

// vitest-axe/extend-expect (README) amplía `Vi.Assertion` — un namespace que
// Vitest 3 ya no usa para tipar `expect()` (su `Assertion<T>` ahora vive en
// @vitest/expect y se reexporta plano desde 'vitest'). Sin esto,
// `.toHaveNoViolations()` corre bien en runtime (transform de esbuild, sin
// chequeo de tipos) pero `tsc --noEmit` lo marca como TS2339.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- debe coincidir
  // exactamente con los parámetros de tipo de Assertion<T = any> en @vitest/expect
  // (fusión de declaraciones: TS exige la misma lista de parámetros de tipo).
  interface Assertion<T = any> {
    toHaveNoViolations(): void
  }
}

expect.extend(axeMatchers)

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
  const viewState = computeViewState({ conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, assistantName: config.assistantName ?? 'Asistente', isStreaming: false })
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
  const viewState = computeViewState({ conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, assistantName: config.assistantName ?? 'Asistente', isStreaming: false })
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

  // 12. waiting + offline combo — gap señalado en la revisión de Task 13: ningún
  // test ensamblado cubría escalado ESCALATED_WAITING con connection: 'offline'
  // a la vez. view-state.ts los mantiene independientes (la conexión SOLO
  // superpone texto/banner, nunca sustituye la fase), así que el panel real
  // puede mostrar la WaitingCard Y el banner offline simultáneamente — este es
  // el sitio natural para probarlo montado de verdad, con axe encima.
  it('12. waiting + offline (combo) — WaitingCard y banner offline renderizan a la vez', async () => {
    const root = await mountPanel((store) => {
      store.applySnapshot({
        messages: [{ messageId: 'm1', role: 'user', text: 'Mi caso es raro', createdAt: '2026-07-18T14:06:00.000Z' }],
        state: 'ESCALATED_WAITING', snapshotCursor: 'evt_v1_demo_1',
      })
      store.setConnection('offline')
    })
    expect(root.querySelector('.syscard.waiting')).not.toBeNull()
    expect(root.querySelector('.conn.offline')).not.toBeNull()
    expect(await axe(root)).toHaveNoViolations()
  })
})
