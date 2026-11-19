import type { NewsletterLabels } from './types';

/** Italian (Italy) translations for the newsletter widget. */
export const it: NewsletterLabels = {
  formTitle: 'Iscriviti alla nostra newsletter',
  formAriaLabel: 'Modulo di iscrizione alla newsletter',

  submitButton: 'Iscriviti',
  loadingButton: 'Invio in corso…',

  successMessage: 'Iscrizione confermata. Riceverai le nostre comunicazioni.',
  errorMessage: 'Si è verificato un errore. Riprova.',
  alreadySubscribed: 'Questo indirizzo email è già iscritto.',
  invalidEmail: 'Inserisci un indirizzo email valido.',
  offlineMessage: 'Connessione assente. Controlla la connessione.',
  retryMessage: 'Riconnessione in corso…',

  gdprText:
    'Acconsento al trattamento dei miei dati personali per ricevere comunicazioni commerciali e promozioni relative a {{companyName}}, secondo quanto indicato qui: {{privacyPolicyLink}}.',
  gdprRequired: 'Accetta l’informativa sulla privacy per continuare.',
  privacyPolicyLabel: 'Informativa sulla privacy',

  emailLabel: 'Email',
  emailPlaceholder: 'Il tuo indirizzo email',
  firstNamePlaceholder: 'Il tuo nome',
  lastNamePlaceholder: 'Cognome',
  postalCodePlaceholder: 'CAP',
  birthDatePlaceholder: 'Data di nascita',

  fieldRequired: 'Campo obbligatorio: {{fieldName}}',
  fieldInvalid: 'Valore non valido per il campo {{fieldName}}.',
  invalidEmailFormat: 'Inserisci un indirizzo email valido.',
  invalidPhoneFormat: 'Inserisci un numero di telefono valido.',
  invalidNumberFormat: 'Inserisci un numero valido.',
  invalidUrlFormat: 'Inserisci un URL valido.',

  statusRegionLabel: 'Stato del modulo',
  errorPrefix: 'Errore:',
  successPrefix: 'Operazione riuscita:',
  widgetUnavailable: 'Modulo non disponibile. Contatta chi organizza l’evento.',
};
