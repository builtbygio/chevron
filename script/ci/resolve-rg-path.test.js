'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  resolveRgPath,
  rgBinName,
  platformPackageName,
  preferUnpacked
} = require('../../src/resolve-rg-path');

describe('resolve-rg-path', () => {
  it('names the host binary', () => {
    assert.strictEqual(rgBinName('linux'), 'rg');
    assert.strictEqual(rgBinName('win32'), 'rg.exe');
  });

  it('names the 1.18 platform package for this host', () => {
    assert.strictEqual(
      platformPackageName('linux', 'x64'),
      '@vscode/ripgrep-linux-x64'
    );
    assert.strictEqual(
      platformPackageName('darwin', 'arm64'),
      '@vscode/ripgrep-darwin-arm64'
    );
    assert.strictEqual(
      platformPackageName('win32', 'x64'),
      '@vscode/ripgrep-win32-x64'
    );
  });

  it('rewrites app.asar to app.asar.unpacked and prefers the file that exists', () => {
    const asar =
      '/tmp/Chevron/resources/app.asar/node_modules/@vscode/ripgrep/bin/rg';
    const unpacked = asar.replace('app.asar', 'app.asar.unpacked');
    const existing = new Set([unpacked]);
    assert.strictEqual(
      preferUnpacked(asar, p => existing.has(p)),
      unpacked
    );
  });

  it('prefers an explicit path with asar rewrite', () => {
    const asar =
      '/tmp/Chevron/resources/app.asar/node_modules/@vscode/ripgrep-linux-x64/bin/rg';
    const unpacked = asar.replace('app.asar', 'app.asar.unpacked');
    const existing = new Set([unpacked]);
    assert.strictEqual(
      resolveRgPath(asar, p => existing.has(p)),
      unpacked
    );
  });

  it('resolves the 1.18 platform package before the wrapper', () => {
    const platformBin =
      '/tmp/nm/@vscode/ripgrep-linux-x64/bin/rg';
    const wrapperBin = '/tmp/nm/@vscode/ripgrep/bin/rg';
    const resolveFn = id => {
      if (id.endsWith('/bin/rg') || id.endsWith('/bin/rg.exe')) {
        return platformBin;
      }
      throw new Error('not found: ' + id);
    };
    const existing = new Set([platformBin, wrapperBin]);
    assert.strictEqual(
      resolveRgPath(undefined, p => existing.has(p), resolveFn),
      platformBin
    );
  });

  it('falls back to the wrapper rgPath when the platform package resolve fails', () => {
    // With 1.18 the wrapper itself points at the platform package bin; with
    // 1.15 it points at …/ripgrep/bin/rg. Either way the fallback must work.
    const resolved = resolveRgPath(undefined, p => fs.existsSync(p), id => {
      throw new Error('no platform package: ' + id);
    });
    assert.ok(resolved.includes('@vscode/ripgrep'));
    assert.ok(fs.existsSync(resolved), resolved);
  });

  it('resolves a real binary on this host via the platform package', () => {
    const resolved = resolveRgPath();
    assert.ok(fs.existsSync(resolved), resolved);
    assert.strictEqual(path.basename(resolved), rgBinName());
    assert.ok(
      resolved.includes('ripgrep-') || resolved.includes(`${path.sep}ripgrep${path.sep}`),
      resolved
    );
  });
});
