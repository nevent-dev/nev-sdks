import type { NewsletterLabels } from './types';

/**
 * English (en) translations for the newsletter widget
 */
export const en: NewsletterLabels = {
  // Form chrome
  formTitle: 'Subscribe to our newsletter',
  formAriaLabel: 'Newsletter subscription form',

  // Buttons
  submitButton: 'Subscribe',
  loadingButton: 'Sending...',

  // Status messages
  successMessage:
    'Subscription successful! You are now receiving our communications.',
  errorMessage: 'An error occurred. Please try again.',
  alreadySubscribed: 'This email is already subscribed.',
  invalidEmail: 'Please enter a valid email address.',
  offlineMessage: 'No internet connection. Please check your connection.',
  retryMessage: 'Retrying connection...',

  // GDPR
  gdprText:
    'I accept the processing of my personal data to receive commercial communications and promotions related to {{companyName}}, according to the {{privacyPolicyLink}}.',
  gdprRequired: 'You must accept the privacy policy to continue.',
  privacyPolicyLabel: 'Privacy Policy',

  // Validation
  fieldRequired: '{{fieldName}} is required',
  invalidEmailFormat: 'Please enter a valid email address',
  invalidPhoneFormat: 'Please enter a valid phone number',
  invalidNumberFormat: 'Please enter a valid number',
  invalidUrlFormat: 'Please enter a valid URL',

  // Accessibility
  statusRegionLabel: 'Form status',
  errorPrefix: 'Error:',
  successPrefix: 'Success:',
};
