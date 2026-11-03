/**
 * Multiple choice, API errors and retries of the subscription POST
 * (nevent-work#315, F3).
 *
 * - A LIST with options travels as properties[propertyDefinitionId] = string[].
 * - Any API failure reaches onError as an Error with status, code and field.
 * - A 400 on a field is shown next to that field (i18n, never the server text);
 *   a 409 shows alreadySubscribed; anything else the generic message.
 * - The POST is retried only on 502, 503, 504 or a network failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWidget,
  getShadowRoot,
  fillInput,
  toggleCheckbox,
  submitForm,
  flush,
  getStatusMessage,
} from './e2e/helpers';

const GENRES = ['Techno', 'House', 'Hard Techno', 'Hard Groove', 'Tech house'];

interface FakeResponse {
  status: number;
  body?: unknown;
  /** When set, fetch rejects (a network failure) instead of answering. */
  networkError?: boolean;
}

function serverConfig(genreRequired: boolean) {
  return {
    title: 'NO TE LO PIERDAS',
    companyName: 'Bassmnt',
    privacyPolicyUrl: 'https://example.com/privacy',
    fieldConfigurations: [
      {
        propertyDefinitionId: 'prop-email',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Email',
        hint: null,
        placeholder: 'Email',
        semanticKey: 'email',
        dataType: 'TEXT',
      },
      {
        propertyDefinitionId: 'prop-genre',
        enabled: true,
        required: genreRequired,
        displayOrder: 2,
        displayName: 'Género musical',
        hint: null,
        placeholder: null,
        semanticKey: 'gnero_musical',
        dataType: 'LIST',
        options: GENRES,
      },
    ],
  };
}

/**
 * Routes the config request and answers the subscription POSTs in order with
 * `responses` (the last one repeats). Returns the recorded POST bodies.
 */
function stubApi(responses: FakeResponse[], genreRequired = true) {
  const posts: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/config')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(serverConfig(genreRequired)),
      });
    }
    if (u.includes('/subscribe')) {
      posts.push(JSON.parse(String(init?.body ?? '{}')));
      const r = responses[Math.min(posts.length - 1, responses.length - 1)];
      if (r.networkError) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: () => Promise.resolve(r.body ?? {}),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { posts };
}

const OK = { status: 200, body: { data: { success: true, message: 'OK' }, success: true } };

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await vi.runAllTimersAsync();
    await flush();
  }
}

async function mountAndFill(
  onError: ReturnType<typeof vi.fn>,
  genres: string[]
): Promise<{ shadow: ShadowRoot; destroy: () => void }> {
  const { widget, container } = createWidget({ onError });
  await widget.init();
  const shadow = getShadowRoot(container)!;
  fillInput(shadow, 'input[name="email"]', 'fan@example.com');
  toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
  for (const g of genres) {
    const box = shadow.querySelector<HTMLInputElement>(
      `input[type="checkbox"][name="gnero_musical"][value="${g}"]`
    );
    expect(box, `checkbox for ${g}`).not.toBeNull();
    box!.click();
  }
  return { shadow, destroy: () => widget.destroy() };
}

function fieldError(shadow: ShadowRoot): HTMLElement {
  return shadow.querySelector(
    '.nevent-field[data-field-name="gnero_musical"] .nevent-field-error'
  ) as HTMLElement;
}

