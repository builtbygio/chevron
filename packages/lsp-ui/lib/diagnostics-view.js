'use strict';

/**
 * Diagnostics panel + per-editor gutter markers (reference UI).
 * Consumes normalized diagnostics from the lsp.diagnostics service shape.
 */

// The orange dot is an absolutely positioned ::after on the right of the
// line-number box (out of flow, so it does not shift the digits). A click
// on the digits selects the line; only a click in that trailing zone asks
// for code actions.
function clickedLightbulb(event, node) {
  if (!event || !node || typeof node.getBoundingClientRect !== 'function') {
    return false;
  }
  const rect = node.getBoundingClientRect();
  let fontSize = 14;
  try {
    const view = node.ownerDocument && node.ownerDocument.defaultView;
    const parsed = view ? parseFloat(view.getComputedStyle(node).fontSize) : NaN;
    if (Number.isFinite(parsed)) fontSize = parsed;
  } catch (_) {
    /* keep the fallback */
  }
  return event.clientX >= rect.right - fontSize * 1.15;
}

function compareBufferPoint(a, b) {
  if (a.row !== b.row) return a.row - b.row;
  return (a.column || 0) - (b.column || 0);
}

// One span that contains every diagnostic on the clicked line. The code-action
// request uses this span. A caret at column 0 does not cover a diagnostic
// later on the line, and the TypeScript server then returns no quick fix.
function rangeCoveringDiagnostics(ranges) {
  let start = null;
  let end = null;
  for (const range of ranges || []) {
    if (!range || !range.start || !range.end) continue;
    if (!start || compareBufferPoint(range.start, start) < 0) start = range.start;
    if (!end || compareBufferPoint(range.end, end) > 0) end = range.end;
  }
  if (!start || !end) return null;
  return {
    start: { row: start.row, column: start.column || 0 },
    end: { row: end.row, column: end.column || 0 }
  };
}

function lightbulbRange(editor, row, rangesByRow) {
  const covering = rangeCoveringDiagnostics(
    rangesByRow && rangesByRow.get(row)
  );
  if (covering) return covering;
  let column = 0;
  if (editor && typeof editor.lineTextForBufferRow === 'function') {
    column = (editor.lineTextForBufferRow(row) || '').length;
  }
  return { start: { row, column: 0 }, end: { row, column } };
}

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
    this._rangesByEditor = new WeakMap();
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
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.add('lsp-ui-list-choice');
      const loc = d.range
        ? `${d.range.start.row + 1}:${d.range.start.column + 1}`
        : '';
      const src = d.source ? ` [${d.source}]` : '';
      button.textContent = `${loc} ${d.message}${src}`;
      button.title = d.uri || '';
      button.addEventListener('click', e => {
        e.preventDefault();
        this._openDiagnostic(d, env);
      });
      li.appendChild(button);
      list.appendChild(li);
    }
    this.element.appendChild(list);
  }

  async _openDiagnostic(d, env) {
    try {
      const root = global.chevron || global.atom;
      if (!env || !env.workspace || !d || !d.uri || !root || !root.lsp) return;
      const filePath = root.lsp.uriToPath(d.uri);
      if (!filePath) {
        if (env.notifications) {
          env.notifications.addWarning('Could not open that diagnostic');
        }
        return;
      }
      const start = d.range && d.range.start;
      const editor = await env.workspace.open(filePath, {
        initialLine: start ? start.row : 0,
        initialColumn: start ? start.column : 0,
        searchAllPanes: true
      });
      if (editor && editor.setCursorBufferPosition && start) {
        editor.setCursorBufferPosition(start);
      }
    } catch (err) {
      if (env && env.notifications) {
        env.notifications.addWarning(
          `Could not open diagnostic: ${err && err.message ? err.message : err}`
        );
      }
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
    if (!editor || !editor.decorateMarker) return;
    const byRow = new Map();
    for (const d of diagnostics || []) {
      if (!d.range || !d.range.start || !Number.isInteger(d.range.start.row)) {
        continue;
      }
      const row = d.range.start.row;
      let list = byRow.get(row);
      if (!list) {
        list = [];
        byRow.set(row, list);
      }
      list.push(d.range);
    }
    this._rangesByEditor.set(editor, byRow);
    const markers = [];
    for (const row of byRow.keys()) {
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
    element.addEventListener(
      'mousedown',
      event => {
        if (event.button !== 0) return;
        const node =
          event.target && event.target.closest
            ? event.target.closest('.line-number.lsp-lightbulb')
            : null;
        if (!node || !clickedLightbulb(event, node)) return;
        // Capture phase, before the gutter turns the click into a line selection.
        event.preventDefault();
        event.stopPropagation();
        const row = Number(node.dataset.bufferRow);
        if (!Number.isInteger(row)) return;
        const range = lightbulbRange(
          editor,
          row,
          this._rangesByEditor.get(editor)
        );
        if (editor.setSelectedBufferRange) {
          editor.setSelectedBufferRange([range.start, range.end], {
            autoscroll: false
          });
        } else if (editor.setCursorBufferPosition) {
          editor.setCursorBufferPosition(range.start);
        }
        if (typeof element.focus === 'function') element.focus();
        const rect = node.getBoundingClientRect();
        editor.__chevronCodeActionAnchor = {
          top: rect.bottom + 4,
          left: Math.max(8, rect.left)
        };
        const e = global.chevron || global.atom;
        if (e && e.commands) {
          e.commands.dispatch(element, 'chevron-lsp:code-actions', {
            editor,
            range
          });
        }
      },
      true
    );
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
    this._rangesByEditor.delete(editor);
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

module.exports = {
  DiagnosticsView,
  SEVERITY_CLASS,
  clickedLightbulb,
  rangeCoveringDiagnostics,
  lightbulbRange
};
