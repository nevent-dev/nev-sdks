import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { WidgetLocale } from '../contract/locale'

// Todo el copy localizable de la shell (Plan 4) — un único punto de verdad,
// consumido vía useStrings() por cada componente Y por computeViewState
// (función pura, recibe strings como parámetro en vez de contexto: ver
// view-state.ts). Las claves parametrizadas son funciones — placeholderAgent
// y resolvedByAgent reciben el NOMBRE del agente (no un conteo); pill recibe
// el CONTEO de mensajes nuevos.
export interface WidgetStrings {
  launcherOpen: string
  headerClose: string
  stateOnline: string
  stateInstant: string
  stateTyping: string
  stateTeamSoon: string
  stateResolved: string
  team: string
  assistantFallback: string
  placeholderIdle: string
  placeholderTeam: string
  placeholderAgent: (agentName: string) => string
  composerAria: string
  attach: string
  attachSoon: string
  send: string
  stop: string
  poweredPrefix: string
  connReconnecting: string
  connOffline: string
  connShortOffline: string
  thinking: string
  notSent: string
  retry: string
  today: string
  jumpLatest: string
  pill: (count: number) => string
  welcomeTitle: string
  welcomeSubtitle: string
  handoffTitle: string
  handoffDesc: string
  joinedSuffix: string
  resolvedByAgent: (agentName: string) => string
  resolvedGeneric: string
  resolvedTail: string
  agentTyping: string
  rateUp: string
  rateDown: string
  newConvTitle: string
  newConvDesc: string
  timeLocale: string
}

const es: WidgetStrings = {
  launcherOpen: 'Abrir chat de ayuda',
  headerClose: 'Cerrar',
  stateOnline: 'En línea ahora',
  stateInstant: 'Respuesta al instante',
  stateTyping: 'Escribiendo…',
  stateTeamSoon: 'El equipo te atenderá en breve',
  stateResolved: 'Conversación resuelta',
  team: 'El equipo',
  assistantFallback: 'Asistente',
  placeholderIdle: 'Escribe tu pregunta…',
  placeholderTeam: 'Escribe al equipo…',
  placeholderAgent: (agentName) => `Escribe a ${agentName}…`,
  composerAria: 'Escribe tu mensaje',
  attach: 'Adjuntar archivo',
  attachSoon: 'Próximamente',
  send: 'Enviar',
  stop: 'Detener respuesta',
  poweredPrefix: 'Con la tecnología de',
  connReconnecting: 'Reconectando…',
  connOffline: 'Sin conexión. Reintentando…',
  connShortOffline: 'Sin conexión',
  thinking: 'Pensando…',
  notSent: 'No enviado',
  retry: 'Reintentar',
  today: 'Hoy',
  jumpLatest: 'Ir al último mensaje',
  pill: (count) => `${count} ${count === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}, ir al último`,
  welcomeTitle: 'Hola 👋 ¿en qué te ayudamos?',
  welcomeSubtitle: 'Escríbenos y te respondemos al momento.',
  handoffTitle: 'Te pasamos con el equipo',
  handoffDesc: 'El equipo te atenderá en breve. Puedes seguir escribiendo mientras tanto.',
  joinedSuffix: 'se ha unido',
  resolvedByAgent: (agentName) => `${agentName} resolvió tu consulta.`,
  resolvedGeneric: 'Tu consulta ha sido resuelta.',
  resolvedTail: 'Si necesitas algo más, escribe y volvemos al momento.',
  agentTyping: 'El agente está escribiendo',
  rateUp: 'Valorar positivamente',
  rateDown: 'Valorar negativamente',
  newConvTitle: 'Conversación nueva',
  newConvDesc: 'La conversación anterior expiró. Cuéntanos en qué te ayudamos.',
  timeLocale: 'es-ES',
}

const en: WidgetStrings = {
  launcherOpen: 'Open help chat',
  headerClose: 'Close',
  stateOnline: 'Online now',
  stateInstant: 'Instant answers',
  stateTyping: 'Typing…',
  stateTeamSoon: 'The team will be with you shortly',
  stateResolved: 'Conversation resolved',
  team: 'The team',
  assistantFallback: 'Assistant',
  placeholderIdle: 'Type your question…',
  placeholderTeam: 'Message the team…',
  placeholderAgent: (agentName) => `Message ${agentName}…`,
  composerAria: 'Type your message',
  attach: 'Attach file',
  attachSoon: 'Coming soon',
  send: 'Send',
  stop: 'Stop response',
  poweredPrefix: 'Powered by',
  connReconnecting: 'Reconnecting…',
  connOffline: 'Offline. Retrying…',
  connShortOffline: 'Offline',
  thinking: 'Thinking…',
  notSent: 'Not sent',
  retry: 'Retry',
  today: 'Today',
  jumpLatest: 'Jump to latest message',
  pill: (count) => `${count} ${count === 1 ? 'new message' : 'new messages'}, jump to latest`,
  welcomeTitle: 'Hi 👋 how can we help?',
  welcomeSubtitle: "Write to us and we'll reply right away.",
  handoffTitle: 'Connecting you with the team',
  handoffDesc: 'The team will be with you shortly. You can keep writing in the meantime.',
  joinedSuffix: 'joined',
  resolvedByAgent: (agentName) => `${agentName} resolved your query.`,
  resolvedGeneric: 'Your query has been resolved.',
  resolvedTail: "If you need anything else, write to us and we'll be right back.",
  agentTyping: 'The agent is typing',
  rateUp: 'Rate positively',
  rateDown: 'Rate negatively',
  newConvTitle: 'New conversation',
  newConvDesc: 'The previous conversation expired. Tell us how we can help.',
  timeLocale: 'en-GB',
}

