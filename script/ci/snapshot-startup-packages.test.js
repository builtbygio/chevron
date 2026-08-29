'use strict';

/**
 * Packages the startup snapshot bakes in must not also be snapshot-excluded.
 *
 * generate-startup-snapshot.js verifies the linked script under
 * Electron-as-Node. If a module required during generation was excluded,
 * customRequire throws ("To use Node's require you need to call
 * `snapshotResult.setGlobals` first!") and the whole snapshot is discarded --
 * not just the offending package. The build catches that, prints a one-line
 * NOTE, and exits 0, so the app silently falls back to Electron's stock V8
 * snapshots and every user pays a slower cold start.
 *
 * That is exactly how 1.1.0 shipped: d180784b9 excluded all of tree-view to
 * keep its nested minimatch out of the snapshot, but tree-view is a
 * SNAPSHOT_STARTUP_PACKAGES entry that initialize-application-window.js
 * requires while generating.
 *
 * Entry points are read from packages/<name>/package.json so this runs without
 * node_modules (the unit-and-cpm job never installs the root package.json).
 *
 * Run: node --test script/ci/snapshot-startup-packages.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { shouldExcludeModule } = require('../lib/snapshot-exclude');
const {
  SNAPSHOT_STARTUP_PACKAGES
} = require('../../src/deferred-startup-packages');

const ROOT = path.resolve(__dirname, '..', '..');

// Mirrors generate-startup-snapshot.js: baseDirPath is <app>/static and the
// snapshot entry point is <app>/src/initialize-application-window.js.
const APP = path.join(ROOT, 'out', 'app');
const BASE_DIR_PATH = path.join(APP, 'static');
const ENTRY = path.join(APP, 'src', 'initialize-application-window.js');

function entryPointFor(name) {
  const manifestPath = path.join(ROOT, 'packages', name, 'package.json');
  assert.ok(
    fs.existsSync(manifestPath),
    `${name} is in SNAPSHOT_STARTUP_PACKAGES but packages/${name} does not exist`
  );
  const main = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).main;
  let relative = main ? main.replace(/^\.\//, '') : 'index.js';
  if (!path.extname(relative)) relative += '.js';
  return path.join(APP, 'node_modules', name, relative);
}

function excluded(requiredModulePath) {
  return shouldExcludeModule({
    baseDirPath: BASE_DIR_PATH,
    requiringModulePath: ENTRY,
    requiredModulePath
  });
}

describe('snapshot startup packages', () => {
  it('no snapshot-startup package is excluded from the snapshot', () => {
    for (const name of SNAPSHOT_STARTUP_PACKAGES) {
      assert.equal(
        excluded(entryPointFor(name)),
        false,
        `${name} is required while generating the snapshot but ` +
          'snapshot-exclude.js excludes it, which discards the whole snapshot'
      );
    }
  });

  it('still keeps tree-view nested deps out of the snapshot', () => {
    // The narrow form of the d180784b9 rule: pnpm hoists minimatch, so the
    // nested copy must not be baked. Deleting the rule outright would fix the
    // verify failure and reintroduce that bake.
    assert.equal(
      excluded(
        path.join(
          APP,
          'node_modules',
          'tree-view',
          'node_modules',
          'minimatch',
          'minimatch.js'
        )
      ),
      true,
      'tree-view/node_modules must stay excluded from the snapshot'
    );
  });

  it('the generated require list matches SNAPSHOT_STARTUP_PACKAGES', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src', 'initialize-application-window.js'),
      'utf8'
    );
    const start = src.indexOf('if (global.isGeneratingSnapshot) {');
    assert.ok(start !== -1, 'isGeneratingSnapshot block not found');
    const block = src.slice(start, src.indexOf('\n}', start));
    const required = [...block.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
    assert.deepEqual(
      required.slice().sort(),
      SNAPSHOT_STARTUP_PACKAGES.slice().sort(),
      'electron-link only follows static requires: the block and ' +
        'SNAPSHOT_STARTUP_PACKAGES must list the same packages'
    );
  });
});
