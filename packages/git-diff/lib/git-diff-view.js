var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var git_diff_view_exports = {};
__export(git_diff_view_exports, {
  default: () => GitDiffView
});
module.exports = __toCommonJS(git_diff_view_exports);
var import_atom = require("atom");
var import_helpers = __toESM(require("./helpers"));
const MAX_BUFFER_LENGTH_TO_DIFF = 2 * 1024 * 1024;
class GitDiffView {
  constructor(editor, editorElement) {
    this.subscriptions = new import_atom.CompositeDisposable();
    this.editor = editor;
    this.editorElement = editorElement;
    this.repository = null;
    this.markers = /* @__PURE__ */ new Map();
    this.destroyed = false;
    this.releaseChildren();
    const subscribeToRepository = this.subscribeToRepository.bind(this);
    this.updateDiffs = this.updateDiffs.bind(this);
    subscribeToRepository();
    this.subscriptions.add(
      atom.project.onDidChangePaths(subscribeToRepository)
    );
  }
  /**
   * @describe Handles tear down of destructables and subscriptions.
   *   Does not handle release of memory. This method should only be called
   *   just before this object is freed, and should only tear down the main
   *   object components that are guarunteed to exist at all times.
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.subscriptions.dispose();
    this.destroyChildren();
    this.markers.clear();
    this.releaseChildren();
  }
  /**
   * @describe Destroys this objects children (non-freeing), it's intended
   *   to be an ease-of use function for maintaing this object. This method
   *   should only tear down objects that are selectively allocated upon
   *   repository discovery.
   *
   *   Example: this.diffs only exists when we have a repository.
   */
  destroyChildren() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
    if (this.diffs) {
      for (const diff of this.diffs) {
        const marker = this.markers.get(diff);
        if (marker && !marker.isDestroyed()) marker.destroy();
      }
    }
  }
  /**
   * @describe The memory releasing complement function of `destroyChildren`.
   *   frees the memory allocated at all child object storage locations
   *   when there is no repository.
   */
  releaseChildren() {
    this.diffs = null;
    this._repoSubs = null;
    this._animationId = null;
    this.editorPath = null;
    this.buffer = null;
  }
  isEditorAlive() {
    return !this.destroyed && this.editor != null && !this.editor.isDestroyed();
  }
  /**
   * @describe handles all subscriptions based on the repository in focus
   */
  async subscribeToRepository() {
    if (this.destroyed) return;
    if (this._repoSubs !== null) {
      this._repoSubs.dispose();
      this.subscriptions.remove(this._repoSubs);
      this._repoSubs = null;
    }
    let editorPath = this.editor.getPath();
    this.repository = await (0, import_helpers.default)(editorPath);
    if (!this.isEditorAlive()) return;
    if (this.repository !== null) {
      this.editorPath = editorPath;
      this.buffer = this.editor.getBuffer();
      const subscribeToRepository = this.subscribeToRepository.bind(this);
      const updateIconDecoration = this.updateIconDecoration.bind(this);
      const scheduleUpdate = this.scheduleUpdate.bind(this);
      this._repoSubs = new import_atom.CompositeDisposable(
        this.repository.onDidDestroy(subscribeToRepository),
        this.repository.onDidChangeStatuses(scheduleUpdate),
        this.repository.onDidChangeStatus((changedPath) => {
          if (changedPath === this.editorPath) scheduleUpdate();
        }),
        this.editor.onDidStopChanging(scheduleUpdate),
        this.editor.onDidChangePath(() => {
          this.editorPath = this.editor.getPath();
          this.buffer = this.editor.getBuffer();
          scheduleUpdate();
        }),
        atom.commands.add(
          this.editorElement,
          "git-diff:move-to-next-diff",
          this.moveToNextDiff.bind(this)
        ),
        atom.commands.add(
          this.editorElement,
          "git-diff:move-to-previous-diff",
          this.moveToPreviousDiff.bind(this)
        ),
        atom.config.onDidChange(
          "git-diff.showIconsInEditorGutter",
          updateIconDecoration
        ),
        atom.config.onDidChange("editor.showLineNumbers", updateIconDecoration),
        this.editorElement.onDidAttach(updateIconDecoration)
      );
      this.subscriptions.add(this._repoSubs);
      updateIconDecoration();
      scheduleUpdate();
    } else {
      this.destroyChildren();
      this.releaseChildren();
    }
  }
  moveToNextDiff() {
    if (!this.diffs || !this.isEditorAlive()) return;
    const cursorLineNumber = this.editor.getCursorBufferPosition().row + 1;
    let nextDiffLineNumber = null;
    let firstDiffLineNumber = null;
    for (const { newStart } of this.diffs) {
      if (newStart > cursorLineNumber) {
        if (nextDiffLineNumber == null) nextDiffLineNumber = newStart - 1;
        nextDiffLineNumber = Math.min(newStart - 1, nextDiffLineNumber);
      }
      if (firstDiffLineNumber == null) firstDiffLineNumber = newStart - 1;
      firstDiffLineNumber = Math.min(newStart - 1, firstDiffLineNumber);
    }
    if (atom.config.get("git-diff.wrapAroundOnMoveToDiff") && nextDiffLineNumber == null) {
      nextDiffLineNumber = firstDiffLineNumber;
    }
    this.moveToLineNumber(nextDiffLineNumber);
  }
  moveToPreviousDiff() {
    if (!this.diffs || !this.isEditorAlive()) return;
    const cursorLineNumber = this.editor.getCursorBufferPosition().row + 1;
    let previousDiffLineNumber = null;
    let lastDiffLineNumber = null;
    for (const { newStart } of this.diffs) {
      if (newStart < cursorLineNumber) {
        previousDiffLineNumber = Math.max(newStart - 1, previousDiffLineNumber);
      }
      lastDiffLineNumber = Math.max(newStart - 1, lastDiffLineNumber);
    }
    if (atom.config.get("git-diff.wrapAroundOnMoveToDiff") && previousDiffLineNumber === null) {
      previousDiffLineNumber = lastDiffLineNumber;
    }
    this.moveToLineNumber(previousDiffLineNumber);
  }
  updateIconDecoration() {
    if (!this.isEditorAlive()) return;
    const gutter = this.editorElement.querySelector(".gutter");
    if (gutter) {
      if (atom.config.get("editor.showLineNumbers") && atom.config.get("git-diff.showIconsInEditorGutter")) {
        gutter.classList.add("git-diff-icon");
      } else {
        gutter.classList.remove("git-diff-icon");
      }
    }
  }
  moveToLineNumber(lineNumber) {
    if (lineNumber !== null && this.isEditorAlive()) {
      this.editor.setCursorBufferPosition([lineNumber, 0]);
      this.editor.moveToFirstCharacterOfLine();
    }
  }
  scheduleUpdate() {
    if (!this.isEditorAlive()) return;
    if (this._animationId) cancelAnimationFrame(this._animationId);
    this._animationId = requestAnimationFrame(this.updateDiffs);
  }
  /**
   * @describe Uses text markers in the target editor to visualize
   *   git modifications, additions, and deletions. The current algorithm
   *   just redraws the markers each call.
   */
  updateDiffs() {
    this._animationId = null;
    if (!this.isEditorAlive()) return;
    if (!this.repository || !this.buffer) return;
    if (typeof this.buffer.isDestroyed === "function" && this.buffer.isDestroyed()) {
      return;
    }
    if (this.buffer.getLength() < MAX_BUFFER_LENGTH_TO_DIFF) {
      if (this.diffs) {
        for (const diff of this.diffs) {
          const existing = this.markers.get(diff);
          if (existing && !existing.isDestroyed()) existing.destroy();
        }
      }
      this.markers.clear();
      if (!this.isEditorAlive()) return;
      const text = this.buffer.getText();
      this.diffs = this.repository.getLineDiffs(this.editorPath, text);
      this.diffs = this.diffs || [];
      for (const diff of this.diffs) {
        if (!this.isEditorAlive()) return;
        const { newStart, oldLines, newLines } = diff;
        const startRow = newStart - 1;
        const endRow = newStart + newLines - 1;
        let mark;
        if (oldLines === 0 && newLines > 0) {
          mark = this.markRange(startRow, endRow, "git-line-added");
        } else if (newLines === 0 && oldLines > 0) {
          if (startRow < 0) {
            mark = this.markRange(0, 0, "git-previous-line-removed");
          } else {
            mark = this.markRange(startRow, startRow, "git-line-removed");
          }
        } else {
          mark = this.markRange(startRow, endRow, "git-line-modified");
        }
        if (mark) this.markers.set(diff, mark);
      }
    }
  }
  markRange(startRow, endRow, klass) {
    if (!this.isEditorAlive()) return null;
    let marker;
    try {
      marker = this.editor.markBufferRange([[startRow, 0], [endRow, 0]], {
        invalidate: "never"
      });
    } catch (error) {
      return null;
    }
    if (!marker || marker.isDestroyed()) return null;
    try {
      this.editor.decorateMarker(marker, { type: "line-number", class: klass });
    } catch (error) {
      if (error && /destroyed marker/i.test(error.message || "")) {
        try {
          if (!marker.isDestroyed()) marker.destroy();
        } catch (_) {
        }
        return null;
      }
      throw error;
    }
    return marker;
  }
}