const ca: WidgetStrings = {
  launcherOpen: "Obre el xat d'ajuda",
  headerClose: 'Tanca',
  stateOnline: 'En línia ara',
  stateInstant: "Resposta a l'instant",
  stateTyping: 'Escrivint…',
  stateTeamSoon: "L'equip t'atendrà en breu",
  stateResolved: 'Conversa resolta',
  team: "L'equip",
  assistantFallback: 'Assistent',
  placeholderIdle: 'Escriu la teva pregunta…',
  placeholderTeam: "Escriu a l'equip…",
  placeholderAgent: (agentName) => `Escriu a ${agentName}…`,
  composerAria: 'Escriu el teu missatge',
  attach: 'Adjunta un fitxer',
  attachSoon: 'Pròximament',
  send: 'Envia',
  stop: 'Atura la resposta',
  poweredPrefix: 'Amb la tecnologia de',
  connReconnecting: 'Reconnectant…',
  connOffline: 'Sense connexió. Reintentant…',
  connShortOffline: 'Sense connexió',
  thinking: 'Pensant…',
  notSent: 'No enviat',
  retry: 'Reintenta',
  today: 'Avui',
  jumpLatest: "Vés a l'últim missatge",
  pill: (count) => `${count} ${count === 1 ? 'missatge nou' : 'missatges nous'}, vés a l'últim`,
  welcomeTitle: 'Hola 👋 en què et podem ajudar?',
  welcomeSubtitle: "Escriu-nos i et responem a l'instant.",
  handoffTitle: "Et passem amb l'equip",
  handoffDesc: "L'equip t'atendrà en breu. Pots continuar escrivint mentrestant.",
  joinedSuffix: "s'ha unit",
  resolvedByAgent: (agentName) => `${agentName} ha resolt la teva consulta.`,
  resolvedGeneric: "La teva consulta s'ha resolt.",
  resolvedTail: "Si necessites res més, escriu i tornem a l'instant.",
  agentTyping: "L'agent està escrivint",
  rateUp: 'Valora positivament',
  rateDown: 'Valora negativament',
  newConvTitle: 'Conversa nova',
  newConvDesc: "La conversa anterior va caducar. Explica'ns en què et podem ajudar.",
  timeLocale: 'ca-ES',
}

const pt: WidgetStrings = {
  launcherOpen: 'Abrir o chat de ajuda',
  headerClose: 'Fechar',
  stateOnline: 'Online agora',
  stateInstant: 'Resposta imediata',
  stateTyping: 'A escrever…',
  stateTeamSoon: 'A equipa vai atender-te em breve',
  stateResolved: 'Conversa resolvida',
  team: 'A equipa',
  assistantFallback: 'Assistente',
  placeholderIdle: 'Escreve a tua pergunta…',
  placeholderTeam: 'Escreve à equipa…',
  placeholderAgent: (agentName) => `Escreve a ${agentName}…`,
  composerAria: 'Escreve a tua mensagem',
  attach: 'Anexar ficheiro',
  attachSoon: 'Brevemente',
  send: 'Enviar',
  stop: 'Parar a resposta',
  poweredPrefix: 'Com tecnologia de',
  connReconnecting: 'A religar…',
  connOffline: 'Sem ligação. A tentar novamente…',
  connShortOffline: 'Sem ligação',
  thinking: 'A pensar…',
  notSent: 'Não enviado',
  retry: 'Tentar novamente',
  today: 'Hoje',
  jumpLatest: 'Ir para a última mensagem',
  pill: (count) => `${count} ${count === 1 ? 'mensagem nova' : 'mensagens novas'}, ir para a última`,
  welcomeTitle: 'Olá 👋 como podemos ajudar?',
  welcomeSubtitle: 'Escreve-nos e respondemos logo.',
  handoffTitle: 'Vamos passar-te à equipa',
  handoffDesc: 'A equipa vai atender-te em breve. Podes continuar a escrever entretanto.',
  joinedSuffix: 'juntou-se',
  resolvedByAgent: (agentName) => `${agentName} resolveu o teu pedido.`,
  resolvedGeneric: 'O teu pedido foi resolvido.',
  resolvedTail: 'Se precisares de mais alguma coisa, escreve e voltamos já.',
  agentTyping: 'O agente está a escrever',
  rateUp: 'Avaliar positivamente',
  rateDown: 'Avaliar negativamente',
  newConvTitle: 'Conversa nova',
  newConvDesc: 'A conversa anterior expirou. Diz-nos como podemos ajudar.',
  timeLocale: 'pt-PT',
}

export const STRINGS: Record<WidgetLocale, WidgetStrings> = { es, en, ca, pt }

// Español por defecto: el mismo criterio que el resto del shell cuando nadie
// (host ni config) declara un locale soportado (Plan 4, prioridad host >
// config.locale > 'es') — así un componente montado en un test o harness sin
// <StringsContext.Provider> explícito (p.ej. la suite existente, ninguna
// modificada para esta task) sigue viendo el copy en español de siempre.
export const StringsContext = createContext<WidgetStrings>(STRINGS.es)

export function useStrings(): WidgetStrings {
  return useContext(StringsContext)
}
