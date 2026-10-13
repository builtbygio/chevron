// The badge for an editor in large-file mode (core.largeFileModeThreshold).
// Hidden for every other editor; a click switches the full features back on.
const {CompositeDisposable} = require('chevron');

module.exports = class LargeFileView {
  constructor() {
    this.element = document.createElement('status-bar-large-file');
    this.element.classList.add('large-file-mode', 'inline-block');

    this.link = document.createElement('a');
    this.link.classList.add('inline-block', 'text-warning');
    this.link.textContent = 'Large file';
    this.link.addEventListener('click', () => this.enableFullFeatures());
    this.element.appendChild(this.link);

    this.tooltipDisposable = chevron.tooltips.add(this.link, {
      title: 'Opened as plain text with syntax highlighting, folding, the language server and other heavy features off. Click to enable full features.'
    });

    this.editorSubscriptions = new CompositeDisposable();
    this.activeItemSubscription = chevron.workspace.onDidChangeActiveTextEditor(() => this.subscribeToActiveTextEditor());
    this.subscribeToActiveTextEditor();
  }

  destroy() {
    this.activeItemSubscription.dispose();
    this.editorSubscriptions.dispose();
    this.tooltipDisposable.dispose();
  }

  subscribeToActiveTextEditor() {
    this.editorSubscriptions.dispose();
    this.editorSubscriptions = new CompositeDisposable();
    const editor = chevron.workspace.getActiveTextEditor();
    if (editor) {
      this.editorSubscriptions.add(editor.onDidChangeLargeFileMode(() => this.update()));
    }
    this.update();
  }

  update() {
    const editor = chevron.workspace.getActiveTextEditor();
    this.element.style.display = editor && editor.isLargeFileMode() ? '' : 'none';
  }

  enableFullFeatures() {
    const editor = chevron.workspace.getActiveTextEditor();
    if (editor) {
      chevron.commands.dispatch(chevron.views.getView(editor), 'editor:enable-full-features');
    }
  }
};
