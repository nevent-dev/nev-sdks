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
import { STRINGS, StringsContext } from '../src/panel/strings'
import type { WidgetLocale } from '../src/contract/locale'

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
  ['waiting-offline', 'Escalado + sin conexión (combo)'],
  ['contact-es', 'Bloque de contacto · es'],
  ['contact-en', 'Bloque de contacto · en'],
  ['contact-ca', 'Bloque de contacto · ca'],
  ['contact-pt', 'Bloque de contacto · pt'],
  ['contact-several', 'Varios bloques seguidos · es'],
  ['contact-dark', 'Bloque de contacto · oscuro'],
  ['contact-none', 'Sin derivación (sin bloque)'],
] as const

// nevent-work#15: textos del modelo de los ejemplos del catálogo; el bloque lo
// pone el sistema. Llegan por el wire como cualquier message.created.
const CONTACT_TEXT: Record<WidgetLocale, [string, string]> = {
  es: ['Ayer perdí el móvil, ¿cómo contacto con objetos perdidos?', 'Siento lo del móvil. En MYA, los objetos perdidos se gestionan por WhatsApp:'],
  en: ['I lost my phone yesterday, how can I go to the lost and found?', 'Sorry to hear about your phone. MYA handles lost property on WhatsApp:'],
  ca: ['Ahir vaig perdre el mòbil, com contacto amb objectes perduts?', 'Sento el del mòbil. A MYA, els objectes perduts es gestionen per WhatsApp:'],
  pt: ['Perdi o telemóvel ontem, como contacto os perdidos e achados?', 'Lamento o do telemóvel. Na MYA, os perdidos e achados tratam-se por WhatsApp:'],
}
const WA_BLOCK = { channel: 'WHATSAPP', value: '+34612345678', display: '+34 612 34 56 78', url: 'https://wa.me/34612345678' }

// Forma del contrato (_rescate/t15-mock/contrato.md §2): text con los valores
// escritos, bodyText sin ellos y contacts.
function contactTransport(locale: WidgetLocale, blocks: Array<{ display: string }>, botText?: string): Transport {
  const [ask, answer] = CONTACT_TEXT[locale]
  return fakeTransport((store) => {
    store.applySnapshot({ messages: [{ messageId: 'u1', role: 'user', text: ask, createdAt: '2026-11-10T12:00:00.000Z' }], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_demo_1' })
    store.applyDurableEvent(JSON.parse(JSON.stringify({
      eventId: 'evt_v1_demo_2', schemaVersion: 1, conversationId: 'demo', occurredAt: '2026-11-10T12:00:05.000Z',
      type: 'message.created', payload: blocks.length > 0
        ? { messageId: 'b1', role: 'bot', text: `${botText ?? answer} ${blocks.map((b) => b.display).join(', ')}`, bodyText: botText ?? answer, contacts: blocks }
        : { messageId: 'b1', role: 'bot', text: botText ?? answer },
    })))
  })
}

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
  if (state === 'contact-es' || state === 'contact-dark') return contactTransport('es', [WA_BLOCK])
  if (state === 'contact-en' || state === 'contact-ca' || state === 'contact-pt') return contactTransport(state.slice(8) as WidgetLocale, [WA_BLOCK])
  if (state === 'contact-several') {
    return contactTransport('es', [
      { channel: 'PHONE', value: '+34963123456', display: '+34 963 12 34 56', url: 'tel:+34963123456' },
      { channel: 'EMAIL', value: 'atencion@tuclub.com', display: 'atencion@tuclub.com', url: 'mailto:atencion@tuclub.com' },
      WA_BLOCK,
    ], 'Puedes escribir o llamar a la oficina del club:')
  }
  if (state === 'contact-none') return contactTransport('es', [], 'No tengo un contacto de MYA para objetos perdidos.')
  if (state === 'offline') return fakeTransport((store) => { store.setConnection('offline') })
  if (state === 'resolved') return fakeTransport((store) => { store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_1' }) })
  // Combo waiting+offline (gap de Task 13): la conexión nunca sustituye la
  // fase (view-state.ts), así que WaitingCard y el banner offline conviven.
  if (state === 'waiting-offline') {
    return fakeTransport((store) => {
      store.applySnapshot({
        messages: [{ messageId: 'm1', role: 'user', text: 'Mi caso es raro: lo compré con el DNI antiguo', createdAt: '2026-07-18T14:06:00.000Z' }],
        state: 'ESCALATED_WAITING', snapshotCursor: 'evt_v1_demo_1',
      })
      store.setConnection('offline')
    })
  }
  return fakeTransport(() => {})
}

const demoCards: CardItem[] = [
  { id: '1', title: 'Abono 3 días', description: 'Acceso general · vie–dom', priceLabel: '89 €', imageVariant: 'brand', action: { kind: 'send_message', label: 'Ver abono', text: 'demo' } },
  { id: '2', title: 'Abono VIP', description: 'Front stage + zona lounge', priceLabel: '149 €', imageVariant: 'sun', action: { kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' } },
]

function idleMsg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: '', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T14:00:00.000Z', clientId: null, turnId: null, authorName: null, authorAvatarUrl: null, contactBlocks: [], ...overrides,
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

function localeOf(state: string): WidgetLocale {
  const tail = state.slice(8)
  return state.startsWith('contact-') && (tail === 'en' || tail === 'ca' || tail === 'pt') ? tail : 'es'
}

export function FixturesApp() {
  const [state, setState] = useState<string>(new URLSearchParams(location.search).get('state') ?? 'welcome')
  // Tema oscuro solo para el estado que lo pide (mismo atributo que theme.ts).
  if (state === 'contact-dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
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
          <StringsContext.Provider value={STRINGS[localeOf(state)]}>
            <Panel key={state} config={{ ...fixtureConfig(), assistantName: state.startsWith('contact') ? 'MYA Valencia' : fixtureConfig().assistantName }}
              transport={buildTransport(state)} onMinimize={() => {}} onClose={() => {}} onResize={() => {}}
              viewportKind="desktop" viewportHeight={900} />
          </StringsContext.Provider>
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
