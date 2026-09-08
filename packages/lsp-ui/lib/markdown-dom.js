'use strict';

/**
 * Render the markdown LSP servers send into DOM nodes.
 *
 * Never builds an HTML string: every piece of server text lands in a text
 * node, so the "server strings never become HTML" rule holds by construction
 * rather than by sanitising. That is also why this does not strip tags —
 * inside a text node `<stdio.h>` is inert, and stripping it deletes half of
 * every C and C++ hover.
 *
 * Supports the subset servers actually emit: ATX headings, fenced code,
 * horizontal rules, paragraphs, inline code, bold and italic.
 */

const FENCE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

// Code first: a span inside backticks is literal, not emphasis.
const INLINE = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_/;

function appendInline(parent, text) {
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) break;
    if (match.index > 0) {
      appendText(parent, rest.slice(0, match.index));
    }
    if (match[2] != null) {
      const code = document.createElement('code');
      code.textContent = match[2].trim();
      parent.appendChild(code);
    } else if (match[3] != null || match[4] != null) {
      const strong = document.createElement('strong');
      strong.textContent = match[3] != null ? match[3] : match[4];
      parent.appendChild(strong);
    } else {
      const em = document.createElement('em');
      em.textContent = match[5] != null ? match[5] : match[6];
      parent.appendChild(em);
    }
    rest = rest.slice(match.index + match[0].length);
  }
  if (rest) appendText(parent, rest);
}

// A newline inside a paragraph is a line break, not a space: servers lay out
// signatures and value dumps across lines and mean them.
function appendText(parent, text) {
  const lines = String(text).split('\n');
  lines.forEach((line, i) => {
    if (i > 0) parent.appendChild(document.createElement('br'));
    if (line) parent.appendChild(document.createTextNode(line));
  });
}

function flushParagraph(fragment, lines) {
  if (!lines.length) return;
  const text = lines.join('\n').trim();
  lines.length = 0;
  if (!text) return;
  const p = document.createElement('p');
  p.classList.add('lsp-ui-hover-p');
  appendInline(p, text);
  fragment.appendChild(p);
}

function appendCodeBlock(fragment, code, language) {
  const pre = document.createElement('pre');
  pre.classList.add('lsp-ui-hover-code');
  const el = document.createElement('code');
  if (language) el.classList.add(`language-${language.replace(/[^\w-]/g, '')}`);
  el.textContent = code.join('\n');
  pre.appendChild(el);
  fragment.appendChild(pre);
}

/**
 * @param {string} markdown
 * @returns {DocumentFragment}
 */
function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  const lines = String(markdown == null ? '' : markdown).split(/\r?\n/);
  const paragraph = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);

    if (fence) {
      flushParagraph(fragment, paragraph);
      const marker = fence[1];
      const code = [];
      i++;
      for (; i < lines.length; i++) {
        const closer = FENCE.exec(lines[i]);
        if (closer && closer[1][0] === marker[0]) break;
        code.push(lines[i]);
      }
      appendCodeBlock(fragment, code, fence[2]);
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph(fragment, paragraph);
      fragment.appendChild(document.createElement('hr'));
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph(fragment, paragraph);
      const h = document.createElement(`h${heading[1].length}`);
      h.classList.add('lsp-ui-hover-heading');
      appendInline(h, heading[2].trim());
      fragment.appendChild(h);
      continue;
    }

    if (!line.trim()) {
      flushParagraph(fragment, paragraph);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph(fragment, paragraph);
  return fragment;
}

module.exports = { renderMarkdown };
