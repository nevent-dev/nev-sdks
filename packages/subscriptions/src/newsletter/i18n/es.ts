import type { NewsletterLabels } from './types';

/**
 * Spanish (es) translations for the newsletter widget
 */
export const es: NewsletterLabels = {
  // Form chrome
  formTitle: 'Suscribete a nuestro newsletter',
  formAriaLabel: 'Formulario de suscripcion al newsletter',

  // Buttons
  submitButton: 'Suscribirse',
  loadingButton: 'Enviando...',

  // Status messages
  successMessage:
    'Suscripcion exitosa. Ya estas recibiendo nuestras comunicaciones.',
  errorMessage: 'Ha ocurrido un error. Intentalo de nuevo.',
  alreadySubscribed: 'Este email ya esta suscrito.',
  invalidEmail: 'Por favor, introduce un email valido.',
  offlineMessage: 'Sin conexion a internet. Comprueba tu conexion.',
  retryMessage: 'Reintentando conexion...',

  // GDPR
  gdprText:
    'Acepto el tratamiento de mis datos personales para recibir comunicaciones comerciales y promociones relacionadas con {{companyName}}, segun la {{privacyPolicyLink}}.',
  gdprRequired: 'Debes aceptar la politica de privacidad para continuar.',
  privacyPolicyLabel: 'Politica de Privacidad',

  // Validation
  fieldRequired: '{{fieldName}} es obligatorio',
  invalidEmailFormat: 'Por favor, introduce un email valido',
  invalidPhoneFormat: 'Por favor, introduce un telefono valido',
  invalidNumberFormat: 'Por favor, introduce un numero valido',
  invalidUrlFormat: 'Por favor, introduce una URL valida',

  // Accessibility
  statusRegionLabel: 'Estado del formulario',
  errorPrefix: 'Error:',
  successPrefix: 'Exito:',
};
