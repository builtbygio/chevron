'use strict';

const { CompositeDisposable } = require('chevron');
const { ipcRenderer } = require('electron');
const path = require('path');
const { parseRemote } = require('./remote-spec');

function ask(prompt) {
  return new Promise(resolve => {
    const editor = chevron.workspace.buildTextEditor({ mini: true });
    const element = document.createElement('div');
    element.className = 'remote-edit-prompt';
    const label = document.createElement('div');
    label.textContent = prompt;
    element.appendChild(label);
    element.appendChild(editor.element);
    const panel = chevron.workspace.addModalPanel({ item: { element }, visible: true });
    const done = value => {
      panel.destroy();
      resolve(value);
    };
    editor.element.addEventListener('blur', () => done(null));
    chevron.commands.add(editor.element, 'core:confirm', () => done(editor.getText()));
    chevron.commands.add(editor.element, 'core:cancel', () => done(null));
    editor.element.focus();
  });
}

function openRemote({ host, filePath, text }) {
  const editor = chevron.workspace.buildTextEditor();
  editor.setText(text);
  let saved = text;
  const item = {
    element: editor.element,
    getTitle: () => path.basename(filePath),
    getURI: () => `remote://${host}${filePath}`,
    getPath: () => filePath,
    isModified: () => editor.getText() !== saved,
    save: async () => {
      await ipcRenderer.invoke('chevron:ssh-write', {
        host,
        path: filePath,
        text: editor.getText()
      });
      saved = editor.getText();
      chevron.notifications.addSuccess(`Saved ${host}:${filePath}`);
    }
  };
  const pane = chevron.workspace.getActivePane();
  pane.addItem(item);
  pane.activateItem(item);
  return item;
}

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(chevron.commands.add('chevron-workspace', {
      'remote-edit:open-file': () => this.openFile(),
      'remote-edit:open-folder': () => this.openFolder()
    }));
  },

  async openFile() {
    const spec = await ask('Remote file (user@host:/absolute/path)');
    if (!spec) return;
    let remote;
    try {
      remote = parseRemote(spec);
    } catch (error) {
      chevron.notifications.addWarning(error.message);
      return;
    }
    try {
      const { text } = await ipcRenderer.invoke('chevron:ssh-read', {
        host: remote.host,
        path: remote.path
      });
      openRemote({ host: remote.host, filePath: remote.path, text });
    } catch (error) {
      chevron.notifications.addError(String(error && error.message ? error.message : error));
    }
  },

  async openFolder() {
    const spec = await ask('Remote folder (user@host:/absolute/path)');
    if (!spec) return;
    let remote;
    try {
      remote = parseRemote(spec);
    } catch (error) {
      chevron.notifications.addWarning(error.message);
      return;
    }
    try {
      const { names } = await ipcRenderer.invoke('chevron:ssh-list', {
        host: remote.host,
        path: remote.path
      });
      const element = document.createElement('div');
      element.className = 'remote-edit-list';
      const title = document.createElement('div');
      title.textContent = `${remote.host}:${remote.path}`;
      element.appendChild(title);
      for (const name of names) {
        if (!/^[A-Za-z0-9._@+-]+$/.test(name)) continue;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'btn';
        row.textContent = name;
        row.addEventListener('click', () => {
          const child = remote.path.replace(/\/$/, '') + '/' + name;
          this.openPath(remote.host, child);
        });
        element.appendChild(row);
      }
      chevron.workspace.addRightPanel({ item: { element }, visible: true });
    } catch (error) {
      chevron.notifications.addError(String(error && error.message ? error.message : error));
    }
  },

  async openPath(host, filePath) {
    try {
      const { text } = await ipcRenderer.invoke('chevron:ssh-read', { host, path: filePath });
      openRemote({ host, filePath, text });
    } catch (error) {
      chevron.notifications.addError(String(error && error.message ? error.message : error));
    }
  },

  deactivate() {
    this.disposables.dispose();
  }
};
