import type { NewsletterLabels } from './types';

/** German (Germany) translations for the newsletter widget. */
export const de: NewsletterLabels = {
  formTitle: 'Newsletter abonnieren',
  formAriaLabel: 'Anmeldeformular für den Newsletter',

  submitButton: 'Abonnieren',
  loadingButton: 'Wird gesendet…',

  successMessage: 'Sie haben den Newsletter abonniert und erhalten jetzt unsere Mitteilungen.',
  errorMessage: 'Ein Fehler ist aufgetreten. Versuchen Sie es erneut.',
  alreadySubscribed: 'Diese E-Mail-Adresse ist bereits angemeldet.',
  invalidEmail: 'Geben Sie eine gültige E-Mail-Adresse ein.',
  offlineMessage: 'Keine Internetverbindung. Prüfen Sie Ihre Verbindung.',
  retryMessage: 'Verbindung wird erneut aufgebaut…',

  gdprText:
    'Ich willige in die Verarbeitung meiner personenbezogenen Daten ein, um kommerzielle Mitteilungen und Angebote zu {{companyName}} gemäß der {{privacyPolicyLink}} zu erhalten.',
  gdprRequired: 'Akzeptieren Sie die Datenschutzerklärung, um fortzufahren.',
  privacyPolicyLabel: 'Datenschutzerklärung',

  emailLabel: 'E-Mail',
  emailPlaceholder: 'Ihre E-Mail',
  firstNamePlaceholder: 'Ihr Vorname',
  lastNamePlaceholder: 'Nachname',
  postalCodePlaceholder: 'Postleitzahl',
  birthDatePlaceholder: 'Geburtsdatum',

  fieldRequired: 'Pflichtfeld: {{fieldName}}',
  fieldInvalid: 'Ungültige Eingabe: {{fieldName}}',
  invalidEmailFormat: 'Geben Sie eine gültige E-Mail-Adresse ein.',
  invalidPhoneFormat: 'Geben Sie eine gültige Telefonnummer ein.',
  invalidNumberFormat: 'Geben Sie eine gültige Zahl ein.',
  invalidUrlFormat: 'Geben Sie eine gültige URL ein.',

  statusRegionLabel: 'Formularstatus',
  errorPrefix: 'Fehler:',
  successPrefix: 'Erfolg:',

  widgetUnavailable: 'Das Formular ist nicht verfügbar. Wenden Sie sich an den Veranstalter.',
};
