let SettingsView = null
let settingsView = null

let statusView = null

const PackageManager = require('./package-manager')
let packageManager = null

const SnippetsProvider = {
  getSnippets () { return chevron.config.scopedSettingsStore.propertySets }
}

const CONFIG_URI = 'chevron://config'

module.exports = {
  handleURI (parsed) {
    switch (parsed.pathname) {
      case '/show-package': this.showPackage(parsed.query.package)
    }
  },

  showPackage (packageName) {
    chevron.workspace.open(`chevron://config/packages/${packageName}`)
  },

  activate () {
    chevron.workspace.addOpener(uri => {
      if (uri.startsWith(CONFIG_URI)) {
        if (settingsView == null || settingsView.destroyed) {
          settingsView = this.createSettingsView({uri})
        } else {
          const pane = chevron.workspace.paneForItem(settingsView)
          if (pane) pane.activate()
        }

        settingsView.showPanelForURI(uri)
        return settingsView
      }
    })

    chevron.commands.add('atom-workspace', {
      'settings-view:open' () { chevron.workspace.open(CONFIG_URI) },
      'settings-view:core' () { chevron.workspace.open(`${CONFIG_URI}/core`) },
      'settings-view:editor' () { chevron.workspace.open(`${CONFIG_URI}/editor`) },
      'settings-view:show-keybindings' () { chevron.workspace.open(`${CONFIG_URI}/keybindings`) },
      'settings-view:change-themes' () { chevron.workspace.open(`${CONFIG_URI}/themes`) },
      'settings-view:install-packages-and-themes' () { chevron.workspace.open(`${CONFIG_URI}/install`) },
      'settings-view:view-installed-themes' () { chevron.workspace.open(`${CONFIG_URI}/themes`) },
      'settings-view:uninstall-themes' () { chevron.workspace.open(`${CONFIG_URI}/themes`) },
      'settings-view:view-installed-packages' () { chevron.workspace.open(`${CONFIG_URI}/packages`) },
      'settings-view:uninstall-packages' () { chevron.workspace.open(`${CONFIG_URI}/packages`) },
      'settings-view:check-for-package-updates' () { chevron.workspace.open(`${CONFIG_URI}/updates`) }
    })

    if (process.platform === 'win32' && require('chevron').WinShell != null) {
      chevron.commands.add('atom-workspace', {'settings-view:system' () { chevron.workspace.open(`${CONFIG_URI}/system`) }})
    }

    if (!localStorage.getItem('hasSeenDeprecatedNotification')) {
      if (packageManager == null) packageManager = new PackageManager()
      packageManager.getInstalled().then(packages => {
        if (packages.user && packages.user.length) this.showDeprecatedNotification(packages)
      })
    }
  },

  deactivate () {
    if (settingsView) settingsView.destroy()
    if (statusView) statusView.destroy()
    settingsView = null
    packageManager = null
    statusView = null
  },

  consumeStatusBar (statusBar) {
    if (packageManager == null) packageManager = new PackageManager()
    packageManager.getOutdated().then(updates => {
      if (packageManager) {
        const PackageUpdatesStatusView = require('./package-updates-status-view')
        statusView = new PackageUpdatesStatusView()
        statusView.initialize(statusBar, packageManager, updates)
      }
    })
  },

  consumeSnippets (snippets) {
    if (typeof snippets.getUnparsedSnippets === 'function') {
      SnippetsProvider.getSnippets = snippets.getUnparsedSnippets.bind(snippets)
    }
    if (typeof snippets.getUserSnippetsPath === 'function') {
      SnippetsProvider.getUserSnippetsPath = snippets.getUserSnippetsPath.bind(snippets)
    }
  },

  createSettingsView (params) {
    if (SettingsView == null) SettingsView = require('./settings-view')
    if (packageManager == null) packageManager = new PackageManager()
    params.packageManager = packageManager
    params.snippetsProvider = SnippetsProvider
    settingsView = new SettingsView(params)
    return settingsView
  },

  showDeprecatedNotification (packages) {
    localStorage.setItem('hasSeenDeprecatedNotification', true)

    const deprecatedPackages = packages.user.filter(({name, version}) => chevron.packages.isDeprecatedPackage(name, version))
    if (!deprecatedPackages.length) return

    let were = 'were'
    let have = 'have'
    let packageText = 'packages'
    if (packages.length === 1) {
      packageText = 'package'
      were = 'was'
      have = 'has'
    }

    const notification = chevron.notifications.addWarning(`${deprecatedPackages.length} ${packageText} ${have} deprecations and ${were} not loaded.`, {
      description: 'This message will show only one time. Deprecated packages can be viewed in the settings view.',
      detail: (deprecatedPackages.map(pack => pack.name)).join(', '),
      dismissable: true,
      buttons: [{
        text: 'View Deprecated Packages',
        onDidClick () {
          chevron.commands.dispatch(chevron.views.getView(chevron.workspace), 'settings-view:view-installed-packages')
          notification.dismiss()
        }
      }]
    })
  }
}
