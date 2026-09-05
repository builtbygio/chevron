const { CompositeDisposable } = require('chevron');

// Inlay hints: parameter names and inferred types drawn between the
// characters that are actually in the file.
//
// Only the visible rows are asked for and only the visible rows are drawn. A
// server asked about a ten thousand line file will happily compute ten
// thousand lines of hints that nobody can see, and every one of them would
// become a marker.
//
// docs/reference/inlay-hints.md

const REQUEST_DEBOUNCE_MS = 250;

class EditorHints {
  constructor(editor, lsp) {
    this.editor = editor;
    this.lsp = lsp;
    this.markers = [];
    this.subscriptions = new CompositeDisposable();
    this.timer = null;
    // Rises on every request; a reply carrying an older token has been
    // overtaken by the user typing and is thrown away.
    this.token = 0;
    this.destroyed = false;

    const request = () => this.schedule();
    this.subscriptions.add(editor.onDidStopChanging(request));
    this.subscriptions.add(editor.onDidChangeGrammar(request));
    this.subscriptions.add(editor.onDidDestroy(() => this.destroy()));

    const view = chevron.views.getView(editor);
    if (view && typeof view.onDidChangeScrollTop === 'function') {
      this.subscriptions.add(view.onDidChangeScrollTop(request));
    }

    this.schedule();
  }

  schedule() {
    if (this.destroyed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, REQUEST_DEBOUNCE_MS);
  }

  visibleRange() {
    const start = this.editor.getFirstVisibleScreenRow
      ? this.editor.getFirstVisibleScreenRow()
      : 0;
    const end = this.editor.getLastVisibleScreenRow
      ? this.editor.getLastVisibleScreenRow()
      : this.editor.getLastBufferRow();
    const lastRow = this.editor.getLastBufferRow();
    return {
      start: { row: Math.max(0, start), column: 0 },
      end: {
        row: Math.min(lastRow, (end == null ? lastRow : end) + 1),
        column: 0
      }
    };
  }

  async refresh() {
    if (this.destroyed) return;
    if (!chevron.config.get('lsp.inlayHints')) {
      this.clear();
      return;
    }
    if (!this.lsp.servesInlayHints(this.editor)) {
      this.clear();
      return;
    }

    const token = ++this.token;
    let hints;
    try {
      hints = await this.lsp.inlayHintsAt(this.editor, this.visibleRange());
    } catch (error) {
      return;
    }
    if (this.destroyed || token !== this.token) return;

    this.clear();
    for (const hint of hints) this.draw(hint);
  }

  draw(hint) {
    const { row, column } = hint.position;
    if (row == null || column == null) return;

    const marker = this.editor.markBufferPosition([row, column], {
      invalidate: 'touch'
    });
    // Padding is the server's, not ours: it knows whether `: number` needs a
    // space in front of it for the language it is describing.
    const text =
      (hint.paddingLeft ? ' ' : '') + hint.text + (hint.paddingRight ? ' ' : '');
    this.editor.decorateMarker(marker, {
      type: 'inline-text',
      text,
      class: hint.kind ? `inlay-hint inlay-hint-${hint.kind}` : 'inlay-hint'
    });
    this.markers.push(marker);
  }

  clear() {
    for (const marker of this.markers) marker.destroy();
    this.markers.length = 0;
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.clear();
    this.subscriptions.dispose();
  }
}

class InlayHints {
  constructor(lsp) {
    this.lsp = lsp;
    this.byEditor = new Map();
    this.subscriptions = new CompositeDisposable();
  }

  activate() {
    this.subscriptions.add(
      chevron.workspace.observeTextEditors(editor => this.watch(editor))
    );
    this.subscriptions.add(
      chevron.config.onDidChange('lsp.inlayHints', () => this.refreshAll())
    );
  }

  watch(editor) {
    if (this.byEditor.has(editor)) return;
    const hints = new EditorHints(editor, this.lsp);
    this.byEditor.set(editor, hints);
    editor.onDidDestroy(() => this.byEditor.delete(editor));
  }

  refreshAll() {
    for (const hints of this.byEditor.values()) hints.schedule();
  }

  deactivate() {
    for (const hints of this.byEditor.values()) hints.destroy();
    this.byEditor.clear();
    this.subscriptions.dispose();
  }
}

module.exports = { InlayHints, EditorHints, REQUEST_DEBOUNCE_MS };
