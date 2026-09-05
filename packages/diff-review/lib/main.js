const { CompositeDisposable } = require('chevron');
const ReviewView = require('./review-view');

// The review surface: something proposes a change, a person takes the parts
// they want, and what they took is applied as one undoable step.
//
// docs/reference/change-review.md

let subscriptions = null;
let openViews = new Set();

async function textFor(filePath) {
  const editor = chevron.workspace
    .getTextEditors()
    .find(e => e.getPath() === filePath);
  if (editor) return { text: editor.getText(), editor };
  const opened = await chevron.workspace.open(filePath, { activateItem: false });
  return { text: opened.getText(), editor: opened };
}

// One transaction per file, so a single undo takes the whole application back.
// Setting the text wholesale would also lose the cursor and every marker in
// the file, which is why this goes through setTextViaDiff where available.
function writeText(editor, newText) {
  const buffer = editor.getBuffer();
  if (typeof buffer.setTextViaDiff === 'function') {
    buffer.transact(() => buffer.setTextViaDiff(newText));
  } else {
    buffer.transact(() => buffer.setText(newText));
  }
}

async function applySelection(selection) {
  const { applyHunks } = chevron.changeProposal;
  const applied = [];
  for (const file of selection) {
    if (file.acceptedIds.length === 0) continue;
    const { text, editor } = await textFor(file.path);
    const next = applyHunks(text, file.hunks, file.acceptedIds);
    if (next === text) continue;
    writeText(editor, next);
    applied.push({ path: file.path, hunks: file.acceptedIds.length });
  }
  return applied;
}

module.exports = {
  activate() {
    subscriptions = new CompositeDisposable();
    // Published here rather than in core: the arithmetic is core's, the
    // surface is this package's, and a caller wants one entry point.
    chevron.review = { propose: options => module.exports.review(options) };
  },

  deactivate() {
    if (chevron.review && chevron.review.propose) delete chevron.review;
    for (const view of [...openViews]) view.destroy();
    openViews.clear();
    if (subscriptions) subscriptions.dispose();
  },

  // Show a proposal and resolve with what the person accepted. Rejecting
  // everything resolves too -- a caller needs to know it was seen and turned
  // down, which is different from an error.
  async review({ title, proposals }) {
    const view = new ReviewView({ title, proposals });
    openViews.add(view);

    const pane = chevron.workspace.getActivePane();
    pane.addItem(view);
    pane.activateItem(view);

    return new Promise(resolve => {
      const finish = async selection => {
        const applied = selection ? await applySelection(selection) : [];
        openViews.delete(view);
        const owner = chevron.workspace.paneForItem(view);
        if (owner) owner.destroyItem(view);
        resolve({
          applied,
          accepted: selection
            ? selection.reduce((n, f) => n + f.acceptedIds.length, 0)
            : 0,
          cancelled: !selection
        });
      };
      view.onDidConfirm(selection => finish(selection));
      view.onDidCancel(() => finish(null));
    });
  }
};
