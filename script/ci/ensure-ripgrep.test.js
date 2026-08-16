'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  rgBinName,
  rgBinPath,
  rgTarget,
  ensureRipgrepAt
} = require('../lib/ensure-ripgrep');
const { resolveRgPath } = require('../../src/ripgrep-directory-searcher');

describe('ensure-ripgrep / resolveRgPath', () => {
  it('names the host binary', () => {
    assert.strictEqual(rgBinName('linux'), 'rg');
    assert.strictEqual(rgBinName('win32'), 'rg.exe');
  });

  it('rewrites app.asar to app.asar.unpacked and prefers the file that exists', () => {
    const asar =
      '/tmp/Chevron/resources/app.asar/node_modules/@vscode/ripgrep/bin/rg';
    const unpacked = asar.replace('app.asar', 'app.asar.unpacked');
    const existing = new Set([unpacked]);
    assert.strictEqual(
      resolveRgPath(asar, p => existing.has(p)),
      unpacked
    );
  });

  it('falls back to unpacked path when neither file exists', () => {
    const asar =
      '/tmp/Chevron/resources/app.asar/node_modules/@vscode/ripgrep/bin/rg';
    assert.ok(resolveRgPath(asar, () => false).includes('app.asar.unpacked'));
  });

  it('no-ops when the package dir is missing', () => {
    assert.strictEqual(ensureRipgrepAt('/tmp/definitely-no-vscode-ripgrep'), null);
  });

  it('computes bin path under the package', () => {
    const dir = '/tmp/@vscode/ripgrep';
    assert.strictEqual(
      rgBinPath(dir, 'linux'),
      path.join(dir, 'bin', 'rg')
    );
  });

  it('maps @vscode/ripgrep 1.15.14 / ripgrep-prebuilt v13.0.0-13 targets', () => {
    assert.strictEqual(rgTarget('darwin', 'arm64'), 'aarch64-apple-darwin');
    assert.strictEqual(rgTarget('darwin', 'x64'), 'x86_64-apple-darwin');
    assert.strictEqual(rgTarget('linux', 'x64'), 'x86_64-unknown-linux-musl');
    assert.strictEqual(rgTarget('linux', 'arm64'), 'aarch64-unknown-linux-musl');
    assert.strictEqual(rgTarget('win32', 'x64'), 'x86_64-pc-windows-msvc');
  });

  it('@vscode/ripgrep is a root dependency and vscode-ripgrep is gone', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
    );
    assert.strictEqual(pkg.dependencies['@vscode/ripgrep'], '1.15.14');
    assert.ok(!pkg.dependencies['vscode-ripgrep']);
  });
});
