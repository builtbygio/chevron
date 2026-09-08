'use strict';

/**
 * LSP hover markdown renders to DOM nodes, and only to DOM nodes.
 *
 * Servers send MarkupContent with kind "markdown". It used to be dumped into a
 * <pre> as text, so headings, rules and code fences showed as literal `###`,
 * `---` and ```` ``` ````. It was also run through stripHtml first, which
 * deletes `<stdio.h>` from every C hover.
 *
 * Run: node --test script/ci/lsp-hover-markdown.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const TARGET = path.join(ROOT, 'packages/lsp-ui/lib/markdown-dom.js');

// Enough of the DOM for a renderer that only ever creates elements and text.
class StubNode {
  constructor(tag) {
    this.tagName = tag;
    this.childNodes = [];
    this.classList = {
      _set: new Set(),
      add: (...names) => names.forEach(n => this.classList._set.add(n))
    };
    this._text = null;
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    this.childNodes = this.childNodes.filter(c => c !== child);
  }
  set textContent(value) {
    this._text = String(value);
    this.childNodes = [];
  }
  get textContent() {
    if (this._text != null) return this._text;
    return this.childNodes.map(c => c.textContent).join('');
  }
  get firstChild() {
    return this.childNodes[0];
  }
}

class StubText extends StubNode {
  constructor(text) {
    super('#text');
    this._text = String(text);
  }
}

function withStubDom(fn) {
  const previous = global.document;
  global.document = {
    createElement: tag => new StubNode(tag),
    createTextNode: text => new StubText(text),
    createDocumentFragment: () => new StubNode('#fragment')
  };
  try {
    delete require.cache[Module._resolveFilename(TARGET)];
    return fn(require(TARGET));
  } finally {
    delete require.cache[Module._resolveFilename(TARGET)];
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
}

function tags(node, acc = []) {
  for (const child of node.childNodes) {
    if (child.tagName !== '#text') acc.push(child.tagName);
    tags(child, acc);
  }
  return acc;
}

describe('lsp hover markdown', () => {
  it('renders headings, rules and fenced code as elements', () => {
    withStubDom(({ renderMarkdown }) => {
      const out = renderMarkdown(
        '### variable `story`\n\n---\nType: `const char *[3]`\n\n```cpp\nstatic const char *story[] = {\n```\n'
      );
      const produced = tags(out);
      assert.ok(produced.includes('h3'), 'heading became an element');
      assert.ok(produced.includes('hr'), 'rule became an element');
      assert.ok(produced.includes('pre'), 'fence became a code block');
      assert.ok(produced.includes('code'), 'inline code became an element');
      // The markers themselves must not survive as text.
      const text = out.textContent;
      assert.ok(!text.includes('###'), `"###" left in: ${text}`);
      assert.ok(!text.includes('```'), '"```" left in output');
      assert.ok(
        text.includes('static const char *story[] = {'),
        'code block content survived'
      );
    });
  });

  it('keeps angle brackets, which stripping used to delete', () => {
    withStubDom(({ renderMarkdown }) => {
      const out = renderMarkdown('#include <stdio.h>\n\n`std::vector<int>`');
      const text = out.textContent;
      assert.ok(text.includes('<stdio.h>'), `lost <stdio.h>: ${text}`);
      assert.ok(text.includes('std::vector<int>'), `lost the template: ${text}`);
    });
  });

  it('never builds an HTML string', () => {
    const source = require('fs').readFileSync(TARGET, 'utf8');
    assert.ok(
      !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source),
      'markdown-dom.js must only create nodes, never assign HTML'
    );
    const hover = require('fs').readFileSync(
      path.join(ROOT, 'packages/lsp-ui/lib/hover-view.js'),
      'utf8'
    );
    assert.ok(
      !/innerHTML|outerHTML|insertAdjacentHTML/.test(hover),
      'hover-view.js must only create nodes, never assign HTML'
    );
  });

  it('leaves markup inside a code span alone', () => {
    withStubDom(({ renderMarkdown }) => {
      const out = renderMarkdown('`**not bold**`');
      assert.ok(!tags(out).includes('strong'), 'emphasis inside code applied');
      assert.ok(out.textContent.includes('**not bold**'), 'code span altered');
    });
  });
});
