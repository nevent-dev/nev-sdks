/**
 * MarkdownRenderer - Lightweight markdown-to-HTML converter for chatbot messages
 *
 * Converts a subset of Markdown syntax into sanitized HTML suitable for rendering
 * inside chat message bubbles. Designed for bot/LLM responses that commonly use
 * Markdown formatting.
 *
 * This is NOT a full CommonMark/GFM parser. It uses a regex-based, multi-pass
 * approach that covers the most common patterns found in chatbot and LLM output
 * while keeping the bundle size at zero external dependencies.
 *
 * Supported syntax:
 * - **Bold**: `**text**` or `__text__`
 * - *Italic*: `*text*` or `_text_`
 * - ***Bold+Italic***: `***text***`
 * - ~~Strikethrough~~: `~~text~~`
 * - `Inline code`: `` `code` ``
 * - Code blocks: ` ```lang\ncode\n``` `
 * - [Links](url): `[text](url)` with automatic `target="_blank"` and `rel="noopener noreferrer"`
 * - ![Images](url): `![alt](url)` restricted to HTTPS sources
 * - Headings: `#`, `##`, `###` downscaled to `<h3>`, `<h4>`, `<h5>`
 * - Unordered lists: `- item` or `* item`
 * - Ordered lists: `1. item`
 * - Blockquotes: `> text`
 * - Horizontal rules: `---` or `***`
 * - Line breaks: double newline = paragraph, single newline = `<br>`
 *
 * Processing order (to avoid conflicts):
 * 1. Extract and protect code blocks (``` ... ```) with placeholders
 * 2. Extract and protect inline code (` ... `) with placeholders
 * 3. Process block-level elements (headings, lists, blockquotes, hr, paragraphs)
 * 4. Process inline elements (bold, italic, strikethrough, links, images)
 * 5. Restore code blocks and inline code from placeholders
 * 6. Sanitize final output through MessageSanitizer.sanitize()
 *
 * Security:
 * - All output passes through {@link MessageSanitizer.sanitize()} before returning
 * - Image URLs restricted to HTTPS only
 * - Link URLs validated (no javascript:, data:, vbscript: schemes)
 * - HTML entities in code blocks are escaped to prevent injection
 *
 * @example
 * ```typescript
 * // Basic usage
 * const html = MarkdownRenderer.render('**Hello** *world*');
 * // '<p><strong>Hello</strong> <em>world</em></p>'
 *
 * // Check before rendering
 * if (MarkdownRenderer.containsMarkdown(message.content)) {
 *   element.innerHTML = MarkdownRenderer.render(message.content);
 * }
 * ```
 */

import { MessageSanitizer } from './message-sanitizer';

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Escapes HTML special characters in a plain-text string.
 * Used to protect code block and inline code content from being
 * interpreted as HTML when embedded in the output.
 *
 * @param text - Raw text to escape
 * @returns HTML-escaped string
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates that a URL uses a safe scheme for links.
 * Rejects `javascript:`, `data:`, `vbscript:` and other dangerous protocols.
 *
 * @param url - The URL string to validate
 * @returns true if the URL is safe for use in an href attribute
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  // eslint-disable-next-line no-control-regex
  const normalized = trimmed.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
  if (/^(javascript|data|vbscript):/i.test(normalized)) return false;
  // Allow relative, fragment, and http/https/mailto URLs
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/'))
    return true;
  return /^(https?:|mailto:)/i.test(trimmed);
}

/**
 * Validates that a URL uses HTTPS for image sources.
 *
 * @param url - The URL string to validate
 * @returns true if the URL uses HTTPS
 */
function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  // eslint-disable-next-line no-control-regex
  const normalized = trimmed.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
  if (/^(javascript|data|vbscript):/i.test(normalized)) return false;
  return /^https:/i.test(trimmed);
}

// ============================================================================
// MarkdownRenderer Class
// ============================================================================

/**
 * Static utility class that converts Markdown text to sanitized HTML.
 *
 * All methods are static. The class cannot be instantiated (private constructor).
 * Zero external dependencies -- uses only regex transformations and
 * {@link MessageSanitizer} for final output sanitization.
 *
 * @example
 * ```typescript
 * const html = MarkdownRenderer.render('**bold** and *italic*');
 * const hasMarkdown = MarkdownRenderer.containsMarkdown('plain text');
 * ```
 */
