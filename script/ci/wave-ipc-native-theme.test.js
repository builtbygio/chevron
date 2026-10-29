'use strict';

/**
 * Residual IPC slice: nativeTheme is seeded on loadSettings and pushed on
 * change — no renderer sendSync/invoke pull. Dead utility-worker-enabled-sync
 * is gone. Run: node --test script/ci/wave-ipc-native-theme.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('nativeTheme IPC without sendSync', () => {
  it('seeds nativeTheme on window loadSettings', () => {
    const win = read('src/main-process/chevron-window.js');
    assert.match(win, /loadSettings\.nativeTheme\s*=/);
    assert.match(win, /nativeTheme\.shouldUseDarkColors/);
  });

  it('application-delegate reads the seed and caches push updates', () => {
    const delegate = read('src/application-delegate.js');
    assert.match(delegate, /settings\.nativeTheme/);
    assert.match(delegate, /this\._nativeTheme\s*=\s*theme/);
    assert.doesNotMatch(delegate, /getNativeTheme/);
  });

  it('drops the native-theme pull channels', () => {
    const main = read('src/main-process/register-renderer-ipc.js');
    assert.doesNotMatch(main, /native-theme-sync/);
    assert.doesNotMatch(main, /handle\('chevron:native-theme'/);
    assert.doesNotMatch(main, /utility-worker-enabled-sync/);

    const ipc = read('src/renderer-ipc.js');
    assert.doesNotMatch(ipc, /native-theme/);

    const inventory = JSON.parse(
      read('script/ci/ipc-inventory.json')
    );
    const channels = inventory.map(e => e.channel);
    assert.ok(!channels.includes('chevron:native-theme-sync'));
    assert.ok(!channels.includes('chevron:native-theme'));
    assert.ok(!channels.includes('chevron:utility-worker-enabled-sync'));
  });

  it('leaves clipboard, sync confirm, boot and FS on sendSync', () => {
    const ipc = read('src/renderer-ipc.js');
    assert.ok(ipc.includes("sendSync('chevron:clipboard-read-text-sync'"));
    assert.ok(ipc.includes("sendSync('chevron:show-message-box-sync'"));
    assert.ok(ipc.includes("sendSync('chevron:window-load-settings-sync'"));
    const fsIpc = read('src/main-process/register-fs-ipc.js');
    assert.ok(fsIpc.includes("ipcMain.on('chevron:fs-stat-sync'"));
  });
});
