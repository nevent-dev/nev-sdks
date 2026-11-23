import type { NewsletterLabels } from './types';

/** French (France) translations for the newsletter widget. */
export const fr: NewsletterLabels = {
  formTitle: 'S’abonner à notre newsletter',
  formAriaLabel: 'Formulaire d’inscription à la newsletter',

  submitButton: 'S’abonner',
  loadingButton: 'Envoi en cours…',

  successMessage: 'Votre inscription est confirmée. Vous recevrez nos communications.',
  errorMessage: 'Une erreur est survenue. Réessayez.',
  alreadySubscribed: 'Cette adresse e-mail est déjà inscrite.',
  invalidEmail: 'Saisissez une adresse e-mail valide.',
  offlineMessage: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  retryMessage: 'Reconnexion en cours…',

  gdprText:
    'J’accepte le traitement de mes données personnelles pour recevoir des communications commerciales et des promotions liées à {{companyName}}, conformément à la {{privacyPolicyLink}}.',
  gdprRequired: 'Acceptez la politique de confidentialité pour continuer.',
  privacyPolicyLabel: 'Politique de confidentialité',

  emailLabel: 'E-mail',
  emailPlaceholder: 'Votre adresse e-mail',
  firstNamePlaceholder: 'Votre prénom',
  lastNamePlaceholder: 'Nom de famille',
  postalCodePlaceholder: 'Code postal',
  birthDatePlaceholder: 'Date de naissance',

  fieldRequired: 'Champ obligatoire : {{fieldName}}',
  fieldInvalid: 'Valeur non valide pour {{fieldName}}.',
  invalidEmailFormat: 'Saisissez une adresse e-mail valide.',
  invalidPhoneFormat: 'Saisissez un numéro de téléphone valide.',
  invalidNumberFormat: 'Saisissez un nombre valide.',
  invalidUrlFormat: 'Saisissez une URL valide.',

  statusRegionLabel: 'État du formulaire',
  errorPrefix: 'Erreur :',
  successPrefix: 'Succès :',
  widgetUnavailable: 'Formulaire indisponible. Contactez l’organisateur de l’événement.',
};
