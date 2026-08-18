module.exports = {
  activate(state) {
    if (!chevron.inDevMode() || chevron.inSpecMode()) return;

    if (chevron.packages.hasActivatedInitialPackages()) {
      this.startWatching();
    } else {
      this.activatedDisposable = chevron.packages.onDidActivateInitialPackages(
        () => this.startWatching()
      );
    }
  },

  deactivate() {
    if (this.activatedDisposable) this.activatedDisposable.dispose();
    if (this.commandDisposable) this.commandDisposable.dispose();
    if (this.uiWatcher) this.uiWatcher.destroy();
  },

  startWatching() {
    const UIWatcher = require('./ui-watcher');
    this.uiWatcher = new UIWatcher({ themeManager: chevron.themes });
    this.commandDisposable = chevron.commands.add(
      'atom-workspace',
      'dev-live-reload:reload-all',
      () => this.uiWatcher.reloadAll()
    );
    if (this.activatedDisposable) this.activatedDisposable.dispose();
  }
};
