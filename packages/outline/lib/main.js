const { CompositeDisposable } = require('chevron');
const OutlineView = require('./outline-view');

let subscriptions = null;
let view = null;

// One panel per window. Toggling hides and shows it rather than destroying
// it, so collapsed entries outlive closing the dock.
function getView() {
  if (!view) {
    view = new OutlineView();
    view.onDidDestroy(() => {
      view = null;
    });
  }
  return view;
}

module.exports = {
  activate() {
    subscriptions = new CompositeDisposable(
      chevron.workspace.addOpener(uri => {
        if (uri === OutlineView.URI) return getView();
      }),
      chevron.commands.add('atom-workspace', {
        'outline:toggle': () => chevron.workspace.toggle(OutlineView.URI)
      })
    );
  },

  deactivate() {
    if (subscriptions) subscriptions.dispose();
    subscriptions = null;
    if (view) view.destroy();
  },

  // Restores the panel where it was left; the dock remembers whether it was
  // open.
  deserializeOutlineView() {
    return getView();
  },

  viewForTests() {
    return view;
  }
};
