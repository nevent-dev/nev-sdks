import { describe, expect, it } from 'vitest';

import { Sanitizer } from '../src/sanitizer';

describe('Sanitizer', () => {
  // --------------------------------------------------------------------------
  // escapeHtml
  // --------------------------------------------------------------------------

  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(Sanitizer.escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('should escape angle brackets', () => {
      expect(Sanitizer.escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('should escape double quotes', () => {
      expect(Sanitizer.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(Sanitizer.escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should escape all special characters together', () => {
      expect(Sanitizer.escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should return empty string for falsy input', () => {
      expect(Sanitizer.escapeHtml('')).toBe('');
      expect(Sanitizer.escapeHtml(null as unknown as string)).toBe('');
      expect(Sanitizer.escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('should return plain text unchanged', () => {
      expect(Sanitizer.escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  // --------------------------------------------------------------------------
  // sanitizeHtml
  // --------------------------------------------------------------------------

  describe('sanitizeHtml', () => {
    it('should allow safe formatting tags', () => {
      const input = '<b>Bold</b> and <i>italic</i> and <em>emphasis</em>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).toContain('<b>Bold</b>');
      expect(result).toContain('<i>italic</i>');
      expect(result).toContain('<em>emphasis</em>');
    });

    it('should remove script tags and their content', () => {
      const input = '<b>Hello</b><script>alert(1)</script>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
      expect(result).toContain('<b>Hello</b>');
    });

    it('should remove iframe tags', () => {
      const input = '<p>Text</p><iframe src="http://evil.com"></iframe>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
      expect(result).toContain('<p>Text</p>');
    });

    it('should remove event handlers from allowed tags', () => {
      const input = '<b onclick="alert(1)">Bold</b>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).toContain('<b>');
      expect(result).toContain('Bold');
    });

    it('should remove javascript: URLs from href', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('should allow https links with proper attributes', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should allow img with https src', () => {
      const input = '<img src="https://cdn.example.com/img.png" alt="Photo">';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).toContain('src="https://cdn.example.com/img.png"');
      expect(result).toContain('alt="Photo"');
    });

    it('should reject img with data: src', () => {
      const input = '<img src="data:text/html,<h1>xss</h1>">';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).not.toContain('data:');
    });

    it('should unwrap disallowed non-dangerous tags', () => {
      const input = '<div><b>Bold</b></div>';
      const result = Sanitizer.sanitizeHtml(input);
      expect(result).not.toContain('<div');
      expect(result).toContain('<b>Bold</b>');
    });

    it('should handle custom allowed tags', () => {
      const input = '<b>Bold</b><i>Italic</i><u>Underline</u>';
      const result = Sanitizer.sanitizeHtml(input, ['b']);
      expect(result).toContain('<b>Bold</b>');
      // i and u should be stripped (but content preserved)
      expect(result).not.toContain('<i>');
      expect(result).not.toContain('<u>');
      expect(result).toContain('Italic');
      expect(result).toContain('Underline');
    });

    it('should return empty string for falsy input', () => {
      expect(Sanitizer.sanitizeHtml('')).toBe('');
      expect(Sanitizer.sanitizeHtml(null as unknown as string)).toBe('');
    });

    // XSS attack vectors
    describe('XSS prevention', () => {
      it('should block onerror on img tags', () => {
        const input = '<img src=x onerror=alert(1)>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('onerror');
        expect(result).not.toContain('alert');
      });

      it('should block SVG-based XSS', () => {
        const input = '<svg onload=alert(1)><circle></circle></svg>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('onload');
      });

      it('should block style tags with expressions', () => {
        const input =
          '<style>body{background:url(javascript:alert(1))}</style>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('<style');
        expect(result).not.toContain('javascript');
      });

      it('should block object/embed tags', () => {
        const input = '<object data="evil.swf"></object><embed src="evil.swf">';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('<object');
        expect(result).not.toContain('<embed');
      });

      it('should block form and input tags', () => {
        const input = '<form action="evil.com"><input type="text"></form>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('<form');
        expect(result).not.toContain('<input');
      });

      it('should handle case-insensitive obfuscation', () => {
        const input = '<a href="JaVaScRiPt:alert(1)">Click</a>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('JaVaScRiPt');
      });

      it('should handle vbscript: scheme', () => {
        const input = '<a href="vbscript:MsgBox(1)">Click</a>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('vbscript');
      });

      it('should handle data: scheme', () => {
        const input =
          '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
        const result = Sanitizer.sanitizeHtml(input);
        expect(result).not.toContain('data:text');
      });
    });
  });

  // --------------------------------------------------------------------------
  // isValidUrl
  // --------------------------------------------------------------------------

  describe('isValidUrl', () => {
    it('should accept https URLs', () => {
      expect(Sanitizer.isValidUrl('https://example.com')).toBe(true);
      expect(Sanitizer.isValidUrl('https://sub.example.com/path?q=1')).toBe(
        true
      );
    });

    it('should accept http URLs', () => {
      expect(Sanitizer.isValidUrl('http://example.com')).toBe(true);
    });

    it('should accept mailto URLs', () => {
      expect(Sanitizer.isValidUrl('mailto:user@example.com')).toBe(true);
    });

    it('should reject javascript: URLs', () => {
      expect(Sanitizer.isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject data: URLs', () => {
      expect(Sanitizer.isValidUrl('data:text/html,<h1>hi</h1>')).toBe(false);
    });

    it('should reject vbscript: URLs', () => {
      expect(Sanitizer.isValidUrl('vbscript:MsgBox(1)')).toBe(false);
    });

    it('should reject empty or falsy input', () => {
      expect(Sanitizer.isValidUrl('')).toBe(false);
      expect(Sanitizer.isValidUrl(null as unknown as string)).toBe(false);
      expect(Sanitizer.isValidUrl(undefined as unknown as string)).toBe(false);
    });

    it('should reject whitespace-only input', () => {
      expect(Sanitizer.isValidUrl('   ')).toBe(false);
    });

    it('should handle case-insensitive scheme detection', () => {
      expect(Sanitizer.isValidUrl('HTTPS://example.com')).toBe(true);
      expect(Sanitizer.isValidUrl('JAVASCRIPT:alert(1)')).toBe(false);
    });

    it('should reject schemes with obfuscation (control chars)', () => {
      // Using whitespace/control character tricks
      expect(Sanitizer.isValidUrl('java\tscript:alert(1)')).toBe(false);
    });

    it('should reject ftp and other non-allowed schemes', () => {
      expect(Sanitizer.isValidUrl('ftp://files.example.com')).toBe(false);
      expect(Sanitizer.isValidUrl('file:///etc/passwd')).toBe(false);
    });
  });
});
