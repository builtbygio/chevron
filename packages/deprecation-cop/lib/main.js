const { Disposable, CompositeDisposable } = require('chevron');
const DeprecationCopView = require('./deprecation-cop-view');
const DeprecationCopStatusBarView = require('./deprecation-cop-status-bar-view');
const ViewURI = 'atom://deprecation-cop';

class DeprecationCopPackage {
  activate() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      chevron.workspace.addOpener(uri => {
        if (uri === ViewURI) {
          return this.deserializeDeprecationCopView({ uri });
        }
      })
    );
    this.disposables.add(
      chevron.commands.add('atom-workspace', 'deprecation-cop:view', () => {
        chevron.workspace.open(ViewURI);
      })
    );
  }

  deactivate() {
    this.disposables.dispose();
    const pane = chevron.workspace.paneForURI(ViewURI);
    if (pane) {
      pane.destroyItem(pane.itemForURI(ViewURI));
    }
  }

  deserializeDeprecationCopView(state) {
    return new DeprecationCopView(state);
  }

  consumeStatusBar(statusBar) {
    const statusBarView = new DeprecationCopStatusBarView();
    const statusBarTile = statusBar.addRightTile({
      item: statusBarView,
      priority: 150
    });
    this.disposables.add(
      new Disposable(() => {
        statusBarView.destroy();
      })
    );
    this.disposables.add(
      new Disposable(() => {
        statusBarTile.destroy();
      })
    );
  }
}

module.exports = new DeprecationCopPackage();
