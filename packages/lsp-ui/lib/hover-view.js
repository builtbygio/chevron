'use strict';

/**
 * Hover tooltip for LSP MarkupContent.
 *
 * Markdown is rendered to DOM nodes (see markdown-dom.js); plaintext goes in
 * a <pre>. Either way server text lands in a text node and never becomes
 * HTML, so tags are not stripped — inside a text node they are inert, and
 * stripping deletes `<stdio.h>` and `std::vector<int>` from C and C++ hovers.
 */

const { renderMarkdown } = require('./markdown-dom');

// chevron.lsp, not a relative path into src/: a package that reaches into
// core cannot be bundled or installed from a registry.

class HoverView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-hover', 'native-key-bindings');
    this.element.tabIndex = -1;
    this._marker = null;
    this._overlay = null;
  }

  show(editor, point, contents) {
    this.hide();
    if (!editor || !contents || !contents.value) return;

    const value = String(contents.value);
    if (!value.trim()) return;

    this._clear();
    if (contents.kind === 'markdown') {
      this.element.appendChild(renderMarkdown(value));
    } else {
      const pre = document.createElement('pre');
      pre.classList.add('lsp-ui-hover-body');
      pre.textContent = value;
      this.element.appendChild(pre);
    }

    const bufferPoint = point || editor.getCursorBufferPosition();
    this._marker = editor.markBufferPosition(bufferPoint, {
      invalidate: 'touch'
    });
    this._overlay = editor.decorateMarker(this._marker, {
      type: 'overlay',
      item: this.element,
      position: 'tail',
      class: 'lsp-ui-hover-overlay'
    });
  }

  hide() {
    if (this._overlay) {
      try {
        this._overlay.destroy();
      } catch (_) {
        /* ignore */
      }
      this._overlay = null;
    }
    if (this._marker) {
      try {
        this._marker.destroy();
      } catch (_) {
        /* ignore */
      }
      this._marker = null;
    }
    this._clear();
  }

  _clear() {
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }
  }

  destroy() {
    this.hide();
  }
}

module.exports = { HoverView };
