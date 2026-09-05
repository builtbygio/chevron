'use strict';

/**
 * The dialog and ui channels: what a package may put on screen, and what it
 * may send to another window.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/ipc-ui-payloads.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const Module = require('module');

const electronStub = {
  ipcMain: { on() {}, handle() {} },
  app: { getPath: () => os.tmpdir(), getVersion: () => '0' },
  BrowserWindow: { fromWebContents: () => null },
  Menu: {},
  clipboard: {},
  dialog: {},
  screen: {},
  shell: {},
  systemPreferences: {},
  webContents: {},
  utilityProcess: { fork() {} }
};
const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return electronStub;
  return origRequire.apply(this, arguments);
};

const {
  validateDialogOptions,
  validateMenuTemplate,
  validateCrossWindowSend
} = require('../../src/main-process/register-renderer-ipc');

const NUL = '\u0000';

describe('dialog options', () => {
  it('accepts what the callers send', () => {
    assert.equal(
      validateDialogOptions({
        type: 'info',
        message: 'Save changes?',
        detail: 'Your work will be lost.',
        buttons: ['Save', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      }).ok,
      true
    );
    assert.equal(validateDialogOptions(undefined).ok, true);
    assert.equal(validateDialogOptions({}).ok, true);
  });

  it('refuses text fields that are not strings', () => {
    assert.equal(validateDialogOptions({ message: 5 }).ok, false);
    assert.equal(validateDialogOptions({ title: {} }).ok, false);
    assert.equal(validateDialogOptions({ detail: `a${NUL}b` }).ok, false);
  });

  it('refuses buttons that are not strings', () => {
    assert.equal(validateDialogOptions({ buttons: 'Save' }).ok, false);
    assert.equal(validateDialogOptions({ buttons: [1, 2] }).ok, false);
  });

  it('refuses indices that are not integers', () => {
    assert.equal(validateDialogOptions({ defaultId: '0' }).ok, false);
    assert.equal(validateDialogOptions({ cancelId: -1 }).ok, false);
  });

  it('refuses a shape that is not options at all', () => {
    assert.equal(validateDialogOptions('message').ok, false);
    assert.equal(validateDialogOptions(['Save']).ok, false);
  });
});

describe('menu templates', () => {
  it('accepts an ordinary menu', () => {
    assert.equal(
      validateMenuTemplate([
        { label: 'Copy', type: 'normal' },
        { type: 'separator' },
        { label: 'More', submenu: [{ label: 'Deeper' }] }
      ]).ok,
      true
    );
    assert.equal(validateMenuTemplate([]).ok, true);
    assert.equal(validateMenuTemplate(undefined).ok, true);
  });

  it('refuses non-string display fields', () => {
    assert.equal(validateMenuTemplate([{ label: 5 }]).ok, false);
    assert.equal(validateMenuTemplate([{ label: `a${NUL}b` }]).ok, false);
    assert.equal(validateMenuTemplate([{ role: {} }]).ok, false);
  });

  it('refuses shapes that are not a template', () => {
    assert.equal(validateMenuTemplate('Copy').ok, false);
    assert.equal(validateMenuTemplate([null]).ok, false);
    assert.equal(validateMenuTemplate([['Copy']]).ok, false);
  });

  it('refuses a template nested deeply enough to be a denial of service', () => {
    let deep = [{ label: 'leaf' }];
    for (let i = 0; i < 12; i++) deep = [{ label: 'x', submenu: deep }];
    assert.equal(validateMenuTemplate(deep).ok, false);
  });
});

describe('sending to another window', () => {
  it('allows an ordinary package channel', () => {
    assert.equal(validateCrossWindowSend(3, 'my-package:hello').ok, true);
  });

  it('refuses channels main sends on, which a renderer must not forge', () => {
    for (const channel of [
      'prepare-to-unload',
      'lsp:event',
      'chevron:pty-event',
      'atom-popup-menu-click',
      'uri-message'
    ]) {
      const result = validateCrossWindowSend(3, channel);
      assert.equal(result.ok, false, channel);
      assert.match(result.reason, /main-process channel/);
    }
  });

  it('refuses payloads that are not an id and a channel name', () => {
    assert.equal(validateCrossWindowSend('3', 'ok').ok, false);
    assert.equal(validateCrossWindowSend(1.5, 'ok').ok, false);
    assert.equal(validateCrossWindowSend(-1, 'ok').ok, false);
    assert.equal(validateCrossWindowSend(3, 5).ok, false);
    assert.equal(validateCrossWindowSend(3, '').ok, false);
  });
});
