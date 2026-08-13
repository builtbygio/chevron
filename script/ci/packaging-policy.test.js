'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR,
  shouldSkipCustomSnapshot,
  stockSnapshotNote,
  isForeignPrebuildPath
} = require('../lib/packaging-policy');

const ROOT = path.resolve(__dirname, '..', '..');

describe('packaging policy (Stream D)', () => {
  it('skips custom snapshot on Electron 43+ unless forced', () => {
    assert.strictEqual(STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR, 43);
    const skip = shouldSkipCustomSnapshot('43.1.0');
    assert.strictEqual(skip.skip, true);
    assert.strictEqual(skip.reason, 'electron-43-stock-default');

    const forced = shouldSkipCustomSnapshot('43.1.0', { force: true });
    assert.strictEqual(forced.skip, false);

    const old = shouldSkipCustomSnapshot('28.3.0');
    assert.strictEqual(old.skip, false);

    const host = shouldSkipCustomSnapshot('28.3.0', { hostCanRun: false });
    assert.strictEqual(host.skip, true);
  });

  it('note mentions CHEVRON_FORCE_MKSNAPSHOT', () => {
    assert.ok(stockSnapshotNote('43.1.0').includes('CHEVRON_FORCE_MKSNAPSHOT'));
  });

  it('script still uses electron-packager (no silent swap)', () => {
    const scriptPkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'script', 'package.json'), 'utf8')
    );
    assert.ok(scriptPkg.dependencies['electron-packager']);
    const impl = fs.readFileSync(
      path.join(ROOT, 'script', 'lib', 'package-application.js'),
      'utf8'
    );
    assert.ok(impl.includes("require('electron-packager')"));
  });

  it('docs/packaging.md exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'docs', 'packaging.md'))
    );
  });

  it('drops other-arch prebuilds and keeps host + suffix tags', () => {
    const keep = isForeignPrebuildPath(
      'node_modules/tree-sitter-css/prebuilds/linux-x64/tree-sitter-css.node',
      'linux',
      'x64'
    );
    const keepGnu = isForeignPrebuildPath(
      'node_modules/tree-sitter-c/prebuilds/linux-x64-gnu/x.node',
      'linux',
      'x64'
    );
    const dropArm = isForeignPrebuildPath(
      'node_modules/tree-sitter-css/prebuilds/linux-arm64/tree-sitter-css.node',
      'linux',
      'x64'
    );
    const dropWin = isForeignPrebuildPath(
      'node_modules/tree-sitter-js/prebuilds/win32-x64/tree-sitter-javascript.node',
      'linux',
      'x64'
    );
    const nested = isForeignPrebuildPath(
      'node_modules/tree-sitter-cpp/node_modules/tree-sitter-c/prebuilds/darwin-arm64/x.node',
      'linux',
      'x64'
    );
    const notPrebuild = isForeignPrebuildPath(
      'node_modules/tree-sitter-css/build/Release/tree_sitter_css.node',
      'linux',
      'x64'
    );
    assert.strictEqual(keep, false);
    assert.strictEqual(keepGnu, false);
    assert.strictEqual(dropArm, true);
    assert.strictEqual(dropWin, true);
    assert.strictEqual(nested, true);
    assert.strictEqual(notPrebuild, false);
  });
});
