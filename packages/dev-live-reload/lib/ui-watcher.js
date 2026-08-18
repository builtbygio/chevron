const { CompositeDisposable } = require('chevron');

const BaseThemeWatcher = require('./base-theme-watcher');
const PackageWatcher = require('./package-watcher');

module.exports = class UIWatcher {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.reloadAll = this.reloadAll.bind(this);
    this.watchers = [];
    this.baseTheme = this.createWatcher(new BaseThemeWatcher());
    this.watchPackages();
  }

  watchPackages() {
    this.watchedThemes = new Map();
    this.watchedPackages = new Map();
    for (const theme of chevron.themes.getActiveThemes()) {
      this.watchTheme(theme);
    }
    for (const pack of chevron.packages.getActivePackages()) {
      this.watchPackage(pack);
    }
    this.watchForPackageChanges();
  }

  watchForPackageChanges() {
    this.subscriptions.add(
      chevron.themes.onDidChangeActiveThemes(() => {
        // We need to destroy all theme watchers as all theme packages are destroyed
        // when a theme changes.
        for (const theme of this.watchedThemes.values()) {
          theme.destroy();
        }

        this.watchedThemes.clear();

        // Rewatch everything!
        for (const theme of chevron.themes.getActiveThemes()) {
          this.watchTheme(theme);
        }
      })
    );

    this.subscriptions.add(
      chevron.packages.onDidActivatePackage(pack => this.watchPackage(pack))
    );

    this.subscriptions.add(
      chevron.packages.onDidDeactivatePackage(pack => {
        // This only handles packages - onDidChangeActiveThemes handles themes
        const watcher = this.watchedPackages.get(pack.name);
        if (watcher) watcher.destroy();
        this.watchedPackages.delete(pack.name);
      })
    );
  }

  watchTheme(theme) {
    if (PackageWatcher.supportsPackage(theme, 'theme')) {
      this.watchedThemes.set(
        theme.name,
        this.createWatcher(new PackageWatcher(theme))
      );
    }
  }

  watchPackage(pack) {
    if (PackageWatcher.supportsPackage(pack, 'atom')) {
      this.watchedPackages.set(
        pack.name,
        this.createWatcher(new PackageWatcher(pack))
      );
    }
  }

  createWatcher(watcher) {
    watcher.onDidChangeGlobals(() => {
      console.log('Global changed, reloading all styles');
      this.reloadAll();
    });
    watcher.onDidDestroy(() =>
      this.watchers.splice(this.watchers.indexOf(watcher), 1)
    );
    this.watchers.push(watcher);
    return watcher;
  }

  reloadAll() {
    this.baseTheme.loadAllStylesheets();
    for (const pack of chevron.packages.getActivePackages()) {
      if (PackageWatcher.supportsPackage(pack, 'atom')) {
        pack.reloadStylesheets();
      }
    }

    for (const theme of chevron.themes.getActiveThemes()) {
      if (PackageWatcher.supportsPackage(theme, 'theme')) {
        theme.reloadStylesheets();
      }
    }
  }

  destroy() {
    this.subscriptions.dispose();
    this.baseTheme.destroy();
    for (const pack of this.watchedPackages.values()) {
      pack.destroy();
    }
    for (const theme of this.watchedThemes.values()) {
      theme.destroy();
    }
  }
};
