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
function stripNamedElement(src, name) {
  const open = '<' + name;
  const close = '</' + name;
  for (let guard = 0; guard < 20; guard++) {
    const lower = src.toLowerCase();
    let from = 0;
    let found = -1;
    while (from < lower.length) {
      const start = lower.indexOf(open, from);
      if (start === -1) break;
      const boundary = lower.charAt(start + open.length);
      if (boundary === '' || ' \t\n\r>/'.includes(boundary)) {
        found = start;
        break;
      }
      from = start + open.length;
    }
    if (found === -1) return src;
    const openEnd = lower.indexOf('>', found);
    if (openEnd === -1) return src.slice(0, found);
    const end = lower.indexOf(close, openEnd);
    if (end === -1) return src.slice(0, found);
    const endGt = lower.indexOf('>', end);
    if (endGt === -1) return src.slice(0, found);
    src = src.slice(0, found) + src.slice(endGt + 1);
  }
  return src;
}

function stripTags(src) {
  let prev;
  do {
    prev = src;
    let out = '';
    for (let i = 0; i < src.length; i++) {
      if (src.charCodeAt(i) !== 60) {
        out += src[i];
        continue;
      }
      const close = src.indexOf('>', i + 1);
      if (close === -1) {
        out += src.slice(i);
        break;
      }
      i = close;
    }
    src = out;
  } while (src !== prev);
  return src;
}

function stripHtml(text) {
  if (!text) return '';
  let src = stripNamedElement(String(text), 'script');
  src = stripNamedElement(src, 'style');
  return stripTags(src);
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
