/**
 * Newsletter widget i18n translation keys
 *
 * Defines all user-facing strings in the newsletter subscription widget.
 * Each key maps to a translation string that may contain `{{paramName}}`
 * interpolation placeholders.
 *
 * @example
 * ```typescript
 * const labels: NewsletterLabels = {
 *   formTitle: 'Subscribe to our newsletter',
 *   submitButton: 'Subscribe',
 *   gdprText: 'I accept the processing of my data by {{companyName}}...',
 * };
 * ```
 */
export interface NewsletterLabels extends Record<string, string> {
  // Form chrome
  formTitle: string;
  formAriaLabel: string;

  // Buttons
  submitButton: string;
  loadingButton: string;

  // Status messages
  successMessage: string;
  errorMessage: string;
  alreadySubscribed: string;
  invalidEmail: string;
  offlineMessage: string;
  retryMessage: string;

  // GDPR
  gdprText: string;
  gdprRequired: string;
  privacyPolicyLabel: string;

  // Validation
  fieldRequired: string;
  invalidEmailFormat: string;
  invalidPhoneFormat: string;
  invalidNumberFormat: string;
  invalidUrlFormat: string;

  // Accessibility
  statusRegionLabel: string;
  errorPrefix: string;
  successPrefix: string;
}
