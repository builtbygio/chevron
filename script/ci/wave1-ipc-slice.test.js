'use strict';

/**
 * Wave 1: app jump list + shell beep move from `sendSync` to `invoke`.
 * Clipboard, sync confirm, boot, workers and FS IPC stay sync on purpose.
 * Run: node --test script/ci/wave1-ipc-slice.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Wave 1 app/shell invoke slice', () => {
  it('registers chevron: invoke handlers for beep and jump list', () => {
    const main = read('src/main-process/register-renderer-ipc.js');
    assert.ok(main.includes("handle('chevron:shell-beep'"));
    assert.ok(main.includes("handle('chevron:app-get-jump-list-settings'"));
    assert.ok(main.includes("handle('chevron:app-set-jump-list'"));
  });

  it('keeps the atom-*-sync twins for remote-compat', () => {
    const main = read('src/main-process/register-renderer-ipc.js');
    assert.ok(main.includes("on('atom-shell-beep-sync'"));
    assert.ok(main.includes("on('atom-app-get-jump-list-settings-sync'"));
    assert.ok(main.includes("on('atom-app-set-jump-list-sync'"));

    const remote = read('src/remote-compat.js');
    assert.ok(remote.includes('rendererIpc.getJumpListSettings()'));
    assert.ok(remote.includes('rendererIpc.setJumpList(categories)'));
  });

  it('first-party callers use the async getters', () => {
    const delegate = read('src/application-delegate.js');
    assert.ok(delegate.includes('rendererIpc.beepAsync()'));
    assert.ok(!delegate.includes('rendererIpc.beep()'));

    const reopen = read('src/reopen-project-menu-manager.js');
    assert.ok(reopen.includes('getJumpListSettingsAsync()'));
    assert.ok(reopen.includes('setJumpListAsync('));
    assert.ok(!/rendererIpc\.getJumpListSettings\(\)/.test(reopen));
    assert.ok(!/rendererIpc\.setJumpList\(/.test(reopen));
  });

  it('dropped promises are caught so the renderer has no unhandled rejection', () => {
    const reopen = read('src/reopen-project-menu-manager.js');
    assert.ok(reopen.includes('applyWindowsJumpListRemovals().catch('));
    assert.ok(/setJumpListAsync\([\s\S]*?\)\.catch\(/.test(reopen));
  });

  it('clipboard stays sync: read() is synchronous public API', () => {
    const ipc = read('src/renderer-ipc.js');
    for (const channel of [
      'atom-clipboard-write-text-sync',
      'atom-clipboard-read-text-sync',
      'atom-clipboard-write-find-text-sync',
      'atom-clipboard-read-find-text-sync'
    ]) {
      assert.ok(
        ipc.includes(`sendSync('${channel}'`),
        `${channel} must stay sendSync`
      );
    }
    const clipboard = read('src/clipboard.js');
    assert.ok(clipboard.includes('return rendererIpc.clipboardReadText();'));
    assert.ok(
      !clipboard.includes('await '),
      'Clipboard#read must not be async'
    );
  });

  it('does not touch sync confirm, boot settings, workers or FS IPC', () => {
    const ipc = read('src/renderer-ipc.js');
    assert.ok(ipc.includes("sendSync('atom-show-message-box-sync'"));
    assert.ok(ipc.includes("sendSync('atom-window-load-settings-sync'"));
    const main = read('src/main-process/register-renderer-ipc.js');
    assert.ok(main.includes("on('atom-create-browser-window-sync'"));
    const fsIpc = read('src/main-process/register-fs-ipc.js');
    assert.ok(/atom-fs-.*-sync/.test(fsIpc));
  });

  it('Workspace.replace forces a global regex like the old Task worker', () => {
    const ws = read('src/workspace.js');
    assert.match(ws, /regex\.global/);
    assert.match(ws, /new RegExp\(regex\.source, `\$\{regex\.flags\}g`\)/);
    assert.doesNotMatch(ws, /Task\.once/);
  });
});
