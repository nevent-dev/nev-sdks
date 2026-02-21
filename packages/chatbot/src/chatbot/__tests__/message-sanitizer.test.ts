import { describe, it, expect } from 'vitest';
import { MessageSanitizer } from '../message-sanitizer';

describe('MessageSanitizer', () => {
  // ==========================================================================
  // sanitize() - safe tags
  // ==========================================================================

  describe('sanitize() - allowed tags', () => {
    it('should allow <b>, <i>, <em>, <strong> tags', () => {
      const input =
        '<b>bold</b> <i>italic</i> <em>emphasis</em> <strong>strong</strong>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<b>bold</b>');
      expect(result).toContain('<i>italic</i>');
      expect(result).toContain('<em>emphasis</em>');
      expect(result).toContain('<strong>strong</strong>');
    });

    it('should allow <br> tag', () => {
      const input = 'line1<br>line2';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('<br>');
    });

    it('should allow <p> tag', () => {
      const input = '<p>Paragraph text</p>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<p>Paragraph text</p>');
    });

    it('should allow <a> tag with valid href', () => {
      const input = '<a href="https://nevent.es">Link</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('href="https://nevent.es"');
      expect(result).toContain('Link');
    });

    it('should allow <ul>, <ol>, <li> tags', () => {
      const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('</ul>');
    });

    it('should allow <code> and <pre> tags', () => {
      const input = '<code>const x = 1;</code><pre>function foo() {}</pre>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<code>const x = 1;</code>');
      expect(result).toContain('<pre>function foo() {}</pre>');
    });
  });

  // ==========================================================================
  // sanitize() - dangerous content removal
  // ==========================================================================

  describe('sanitize() - dangerous content', () => {
    it('should remove <script> tags entirely', () => {
      const input = '<b>Hello</b><script>alert(1)</script>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<b>Hello</b>');
      expect(result).not.toContain('script');
      expect(result).not.toContain('alert');
    });

    it('should remove <iframe> tags entirely', () => {
      const input = '<p>Text</p><iframe src="evil.com"></iframe>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<p>Text</p>');
      expect(result).not.toContain('iframe');
    });

    it('should remove event handlers (onclick, onerror, onload)', () => {
      const input = '<b onclick="alert(1)">Click me</b>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<b>');
      expect(result).toContain('Click me');
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('alert');
    });

    it('should remove onerror event handler from img', () => {
      const input =
        '<img src="https://cdn.example.com/img.png" onerror="alert(1)">';
      const result = MessageSanitizer.sanitize(input);

      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should remove javascript: URLs from href', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).not.toContain('javascript:');
      expect(result).toContain('Click');
    });
  });

  // ==========================================================================
  // sanitize() - URL validation
  // ==========================================================================

  describe('sanitize() - URL validation', () => {
    it('should allow href with https', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('href="https://example.com"');
    });

    it('should allow href with http', () => {
      const input = '<a href="http://example.com">Link</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('href="http://example.com"');
    });

    it('should allow href with mailto', () => {
      const input = '<a href="mailto:test@example.com">Email</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('href="mailto:test@example.com"');
    });

    it('should reject href with data: URL', () => {
      const input =
        '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).not.toContain('data:');
    });

    it('should allow img with https src', () => {
      const input = '<img src="https://cdn.example.com/img.png" alt="Photo">';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('src="https://cdn.example.com/img.png"');
      expect(result).toContain('alt="Photo"');
    });

    it('should reject img with http (non-secure) src', () => {
      const input = '<img src="http://cdn.example.com/img.png">';
      const result = MessageSanitizer.sanitize(input);

      expect(result).not.toContain('src="http://');
    });
  });

  // ==========================================================================
  // sanitize() - attribute handling
  // ==========================================================================

  describe('sanitize() - attribute handling', () => {
    it('should remove style attributes', () => {
      const input = '<b style="color: red;">Bold</b>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('<b>Bold</b>');
      expect(result).not.toContain('style');
    });

    it('should preserve text within removed tags', () => {
      const input = '<div>This is inside a div</div>';
      const result = MessageSanitizer.sanitize(input);

      // <div> is not in the allowlist, but its text content should be preserved
      expect(result).toContain('This is inside a div');
      expect(result).not.toContain('<div>');
    });

    it('should force rel="noopener noreferrer" on links with href', () => {
      const input = '<a href="https://nevent.es">Link</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should add target="_blank" to links', () => {
      const input = '<a href="https://nevent.es">Link</a>';
      const result = MessageSanitizer.sanitize(input);

      expect(result).toContain('target="_blank"');
    });
  });

  // ==========================================================================
  // sanitize() - edge cases
  // ==========================================================================

  describe('sanitize() - edge cases', () => {
    it('should return empty string for null/undefined input', () => {
      expect(MessageSanitizer.sanitize(null as unknown as string)).toBe('');
      expect(MessageSanitizer.sanitize(undefined as unknown as string)).toBe(
        ''
      );
      expect(MessageSanitizer.sanitize('')).toBe('');
    });

    it('should return plain text unchanged', () => {
      const input = 'Hello world, no HTML here.';
      expect(MessageSanitizer.sanitize(input)).toBe(input);
    });
  });

  // ==========================================================================
  // stripHtml()
  // ==========================================================================

  describe('stripHtml()', () => {
    it('should remove all HTML tags and return plain text', () => {
      const input = '<b>Hello</b> <em>world</em>';
      expect(MessageSanitizer.stripHtml(input)).toBe('Hello world');
    });

    it('should handle nested tags', () => {
      const input = '<div><p><b>Deep</b> text</p></div>';
      expect(MessageSanitizer.stripHtml(input)).toBe('Deep text');
    });

    it('should return empty string for empty input', () => {
      expect(MessageSanitizer.stripHtml('')).toBe('');
      expect(MessageSanitizer.stripHtml(null as unknown as string)).toBe('');
    });
  });

  // ==========================================================================
  // escapeHtml()
  // ==========================================================================

  describe('escapeHtml()', () => {
    it('should escape &, <, >, ", \'', () => {
      const input = '<script>alert("hello & \'world\'")</script>';
      const result = MessageSanitizer.escapeHtml(input);

      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&#39;');
      expect(result).not.toContain('<script>');
    });

    it('should escape ampersand (&)', () => {
      expect(MessageSanitizer.escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('should escape less than (<)', () => {
      expect(MessageSanitizer.escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than (>)', () => {
      expect(MessageSanitizer.escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quote (")', () => {
      expect(MessageSanitizer.escapeHtml('say "hi"')).toBe(
        'say &quot;hi&quot;'
      );
    });

    it("should escape single quote (')", () => {
      expect(MessageSanitizer.escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should return empty string for empty/null input', () => {
      expect(MessageSanitizer.escapeHtml('')).toBe('');
      expect(MessageSanitizer.escapeHtml(null as unknown as string)).toBe('');
    });
  });

  // ==========================================================================
  // isDangerous()
  // ==========================================================================

  describe('isDangerous()', () => {
    it('should detect script tags', () => {
      expect(MessageSanitizer.isDangerous('<script>alert(1)</script>')).toBe(
        true
      );
    });

    it('should detect self-closing script tags', () => {
      expect(MessageSanitizer.isDangerous('<script src="evil.js">')).toBe(true);
    });

    it('should detect event handlers (onclick)', () => {
      expect(MessageSanitizer.isDangerous('<img onclick="alert(1)">')).toBe(
        true
      );
    });

    it('should detect event handlers (onerror)', () => {
      expect(MessageSanitizer.isDangerous('<img src=x onerror=alert(1)>')).toBe(
        true
      );
    });

    it('should detect event handlers (onload)', () => {
      expect(MessageSanitizer.isDangerous('<body onload="alert(1)">')).toBe(
        true
      );
    });

    it('should detect javascript: URIs in href', () => {
      expect(
        MessageSanitizer.isDangerous('<a href="javascript:alert(1)">click</a>')
      ).toBe(true);
    });

    it('should detect javascript: URIs in src', () => {
      expect(
        MessageSanitizer.isDangerous('<img src="javascript:alert(1)">')
      ).toBe(true);
    });

    it('should detect iframe tags', () => {
      expect(
        MessageSanitizer.isDangerous('<iframe src="evil.com"></iframe>')
      ).toBe(true);
    });

    it('should detect object tags', () => {
      expect(
        MessageSanitizer.isDangerous('<object data="evil.swf"></object>')
      ).toBe(true);
    });

    it('should detect embed tags', () => {
      expect(MessageSanitizer.isDangerous('<embed src="evil.swf">')).toBe(true);
    });

    it('should return false for safe HTML', () => {
      expect(MessageSanitizer.isDangerous('<b>Hello world</b>')).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(MessageSanitizer.isDangerous('Hello world')).toBe(false);
    });

    it('should return false for empty/null input', () => {
      expect(MessageSanitizer.isDangerous('')).toBe(false);
      expect(MessageSanitizer.isDangerous(null as unknown as string)).toBe(
        false
      );
    });

    it('should detect data: URIs in href', () => {
      expect(
        MessageSanitizer.isDangerous(
          '<a href="data:text/html,<script>alert(1)</script>">click</a>'
        )
      ).toBe(true);
    });
  });
});
