import type { NewsletterLabels } from './types';

/**
 * Catalan (ca) translations for the newsletter widget
 */
export const ca: NewsletterLabels = {
  // Form chrome
  formTitle: "Subscriu-te al nostre newsletter",
  formAriaLabel: "Formulari de subscripcio al newsletter",

  // Buttons
  submitButton: "Subscriure's",
  loadingButton: 'Enviant...',

  // Status messages
  successMessage:
    'Subscripcio correcta. Ja estas rebent les nostres comunicacions.',
  errorMessage: "S'ha produit un error. Torna-ho a intentar.",
  alreadySubscribed: 'Aquest email ja esta subscrit.',
  invalidEmail: 'Si us plau, introdueix un email valid.',
  offlineMessage: "Sense connexio a internet. Comprova la teva connexio.",
  retryMessage: 'Reintentant connexio...',

  // GDPR
  gdprText:
    "Accepto el tractament de les meves dades personals per rebre comunicacions comercials i promocions relacionades amb {{companyName}}, segons la {{privacyPolicyLink}}.",
  gdprRequired: 'Has d\'acceptar la politica de privacitat per continuar.',
  privacyPolicyLabel: 'Politica de Privacitat',

  // Validation
  fieldRequired: '{{fieldName}} es obligatori',
  invalidEmailFormat: 'Si us plau, introdueix un email valid',
  invalidPhoneFormat: 'Si us plau, introdueix un telefon valid',
  invalidNumberFormat: 'Si us plau, introdueix un nombre valid',
  invalidUrlFormat: 'Si us plau, introdueix una URL valida',

  // Accessibility
  statusRegionLabel: 'Estat del formulari',
  errorPrefix: 'Error:',
  successPrefix: 'Exit:',
};
