'use strict';

/**
 * Minimal hover tooltip for LSP MarkupContent.
 * Always uses textContent — server strings never become HTML.
 */

const { stripHtml } = require('../../../src/lsp/markup');

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

    const text = stripHtml(contents.value);
    if (!text.trim()) return;

    const pre = document.createElement('pre');
    pre.classList.add('lsp-ui-hover-body');
    pre.textContent = text;
    this.element.innerHTML = '';
    this.element.appendChild(pre);

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
    this.element.innerHTML = '';
  }

  destroy() {
    this.hide();
  }
}

module.exports = { HoverView };
