import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { WidgetLocale } from '../contract/locale'
import type { ContactChannel } from '../contract/types'

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
  resolvedByAgent: (agentName: string, feedbackEnabled?: boolean) => string
  resolvedGeneric: string
  resolvedTail: string
  agentTyping: string
  resolutionQuestion: string
  yes: string
  no: string
  offerHandoff: string
  acceptHandoff: string
  declineHandoff: string
  reformulate: string
  teamQuestion: string
  teamGood: string
  teamFair: string
  teamPoor: string
  teamComment: string
  commentPrivacy: string
  feedbackThanks: string
  answerQuestion: string
  answerIncorrect: string
  answerOutdated: string
  answerIrrelevant: string
  answerOther: string
  answerComment: string
  rateUp: string
  rateDown: string
  newConvTitle: string
  newConvDesc: string
  // Bloque de contacto (nevent-work#15): botón por canal y nombre del canal
  // para el aria del bloque («WhatsApp: +34 612 34 56 78»). A la vista solo
  // van el icono, el valor y el botón: el nombre del canal no se pinta.
  contactAction: Record<ContactChannel, string>
  contactChannel: Record<ContactChannel, string>
  contactSeparator: string
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
  resolvedByAgent: (agentName, feedbackEnabled) => `${agentName} ${feedbackEnabled ? 'ha resuelto' : 'resolvió'} tu consulta.`,
  resolvedGeneric: 'Tu consulta ha sido resuelta.',
  resolvedTail: 'Si necesitas algo más, escribe y volvemos al momento.',
  agentTyping: 'El agente está escribiendo',
  resolutionQuestion: '¿Hemos resuelto tu consulta?',
  yes: 'Sí',
  no: 'No',
  offerHandoff: '¿Te pasamos con una persona del equipo?',
  acceptHandoff: 'Sí, con una persona',
  declineHandoff: 'No, gracias',
  reformulate: 'Escribe tu pregunta de otra forma y lo intentamos de nuevo.',
  teamQuestion: '¿Qué tal te hemos atendido?',
  teamGood: 'Bien',
  teamFair: 'Regular',
  teamPoor: 'Mal',
  teamComment: '¿Qué podemos mejorar? (opcional)',
  commentPrivacy: 'No incluyas datos personales.',
  feedbackThanks: 'Gracias por tu valoración.',
  answerQuestion: '¿Qué ha fallado?',
  answerIncorrect: 'Es incorrecta',
  answerOutdated: 'Está desactualizada',
  answerIrrelevant: 'No responde a mi pregunta',
  answerOther: 'Otro motivo',
  answerComment: 'Cuéntanos más (opcional)',
  rateUp: 'Valorar positivamente',
  rateDown: 'Valorar negativamente',
  newConvTitle: 'Conversación nueva',
  newConvDesc: 'La conversación anterior expiró. Cuéntanos en qué te ayudamos.',
  contactAction: { WHATSAPP: 'Abrir WhatsApp', PHONE: 'Llamar', EMAIL: 'Escribir un email' },
  contactChannel: { WHATSAPP: 'WhatsApp', PHONE: 'Teléfono', EMAIL: 'Email' },
  contactSeparator: ': ',
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
  resolutionQuestion: 'Did we resolve your question?',
  yes: 'Yes',
  no: 'No',
  offerHandoff: 'Would you like to talk to someone on the team?',
  acceptHandoff: 'Yes, talk to someone',
  declineHandoff: 'No, thanks',
  reformulate: 'Try asking your question another way.',
  teamQuestion: 'How was your support experience?',
  teamGood: 'Good',
  teamFair: 'Fair',
  teamPoor: 'Poor',
  teamComment: 'What could we improve? (optional)',
  commentPrivacy: 'Do not include personal information.',
  feedbackThanks: 'Thank you for your feedback.',
  answerQuestion: 'What went wrong?',
  answerIncorrect: 'It is incorrect',
  answerOutdated: 'It is outdated',
  answerIrrelevant: 'It did not answer my question',
  answerOther: 'Another reason',
  answerComment: 'Tell us more (optional)',
  rateUp: 'Rate positively',
  rateDown: 'Rate negatively',
  newConvTitle: 'New conversation',
  newConvDesc: 'The previous conversation expired. Tell us how we can help.',
  contactAction: { WHATSAPP: 'Open WhatsApp', PHONE: 'Call', EMAIL: 'Send an email' },
  contactChannel: { WHATSAPP: 'WhatsApp', PHONE: 'Phone', EMAIL: 'Email' },
  contactSeparator: ': ',
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
  resolutionQuestion: 'Hem resolt la teva consulta?',
  yes: 'Sí',
  no: 'No',
  offerHandoff: 'Et passem amb una persona de l’equip?',
  acceptHandoff: 'Sí, amb una persona',
  declineHandoff: 'No, gràcies',
  reformulate: 'Escriu la pregunta d’una altra manera i ho tornem a provar.',
  teamQuestion: 'Com t’hem atès?',
  teamGood: 'Bé',
  teamFair: 'Regular',
  teamPoor: 'Mal',
  teamComment: 'Què podem millorar? (opcional)',
  commentPrivacy: 'No hi incloguis dades personals.',
  feedbackThanks: 'Gràcies per la teva valoració.',
  answerQuestion: 'Què ha fallat?',
  answerIncorrect: 'És incorrecta',
  answerOutdated: 'Està desactualitzada',
  answerIrrelevant: 'No respon a la meva pregunta',
  answerOther: 'Un altre motiu',
  answerComment: 'Explica’ns-en més (opcional)',
  rateUp: 'Valora positivament',
  rateDown: 'Valora negativament',
  newConvTitle: 'Conversa nova',
  newConvDesc: "La conversa anterior va caducar. Explica'ns en què et podem ajudar.",
  contactAction: { WHATSAPP: 'Obre WhatsApp', PHONE: 'Truca', EMAIL: 'Envia un correu' },
  contactChannel: { WHATSAPP: 'WhatsApp', PHONE: 'Telèfon', EMAIL: 'Correu electrònic' },
  contactSeparator: ': ',
  timeLocale: 'ca-ES',
}

