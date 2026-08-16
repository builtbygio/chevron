'use strict';

/**
 * H1 PR 8 / S4: one display invoke slice. Sync confirm, FS, workers stay.
 * Run: node --test script/ci/s4-ipc-slice.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('S4 display invoke slice', () => {
  it('registers chevron: invoke handlers for work-area and user-default', () => {
    const main = read('src/main-process/register-renderer-ipc.js');
    assert.ok(main.includes("handle('chevron:get-primary-display-work-area-size'"));
    assert.ok(main.includes("handle('chevron:get-user-default'"));
    assert.ok(
      main.includes("on('atom-get-primary-display-work-area-size-sync'"),
      'sendSync twin stays for remote-compat'
    );
    assert.ok(main.includes("on('atom-get-user-default-sync'"));
  });

  it('first-party application-delegate uses the async display getters', () => {
    const delegate = read('src/application-delegate.js');
    assert.ok(delegate.includes('getPrimaryDisplayWorkAreaSizeAsync'));
    assert.ok(delegate.includes('getUserDefaultAsync'));
    assert.ok(!delegate.includes("sendSync('atom-get-primary-display-work-area-size-sync'"));
  });

  it('keeps sync confirm and does not touch FS or worker create', () => {
    const ipc = read('src/renderer-ipc.js');
    assert.ok(ipc.includes("sendSync('atom-show-message-box-sync'"));
    const main = read('src/main-process/register-renderer-ipc.js');
    assert.ok(main.includes("on('atom-show-message-box-sync'"));
    assert.ok(main.includes("on('atom-create-browser-window-sync'") || main.includes('atom-create-browser-window'));
    const fsIpc = read('src/main-process/register-fs-ipc.js');
    assert.ok(/atom-fs-.*-sync/.test(fsIpc));
  });

  it('deprecates require("remote") as unsupported', () => {
    const remote = read('exports/remote.js');
    assert.ok(remote.includes('Grim.deprecate'));
    assert.ok(remote.includes('unsupported'));
    assert.ok(remote.includes('require("chevron")'));
  });
});
