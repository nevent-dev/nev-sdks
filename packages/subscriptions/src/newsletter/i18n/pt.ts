import type { NewsletterLabels } from './types';

/**
 * Portuguese (pt) translations for the newsletter widget
 */
export const pt: NewsletterLabels = {
  // Form chrome
  formTitle: 'Subscreva a nossa newsletter',
  formAriaLabel: 'Formulario de subscricao da newsletter',

  // Buttons
  submitButton: 'Subscrever',
  loadingButton: 'A enviar...',

  // Status messages
  successMessage:
    'Subscricao realizada com sucesso! Ja esta a receber as nossas comunicacoes.',
  errorMessage: 'Ocorreu um erro. Por favor, tente novamente.',
  alreadySubscribed: 'Este email ja esta subscrito.',
  invalidEmail: 'Por favor, introduza um email valido.',
  offlineMessage: 'Sem ligacao a internet. Verifique a sua ligacao.',
  retryMessage: 'A tentar ligar novamente...',

  // GDPR
  gdprText:
    'Aceito o tratamento dos meus dados pessoais para receber comunicacoes comerciais e promocoes relacionadas com {{companyName}}, de acordo com a {{privacyPolicyLink}}.',
  gdprRequired:
    'Deve aceitar a politica de privacidade para continuar.',
  privacyPolicyLabel: 'Politica de Privacidade',

  // Validation
  fieldRequired: '{{fieldName}} e obrigatorio',
  invalidEmailFormat: 'Por favor, introduza um email valido',
  invalidPhoneFormat: 'Por favor, introduza um telefone valido',
  invalidNumberFormat: 'Por favor, introduza um numero valido',
  invalidUrlFormat: 'Por favor, introduza um URL valido',

  // Accessibility
  statusRegionLabel: 'Estado do formulario',
  errorPrefix: 'Erro:',
  successPrefix: 'Sucesso:',
};