const pt: WidgetStrings = {
  launcherOpen: 'Abrir o chat de apoio',
  headerClose: 'Fechar',
  stateOnline: 'Online agora',
  stateInstant: 'Resposta imediata',
  stateTyping: 'A escrever…',
  stateTeamSoon: 'A equipa responde em breve',
  stateResolved: 'Conversa resolvida',
  team: 'A equipa',
  assistantFallback: 'Assistente',
  placeholderIdle: 'Escreva uma pergunta…',
  placeholderTeam: 'Escreva à equipa…',
  placeholderAgent: (agentName) => `Escreva a ${agentName}…`,
  composerAria: 'Escreva uma mensagem',
  attach: 'Anexar ficheiro',
  attachSoon: 'Brevemente',
  send: 'Enviar',
  stop: 'Parar a resposta',
  poweredPrefix: 'Com tecnologia de',
  connReconnecting: 'A voltar a ligar…',
  connOffline: 'Sem ligação. A tentar novamente…',
  connShortOffline: 'Sem ligação',
  thinking: 'A pensar…',
  notSent: 'Não enviado',
  retry: 'Tentar novamente',
  today: 'Hoje',
  jumpLatest: 'Ir para a última mensagem',
  pill: (count) => `${count} ${count === 1 ? 'mensagem nova' : 'mensagens novas'}, ir para a última`,
  welcomeTitle: 'Olá 👋 Como podemos ajudar?',
  welcomeSubtitle: 'Escreva-nos e respondemos de imediato.',
  handoffTitle: 'Vamos encaminhar a conversa para a equipa',
  handoffDesc: 'A equipa responde em breve. Entretanto, pode continuar a escrever.',
  joinedSuffix: 'juntou-se',
  resolvedByAgent: (agentName) => `${agentName} resolveu o pedido.`,
  resolvedGeneric: 'O pedido foi resolvido.',
  resolvedTail: 'Se precisar de mais alguma coisa, escreva-nos e voltaremos em breve.',
  agentTyping: 'O agente está a escrever',
  resolutionQuestion: 'Resolvemos a sua questão?',
  yes: 'Sim',
  no: 'Não',
  offerHandoff: 'Quer falar com alguém da equipa?',
  acceptHandoff: 'Sim, falar com alguém',
  declineHandoff: 'Não, obrigado',
  reformulate: 'Escreva a pergunta de outra forma e tentamos novamente.',
  teamQuestion: 'Como avalia o nosso atendimento?',
  teamGood: 'Bom',
  teamFair: 'Razoável',
  teamPoor: 'Mau',
  teamComment: 'O que podemos melhorar? (opcional)',
  commentPrivacy: 'Não inclua dados pessoais.',
  feedbackThanks: 'Agradecemos a sua avaliação.',
  answerQuestion: 'O que correu mal?',
  answerIncorrect: 'Está incorreta',
  answerOutdated: 'Está desatualizada',
  answerIrrelevant: 'Não responde à minha pergunta',
  answerOther: 'Outro motivo',
  answerComment: 'Conte-nos mais (opcional)',
  rateUp: 'Avaliar positivamente',
  rateDown: 'Avaliar negativamente',
  newConvTitle: 'Nova conversa',
  newConvDesc: 'A conversa anterior expirou. Diga-nos como podemos ajudar.',
  contactAction: { WHATSAPP: 'Abrir o WhatsApp', PHONE: 'Ligar', EMAIL: 'Enviar email' },
  contactChannel: { WHATSAPP: 'WhatsApp', PHONE: 'Telefone', EMAIL: 'Email' },
  contactSeparator: ': ',
  timeLocale: 'pt-PT',
}

