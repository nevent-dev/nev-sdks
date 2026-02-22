/**
 * @nevent/subscriptions - Newsletter subscription widget
 *
 * An enterprise-grade newsletter subscription widget for the Nevent platform.
 *
 * Features:
 * - Shadow DOM encapsulation (CSS isolation)
 * - Error isolation via ErrorBoundary (widget errors never crash host page)
 * - i18n support (es, en, ca, pt with auto-detection)
 * - HTML sanitization for XSS prevention
 * - WCAG 2.1 AA accessibility compliance
 * - GDPR-compliant subscription forms
 * - Customizable layouts (column/row)
 * - Google Fonts and custom fonts support
 * - Responsive design
 * - Form validation
 * - Connection management with retry logic and offline detection
 * - Analytics tracking
 * - Proper destroy() lifecycle method
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
 *   locale: 'en',
 *   onError: (err) => console.error('Widget error:', err),
 * });
 *
 * await widget.init();
 *
 * // Cleanup when done
 * widget.destroy();
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
