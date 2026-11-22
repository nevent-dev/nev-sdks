import type { NewsletterLabels } from './types';

/** Dutch translations for the newsletter widget. */
export const nl: NewsletterLabels = {
  formTitle: 'Aanmelden voor de nieuwsbrief',
  formAriaLabel: 'Aanmeldformulier voor de nieuwsbrief',

  submitButton: 'Aanmelden',
  loadingButton: 'Verzenden…',

  successMessage: 'De aanmelding is gelukt. Voortaan ontvangt u onze berichten.',
  errorMessage: 'Er is een fout opgetreden. Probeer het opnieuw.',
  alreadySubscribed: 'Dit e-mailadres is al aangemeld.',
  invalidEmail: 'Voer een geldig e-mailadres in.',
  offlineMessage: 'Geen internetverbinding. Controleer de verbinding.',
  retryMessage: 'Opnieuw verbinden…',

  gdprText:
    'Ik ga akkoord met de verwerking van mijn persoonsgegevens om commerciële berichten en promoties over {{companyName}} te ontvangen, volgens de {{privacyPolicyLink}}.',
  gdprRequired: 'Accepteer het privacybeleid om door te gaan.',
  privacyPolicyLabel: 'Privacybeleid',

  emailLabel: 'E-mail',
  emailPlaceholder: 'E-mailadres',
  firstNamePlaceholder: 'Voornaam',
  lastNamePlaceholder: 'Achternaam',
  postalCodePlaceholder: 'Postcode',
  birthDatePlaceholder: 'Geboortedatum',

  fieldRequired: 'Verplicht veld: {{fieldName}}',
  fieldInvalid: 'Ongeldige invoer: {{fieldName}}',
  invalidEmailFormat: 'Voer een geldig e-mailadres in',
  invalidPhoneFormat: 'Voer een geldig telefoonnummer in',
  invalidNumberFormat: 'Voer een geldig getal in',
  invalidUrlFormat: 'Voer een geldige URL in',

  statusRegionLabel: 'Formulierstatus',
  errorPrefix: 'Fout:',
  successPrefix: 'Gelukt:',

  widgetUnavailable: 'Het formulier is niet beschikbaar. Neem contact op met de organisator.',
};
