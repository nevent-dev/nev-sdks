import type { NewsletterLabels } from './types';

/**
 * Spanish (es) translations for the newsletter widget
 */
export const es: NewsletterLabels = {
  // Form chrome
  formTitle: 'Suscríbete a nuestro newsletter',
  formAriaLabel: 'Formulario de suscripción al newsletter',

  // Buttons
  submitButton: 'Suscribirse',
  loadingButton: 'Enviando...',

  // Status messages
  successMessage:
    'Suscripción exitosa. Ya estás recibiendo nuestras comunicaciones.',
  errorMessage: 'Ha ocurrido un error. Inténtalo de nuevo.',
  alreadySubscribed: 'Este email ya está suscrito.',
  invalidEmail: 'Por favor, introduce un email válido.',
  offlineMessage: 'Sin conexión a internet. Comprueba tu conexión.',
  retryMessage: 'Reintentando conexión...',

  // GDPR
  gdprText:
    'Acepto el tratamiento de mis datos personales para recibir comunicaciones comerciales y promociones relacionadas con {{companyName}}, según la {{privacyPolicyLink}}.',
  gdprRequired: 'Debes aceptar la política de privacidad para continuar.',
  privacyPolicyLabel: 'Política de Privacidad',

  // Validation
  fieldRequired: '{{fieldName}} es obligatorio',
  fieldInvalid: '{{fieldName}} no es válido',
  invalidEmailFormat: 'Por favor, introduce un email válido',
  invalidPhoneFormat: 'Por favor, introduce un teléfono válido',
  invalidNumberFormat: 'Por favor, introduce un número válido',
  invalidUrlFormat: 'Por favor, introduce una URL válida',

  // Accessibility
  statusRegionLabel: 'Estado del formulario',
  errorPrefix: 'Error:',
  successPrefix: 'Éxito:',

  // Widget unavailable (HTTP 422 from /config — tenant legal incomplete)
  widgetUnavailable:
    'Formulario no disponible. Contacta con el organizador del evento.',
};
