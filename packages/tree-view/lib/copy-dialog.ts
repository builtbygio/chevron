/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let CopyDialog;
const path = require('path');
const fs = require('./fs-via-main');
const Dialog = require('./dialog');
const {repoForPath} = require("./helpers");

module.exports =
(CopyDialog = class CopyDialog extends Dialog {
  constructor(initialPath, {onCopy}) {
    super({
      prompt: 'Enter the new path for the duplicate.',
      initialPath: chevron.project.relativize(initialPath),
      select: true,
      iconClass: 'icon-arrow-right'
    });

    this.initialPath = initialPath;
    this.onCopy = onCopy;
  }

  onConfirm(newPath) {
    newPath = newPath.replace(/\s+$/, ''); // Remove trailing whitespace
    if (!path.isAbsolute(newPath)) {
      const [rootPath] = Array.from(chevron.project.relativizePath(this.initialPath));
      newPath = path.join(rootPath, newPath);
      if (!newPath) { return; }
    }

    if (this.initialPath === newPath) {
      this.close();
      return;
    }

    if (fs.existsSync(newPath)) {
      this.showError(`'${newPath}' already exists.`);
      return;
    }

    let activeEditor = chevron.workspace.getActiveTextEditor();
    if ((activeEditor != null ? activeEditor.getPath() : undefined) !== this.initialPath) { activeEditor = null; }
    try {
      let repo;
      if (fs.isDirectorySync(this.initialPath)) {
        fs.copySync(this.initialPath, newPath);
        if (typeof this.onCopy === 'function') {
          this.onCopy({initialPath: this.initialPath, newPath});
        }
      } else {
        fs.copy(this.initialPath, newPath, () => {
          if (typeof this.onCopy === 'function') {
            this.onCopy({initialPath: this.initialPath, newPath});
          }
          return chevron.workspace.open(newPath, {
            activatePane: true,
            initialLine: (activeEditor != null ? activeEditor.getLastCursor().getBufferRow() : undefined),
            initialColumn: (activeEditor != null ? activeEditor.getLastCursor().getBufferColumn() : undefined)
          }
          );
        });
      }
      if (repo = repoForPath(newPath)) {
        repo.getPathStatus(this.initialPath);
        repo.getPathStatus(newPath);
      }
      return this.close();
    } catch (error) {
      return this.showError(`${error.message}.`);
    }
  }
});