const fr: WidgetStrings = {
  launcherOpen: 'Ouvrir le chat d’assistance',
  headerClose: 'Fermer',
  stateOnline: 'En ligne',
  stateInstant: 'Réponse instantanée',
  stateTyping: 'Saisie en cours…',
  stateTeamSoon: 'L’équipe vous répondra bientôt',
  stateResolved: 'Conversation résolue',
  team: 'L’équipe',
  assistantFallback: 'Assistant',
  placeholderIdle: 'Saisissez votre question…',
  placeholderTeam: 'Écrivez à l’équipe…',
  placeholderAgent: (agentName) => `Écrivez à ${agentName}…`,
  composerAria: 'Saisissez votre message',
  attach: 'Joindre un fichier',
  attachSoon: 'Bientôt disponible',
  send: 'Envoyer',
  stop: 'Arrêter la réponse',
  poweredPrefix: 'Une technologie',
  connReconnecting: 'Reconnexion…',
  connOffline: 'Hors ligne. Nouvelle tentative…',
  connShortOffline: 'Hors ligne',
  thinking: 'Réflexion en cours…',
  notSent: 'Non envoyé',
  retry: 'Réessayer',
  today: 'Aujourd’hui',
  jumpLatest: 'Aller au dernier message',
  pill: (count) => `${count} ${count === 1 ? 'nouveau message' : 'nouveaux messages'}, aller au dernier message`,
  welcomeTitle: 'Bonjour 👋 Comment pouvons-nous vous aider ?',
  welcomeSubtitle: 'Écrivez-nous et nous vous répondrons tout de suite.',
  handoffTitle: 'Mise en relation avec l’équipe',
  handoffDesc: 'L’équipe vous répondra bientôt. Vous pouvez continuer à écrire en attendant.',
  joinedSuffix: 'a rejoint la conversation',
  resolvedByAgent: (agentName) => `${agentName} a résolu votre demande.`,
  resolvedGeneric: 'Votre demande a été résolue.',
  resolvedTail: 'Si vous avez une autre question, écrivez-nous. Nous vous répondrons tout de suite.',
  agentTyping: 'Votre interlocuteur écrit',
  resolutionQuestion: 'Avons-nous répondu à votre question ?',
  yes: 'Oui',
  no: 'Non',
  offerHandoff: 'Souhaitez-vous parler à un membre de l’équipe ?',
  acceptHandoff: 'Oui, parler à un membre de l’équipe',
  declineHandoff: 'Non, merci',
  reformulate: 'Reformulez votre question pour réessayer.',
  teamQuestion: 'Comment évaluez-vous notre assistance ?',
  teamGood: 'Bonne',
  teamFair: 'Moyenne',
  teamPoor: 'Mauvaise',
  teamComment: 'Que pouvons-nous améliorer ? (facultatif)',
  commentPrivacy: 'N’indiquez aucune donnée personnelle.',
  feedbackThanks: 'Merci pour votre évaluation.',
  answerQuestion: 'Qu’est-ce qui n’a pas fonctionné ?',
  answerIncorrect: 'La réponse est incorrecte',
  answerOutdated: 'La réponse n’est plus à jour',
  answerIrrelevant: 'La réponse ne répond pas à ma question',
  answerOther: 'Autre raison',
  answerComment: 'Précisez votre réponse (facultatif)',
  rateUp: 'Évaluer positivement',
  rateDown: 'Évaluer négativement',
  newConvTitle: 'Nouvelle conversation',
  newConvDesc: 'La conversation précédente a expiré. Dites-nous comment nous pouvons vous aider.',
  contactAction: { WHATSAPP: 'Ouvrir WhatsApp', PHONE: 'Appeler', EMAIL: 'Envoyer un e-mail' },
  contactChannel: { WHATSAPP: 'WhatsApp', PHONE: 'Téléphone', EMAIL: 'E-mail' },
  contactSeparator: ' : ',
  timeLocale: 'fr-FR',
}

