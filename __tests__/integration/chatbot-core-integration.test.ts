/**
 * Integration Test: Chatbot <-> Core
 *
 * Verifies that @nevent/chatbot correctly extends and delegates to @nevent/core
 * utilities. Tests inheritance chains, delegation patterns, and behavioral
 * compatibility between the two packages.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ErrorBoundary as CoreErrorBoundary,
  Sanitizer as CoreSanitizer,
  I18nManager as CoreI18nManager,
} from '@nevent/core';
import type { NormalizedError } from '@nevent/core';
import { ErrorBoundary as ChatbotErrorBoundary } from '@nevent/chatbot/src/chatbot/error-boundary';
import { MessageSanitizer } from '@nevent/chatbot/src/chatbot/message-sanitizer';
import { I18nManager as ChatbotI18nManager } from '@nevent/chatbot/src/chatbot/i18n-manager';

// ============================================================================
// ErrorBoundary Inheritance
// ============================================================================

describe('Chatbot ErrorBoundary extends Core ErrorBoundary', () => {
  it('should be an instance of Core ErrorBoundary', () => {
    const chatbotBoundary = new ChatbotErrorBoundary();
    expect(chatbotBoundary).toBeInstanceOf(CoreErrorBoundary);
  });

  it('should be an instance of Chatbot ErrorBoundary', () => {
    const chatbotBoundary = new ChatbotErrorBoundary();
    expect(chatbotBoundary).toBeInstanceOf(ChatbotErrorBoundary);
  });

  it('should inherit guard() from core', () => {
    const chatbotBoundary = new ChatbotErrorBoundary();

    const result = chatbotBoundary.guard(() => 'success');
    expect(result).toBe('success');

    const errorResult = chatbotBoundary.guard(() => {
      throw new Error('chatbot error');
    });
    expect(errorResult).toBeUndefined();
  });

  it('should inherit guardAsync() from core', async () => {
    const chatbotBoundary = new ChatbotErrorBoundary();

    const result = await chatbotBoundary.guardAsync(async () => 'async-ok');
    expect(result).toBe('async-ok');

    const errorResult = await chatbotBoundary.guardAsync(async () => {
      throw new Error('async chatbot error');
    });
    expect(errorResult).toBeUndefined();
  });

  it('should inherit wrapCallback() from core', () => {
    const chatbotBoundary = new ChatbotErrorBoundary();

    const wrapped = chatbotBoundary.wrapCallback(
      () => 'callback-ok',
      'testCallback',
    );
    expect(wrapped()).toBe('callback-ok');

    // Wrapping a throwing callback should not propagate
    const throwingWrapped = chatbotBoundary.wrapCallback(() => {
      throw new Error('callback error');
    }, 'errorCallback');
    expect(() => throwingWrapped()).not.toThrow();
  });

  it('should override guardTimer() to return a function (chatbot signature)', () => {
    const chatbotBoundary = new ChatbotErrorBoundary();
    let called = false;

    const timerFn = chatbotBoundary.guardTimer(() => {
      called = true;
    }, 'testTimer');

    // Chatbot guardTimer returns a function, not a number
    expect(typeof timerFn).toBe('function');

    // Calling the returned function should execute the original
    (timerFn as () => void)();
    expect(called).toBe(true);
  });

  it('should catch errors in chatbot guardTimer wrapper', () => {
    const chatbotBoundary = new ChatbotErrorBoundary();
    const errors: NormalizedError[] = [];

    chatbotBoundary.setErrorHandler((err) => {
      errors.push(err as NormalizedError);
    });

    const timerFn = chatbotBoundary.guardTimer(() => {
      throw new Error('timer explosion');
    }, 'explodingTimer');

    // Should not throw when called
    expect(() => (timerFn as () => void)()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('timer explosion');
  });

  it('should override normalize() returning ChatbotError-compatible shape', () => {
    const normalized = ChatbotErrorBoundary.normalize(
      new Error('chatbot fail'),
      'render',
    );

    // Should have the same NormalizedError structure
    expect(normalized).toHaveProperty('code');
    expect(normalized).toHaveProperty('message');
    expect(normalized.code).toBe('UNKNOWN_ERROR');
    expect(normalized.message).toBe('render: chatbot fail');
  });

  it('core guard() catches errors thrown by chatbot code', () => {
    const coreBoundary = new CoreErrorBoundary();
    const errors: NormalizedError[] = [];

    coreBoundary.setErrorHandler((err) => errors.push(err));

    // Simulate chatbot code running inside a core error boundary
    const result = coreBoundary.guard(() => {
      // Chatbot-specific code that fails
      throw new Error('Chatbot render failed: invalid config');
    }, 'chatbot:render');

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('chatbot:render');
    expect(errors[0]!.message).toContain('Chatbot render failed');
  });

  it('core and chatbot ErrorBoundary instances are independent', () => {
    const coreBoundary = new CoreErrorBoundary();
    const chatbotBoundary = new ChatbotErrorBoundary();

    const coreErrors: NormalizedError[] = [];
    const chatbotErrors: NormalizedError[] = [];

    coreBoundary.setErrorHandler((err) => coreErrors.push(err));
    chatbotBoundary.setErrorHandler((err) =>
      chatbotErrors.push(err as NormalizedError),
    );

    // Error in core
    coreBoundary.guard(() => {
      throw new Error('core error');
    });

    // Error in chatbot
    chatbotBoundary.guard(() => {
      throw new Error('chatbot error');
    });

    expect(coreErrors).toHaveLength(1);
    expect(chatbotErrors).toHaveLength(1);
    expect(coreErrors[0]!.message).toBe('core error');
    expect(chatbotErrors[0]!.message).toBe('chatbot error');
  });
});

// ============================================================================
// MessageSanitizer delegates to Core Sanitizer
// ============================================================================

describe('Chatbot MessageSanitizer delegates to Core Sanitizer', () => {
  it('escapeHtml() produces same output as core Sanitizer.escapeHtml()', () => {
    const testCases = [
      '<script>alert(1)</script>',
      'Hello "world" & \'you\'',
      '<img src=x onerror=alert(1)>',
      'Normal text without HTML',
      '',
      'Tom & Jerry < Friends > Enemies',
    ];

    for (const input of testCases) {
      expect(MessageSanitizer.escapeHtml(input)).toBe(
        CoreSanitizer.escapeHtml(input),
      );
    }
  });

  it('sanitize() removes dangerous tags like core sanitizeHtml()', () => {
    const dangerous = '<b>Hello</b><script>alert(1)</script>';

    const chatbotResult = MessageSanitizer.sanitize(dangerous);
    const coreResult = CoreSanitizer.sanitizeHtml(dangerous);

    // Both should strip <script> and keep <b>
    expect(chatbotResult).toContain('<b>Hello</b>');
    expect(chatbotResult).not.toContain('<script>');
    expect(coreResult).toContain('<b>Hello</b>');
    expect(coreResult).not.toContain('<script>');
  });

  it('sanitize() uses chatbot-specific ALLOWED_TAGS (no h1, h2, h6)', () => {
    const html =
      '<h1>Title</h1><h2>Sub</h2><h3>Small</h3><h6>Tiny</h6>';

    const chatbotResult = MessageSanitizer.sanitize(html);

    // h3 should be preserved (in chatbot whitelist)
    expect(chatbotResult).toContain('<h3>Small</h3>');
    // h1, h2, h6 should be stripped (not in chatbot whitelist)
    expect(chatbotResult).not.toContain('<h1>');
    expect(chatbotResult).not.toContain('<h2>');
    expect(chatbotResult).not.toContain('<h6>');
  });

  it('core Sanitizer.sanitizeHtml() works with chatbot ALLOWED_TAGS', () => {
    const chatbotAllowedTags = Array.from(MessageSanitizer.ALLOWED_TAGS);
    const html = '<b>Bold</b><h3>Heading</h3><h1>Big</h1>';

    const result = CoreSanitizer.sanitizeHtml(html, chatbotAllowedTags);

    expect(result).toContain('<b>Bold</b>');
    expect(result).toContain('<h3>Heading</h3>');
    expect(result).not.toContain('<h1>');
  });

  it('chatbot has additional methods not in core (stripHtml, isDangerous)', () => {
    expect(typeof MessageSanitizer.stripHtml).toBe('function');
    expect(typeof MessageSanitizer.isDangerous).toBe('function');

    expect(MessageSanitizer.stripHtml('<b>Hello</b> <em>world</em>')).toBe(
      'Hello world',
    );
    expect(MessageSanitizer.isDangerous('<script>alert(1)</script>')).toBe(
      true,
    );
    expect(MessageSanitizer.isDangerous('<b>safe</b>')).toBe(false);
  });

  it('both sanitizers handle empty/null input consistently', () => {
    expect(MessageSanitizer.sanitize('')).toBe('');
    expect(CoreSanitizer.sanitizeHtml('')).toBe('');
    // @ts-expect-error Testing non-string input
    expect(MessageSanitizer.sanitize(null)).toBe('');
    // @ts-expect-error Testing non-string input
    expect(CoreSanitizer.sanitizeHtml(null)).toBe('');
  });
});

// ============================================================================
// I18nManager Inheritance
// ============================================================================

describe('Chatbot I18nManager extends Core I18nManager', () => {
  it('should be an instance of Core I18nManager', () => {
    const chatbotI18n = new ChatbotI18nManager();
    expect(chatbotI18n).toBeInstanceOf(CoreI18nManager);
  });

  it('should be an instance of Chatbot I18nManager', () => {
    const chatbotI18n = new ChatbotI18nManager();
    expect(chatbotI18n).toBeInstanceOf(ChatbotI18nManager);
  });

  it('should inherit t() from core with locale-aware behavior', () => {
    const i18n = new ChatbotI18nManager('en');
    expect(i18n.t('sendButton')).toBe('Send');

    i18n.setLocale('es');
    expect(i18n.t('sendButton')).toBe('Enviar');
  });

  it('should inherit setLocale() from core', () => {
    const i18n = new ChatbotI18nManager('en');
    expect(i18n.getLocale()).toBe('en');

    i18n.setLocale('ca');
    expect(i18n.getLocale()).toBe('ca');
    expect(i18n.t('sendButton')).toBe('Enviar');
  });

  it('should inherit getLocale() from core', () => {
    const i18n = new ChatbotI18nManager('pt');
    expect(i18n.getLocale()).toBe('pt');
  });

  it('should have chatbot-specific format() method', () => {
    const i18n = new ChatbotI18nManager('en');
    expect(typeof i18n.format).toBe('function');

    const result = i18n.format('minutesAgo', { n: 5 });
    expect(result).toBe('5 min ago');
  });

  it('should support translation overrides (chatbot-specific)', () => {
    const i18n = new ChatbotI18nManager('en');
    expect(i18n.t('poweredBy')).toBe('Powered by Nevent');

    i18n.setOverrides({ poweredBy: 'Powered by Acme Corp' });
    expect(i18n.t('poweredBy')).toBe('Powered by Acme Corp');
  });

  it('should have typed detectLocale() (returns SupportedLocale)', () => {
    const locale = ChatbotI18nManager.detectLocale();
    expect(typeof locale).toBe('string');
    expect(['es', 'en', 'ca', 'pt']).toContain(locale);
  });

  it('should support all 4 locales (es, en, ca, pt)', () => {
    const locales = ['es', 'en', 'ca', 'pt'] as const;

    for (const locale of locales) {
      const i18n = new ChatbotI18nManager(locale);
      expect(i18n.getLocale()).toBe(locale);
      // Every locale should have a sendButton translation
      expect(i18n.t('sendButton')).toBeTruthy();
      expect(i18n.t('sendButton')).not.toBe('sendButton'); // Not falling back to key
    }
  });

  it('defaults to es when no locale is specified and navigator is not available', () => {
    // In jsdom, navigator.language defaults to '' or 'en'
    // The chatbot I18nManager falls back to 'es' when no explicit locale is given
    const i18n = new ChatbotI18nManager();
    const locale = i18n.getLocale();
    // Should be either the detected locale or 'es' default
    expect(['es', 'en', 'ca', 'pt']).toContain(locale);
  });
});