export class MarkdownRenderer {
  /** Prevent instantiation -- all methods are static. */
  private constructor() {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Converts a Markdown string to sanitized HTML.
   *
   * Handles the full set of supported Markdown features listed in the class
   * documentation. The output is always passed through
   * {@link MessageSanitizer.sanitize()} to prevent XSS.
   *
   * @param markdown - Raw Markdown text (typically from an LLM/bot response)
   * @returns Sanitized HTML string safe for `innerHTML` insertion
   *
   * @example
   * ```typescript
   * MarkdownRenderer.render('**Hello** *world*');
   * // '<p><strong>Hello</strong> <em>world</em></p>'
   *
   * MarkdownRenderer.render('# Title\n\nParagraph text.');
   * // '<h3>Title</h3><p>Paragraph text.</p>'
   *
   * MarkdownRenderer.render('');
   * // ''
   * ```
   */
  static render(markdown: string): string {
    if (!markdown || !markdown.trim()) return '';

    let html = markdown;

    // ------------------------------------------------------------------
    // Phase 1: Extract code blocks (``` ... ```) into placeholders
    // This prevents markdown processing inside code blocks.
    // ------------------------------------------------------------------
    const codeBlocks: string[] = [];
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_match, lang: string, code: string) => {
        const index = codeBlocks.length;
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        codeBlocks.push(
          `<pre><code${langClass}>${escapeHtml(code.trimEnd())}</code></pre>`
        );
        return `\x00CB${index}\x00`;
      }
    );

