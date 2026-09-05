const { CompositeDisposable } = require('chevron');
const path = require('path');

// The path to the cursor: file, then the blocks it sits inside.
//
// One bar for the active editor rather than one per pane. A breadcrumb answers
// "where am I", and only the editor you are looking at can pose that question.
//
// docs/reference/code-context.md

let subscriptions = null;
let editorSubscriptions = null;
let panel = null;
let element = null;
let cache = null;

function render(editor) {
  if (!element) return;
  element.innerHTML = '';
  if (!editor || !chevron.config.get('breadcrumbs.enabled')) {
    if (panel && panel.isVisible()) panel.hide();
    return;
  }
  if (panel && !panel.isVisible()) panel.show();

  const file = document.createElement('span');
  file.classList.add('breadcrumb-segment', 'breadcrumb-file');
  const filePath = editor.getPath();
  file.textContent = filePath ? path.basename(filePath) : 'untitled';
  element.appendChild(file);

  const row = editor.getCursorBufferPosition().row;
  const ranges = chevron.enclosingScopes.enclosingRanges(cache.get(editor), row);

  for (const range of ranges) {
    const label = chevron.enclosingScopes.labelForLine(
      editor.lineTextForBufferRow(range.startRow) || ''
    );
    if (!label) continue;

    const sep = document.createElement('span');
    sep.classList.add('breadcrumb-separator');
    sep.textContent = '›';
    element.appendChild(sep);

    const segment = document.createElement('a');
    segment.classList.add('breadcrumb-segment');
    segment.textContent = label;
    // Clicking a segment goes to the line that opened it, which is the only
    // thing a breadcrumb can usefully do.
    segment.addEventListener('click', () => {
      editor.setCursorBufferPosition([range.startRow, 0]);
      editor.scrollToBufferPosition([range.startRow, 0], { center: true });
      chevron.views.getView(editor).focus();
    });
    element.appendChild(segment);
  }
}

function watch(editor) {
  if (editorSubscriptions) editorSubscriptions.dispose();
  editorSubscriptions = new CompositeDisposable();
  if (!editor) return render(null);

  editorSubscriptions.add(
    editor.onDidChangeCursorPosition(() => render(editor)),
    // The tree the ranges came from is stale once the text changes.
    editor.onDidStopChanging(() => {
      cache.invalidate(editor);
      render(editor);
    }),
    editor.onDidChangeGrammar(() => {
      cache.invalidate(editor);
      render(editor);
    })
  );
  render(editor);
}

module.exports = {
  activate() {
    subscriptions = new CompositeDisposable();
    cache = new chevron.enclosingScopes.FoldableRangeCache();

    element = document.createElement('div');
    element.classList.add('breadcrumbs');
    panel = chevron.workspace.addTopPanel({ item: element, visible: false });

    subscriptions.add(
      chevron.workspace.observeActiveTextEditor(editor => watch(editor)),
      chevron.config.onDidChange('breadcrumbs.enabled', () =>
        render(chevron.workspace.getActiveTextEditor())
      )
    );
  },

  deactivate() {
    if (editorSubscriptions) editorSubscriptions.dispose();
    if (subscriptions) subscriptions.dispose();
    if (panel) panel.destroy();
    element = null;
    panel = null;
    cache = null;
  },

  // For the smoke test: the trail as text, without scraping the DOM.
  trailForTests() {
    return element
      ? [].map.call(element.querySelectorAll('.breadcrumb-segment'), n => n.textContent)
      : [];
  }
};