const it: WidgetStrings = {
  launcherOpen: 'Apri la chat di assistenza',
  headerClose: 'Chiudi',
  stateOnline: 'Online',
  stateInstant: 'Risposta immediata',
  stateTyping: 'Scrittura in corso…',
  stateTeamSoon: 'Il team ti risponderà a breve',
  stateResolved: 'Conversazione risolta',
  team: 'Il team',
  assistantFallback: 'Assistente',
  placeholderIdle: 'Scrivi la tua domanda…',
  placeholderTeam: 'Scrivi al team…',
  placeholderAgent: (agentName) => `Scrivi a ${agentName}…`,
  composerAria: 'Scrivi il tuo messaggio',
  attach: 'Allega un file',
  attachSoon: 'Disponibile a breve',
  send: 'Invia',
  stop: 'Interrompi la risposta',
  poweredPrefix: 'Con tecnologia',
  connReconnecting: 'Riconnessione in corso…',
  connOffline: 'Connessione assente. Nuovo tentativo in corso…',
  connShortOffline: 'Connessione assente',
  thinking: 'Sto pensando…',
  notSent: 'Invio non riuscito',
  retry: 'Riprova',
  today: 'Oggi',
  jumpLatest: 'Vai all’ultimo messaggio',
  pill: (count) => `${count} ${count === 1 ? 'nuovo messaggio' : 'nuovi messaggi'}, vai all’ultimo`,
  welcomeTitle: 'Ciao 👋 Come possiamo aiutarti?',
  welcomeSubtitle: 'Scrivici e ti risponderemo subito.',
  handoffTitle: 'Ti mettiamo in contatto con il team',
  handoffDesc: 'Il team ti risponderà a breve. Nel frattempo puoi continuare a scrivere.',
  joinedSuffix: 'ha preso parte alla conversazione',
  resolvedByAgent: (agentName) => `${agentName} ha risolto la tua richiesta.`,
  resolvedGeneric: 'Abbiamo risolto la tua richiesta.',
  resolvedTail: 'Se hai altre domande, scrivici. Ti risponderemo subito.',
  agentTyping: 'Stanno scrivendo',
  resolutionQuestion: 'Abbiamo risolto la tua richiesta?',
  yes: 'Sì',
  no: 'No',
  offerHandoff: 'Vuoi parlare con una persona del team?',
  acceptHandoff: 'Sì, con una persona',
  declineHandoff: 'No, grazie',
  reformulate: 'Riformula la domanda e riproviamo.',
  teamQuestion: 'Come valuti la nostra assistenza?',
  teamGood: 'Buona',
  teamFair: 'Sufficiente',
  teamPoor: 'Scarsa',
  teamComment: 'Cosa possiamo migliorare? (facoltativo)',
  commentPrivacy: 'Non inserire dati personali.',
  feedbackThanks: 'Grazie per la valutazione.',
  answerQuestion: 'Cosa non ha funzionato?',
  answerIncorrect: 'La risposta è sbagliata',
  answerOutdated: 'La risposta non è aggiornata',
  answerIrrelevant: 'Non risponde alla mia domanda',
  answerOther: 'Altro motivo',
  answerComment: 'Aggiungi un commento (facoltativo)',
  rateUp: 'Dai una valutazione positiva',
  rateDown: 'Dai una valutazione negativa',
  newConvTitle: 'Nuova conversazione',
  newConvDesc: 'La conversazione precedente è scaduta. Dicci come possiamo aiutarti.',
  contactAction: { WHATSAPP: 'Apri WhatsApp', PHONE: 'Chiama', EMAIL: 'Invia un’email' },
  contactChannel: { WHATSAPP: 'WhatsApp', PHONE: 'Telefono', EMAIL: 'Email' },
  contactSeparator: ': ',
  timeLocale: 'it-IT',
}

export const STRINGS: Record<WidgetLocale, WidgetStrings> = { es, en, ca, pt, fr, it }

// Español por defecto: el mismo criterio que el resto del shell cuando nadie
// (host ni config) declara un locale soportado (Plan 4, prioridad host >
// config.locale > 'es') — así un componente montado en un test o harness sin
// <StringsContext.Provider> explícito (p.ej. la suite existente, ninguna
// modificada para esta task) sigue viendo el copy en español de siempre.
export const StringsContext = createContext<WidgetStrings>(STRINGS.es)

export function useStrings(): WidgetStrings {
  return useContext(StringsContext)
}
