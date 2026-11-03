import type { ApiError } from '@nevent/core';

/**
 * A failed subscription, as `onError` receives it (nevent-work#315).
 *
 * It is an `Error` (so `error instanceof Error` holds and it carries a stack)
 * with what the API said: the HTTP `status` (0 for a network failure), its
 * `code` and, for a 400 on a custom field, the `field` it rejected.
 */
export class SubscriptionError extends Error {
  /** HTTP status of the answer; 0 when the request never got one. */
  readonly status: number;
  /** Machine-readable code (e.g. `VALUE_NOT_ALLOWED`, `ALREADY_SUBSCRIBED`, `HTTP_500`). */
  readonly code: string;
  /** The field the API rejected (its name or propertyDefinitionId), when it says so. */
  readonly field?: string;

  constructor(
    message: string,
    status: number,
    code: string,
    field?: string
  ) {
    super(message);
    this.name = 'SubscriptionError';
    this.status = status;
    this.code = code;
    if (field) {
      this.field = field;
    }
  }

  /**
   * Builds the error from whatever the HTTP client rejected with: an
   * `ApiError` object from `HttpClient`, an `Error` or anything else.
   *
   * @param failure - The rejected value
   */
  static from(failure: unknown): SubscriptionError {
    if (failure instanceof SubscriptionError) {
      return failure;
    }
    if (typeof failure === 'object' && failure !== null && 'status' in failure) {
      const apiError = failure as ApiError;
      const details = apiError.details ?? {};
      const field =
        typeof details.field === 'string' && details.field ? details.field : undefined;
      // The 409 answers { error: 'ALREADY_SUBSCRIBED' } without a code
      const code =
        typeof details.code === 'string' && details.code
          ? details.code
          : typeof details.error === 'string' && details.error
            ? details.error
            : apiError.code ?? `HTTP_${apiError.status ?? 0}`;
      return new SubscriptionError(
        apiError.message || 'Request failed',
        apiError.status ?? 0,
        code,
        field
      );
    }
    if (failure instanceof Error) {
      return new SubscriptionError(failure.message, 0, 'UNKNOWN_ERROR');
    }
    return new SubscriptionError(String(failure), 0, 'UNKNOWN_ERROR');
  }
}
