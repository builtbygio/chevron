'use strict';

const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const { CompositeDisposable } = require('chevron');
const {
  FILES,
  JSON_FILES,
  buildBundle,
  serializeBundle,
  parseBundle
} = require('./bundle');

function readFiles(dir) {
  const files = {};
  for (const name of FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    files[name] = JSON_FILES.includes(name) ? JSON.parse(text) : text;
  }
  return files;
}

function communityPackages() {
  const active = chevron.packages.getActivePackages
    ? chevron.packages.getActivePackages()
    : [];
  return active
    .filter(pkg => pkg && !pkg.bundledPackage && pkg.name)
    .map(pkg => pkg.name);
}

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(chevron.commands.add('chevron-workspace', {
      'settings-sync:export': () => this.exportBundle(),
      'settings-sync:import': () => this.importBundle()
    }));
  },

  async exportBundle() {
    const dir = chevron.getConfigDirPath();
    const bundle = buildBundle({
      files: readFiles(dir),
      packages: communityPackages()
    });
    const chosen = await chevron.applicationDelegate.showSaveDialog({
      defaultPath: 'chevron-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    const file = chosen && chosen.filePath;
    if (!file || chosen.canceled) return;
    fs.writeFileSync(file, serializeBundle(bundle));
    chevron.notifications.addSuccess(`Exported settings to ${file}`);
  },

  async importBundle() {
    const chosen = await ipcRenderer.invoke('chevron:show-open-dialog', {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    const file = chosen && chosen.filePaths && chosen.filePaths[0];
    if (!file) return;
    const bundle = parseBundle(fs.readFileSync(file, 'utf8'));
    const dir = chevron.getConfigDirPath();
    for (const [name, value] of Object.entries(bundle.files)) {
      const dest = path.join(dir, name);
      if (path.basename(dest) !== name) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
      fs.writeFileSync(dest, text);
      if (name === 'config.json' && typeof chevron.config.resetUserSettings === 'function') {
        chevron.config.resetUserSettings(value);
      }
    }
    const note = bundle.packages.length
      ? ` Imported. Community packages named in the bundle: ${bundle.packages.join(', ')}.`
      : ' Imported.';
    chevron.notifications.addSuccess('Settings restored.' + note);
  },

  deactivate() {
    this.disposables.dispose();
  }
};
