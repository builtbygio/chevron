'use strict';

/**
 * The Install panel exists, and its catalog describes real packages.
 *
 * Three commands pointed at chevron://config/install before it did:
 * settings-view:install-packages-and-themes, the Packages menu entry, and the
 * "Install packages" button on the no-language-server notice. showPanel defers
 * an unknown name and renders nothing, so all three opened Settings and showed
 * whatever was last active.
 *
 * The catalog is a checked-in list, so it can drift from the tree. These
 * assertions keep it honest: every entry must exist in packages/ and must not
 * be bundled, because a bundled package needs no installing.
 *
 * Run: node --test script/ci/install-panel.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'settings-view', 'lib');
const catalog = require(path.join(LIB, 'owned-catalog.js'));
const appManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

describe('owned catalog', () => {
  it('is not empty', () => {
    assert.ok(catalog.length > 0);
  });

  it('every entry is a package that exists', () => {
    for (const entry of catalog) {
      const manifest = path.join(ROOT, 'packages', entry.name, 'package.json');
      assert.ok(
        fs.existsSync(manifest),
        `${entry.name} is in the catalog but not in packages/`
      );
    }
  });

  it('no entry is bundled', () => {
    // A bundled package ships with the app; offering to install it is wrong.
    const bundled = new Set([
      ...Object.keys(appManifest.packageDependencies || {}),
      ...Object.keys(appManifest.dependencies || {})
    ]);
    const wrong = catalog.filter(entry => bundled.has(entry.name));
    assert.deepEqual(
      wrong.map(e => e.name),
      [],
      'these ship with the app and cannot be installed'
    );
  });

  it('versions match the packages they name', () => {
    for (const entry of catalog) {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(ROOT, 'packages', entry.name, 'package.json'),
          'utf8'
        )
      );
      assert.equal(
        entry.version,
        manifest.version,
        `${entry.name}: catalog says ${entry.version}, package says ${manifest.version}`
      );
    }
  });

  it('scopes match what each package registers', () => {
    // The scopes are what let someone who saw "no language server for
    // source.rust" find the package that serves it, so a stale list is worse
    // than none.
    const findScopes = value => {
      if (!value || typeof value !== 'object') return null;
      if (Array.isArray(value.scopes)) return value.scopes;
      for (const key of Object.keys(value)) {
        const found = findScopes(value[key]);
        if (found) return found;
      }
      return null;
    };
    for (const entry of catalog) {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(ROOT, 'packages', entry.name, 'package.json'),
          'utf8'
        )
      );
      const declared = findScopes(manifest);
      assert.ok(declared, `${entry.name} declares no scopes`);
      assert.deepEqual(
        [...entry.scopes].sort(),
        [...declared].sort(),
        `${entry.name}: catalog scopes differ from the package`
      );
    }
  });
});

describe('the panel is registered', () => {
  const settingsView = fs.readFileSync(
    path.join(LIB, 'settings-view.js'),
    'utf8'
  );

  it('adds an Install core panel', () => {
    assert.match(settingsView, /addCorePanel\("Install"/);
    assert.match(settingsView, /require\("\.\/install-panel"\)/);
  });

  it('the panel module exposes what settings-view calls', () => {
    const InstallPanel = require(path.join(LIB, 'install-panel.js'));
    assert.equal(typeof InstallPanel, 'function');
    for (const method of ['focus', 'beforeShow', 'dispose', 'destroy']) {
      assert.equal(
        typeof InstallPanel.prototype[method],
        'function',
        `settings-view calls ${method}() on a panel`
      );
    }
  });

  it('offers no button that cannot work yet', () => {
    // cpm has no install command and no index is published, so an enabled
    // Install button would fail. It says so instead.
    const src = fs.readFileSync(path.join(LIB, 'install-panel.js'), 'utf8');
    assert.match(src, /button\.disabled = true/);
    assert.match(src, /not published yet/i);
  });
});
