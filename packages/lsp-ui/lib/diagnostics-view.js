'use strict';

/**
 * Diagnostics panel + per-editor gutter markers (reference UI).
 * Consumes normalized diagnostics from the lsp.diagnostics service shape.
 */

const SEVERITY_CLASS = {
  1: 'lsp-ui-diag-error',
  2: 'lsp-ui-diag-warning',
  3: 'lsp-ui-diag-info',
  4: 'lsp-ui-diag-hint'
};

class DiagnosticsView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-diagnostics-panel', 'native-key-bindings');
    this.element.tabIndex = -1;
    this._panel = null;
    this._markersByEditor = new WeakMap();
    this._bulbsByEditor = new WeakMap();
    this._bulbClickBound = new WeakSet();
  }

  /**
   * @param {Array<{uri, severity, message, range, source}>} diagnostics
   * @param {object} env
   */
  renderList(diagnostics, env) {
    this.element.innerHTML = '';
    const title = document.createElement('div');
    title.classList.add('lsp-ui-diagnostics-title');
    title.textContent = `Problems (${diagnostics.length})`;
    this.element.appendChild(title);

    if (!diagnostics.length) {
      const empty = document.createElement('div');
      empty.classList.add('lsp-ui-diagnostics-empty');
      empty.textContent = 'No diagnostics';
      this.element.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.classList.add('lsp-ui-diagnostics-list');
    for (const d of diagnostics) {
      const li = document.createElement('li');
      li.classList.add(SEVERITY_CLASS[d.severity] || 'lsp-ui-diag-info');
      const a = document.createElement('a');
      a.href = '#';
      const loc = d.range
        ? `${d.range.start.row + 1}:${d.range.start.column + 1}`
        : '';
      const src = d.source ? ` [${d.source}]` : '';
      a.textContent = `${loc} ${d.message}${src}`;
      a.title = d.uri || '';
      a.addEventListener('click', e => {
        e.preventDefault();
        this._openDiagnostic(d, env);
      });
      li.appendChild(a);
      list.appendChild(li);
    }
    this.element.appendChild(list);
  }

  async _openDiagnostic(d, env) {
    if (!env || !env.workspace || !d.uri) return;
    const filePath = chevron.lsp.uriToPath(d.uri);
    if (!filePath) return;
    const editor = await env.workspace.open(filePath, {
      initialLine: d.range.start.row,
      initialColumn: d.range.start.column,
      searchAllPanes: true
    });
    if (editor && editor.setCursorBufferPosition) {
      editor.setCursorBufferPosition(d.range.start);
    }
  }

  showPanel(env) {
    if (!env || !env.workspace || !env.workspace.addBottomPanel) return;
    if (this._panel) {
      this._panel.show();
      return;
    }
    this._panel = env.workspace.addBottomPanel({
      item: this.element,
      visible: true,
      priority: 100
    });
  }

  hidePanel() {
    if (this._panel) {
      try {
        this._panel.hide();
      } catch (_) {
        /* ignore */
      }
    }
  }

  togglePanel(env) {
    if (this._panel && this._panel.isVisible && this._panel.isVisible()) {
      this.hidePanel();
    } else {
      this.showPanel(env);
    }
  }

  /**
   * Update gutter markers for one editor from diagnostics for its URI.
   * @param {object} editor
   * @param {Array} diagnostics normalized, for this file only
   */
  updateGutter(editor, diagnostics) {
    if (!editor || !editor.markBufferRange) return;
    this.clearGutter(editor);
    const markers = [];
    for (const d of diagnostics) {
      if (!d.range) continue;
      try {
        const marker = editor.markBufferRange(
          [d.range.start, d.range.end],
          { invalidate: 'never' }
        );
        editor.decorateMarker(marker, {
          type: 'line-number',
          class:
            SEVERITY_CLASS[d.severity] ||
            'lsp-ui-diag-info'
        });
        editor.decorateMarker(marker, {
          type: 'highlight',
          class:
            (SEVERITY_CLASS[d.severity] || 'lsp-ui-diag-info') + '-highlight'
        });
        markers.push(marker);
      } catch (_) {
        /* ignore bad ranges */
      }
    }
    this._markersByEditor.set(editor, markers);
    this.updateLightbulbs(editor, diagnostics);
  }

  updateLightbulbs(editor, diagnostics) {
    this.clearLightbulbs(editor);
    if (!editor.decorateMarker) return;
    const rows = new Set();
    for (const d of diagnostics) {
      if (d.range && d.range.start) rows.add(d.range.start.row);
    }
    const markers = [];
    for (const row of rows) {
      try {
        const marker = editor.markBufferRange(
          [[row, 0], [row, 0]],
          { invalidate: 'never' }
        );
        editor.decorateMarker(marker, {
          type: 'line-number',
          class: 'lsp-lightbulb'
        });
        markers.push(marker);
      } catch (_) {
        /* ignore */
      }
    }
    this._bulbsByEditor.set(editor, markers);
    this.bindLightbulbClicks(editor);
  }

  bindLightbulbClicks(editor) {
    if (this._bulbClickBound.has(editor)) return;
    const element = editor.getElement && editor.getElement();
    if (!element || !element.addEventListener) return;
    this._bulbClickBound.add(editor);
    element.addEventListener('mousedown', event => {
      const node =
        event.target && event.target.closest
          ? event.target.closest('.line-number.lsp-lightbulb')
          : null;
      if (!node) return;
      const row = Number(node.dataset.bufferRow);
      if (!Number.isInteger(row)) return;
      if (editor.setCursorBufferPosition) {
        editor.setCursorBufferPosition([row, 0]);
      }
      const e = global.chevron || global.atom;
      if (e && e.commands && editor.getElement) {
        e.commands.dispatch(editor.getElement(), 'chevron-lsp:code-actions');
      }
    });
  }

  clearLightbulbs(editor) {
    const markers = this._bulbsByEditor.get(editor);
    if (!markers) return;
    for (const m of markers) {
      try {
        m.destroy();
      } catch (_) {
        /* ignore */
      }
    }
    this._bulbsByEditor.set(editor, []);
  }

  clearGutter(editor) {
    const markers = this._markersByEditor.get(editor);
    if (!markers) return;
    for (const m of markers) {
      try {
        m.destroy();
      } catch (_) {
        /* ignore */
      }
    }
    this._markersByEditor.set(editor, []);
    this.clearLightbulbs(editor);
  }

  destroy() {
    if (this._panel) {
      try {
        this._panel.destroy();
      } catch (_) {
        /* ignore */
      }
      this._panel = null;
    }
    this.element.innerHTML = '';
  }
}

module.exports = { DiagnosticsView, SEVERITY_CLASS };
