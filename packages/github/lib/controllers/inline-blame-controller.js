"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MAX_BLAME_LINES = exports.REQUEST_DEBOUNCE_MS = void 0;

var _path = _interopRequireDefault(require("path"));

var _eventKit = require("event-kit");

var _blame = require("../models/blame");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Long enough that holding an arrow key does not blame every line it passes.
const REQUEST_DEBOUNCE_MS = 150;
exports.REQUEST_DEBOUNCE_MS = REQUEST_DEBOUNCE_MS;
const MAX_BLAME_LINES = 20000;
exports.MAX_BLAME_LINES = MAX_BLAME_LINES;

function escapeHTML(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tooltipHTML(commit) {
  if (commit.uncommitted) {
    return 'Not committed yet<br><small>This line is not in any commit.</small>';
  }

  const date = new Date(commit.authorTime * 1000).toLocaleString();
  return [`<strong>${escapeHTML(commit.summary)}</strong>`, `${escapeHTML(commit.author)} &lt;${escapeHTML(commit.authorMail)}&gt;`, escapeHTML(date), `<code>${escapeHTML(commit.sha)}</code>`, '<small>Click to open the commit</small>'].join('<br>');
}

// Who last changed the cursor's line, drawn faintly after it: one line, in
// the active editor, never more. Blame runs through the repository, so it is
// off the UI thread and cached per file until the file or HEAD changes.
class InlineBlameController {
  constructor({
    workspace,
    config,
    commands,
    tooltips,
    contextPool,
    now = Date.now
  }) {
    this.workspace = workspace;
    this.config = config;
    this.tooltips = tooltips;
    this.contextPool = contextPool;
    this.now = now;
    this.enabled = false;
    this.editor = null;
    this.editorSubscriptions = null;
    this.marker = null;
    this.current = null;
    this.tooltip = null;
    this.tooltipElement = null;
    this.timer = null;
    this.token = 0;
    this.typing = false;
    this.bufferVersion = 0;
    this.unsaved = null;
    this.subscriptions = new _eventKit.CompositeDisposable(config.observe('github.inlineBlame', enabled => this.setEnabled(enabled)), commands.add('atom-workspace', {
      'github:toggle-inline-blame': () => config.set('github.inlineBlame', !config.get('github.inlineBlame'))
    }), workspace.observeActiveTextEditor(editor => this.setEditor(editor)), contextPool.onDidUpdateRepository(context => this.didChangeContext(context)), contextPool.onDidChangeRepositoryState(context => this.didChangeContext(context)), contextPool.onDidChangePoolContexts(() => this.schedule(0)));
  } // A repository is still loading when the window opens; blame once it is present.


  didChangeContext(context) {
    if (this.editor && this.contextFor(this.editor.getPath()) === context) this.schedule(0);
  }

  destroy() {
    this.setEditor(null);
    this.subscriptions.dispose();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) this.schedule(0);else this.clear();
  }

  setEditor(editor) {
    if (this.editorSubscriptions) this.editorSubscriptions.dispose();
    this.editorSubscriptions = null;
    this.clear();
    this.unsaved = null;
    this.typing = false;
    this.editor = editor || null;
    if (!this.editor) return;
    const element = this.editor.getElement();

    const onMouseDown = event => this.didMouseDown(event);

    const onMouseOver = event => this.didMouseOver(event);

    const onMouseOut = event => this.didMouseOut(event);

    element.addEventListener('mousedown', onMouseDown, true);
    element.addEventListener('mouseover', onMouseOver);
    element.addEventListener('mouseout', onMouseOut);
    this.editorSubscriptions = new _eventKit.CompositeDisposable(this.editor.onDidChangeCursorPosition(() => this.didMoveCursor()), this.editor.getBuffer().onDidChange(() => {
      this.bufferVersion++;
      this.typing = true;
      this.clear();
    }), this.editor.onDidStopChanging(() => {
      this.typing = false;
      this.schedule();
    }), this.editor.onDidSave(() => {
      this.unsaved = null;
      this.schedule(0);
    }), this.editor.onDidChangePath(() => this.schedule(0)), this.editor.onDidDestroy(() => this.setEditor(null)), new _eventKit.Disposable(() => {
      element.removeEventListener('mousedown', onMouseDown, true);
      element.removeEventListener('mouseover', onMouseOver);
      element.removeEventListener('mouseout', onMouseOut);
    }));
    this.schedule(0);
  }

  didMoveCursor() {
    if (this.marker && this.marker.getHeadBufferPosition().row !== this.editor.getCursorBufferPosition().row) {
      this.clear();
    }

    if (!this.typing) this.schedule();
  }

  schedule(delay = REQUEST_DEBOUNCE_MS) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.update();
    }, delay);
  }

  contextFor(filePath) {
    if (!filePath) return null;
    let best = null;
    let bestLength = -1;
    this.contextPool.withResidentContexts((workdir, context) => {
      if (filePath.startsWith(workdir + _path.default.sep) && workdir.length > bestLength) {
        best = context;
        bestLength = workdir.length;
      }
    });
    return best;
  }

  targetFor(editor) {
    if (!this.enabled || !editor) return null;
    if (typeof editor.isLargeFileMode === 'function' && editor.isLargeFileMode()) return null;
    if (editor.getBuffer().getLineCount() > MAX_BLAME_LINES) return null;
    const filePath = editor.getPath();
    const context = this.contextFor(filePath);
    if (!context) return null;
    const repository = context.getRepository();
    if (!repository || !repository.isPresent()) return null;
    const workdir = context.getWorkingDirectory();
    return {
      repository,
      workdir,
      relativePath: _path.default.relative(workdir, filePath)
    };
  }

  blameFor(editor, target) {
    if (!editor.isModified()) return target.repository.getBlame(target.relativePath);

    if (this.unsaved && this.unsaved.editor === editor && this.unsaved.version === this.bufferVersion) {
      return this.unsaved.blame;
    }

    const blame = target.repository.getBlame(target.relativePath, {
      contents: editor.getText()
    });
    this.unsaved = {
      editor,
      version: this.bufferVersion,
      blame
    };
    return blame;
  }

  async update() {
    const token = ++this.token;
    const editor = this.editor;
    const target = this.targetFor(editor);

    if (!target || this.typing) {
      if (!target) this.clear();
      return;
    }

    let blame = null;

    try {
      blame = await this.blameFor(editor, target);
    } catch (error) {
      blame = null;
    }

    if (token !== this.token || editor !== this.editor || this.typing) return;
    const row = editor.getCursorBufferPosition().row;
    const commit = blame && blame.lines[row];

    if (!commit) {
      this.clear();
      return;
    }

    this.render(editor, row, commit, target.workdir);
  }

  render(editor, row, commit, workdir) {
    const text = (0, _blame.formatInlineBlame)(commit, this.now());

    if (this.marker && this.current && this.current.text === text && this.current.commit.sha === commit.sha && this.marker.getHeadBufferPosition().row === row) {
      return;
    }

    this.clear();
    const column = editor.getBuffer().lineLengthForRow(row);
    this.marker = editor.markBufferPosition([row, column], {
      invalidate: 'touch'
    });
    editor.decorateMarker(this.marker, {
      type: 'inline-text',
      text,
      class: 'github-InlineBlame'
    });
    this.current = {
      commit,
      workdir,
      text
    };
  }

  clear() {
    this.disposeTooltip();

    if (this.marker) {
      this.marker.destroy();
      this.marker = null;
    }

    this.current = null;
  }

  blameElementFor(event) {
    const target = event.target;
    return target && typeof target.closest === 'function' ? target.closest('.github-InlineBlame') : null;
  }

  didMouseDown(event) {
    if (!this.current || !this.blameElementFor(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 0) this.openCommit();
  }

  openCommit() {
    if (!this.current || this.current.commit.uncommitted) return null;
    const {
      commit,
      workdir
    } = this.current;

    const CommitDetailItem = require('../items/commit-detail-item').default;

    return this.workspace.open(CommitDetailItem.buildURI(workdir, commit.sha));
  }

  didMouseOver(event) {
    const element = this.blameElementFor(event);
    if (!element || !this.current || this.tooltipElement === element) return;
    this.disposeTooltip();
    this.tooltipElement = element;
    this.tooltip = this.tooltips.add(element, {
      title: tooltipHTML(this.current.commit),
      html: true,
      trigger: 'manual',
      placement: 'bottom',
      class: 'github-InlineBlame-tooltip'
    });
  }

  didMouseOut(event) {
    if (!this.tooltipElement) return;
    if (event.relatedTarget && this.tooltipElement.contains(event.relatedTarget)) return;
    this.disposeTooltip();
  }

  disposeTooltip() {
    if (this.tooltip) this.tooltip.dispose();
    this.tooltip = null;
    this.tooltipElement = null;
  }

}

exports.default = InlineBlameController;
