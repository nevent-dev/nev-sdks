import type { ChatbotTranslations } from '../../types';

export interface RendererLabels {
  keyboardHint: string;
  scrollToBottom: string;
  user: string;
  bot: string;
  today: string;
  labelSeparator: string;
  quickReplies: string;
  carousel: string;
  previousCard: string;
  nextCard: string;
  openImage: string;
  brokenImage: string;
}

export interface LocaleCatalog {
  translations: ChatbotTranslations;
  rendererLabels: RendererLabels;
}
