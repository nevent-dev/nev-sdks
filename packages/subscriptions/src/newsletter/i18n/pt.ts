import type { NewsletterLabels } from './types';

/**
 * Portuguese (pt) translations for the newsletter widget
 */
export const pt: NewsletterLabels = {
  // Form chrome
  formTitle: 'Subscreva a nossa newsletter',
  formAriaLabel: 'Formulário de subscrição da newsletter',

  // Buttons
  submitButton: 'Subscrever',
  loadingButton: 'A enviar…',

  // Status messages
  successMessage:
    'Subscrição concluída. Já pode receber as nossas comunicações.',
  errorMessage: 'Ocorreu um erro. Tente novamente.',
  alreadySubscribed: 'Este endereço de email já está subscrito.',
  invalidEmail: 'Introduza um endereço de email válido.',
  offlineMessage: 'Sem ligação à Internet. Verifique a ligação.',
  retryMessage: 'A tentar voltar a ligar…',

  // GDPR
  gdprText:
    'Aceito o tratamento dos meus dados pessoais para receber comunicações comerciais e promoções relacionadas com {{companyName}}, de acordo com a {{privacyPolicyLink}}.',
  gdprRequired: 'Deve aceitar a política de privacidade para continuar.',
  privacyPolicyLabel: 'Política de privacidade',

  // Default email field (when the API configuration brings none)
  emailLabel: 'Email',
  emailPlaceholder: 'Endereço de email',

  firstNamePlaceholder: 'Nome próprio',
  lastNamePlaceholder: 'Apelidos',
  postalCodePlaceholder: 'Código postal',
  birthDatePlaceholder: 'Data de nascimento',

  // Validation
  fieldRequired: 'Campo obrigatório: {{fieldName}}',
  fieldInvalid: 'Valor inválido: {{fieldName}}',
  invalidEmailFormat: 'Introduza um endereço de email válido',
  invalidPhoneFormat: 'Introduza um número de telefone válido',
  invalidNumberFormat: 'Introduza um número válido',
  invalidUrlFormat: 'Introduza um URL válido',

  // Accessibility
  statusRegionLabel: 'Estado do formulário',
  errorPrefix: 'Erro:',
  successPrefix: 'Sucesso:',

  // Widget unavailable (HTTP 422 from /config — tenant legal incomplete)
  widgetUnavailable:
    'Formulário indisponível. Contacte a organização do evento.',
};