    // ------------------------------------------------------------------
    // Phase 2: Extract inline code (` ... `) into placeholders
    // ------------------------------------------------------------------
    const inlineCodes: string[] = [];
    html = html.replace(/`([^`\n]+)`/g, (_match, code: string) => {
      const index = inlineCodes.length;
      inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
      return `\x00IC${index}\x00`;
    });

    // ------------------------------------------------------------------
    // Phase 3: Block-level elements
    // Process line-by-line for block constructs: headings, lists,
    // blockquotes, horizontal rules, and paragraphs.
    // ------------------------------------------------------------------
    html = MarkdownRenderer.processBlocks(html);

    // ------------------------------------------------------------------
    // Phase 4: Inline elements
    // Process within the already-assembled HTML for inline formatting.
    // ------------------------------------------------------------------
    html = MarkdownRenderer.processInlines(html);

    // ------------------------------------------------------------------
    // Phase 5: Restore code blocks and inline code from placeholders
    // ------------------------------------------------------------------
    // eslint-disable-next-line no-control-regex
    html = html.replace(/\x00CB(\d+)\x00/g, (_match, index: string) => {
      return codeBlocks[Number(index)] ?? '';
    });
    // eslint-disable-next-line no-control-regex
    html = html.replace(/\x00IC(\d+)\x00/g, (_match, index: string) => {
      return inlineCodes[Number(index)] ?? '';
    });

    // ------------------------------------------------------------------
    // Phase 6: Sanitize final output
    // ------------------------------------------------------------------
    return MessageSanitizer.sanitize(html);
  }

  /**
   * Checks whether a text string contains any recognizable Markdown syntax.
   *
   * This is a fast heuristic check (single regex test) intended to decide
   * whether to route a message through the full {@link render} pipeline or
   * treat it as plain text. It does NOT parse the Markdown.
   *
   * @param text - Text to inspect for Markdown patterns
   * @returns `true` if any common Markdown syntax is detected
   *
   * @example
   * ```typescript
   * MarkdownRenderer.containsMarkdown('**bold**');       // true
   * MarkdownRenderer.containsMarkdown('plain text');     // false
   * MarkdownRenderer.containsMarkdown('# Heading');      // true
   * MarkdownRenderer.containsMarkdown('- list item');    // true
   * MarkdownRenderer.containsMarkdown('`code`');         // true
   * ```
   */
  static containsMarkdown(text: string): boolean {
    if (!text) return false;
    // Test for common markdown patterns:
    // **bold**, __bold__, ~~strike~~, ```code```, `inline`,
    // [link](url), # heading, - list, * list, 1. ordered, > blockquote
    return /(\*\*|__|~~|```|`[^`]+`|\[.+?\]\(.+?\)|^#{1,3}\s|^[-*]\s|^\d+\.\s|^>\s)/m.test(
      text
    );
  }

  // --------------------------------------------------------------------------
  // Private: Block-level Processing
  // --------------------------------------------------------------------------

  /**
   * Processes block-level Markdown elements by splitting the input into lines
   * and assembling HTML blocks for headings, lists, blockquotes, horizontal
   * rules, and paragraphs.
   *
   * List continuity: consecutive list items of the same type (ordered or
   * unordered) are grouped into a single `<ul>` or `<ol>`. A non-list line
   * (or a switch between ordered/unordered) closes the current list.
   *
   * @param text - Markdown text with code blocks already extracted
   * @returns HTML string with block-level elements rendered
   */
  private static processBlocks(text: string): string {
    const lines = text.split('\n');
    const output: string[] = [];
    let currentList: 'ul' | 'ol' | null = null;
    let paragraphBuffer: string[] = [];

    /**
     * Flushes accumulated paragraph lines into a `<p>` tag.
     * Single newlines within a paragraph buffer become `<br>`.
     */
    const flushParagraph = (): void => {
      if (paragraphBuffer.length > 0) {
        const content = paragraphBuffer.join('<br>');
        output.push(`<p>${content}</p>`);
        paragraphBuffer = [];
      }
    };

    /**
     * Closes any open list by appending the closing tag.
     */
    const closeList = (): void => {
      if (currentList) {
        output.push(`</${currentList}>`);
        currentList = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';

      // -- Empty line: flush paragraph, close list --
      if (line.trim() === '') {
        flushParagraph();
        closeList();
        continue;
      }

      // -- Code block placeholder: pass through as-is --
      // eslint-disable-next-line no-control-regex
      if (/^\x00CB\d+\x00$/.test(line.trim())) {
        flushParagraph();
        closeList();
        output.push(line.trim());
        continue;
      }

      // -- Horizontal rule: --- or *** or ___ (alone on line) --
      if (/^(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
        flushParagraph();
        closeList();
        output.push('<hr>');
        continue;
      }

      // -- Headings: # H1 -> <h3>, ## H2 -> <h4>, ### H3 -> <h5> --
      const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
      if (headingMatch) {
        flushParagraph();
        closeList();
        const level = (headingMatch[1]?.length ?? 1) + 2; // # -> h3, ## -> h4, ### -> h5
        const headingText = headingMatch[2] ?? '';
        output.push(`<h${level}>${headingText}</h${level}>`);
        continue;
      }

      // -- Blockquote: > text --
      const blockquoteMatch = /^>\s+(.*)$/.exec(line);
      if (blockquoteMatch) {
        flushParagraph();
        closeList();
        output.push(`<blockquote>${blockquoteMatch[1] ?? ''}</blockquote>`);
        continue;
      }

      // -- Unordered list: - item or * item (but not --- or ***) --
      const ulMatch = /^(?:[-*])\s+(.+)$/.exec(line);
      if (ulMatch && !/^(?:---+|\*\*\*+)\s*$/.test(line)) {
        flushParagraph();
        if (currentList !== 'ul') {
          closeList();
          output.push('<ul>');
          currentList = 'ul';
        }
        output.push(`<li>${ulMatch[1] ?? ''}</li>`);
        continue;
      }

      // -- Ordered list: 1. item --
      const olMatch = /^\d+\.\s+(.+)$/.exec(line);
      if (olMatch) {
        flushParagraph();
        if (currentList !== 'ol') {
          closeList();
          output.push('<ol>');
          currentList = 'ol';
        }
        output.push(`<li>${olMatch[1] ?? ''}</li>`);
        continue;
      }

      // -- Regular text: add to paragraph buffer --
      paragraphBuffer.push(line);
    }

    // Flush any remaining buffered content
    flushParagraph();
    closeList();

    return output.join('');
  }

  // --------------------------------------------------------------------------
  // Private: Inline-level Processing
  // --------------------------------------------------------------------------

  /**
   * Processes inline Markdown elements within already-assembled HTML.
   *
   * Applied after block-level processing so that inline formatting works
   * inside paragraphs, list items, headings, and blockquotes.
   *
   * Processing order matters to avoid conflicts:
   * 1. Images (`![alt](url)`) - before links to avoid `!` consumption
   * 2. Links (`[text](url)`)
   * 3. Bold+Italic (`***text***`)
   * 4. Bold (`**text**`)
   * 5. Italic (`*text*` or `_text_`)
   * 6. Strikethrough (`~~text~~`)
   *
   * @param html - HTML string with block elements already rendered
   * @returns HTML string with inline elements rendered
   */
  private static processInlines(html: string): string {
    let result = html;

    // Images: ![alt](url) - only HTTPS URLs
    result = result.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt: string, url: string) => {
        if (isSafeImageUrl(url)) {
          return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
        }
        // Unsafe image URL: render only the alt text (drop the dangerous URL)
        return escapeHtml(alt || 'image');
      }
    );

    // Links: [text](url)
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text: string, url: string) => {
        if (isSafeUrl(url)) {
          return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        // Unsafe URL: render only the link text (drop the dangerous URL)
        return escapeHtml(text);
      }
    );

    // Bold + Italic: ***text*** or ___text___
    result = result.replace(
      /\*\*\*(.+?)\*\*\*/g,
      '<strong><em>$1</em></strong>'
    );

    // Bold: **text** or __text__
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_ (but not inside words for underscore)
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

    // Strikethrough: ~~text~~
    result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

    return result;
  }
}
