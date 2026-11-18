import type { SupportedLocale } from '../../types';

interface RendererLabels {
  keyboardHint: string;
  scrollToBottom: string;
  user: string;
  bot: string;
  today: string;
  quickReplies: string;
  carousel: string;
  previousCard: string;
  nextCard: string;
  openImage: string;
  brokenImage: string;
}

const LABELS: Record<SupportedLocale, RendererLabels> = {
  es: {
    keyboardHint: 'Pulsa Intro para enviar, Mayus+Intro para nueva linea.',
    scrollToBottom: 'Ir al final de la conversación',
    user: 'Tú dijiste',
    bot: 'El bot dijo',
    today: 'Hoy',
    quickReplies: 'Respuestas rápidas',
    carousel: 'Carrusel de tarjetas',
    previousCard: 'Tarjeta anterior',
    nextCard: 'Tarjeta siguiente',
    openImage: 'Abrir imagen en nueva pestaña',
    brokenImage: 'Imagen no disponible',
  },
  en: {
    keyboardHint: 'Press Enter to send, Shift+Enter for a new line.',
    scrollToBottom: 'Scroll to bottom',
    user: 'You said',
    bot: 'Bot said',
    today: 'Today',
    quickReplies: 'Quick replies',
    carousel: 'Card carousel',
    previousCard: 'Previous card',
    nextCard: 'Next card',
    openImage: 'Open image in new tab',
    brokenImage: 'Image not available',
  },
  ca: {
    keyboardHint: 'Prem Intro per enviar, Maj+Intro per nova linia.',
    scrollToBottom: 'Anar al final de la conversa',
    user: 'Has dit',
    bot: 'El bot ha dit',
    today: 'Avui',
    quickReplies: 'Respostes ràpides',
    carousel: 'Carrusel de targetes',
    previousCard: 'Targeta anterior',
    nextCard: 'Targeta següent',
    openImage: 'Obrir imatge en una nova pestanya',
    brokenImage: 'Imatge no disponible',
  },
  pt: {
    keyboardHint: 'Prima Enter para enviar ou Shift+Enter para inserir uma nova linha.',
    scrollToBottom: 'Ir para o final da conversa',
    user: 'Mensagem enviada',
    bot: 'Mensagem do assistente',
    today: 'Hoje',
    quickReplies: 'Respostas rápidas',
    carousel: 'Carrossel de cartões',
    previousCard: 'Cartão anterior',
    nextCard: 'Cartão seguinte',
    openImage: 'Abrir imagem num novo separador',
    brokenImage: 'Imagem não disponível',
  },
};

export function rendererLabel(locale: string | undefined, key: keyof RendererLabels): string {
  const labels = locale && Object.prototype.hasOwnProperty.call(LABELS, locale)
    ? LABELS[locale as SupportedLocale]
    : LABELS.en;
  return labels[key];
}
