'use strict';

/**
 * The electron-builder config that makes the Windows installer names the same
 * product, repository and executable as the rest of packaging, and produces
 * asset names GitHub will not rewrite.
 *
 * Run: node --test script/ci/electron-builder-config.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const config = require(path.join(ROOT, 'script', 'electron-builder.config.js'));
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

describe('electron-builder config', () => {
  it('describes this app', () => {
    assert.equal(config.appId, 'dev.builtbygio.chevron');
    assert.equal(config.productName, 'Chevron');
    assert.equal(config.executableName, 'chevron');
    assert.equal(config.electronVersion, pkg.electronVersion);
  });

  it('points the update feed at the repository package.json names', () => {
    assert.equal(config.publish.provider, 'github');
    assert.match(
      pkg.repository.url,
      new RegExp(`${config.publish.owner}/${config.publish.repo}`)
    );
  });

  it('builds a signed-when-possible NSIS installer, not a one-click one', () => {
    assert.deepEqual(config.win.target, [{ target: 'nsis', arch: ['x64'] }]);
    assert.equal(config.nsis.oneClick, false);
    assert.equal(config.nsis.perMachine, false);
    assert.equal(
      config.nsis.differentialPackage,
      true,
      'the blockmap electron-updater downloads'
    );
    assert.equal(config.win.verifyUpdateCodeSignature, true);
  });

  it('names assets without spaces, which GitHub would rewrite', () => {
    assert.doesNotMatch(config.nsis.artifactName, /\s/);
    assert.match(config.nsis.artifactName, /\$\{version\}/);
  });

  it('uses icons that exist', () => {
    for (const icon of [
      config.win.icon,
      config.nsis.installerIcon,
      config.nsis.uninstallerIcon
    ]) {
      assert.ok(fs.existsSync(path.join(ROOT, icon)), icon);
    }
  });

  it('does not rebuild natives: the app is prepackaged', () => {
    assert.equal(config.npmRebuild, false);
    assert.equal(config.nodeGypRebuild, false);
  });
});
