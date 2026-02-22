import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from '../markdown-renderer';

describe('MarkdownRenderer', () => {
  // ==========================================================================
  // render() - inline formatting
  // ==========================================================================

  describe('render() - bold', () => {
    it('should convert **text** to <strong>', () => {
      const result = MarkdownRenderer.render('**bold text**');
      expect(result).toContain('<strong>bold text</strong>');
    });

    it('should convert __text__ to <strong>', () => {
      const result = MarkdownRenderer.render('__bold text__');
      expect(result).toContain('<strong>bold text</strong>');
    });
  });

  describe('render() - italic', () => {
    it('should convert *text* to <em>', () => {
      const result = MarkdownRenderer.render('*italic text*');
      expect(result).toContain('<em>italic text</em>');
    });

    it('should convert _text_ to <em>', () => {
      const result = MarkdownRenderer.render('_italic text_');
      expect(result).toContain('<em>italic text</em>');
    });
  });

  describe('render() - bold + italic', () => {
    it('should convert ***text*** to <strong><em>', () => {
      const result = MarkdownRenderer.render('***bold and italic***');
      expect(result).toContain('<strong><em>bold and italic</em></strong>');
    });
  });

  describe('render() - strikethrough', () => {
    it('should convert ~~text~~ to <s>', () => {
      const result = MarkdownRenderer.render('~~deleted text~~');
      expect(result).toContain('<s>deleted text</s>');
    });
  });

  // ==========================================================================
  // render() - code
  // ==========================================================================

  describe('render() - inline code', () => {
    it('should convert `code` to <code>', () => {
      const result = MarkdownRenderer.render('Use `console.log()` here');
      expect(result).toContain('<code>console.log()</code>');
    });

    it('should escape HTML inside inline code', () => {
      const result = MarkdownRenderer.render('Try `<script>alert(1)</script>`');
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });
  });

  describe('render() - code blocks', () => {
    it('should convert code blocks without language', () => {
      const input = '```\nconst x = 1;\n```';
      const result = MarkdownRenderer.render(input);
      expect(result).toContain('<pre><code>');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('</code></pre>');
    });

    it('should convert code blocks with language', () => {
      const input = '```javascript\nconst x = 1;\n```';
      const result = MarkdownRenderer.render(input);
      expect(result).toContain('class="language-javascript"');
      expect(result).toContain('const x = 1;');
    });

    it('should escape HTML inside code blocks', () => {
      const input = '```html\n<div>Hello</div>\n```';
      const result = MarkdownRenderer.render(input);
      expect(result).toContain('&lt;div&gt;Hello&lt;/div&gt;');
      expect(result).not.toContain('<div>Hello</div>');
    });

    it('should not process markdown inside code blocks', () => {
      const input = '```\n**not bold** *not italic* ~~not strike~~\n```';
      const result = MarkdownRenderer.render(input);
      // Inside code block, markdown should NOT be processed
      expect(result).not.toContain('<strong>');
      expect(result).not.toContain('<em>');
      expect(result).not.toContain('<s>');
    });
  });

  // ==========================================================================
  // render() - links
  // ==========================================================================

  describe('render() - links', () => {
    it('should convert [text](url) to <a> with target and rel', () => {
      const result = MarkdownRenderer.render(
        '[Click here](https://example.com)'
      );
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).toContain('Click here</a>');
    });

    it('should support http links', () => {
      const result = MarkdownRenderer.render('[Link](http://example.com)');
      expect(result).toContain('href="http://example.com"');
    });

    it('should support mailto links', () => {
      const result = MarkdownRenderer.render(
        '[Email](mailto:test@example.com)'
      );
      expect(result).toContain('href="mailto:test@example.com"');
    });

    it('should reject javascript: URLs (XSS prevention)', () => {
      const result = MarkdownRenderer.render('[click](javascript:alert(1))');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('<a');
      // The link text is preserved but the URL is dropped
      expect(result).toContain('click');
    });

    it('should reject data: URLs', () => {
      const result = MarkdownRenderer.render(
        '[click](data:text/html,<script>alert(1)</script>)'
      );
      expect(result).not.toContain('data:');
      expect(result).not.toContain('<a');
      // The link text is preserved but the URL is dropped
      expect(result).toContain('click');
    });
  });

  // ==========================================================================
  // render() - images
  // ==========================================================================

  describe('render() - images', () => {
    it('should convert ![alt](url) to <img> for HTTPS URLs', () => {
      const result = MarkdownRenderer.render(
        '![Photo](https://cdn.example.com/img.png)'
      );
      expect(result).toContain('<img');
      expect(result).toContain('src="https://cdn.example.com/img.png"');
      expect(result).toContain('alt="Photo"');
    });

    it('should reject non-HTTPS image URLs', () => {
      const result = MarkdownRenderer.render(
        '![Photo](http://cdn.example.com/img.png)'
      );
      expect(result).not.toContain('<img');
    });

    it('should reject javascript: image URLs', () => {
      const result = MarkdownRenderer.render('![xss](javascript:alert(1))');
      expect(result).not.toContain('<img');
      expect(result).not.toContain('javascript:');
      // Alt text is preserved but URL is dropped
      expect(result).toContain('xss');
    });
  });

  // ==========================================================================
  // render() - headings
  // ==========================================================================

  describe('render() - headings', () => {
    it('should convert # H1 to <h3> (downscaled)', () => {
      const result = MarkdownRenderer.render('# Heading 1');
      expect(result).toContain('<h3>Heading 1</h3>');
    });

    it('should convert ## H2 to <h4> (downscaled)', () => {
      const result = MarkdownRenderer.render('## Heading 2');
      expect(result).toContain('<h4>Heading 2</h4>');
    });

    it('should convert ### H3 to <h5> (downscaled)', () => {
      const result = MarkdownRenderer.render('### Heading 3');
      expect(result).toContain('<h5>Heading 3</h5>');
    });
  });

  // ==========================================================================
  // render() - lists
  // ==========================================================================

  describe('render() - unordered lists', () => {
    it('should convert - items to <ul><li>', () => {
      const result = MarkdownRenderer.render('- Item 1\n- Item 2\n- Item 3');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    it('should convert * items to <ul><li>', () => {
      const result = MarkdownRenderer.render('* Item A\n* Item B');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item A</li>');
      expect(result).toContain('<li>Item B</li>');
      expect(result).toContain('</ul>');
    });
  });

  describe('render() - ordered lists', () => {
    it('should convert 1. items to <ol><li>', () => {
      const result = MarkdownRenderer.render('1. First\n2. Second\n3. Third');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First</li>');
      expect(result).toContain('<li>Second</li>');
      expect(result).toContain('<li>Third</li>');
      expect(result).toContain('</ol>');
    });
  });

  // ==========================================================================
  // render() - blockquotes
  // ==========================================================================

  describe('render() - blockquotes', () => {
    it('should convert > text to <blockquote>', () => {
      const result = MarkdownRenderer.render('> This is a quote');
      expect(result).toContain('<blockquote>This is a quote</blockquote>');
    });
  });

  // ==========================================================================
  // render() - horizontal rules
  // ==========================================================================

  describe('render() - horizontal rules', () => {
    it('should convert --- to <hr>', () => {
      const result = MarkdownRenderer.render('Above\n\n---\n\nBelow');
      expect(result).toContain('<hr>');
    });

    it('should convert *** to <hr>', () => {
      const result = MarkdownRenderer.render('Above\n\n***\n\nBelow');
      expect(result).toContain('<hr>');
    });
  });

  // ==========================================================================
  // render() - line breaks and paragraphs
  // ==========================================================================

  describe('render() - line breaks / paragraphs', () => {
    it('should convert double newline to paragraph break', () => {
      const result = MarkdownRenderer.render('Paragraph 1\n\nParagraph 2');
      expect(result).toContain('<p>Paragraph 1</p>');
      expect(result).toContain('<p>Paragraph 2</p>');
    });

    it('should convert single newline within paragraph to <br>', () => {
      const result = MarkdownRenderer.render('Line 1\nLine 2');
      expect(result).toContain('Line 1<br>Line 2');
    });
  });

  // ==========================================================================
  // render() - nested formatting
  // ==========================================================================

  describe('render() - nested formatting', () => {
    it('should handle bold inside a paragraph', () => {
      const result = MarkdownRenderer.render('This is **important** text');
      expect(result).toContain('<strong>important</strong>');
    });

    it('should handle italic inside bold', () => {
      const result = MarkdownRenderer.render('**bold and *italic* text**');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>italic</em>');
    });

    it('should handle inline code inside a paragraph', () => {
      const result = MarkdownRenderer.render('Use `npm install` to install');
      expect(result).toContain('<code>npm install</code>');
    });

    it('should handle links inside a list item', () => {
      const result = MarkdownRenderer.render(
        '- Visit [Google](https://google.com)'
      );
      expect(result).toContain('<li>');
      expect(result).toContain('<a href="https://google.com"');
    });
  });

  // ==========================================================================
  // render() - edge cases
  // ==========================================================================

  describe('render() - edge cases', () => {
    it('should return empty string for null input', () => {
      expect(MarkdownRenderer.render(null as unknown as string)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(MarkdownRenderer.render(undefined as unknown as string)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(MarkdownRenderer.render('')).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(MarkdownRenderer.render('   ')).toBe('');
    });

    it('should handle plain text without markdown', () => {
      const result = MarkdownRenderer.render('Just plain text.');
      expect(result).toContain('Just plain text.');
    });
  });

  // ==========================================================================
  // render() - XSS prevention
  // ==========================================================================

  describe('render() - XSS prevention', () => {
    it('should sanitize javascript: links', () => {
      const result = MarkdownRenderer.render('[click](javascript:alert(1))');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('alert(1)');
    });

    it('should sanitize HTML tags in regular text', () => {
      const result = MarkdownRenderer.render('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
    });

    it('should sanitize event handlers in embedded HTML', () => {
      const result = MarkdownRenderer.render(
        '<img onerror="alert(1)" src="x">'
      );
      expect(result).not.toContain('onerror');
    });

    it('should pass output through MessageSanitizer', () => {
      // Even raw HTML mixed with markdown should be sanitized
      const result = MarkdownRenderer.render(
        '**bold** <iframe src="evil.com"></iframe>'
      );
      expect(result).toContain('<strong>bold</strong>');
      expect(result).not.toContain('<iframe');
    });
  });

  // ==========================================================================
  // render() - complex / mixed content
  // ==========================================================================

  describe('render() - mixed content', () => {
    it('should handle a realistic LLM response', () => {
      const input = [
        '# Welcome',
        '',
        'Here are some **important** things to know:',
        '',
        '1. First, install the package:',
        '',
        '```bash',
        'npm install @nevent/chatbot',
        '```',
        '',
        '2. Then configure it:',
        '',
        '- Set your `apiKey`',
        '- Choose a *theme*',
        '',
        '> Note: See [docs](https://docs.nevent.es) for more details.',
        '',
        '---',
        '',
        "That's it!",
      ].join('\n');

      const result = MarkdownRenderer.render(input);

      expect(result).toContain('<h3>Welcome</h3>');
      expect(result).toContain('<strong>important</strong>');
      expect(result).toContain('<pre><code');
      expect(result).toContain('npm install @nevent/chatbot');
      expect(result).toContain('<code>apiKey</code>');
      expect(result).toContain('<em>theme</em>');
      expect(result).toContain('<blockquote>');
      expect(result).toContain('<hr>');
      expect(result).toContain("That's it!");
    });
  });

  // ==========================================================================
  // containsMarkdown()
  // ==========================================================================

  describe('containsMarkdown()', () => {
    it('should detect **bold**', () => {
      expect(MarkdownRenderer.containsMarkdown('**bold**')).toBe(true);
    });

    it('should detect __bold__', () => {
      expect(MarkdownRenderer.containsMarkdown('__underline bold__')).toBe(
        true
      );
    });

    it('should detect ~~strikethrough~~', () => {
      expect(MarkdownRenderer.containsMarkdown('~~deleted~~')).toBe(true);
    });

    it('should detect ```code blocks```', () => {
      expect(MarkdownRenderer.containsMarkdown('```code```')).toBe(true);
    });

    it('should detect `inline code`', () => {
      expect(MarkdownRenderer.containsMarkdown('use `npm install`')).toBe(true);
    });

    it('should detect [links](url)', () => {
      expect(
        MarkdownRenderer.containsMarkdown('[click](https://example.com)')
      ).toBe(true);
    });

    it('should detect # headings', () => {
      expect(MarkdownRenderer.containsMarkdown('# Heading')).toBe(true);
    });

    it('should detect ## headings', () => {
      expect(MarkdownRenderer.containsMarkdown('## Heading')).toBe(true);
    });

    it('should detect - unordered lists', () => {
      expect(MarkdownRenderer.containsMarkdown('- Item')).toBe(true);
    });

    it('should detect * unordered lists', () => {
      expect(MarkdownRenderer.containsMarkdown('* Item')).toBe(true);
    });

    it('should detect 1. ordered lists', () => {
      expect(MarkdownRenderer.containsMarkdown('1. First')).toBe(true);
    });

    it('should detect > blockquotes', () => {
      expect(MarkdownRenderer.containsMarkdown('> Quote')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(MarkdownRenderer.containsMarkdown('Hello world')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(MarkdownRenderer.containsMarkdown('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(MarkdownRenderer.containsMarkdown(null as unknown as string)).toBe(
        false
      );
      expect(
        MarkdownRenderer.containsMarkdown(undefined as unknown as string)
      ).toBe(false);
    });
  });
});
