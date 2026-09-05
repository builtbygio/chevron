'use strict';

/**
 * The spawn-effect channels that hand the operating system something to run
 * later: a protocol registration, a jump list task, a page for a utility
 * process.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/ipc-spawn-payloads.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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

const { validateJumpList } = require('../../src/main-process/register-renderer-ipc');
const {
  parseWorkerLoadUrl,
  workerLoadFilePath
} = require('../../src/main-process/package-utility-worker');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const NUL = '\u0000';
const inApp = path.join(APP_ROOT, 'packages', 'github', 'lib', 'renderer.html');

describe('a jump list task names a program the OS launches later', () => {
  const task = extra => [
    { type: 'custom', name: 'Recent', items: [{ type: 'task', program: process.execPath, args: '--new-window', ...extra }] }
  ];

  it('accepts the shape reopen-project-menu-manager sends', () => {
    assert.equal(validateJumpList(task()).ok, true);
    assert.equal(validateJumpList([{ type: 'recent' }]).ok, true);
    assert.equal(validateJumpList([]).ok, true);
  });

  it('refuses a task that would launch something else', () => {
    const result = validateJumpList(task({ program: '/bin/sh' }));
    assert.equal(result.ok, false);
    assert.match(result.reason, /this application/);
  });

  it('refuses non-string task fields', () => {
    assert.equal(validateJumpList(task({ args: ['--new-window'] })).ok, false);
    assert.equal(validateJumpList(task({ title: 5 })).ok, false);
    assert.equal(validateJumpList(task({ description: `a${NUL}b` })).ok, false);
  });

  it('refuses shapes that are not a jump list at all', () => {
    assert.equal(validateJumpList(undefined).ok, false);
    assert.equal(validateJumpList('recent').ok, false);
    assert.equal(validateJumpList([null]).ok, false);
    assert.equal(validateJumpList([{ items: 'task' }]).ok, false);
    assert.equal(validateJumpList([{ items: [null] }]).ok, false);
  });
});

describe('a utility worker may only load a page from inside the app', () => {
  it('accepts the github worker page', () => {
    const url = `file://${inApp}?managerWebContentsId=3`;
    assert.equal(workerLoadFilePath(url), inApp);
    assert.equal(parseWorkerLoadUrl(url).managerWebContentsId, 3);
  });

  it('refuses a file outside the application tree', () => {
    assert.equal(workerLoadFilePath('file:///etc/passwd?managerWebContentsId=3'), null);
    assert.equal(parseWorkerLoadUrl('file:///etc/passwd?managerWebContentsId=3'), null);
  });

  it('refuses traversal out of the application tree', () => {
    const outside = path.join(APP_ROOT, '..', 'outside.html');
    assert.equal(parseWorkerLoadUrl(`file://${outside}?managerWebContentsId=3`), null);
  });

  it('refuses a scheme that is not file:', () => {
    assert.equal(parseWorkerLoadUrl('http://evil.example/x?managerWebContentsId=3'), null);
    assert.equal(parseWorkerLoadUrl('chevron://x?managerWebContentsId=3'), null);
  });

  it('does not let a malformed URL skip the scheme check', () => {
    // The old parser fell back to reading the query off any string with a "?",
    // which skipped the file: test entirely.
    assert.equal(parseWorkerLoadUrl('not-a-url?managerWebContentsId=3'), null);
    assert.equal(parseWorkerLoadUrl('?managerWebContentsId=3'), null);
    assert.equal(parseWorkerLoadUrl(''), null);
    assert.equal(parseWorkerLoadUrl(null), null);
  });
});
