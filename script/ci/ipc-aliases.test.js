'use strict';

/**
 * A renamed channel still answers to the name it had, for one release.
 *
 * docs/process/ipc-surface-hardening.md — Phase 4
 * Run: node --test script/ci/ipc-aliases.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  LEGACY_ALIASES,
  withLegacyAliases
} = require(path.join(ROOT, 'src', 'main-process', 'ipc-aliases'));

function fakeIpcMain() {
  const registered = new Map();
  return {
    registered,
    handle: (channel, handler) => registered.set(channel, { kind: 'handle', handler }),
    on: (channel, handler) => registered.set(channel, { kind: 'on', handler }),
    removeListener: () => {}
  };
}

describe('registering a renamed channel', () => {
  it('registers both names with the same handler behaviour', () => {
    const ipcMain = fakeIpcMain();
    const wrapped = withLegacyAliases(ipcMain, { onWarn: () => {} });
    wrapped.handle('chevron:app-get-path-sync', (event, name) => `path:${name}`);

    assert.ok(ipcMain.registered.has('chevron:app-get-path-sync'));
    assert.ok(ipcMain.registered.has('atom-app-get-path-sync'));
    assert.equal(
      ipcMain.registered.get('atom-app-get-path-sync').handler({}, 'home'),
      'path:home'
    );
  });

  it('registers the alias with the same kind', () => {
    const ipcMain = fakeIpcMain();
    const wrapped = withLegacyAliases(ipcMain, { onWarn: () => {} });
    wrapped.on('chevron:fs-exists-sync', () => {});
    assert.equal(ipcMain.registered.get('atom-fs-exists-sync').kind, 'on');
  });

  it('warns when the old name is used, naming the new one', () => {
    const ipcMain = fakeIpcMain();
    const warnings = [];
    const wrapped = withLegacyAliases(ipcMain, {
      onWarn: (legacy, canonical) => warnings.push({ legacy, canonical })
    });
    wrapped.handle('chevron:shell-beep-sync', () => true);

    assert.deepEqual(warnings, []); // nothing said until it is used
    ipcMain.registered.get('atom-shell-beep-sync').handler({});
    assert.deepEqual(warnings, [
      { legacy: 'atom-shell-beep-sync', canonical: 'chevron:shell-beep-sync' }
    ]);
  });

  it('says nothing when the canonical name is used', () => {
    const ipcMain = fakeIpcMain();
    const warnings = [];
    const wrapped = withLegacyAliases(ipcMain, { onWarn: () => warnings.push(1) });
    wrapped.handle('chevron:shell-beep-sync', () => true);
    ipcMain.registered.get('chevron:shell-beep-sync').handler({});
    assert.deepEqual(warnings, []);
  });

  it('leaves a channel with no old name alone', () => {
    const ipcMain = fakeIpcMain();
    const wrapped = withLegacyAliases(ipcMain, { onWarn: () => {} });
    wrapped.handle('lsp:list-servers', () => []);
    assert.deepEqual([...ipcMain.registered.keys()], ['lsp:list-servers']);
  });
});

describe('the alias map', () => {
  it('renames every old name into the chevron namespace', () => {
    for (const [canonical, legacy] of LEGACY_ALIASES) {
      assert.match(canonical, /^chevron:/, canonical);
      assert.ok(!legacy.startsWith('chevron:'), legacy);
    }
  });

  it('maps each old name to exactly one channel', () => {
    const legacyNames = [...LEGACY_ALIASES.values()];
    assert.equal(new Set(legacyNames).size, legacyNames.length);
  });

  it('does not alias the unload handshake', () => {
    // atom-window.js registers and removes that listener for each unload, and
    // an alias registered beside it would not be removed with it.
    assert.equal(LEGACY_ALIASES.has('chevron:did-prepare-to-unload'), false);
  });
});
