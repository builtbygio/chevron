const { CompositeDisposable } = require('chevron');

// The lines that opened the blocks you have scrolled past, pinned to the top
// of the editor.
//
// An overlay, not decorations: a decoration that moved a line would move the
// cursor with it. It never takes a click or a selection.
//
// docs/reference/code-context.md

let subscriptions = null;
let cache = null;
const overlays = new Map();

// Created on first use: touching an editor's view at boot forces it to
// measure before it is ready, and most editors never need one.
function overlayFor(editor) {
  let overlay = overlays.get(editor);
  if (overlay) return overlay;

  const element = document.createElement('div');
  element.classList.add('sticky-scroll');
  // The editor element, not .scroll-view: a child in the component's own
  // subtree disturbs its measurements.
  const view = chevron.views.getView(editor);
  view.appendChild(element);

  overlay = { element, editor };
  overlays.set(editor, overlay);
  return overlay;
}

function update(editor) {
  if (!editor) return;
  const overlay = overlays.get(editor);
  if (!chevron.config.get('sticky-scroll.enabled')) {
    if (overlay) overlay.element.innerHTML = '';
    return;
  }

  const view = chevron.views.getView(editor);
  if (!view || !view.getFirstVisibleScreenRow) return;
  // Nothing to pin over an editor that is not on screen, and asking an
  // unattached one forces it to measure before it can.
  if (!view.isConnected) return;

  // The row below the top of the viewport: what encloses it has scrolled off.
  const firstVisible = view.getFirstVisibleScreenRow();
  if (!Number.isFinite(firstVisible)) return;
  const bufferRow = editor.bufferRowForScreenRow
    ? editor.bufferRowForScreenRow(firstVisible)
    : firstVisible;
  if (!Number.isFinite(bufferRow)) return;

  const ranges = chevron.enclosingScopes
    .enclosingRanges(cache.get(editor), bufferRow)
    // A block whose opening line is still on screen needs no pinning.
    .filter(range => range.startRow < bufferRow);

  const max = chevron.config.get('sticky-scroll.maxLines') || 5;
  const pinned = ranges.slice(-max);

  if (pinned.length === 0) {
    const existing = overlays.get(editor);
    if (existing) existing.element.innerHTML = '';
    return;
  }

  const element = overlayFor(editor).element;
  element.innerHTML = '';

  for (const range of pinned) {
    const line = document.createElement('div');
    line.classList.add('sticky-scroll-line');
    line.textContent = editor.lineTextForBufferRow(range.startRow) || '';
    line.addEventListener('click', () => {
      editor.setCursorBufferPosition([range.startRow, 0]);
      editor.scrollToBufferPosition([range.startRow, 0], { center: true });
    });
    element.appendChild(line);
  }
}

function watch(editor) {
  const editorSubscriptions = new CompositeDisposable();
  const view = chevron.views.getView(editor);

  if (view && typeof view.onDidChangeScrollTop === 'function') {
    editorSubscriptions.add(view.onDidChangeScrollTop(() => update(editor)));
  }
  editorSubscriptions.add(
    editor.onDidStopChanging(() => {
      cache.invalidate(editor);
      update(editor);
    }),
    editor.onDidChangeGrammar(() => {
      cache.invalidate(editor);
      update(editor);
    }),
    editor.onDidDestroy(() => {
      const overlay = overlays.get(editor);
      if (overlay) overlay.element.remove();
      overlays.delete(editor);
      editorSubscriptions.dispose();
    })
  );
  subscriptions.add(editorSubscriptions);
  // No update here: watch() runs as each editor opens, and reaching for its
  // view then forces an early measurement.
}

module.exports = {
  activate() {
    subscriptions = new CompositeDisposable();
    cache = new chevron.enclosingScopes.FoldableRangeCache();
    subscriptions.add(
      chevron.workspace.observeTextEditors(editor => watch(editor)),
      // The editor you are looking at is the only one that can have scrolled.
      chevron.workspace.observeActiveTextEditor(editor => update(editor)),
      chevron.config.onDidChange('sticky-scroll.enabled', () => {
        for (const editor of chevron.workspace.getTextEditors()) update(editor);
      })
    );
  },

  deactivate() {
    for (const overlay of overlays.values()) overlay.element.remove();
    overlays.clear();
    if (subscriptions) subscriptions.dispose();
    cache = null;
  },

  // For the smoke test.
  pinnedForTests(editor) {
    const overlay = overlays.get(editor);
    if (!overlay) return [];
    return [].map.call(
      overlay.element.querySelectorAll('.sticky-scroll-line'),
      n => n.textContent
    );
  },

  updateForTests(editor) {
    update(editor);
  }
};
