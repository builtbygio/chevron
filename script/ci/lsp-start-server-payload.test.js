'use strict';

/**
 * What lsp:start-server refuses. Spawning is the highest-effect thing the IPC
 * surface can do, so the payload around the command is checked too.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/lsp-start-server-payload.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');
const os = require('os');

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
  utilityProcess: {}
};

const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return electronStub;
  return origRequire.apply(this, arguments);
};

const {
  validateStartServerOptions
} = require('../../src/main-process/register-renderer-ipc');

const ROOT = path.join(path.sep, 'repo', 'a');
const NUL = '\u0000';

const good = extra => ({
  projectRoot: ROOT,
  serverId: 'srv-1',
  command: 'my-langserver',
  args: ['--stdio'],
  ...extra
});

describe('lsp:start-server payload', () => {
  it('accepts an ordinary request', () => {
    assert.equal(validateStartServerOptions(good()).ok, true);
  });

  it('accepts one with no optional fields at all', () => {
    assert.equal(
      validateStartServerOptions({
        projectRoot: ROOT,
        serverId: 's',
        command: 'c'
      }).ok,
      true
    );
  });

  it('requires an absolute project root', () => {
    for (const projectRoot of [undefined, '', 'relative', 42, `${path.sep}a${NUL}b`]) {
      assert.equal(
        validateStartServerOptions(good({ projectRoot })).ok,
        false,
        String(projectRoot)
      );
    }
  });

  it('requires serverId and command to be usable strings', () => {
    assert.equal(validateStartServerOptions(good({ serverId: '' })).ok, false);
    assert.equal(validateStartServerOptions(good({ serverId: 7 })).ok, false);
    assert.equal(validateStartServerOptions(good({ command: undefined })).ok, false);
    assert.equal(validateStartServerOptions(good({ command: `sh${NUL}-c` })).ok, false);
  });

  it('requires args to be strings when given', () => {
    assert.equal(validateStartServerOptions(good({ args: undefined })).ok, true);
    assert.equal(validateStartServerOptions(good({ args: '--stdio' })).ok, false);
    assert.equal(validateStartServerOptions(good({ args: [1] })).ok, false);
    assert.equal(validateStartServerOptions(good({ args: [`a${NUL}b`] })).ok, false);
  });

  it('keeps the working directory inside the project root', () => {
    assert.equal(
      validateStartServerOptions(good({ cwd: path.join(ROOT, 'sub') })).ok,
      true
    );
    const escaped = validateStartServerOptions(
      good({ cwd: path.join(path.sep, 'elsewhere') })
    );
    assert.equal(escaped.ok, false);
    assert.match(escaped.reason, /cwd/);
    assert.equal(validateStartServerOptions(good({ cwd: 'relative' })).ok, false);
  });

  it('refuses an environment that is not a flat map of strings', () => {
    assert.equal(validateStartServerOptions(good({ env: { LANG: 'C' } })).ok, true);
    assert.equal(validateStartServerOptions(good({ env: { LANG: 5 } })).ok, false);
    assert.equal(
      validateStartServerOptions(good({ env: { LD_PRELOAD: { toString: () => '/x' } } })).ok,
      false
    );
    assert.equal(validateStartServerOptions(good({ env: ['LANG=C'] })).ok, false);
    assert.equal(validateStartServerOptions(good({ env: 'LANG=C' })).ok, false);
  });

  it('names the field it refused', () => {
    assert.match(validateStartServerOptions(good({ serverId: 1 })).reason, /serverId/);
    assert.match(validateStartServerOptions(good({ env: 1 })).reason, /env/);
  });
});

describe('the other spawn-effect lsp handlers refuse bad payloads', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'main-process', 'register-renderer-ipc.js'),
    'utf8'
  );

  for (const [channel, field] of [
    ['lsp:set-trust', 'projectRoot'],
    ['lsp:unregister-server', 'id'],
    ['lsp:stop-server', 'serverId']
  ]) {
    it(`${channel} checks ${field} before acting`, () => {
      const at = source.indexOf(`'${channel}'`);
      assert.notEqual(at, -1, `${channel} is registered`);
      const body = source.slice(at, at + 500);
      assert.match(body, /guard\.require/, `${channel} must use the guard`);
      assert.match(body, /refused/, `${channel} must say why it refused`);
    });
  }
});