describe('NewsletterWidget · multiple choice (LIST with options)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('payload', () => {
    it('sends the checked options as an array under the propertyDefinitionId', async () => {
      const { posts } = stubApi([OK]);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, ['Hard Groove', 'Techno']);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(1);
      expect(posts[0].properties).toEqual({ 'prop-genre': ['Techno', 'Hard Groove'] });
      expect(onError).not.toHaveBeenCalled();
      destroy();
    });

    it('does not send an optional LIST with nothing checked', async () => {
      const { posts } = stubApi([OK], false);
      const { shadow, destroy } = await mountAndFill(vi.fn(), []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(1);
      expect(posts[0].properties ?? {}).not.toHaveProperty('prop-genre');
      destroy();
    });

    it('a required LIST with nothing checked is not sent and asks for it next to the field', async () => {
      const { posts } = stubApi([OK]);
      const { shadow, destroy } = await mountAndFill(vi.fn(), []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(0);
      expect(fieldError(shadow).textContent).toBe('Género musical is required');
      destroy();
    });
  });

  describe('API errors', () => {
    it('a 400 on the field shows the i18n message next to it, never the server text, and calls onError with an Error', async () => {
      const { posts } = stubApi([
        {
          status: 400,
          body: {
            success: false,
            error: 'VALIDATION_ERROR',
            code: 'VALUE_NOT_ALLOWED',
            field: 'gnero_musical',
            message: "Value 'Techno' is not one of the allowed values: SERVER-RAW-TEXT",
          },
        },
      ]);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, ['Techno']);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(1);
      expect(fieldError(shadow).textContent).toBe('Género musical is not valid');
      expect(fieldError(shadow).classList.contains('nevent-field-error--hidden')).toBe(false);
      expect(shadow.innerHTML).not.toContain('SERVER-RAW-TEXT');

      expect(onError).toHaveBeenCalledTimes(1);
      const err = onError.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err).toMatchObject({ status: 400, code: 'VALUE_NOT_ALLOWED', field: 'gnero_musical' });
      destroy();
    });

    it('a 400 naming the field by propertyDefinitionId is shown next to that field too', async () => {
      stubApi([
        {
          status: 400,
          body: { success: false, error: 'VALIDATION_ERROR', code: 'CUSTOM_FIELD_INVALID', field: 'prop-genre', message: 'x' },
        },
      ]);
      const { shadow, destroy } = await mountAndFill(vi.fn(), ['Techno']);

      submitForm(shadow);
      await settle();

      expect(fieldError(shadow).textContent).toBe('Género musical is not valid');
      destroy();
    });

    it('a 409 shows alreadySubscribed and calls onError with an Error', async () => {
      const { posts } = stubApi([
        {
          status: 409,
          body: {
            success: false,
            error: 'ALREADY_SUBSCRIBED',
            message: 'This email is already subscribed to the newsletter',
          },
        },
      ], false);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(1);
      const status = getStatusMessage(shadow);
      expect(status.isError).toBe(true);
      expect(status.text).toBe('This email is already subscribed.');

      expect(onError).toHaveBeenCalledTimes(1);
      const err = onError.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err).toMatchObject({ status: 409 });
      destroy();
    });

    it('a 500 shows the generic message, calls onError and is sent only once', async () => {
      const { posts } = stubApi([
        {
          status: 500,
          body: { success: false, error: 'INTERNAL_ERROR', message: 'An internal error occurred. Please try again.' },
        },
        OK,
      ], false);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(1);
      expect(getStatusMessage(shadow).text).toBe('An error occurred. Please try again.');
      expect(onError).toHaveBeenCalledTimes(1);
      const err = onError.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err).toMatchObject({ status: 500 });
      destroy();
    });

    it('a 4xx other than 400/409 is sent only once and shows the generic message', async () => {
      const { posts } = stubApi([{ status: 422, body: { message: 'nope' } }, OK], false);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(1);
      expect(getStatusMessage(shadow).text).toBe('An error occurred. Please try again.');
      expect(onError).toHaveBeenCalledTimes(1);
      destroy();
    });
  });

  describe('retries of the subscription POST', () => {
    it('a 503 is retried and the next answer wins', async () => {
      const { posts } = stubApi([{ status: 503, body: { message: 'unavailable' } }, OK], false);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(2);
      expect(posts[1]).toEqual(posts[0]);
      expect(shadow.querySelector('.nevent-newsletter-success-message')).not.toBeNull();
      expect(onError).not.toHaveBeenCalled();
      destroy();
    });

    it.each([502, 504])('a %i is retried', async (status) => {
      const { posts } = stubApi([{ status, body: {} }, OK], false);
      const { shadow, destroy } = await mountAndFill(vi.fn(), []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(2);
      destroy();
    });

    it('a network failure is retried', async () => {
      const { posts } = stubApi([{ status: 0, networkError: true }, OK], false);
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, []);

      submitForm(shadow);
      await settle();

      expect(posts).toHaveLength(2);
      expect(onError).not.toHaveBeenCalled();
      destroy();
    });

    it('a gateway error with a non-JSON body keeps its status and is retried', async () => {
      const posts: unknown[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string, init?: RequestInit) => {
          const u = String(url);
          if (u.includes('/config')) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(serverConfig(false)) });
          }
          if (u.includes('/subscribe')) {
            posts.push(init?.body);
            return Promise.resolve({
              ok: false,
              status: 502,
              statusText: 'Bad Gateway',
              json: () => Promise.reject(new SyntaxError('Unexpected token <')),
            });
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
        })
      );
      const onError = vi.fn();
      const { shadow, destroy } = await mountAndFill(onError, []);

      submitForm(shadow);
      await settle();

      expect(posts.length).toBeGreaterThan(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toMatchObject({ status: 502 });
      destroy();
    });
  });
});
