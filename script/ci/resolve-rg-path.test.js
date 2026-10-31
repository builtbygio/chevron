'use strict';

/**
 * Unit tests for src/resolve-rg-path.js. Fully injected — the unit-and-cpm
 * job never installs the root app tree, so these must not require() the
 * real @vscode/ripgrep package.
 *
 * Run: node --test script/ci/resolve-rg-path.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
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
    const platformBin = '/tmp/nm/@vscode/ripgrep-linux-x64/bin/rg';
    const wrapperBin = '/tmp/nm/@vscode/ripgrep/bin/rg';
    const resolveFn = id => {
      if (id.endsWith('/bin/rg') || id.endsWith('/bin/rg.exe')) {
        return platformBin;
      }
      throw new Error('not found: ' + id);
    };
    const existing = new Set([platformBin, wrapperBin]);
    assert.strictEqual(
      resolveRgPath(
        undefined,
        p => existing.has(p),
        resolveFn,
        () => wrapperBin
      ),
      platformBin
    );
  });

  it('falls back to the wrapper rgPath when the platform package resolve fails', () => {
    const wrapperBin = '/tmp/nm/@vscode/ripgrep/bin/rg';
    const existing = new Set([wrapperBin]);
    const resolved = resolveRgPath(
      undefined,
      p => existing.has(p),
      () => {
        throw new Error('no platform package');
      },
      () => wrapperBin
    );
    assert.strictEqual(resolved, wrapperBin);
  });

  it('throws when neither layout is available', () => {
    assert.throws(
      () =>
        resolveRgPath(
          undefined,
          () => false,
          () => {
            throw new Error('no platform package');
          },
          () => null
        ),
      /ripgrep binary not found/
    );
  });

  it('rewrites a platform-package path out of app.asar', () => {
    const asar =
      '/app/resources/app.asar/node_modules/@vscode/ripgrep-linux-x64/bin/rg';
    const unpacked = asar.replace('app.asar', 'app.asar.unpacked');
    const existing = new Set([unpacked]);
    const resolved = resolveRgPath(
      undefined,
      p => existing.has(p),
      () => asar,
      () => null
    );
    assert.strictEqual(resolved, unpacked);
    assert.strictEqual(path.basename(resolved), 'rg');
  });
});
