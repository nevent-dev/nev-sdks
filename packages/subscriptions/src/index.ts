/**
 * @nevent/subscriptions - Newsletter subscription widget
 *
 * A production-ready newsletter subscription widget for the Nevent platform.
 *
 * Features:
 * - GDPR-compliant subscription forms
 * - Customizable layouts (column/row)
 * - Google Fonts and custom fonts support
 * - Responsive design
 * - Form validation
 * - Error handling and retry logic
 * - Analytics tracking
 * - TypeScript support
 *
 * @example
 * ```typescript
 * import { NewsletterWidget } from '@nevent/subscriptions';
 *
 * const widget = new NewsletterWidget({
 *   newsletterId: 'newsletter-123',
 *   tenantId: 'tenant-456',
 *   containerId: 'newsletter-container',
 * });
 *
 * await widget.init();
 * ```
 *
 * @packageDocumentation
 */

export { NewsletterWidget } from './newsletter-widget';
export type {
  NewsletterConfig,
  FieldConfig,
  FontConfig,
  WidgetStyles,
  LayoutDirection,
  SubscriptionData,
  SubscriptionResponse,
  ServerWidgetConfig,
  CustomFont,
  FontsResponse,
} from './types';
