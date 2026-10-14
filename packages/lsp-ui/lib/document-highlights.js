const { CompositeDisposable } = require('chevron');
const { REQUEST_DEBOUNCE_MS } = require('./inlay-hints');

// Highlight the other uses of the symbol under the cursor, from the server's
// textDocument/documentHighlight.
//
// Two rules keep it calm. Moving the cursor never clears the highlights: they
// stay until the answer for the new position replaces them in one go, so
// moving within a symbol, or from one use of it to the next, does not flicker.
// Typing clears them at once, since every range is stale after an edit, and
// asks again only once the typing stops.

const KINDS = ['text', 'read', 'write'];

class EditorHighlights {
  constructor(editor, lsp) {
    this.editor = editor;
    this.lsp = lsp;
    this.timer = null;
    // Rises on every request and every edit; an answer carrying an older one
    // is for a position or a text that no longer exists.
    this.token = 0;
    this.typing = false;
    this.destroyed = false;
    this.subscriptions = new CompositeDisposable();

    // A layer's decoration goes when the layer is destroyed.
    this.layers = {};
    for (const kind of KINDS) {
      const layer = editor.addMarkerLayer({ maintainHistory: false });
      this.layers[kind] = layer;
      editor.decorateMarkerLayer(layer, {
        type: 'highlight',
        class: `lsp-document-highlight lsp-document-highlight-${kind}`
      });
    }

    this.subscriptions.add(
      editor.onDidChangeCursorPosition(() => {
        if (!this.typing) this.schedule();
      }),
      editor.getBuffer().onDidChange(() => {
        this.typing = true;
        this.cancel();
        this.clear();
      }),
      editor.onDidStopChanging(() => {
        this.typing = false;
        this.schedule();
      }),
      editor.onDidDestroy(() => this.destroy())
    );
  }

  schedule() {
    if (this.destroyed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, REQUEST_DEBOUNCE_MS);
  }

  cancel() {
    this.token++;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async refresh() {
    if (this.destroyed) return;
    if (
      !chevron.config.get('lsp.documentHighlights') ||
      !this.lsp.servesDocumentHighlights(this.editor) ||
      // A selection is something you are about to act on; uses of whatever
      // it starts on are noise over it.
      !this.editor.getLastSelection().isEmpty()
    ) {
      this.clear();
      return;
    }

    const token = ++this.token;
    let highlights;
    try {
      highlights = await this.lsp.documentHighlightsAt(this.editor);
    } catch (error) {
      return;
    }
    if (this.destroyed || token !== this.token) return;

    this.clear();
    for (const { range, kind } of highlights) {
      const layer = this.layers[kind] || this.layers.text;
      layer.markBufferRange([range.start, range.end], { invalidate: 'touch' });
    }
  }

  clear() {
    for (const kind of KINDS) this.layers[kind].clear();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancel();
    this.subscriptions.dispose();
    for (const kind of KINDS) this.layers[kind].destroy();
  }
}

class DocumentHighlights {
  constructor(lsp) {
    this.lsp = lsp;
    this.byEditor = new Map();
    this.subscriptions = new CompositeDisposable();
  }

  activate() {
    this.subscriptions.add(
      chevron.workspace.observeTextEditors(editor => this.watch(editor)),
      chevron.config.onDidChange('lsp.documentHighlights', ({ newValue }) => {
        for (const highlights of this.byEditor.values()) {
          if (newValue) highlights.schedule();
          else highlights.clear();
        }
      })
    );
  }

  watch(editor) {
    if (this.byEditor.has(editor) || editor.isMini()) return;
    this.byEditor.set(editor, new EditorHighlights(editor, this.lsp));
    editor.onDidDestroy(() => this.byEditor.delete(editor));
  }

  deactivate() {
    for (const highlights of this.byEditor.values()) highlights.destroy();
    this.byEditor.clear();
    this.subscriptions.dispose();
  }
}

module.exports = { DocumentHighlights, EditorHighlights, KINDS };
