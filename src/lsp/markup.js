'use strict';

/**
 * Normalize LSP MarkupContent / MarkedString into safe display text.
 * Never treat server strings as HTML — callers should use textContent.
 */

/**
 * @param {unknown} contents
 * @returns {{ kind: 'plaintext'|'markdown', value: string }}
 */
function normalizeMarkup(contents) {
  if (contents == null) return { kind: 'plaintext', value: '' };

  if (typeof contents === 'string') {
    return { kind: 'plaintext', value: contents };
  }

  if (Array.isArray(contents)) {
    const parts = contents
      .map(c => normalizeMarkup(c).value)
      .filter(Boolean);
    return { kind: 'markdown', value: parts.join('\n\n') };
  }

  if (typeof contents === 'object') {
    // MarkedString { language, value } — check before bare MarkupContent
    if (typeof contents.language === 'string' && typeof contents.value === 'string') {
      return {
        kind: 'markdown',
        value: '```' + contents.language + '\n' + contents.value + '\n```'
      };
    }
    // MarkupContent
    if (typeof contents.value === 'string') {
      const kind =
        contents.kind === 'markdown' ? 'markdown' : 'plaintext';
      return { kind, value: contents.value };
    }
  }

  return { kind: 'plaintext', value: String(contents) };
}

/**
 * Strip HTML tags for inert display (defense in depth if a renderer
 * ever uses innerHTML). Does not execute scripts.
 * @param {string} text
 */
function stripHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '');
}

/**
 * Escape for HTML attribute/text contexts if a caller builds HTML.
 * Prefer textContent assignment over this.
 * @param {string} text
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  normalizeMarkup,
  stripHtml,
  escapeHtml
};
