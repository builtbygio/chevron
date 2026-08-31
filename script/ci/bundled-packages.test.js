'use strict';

/**
 * Bundled packages are self-contained, and the list only grows deliberately.
 *
 * Step 2 of docs/decisions/build-architecture.md: a package that is one file
 * with its dependencies inlined can ship as a single signed artifact, bundled
 * into the app or fetched from the registry, same bytes either way.
 *
 * Two ways a package can look bundleable and not be, both of which this
 * checks against the source tree so a bad addition fails before the build:
 *
 *   1. It reaches into core. lsp-ui requires ../../../src/lsp,
 *      ../../../src/text-editor-element and ../../../src/get-window-load-settings.
 *      Inlining those duplicates core modules into the package; leaving them
 *      external makes the package depend on paths that are not API. Either
 *      way it is not self-contained. It is excluded on purpose.
 *   2. It has runtime dependencies. Those are the harder case and come later;
 *      the starting set is the zero-dependency packages.
 *
 * And one thing that must survive bundling: event-kit stays external. Core
 * uses it too, so a bundled second copy would hand core Disposables from a
 * different class and instanceof checks against core's copy would fail. These
 * packages declare no dependencies and resolve it from the app's hoisted
 * node_modules, which is exactly what makes it easy to inline by accident.
 *
 * Run: node --test script/ci/bundled-packages.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');
const { BUNDLED, EXTERNAL } = require('../lib/bundle-packages');

function sourceFiles(packageName) {
  const found = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (/\.(js|ts)$/.test(entry.name)) found.push(full);
    }
  };
  walk(path.join(ROOT, 'packages', packageName, 'lib'));
  return found;
}

describe('bundled packages', () => {
  it('the list is non-empty and every entry is a real package', () => {
    assert.ok(BUNDLED.length > 0, 'nothing is bundled yet');
    for (const name of BUNDLED) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'packages', name, 'package.json')),
        `${name} is in the bundle list but is not a package`
      );
    }
  });

  it('no bundled package reaches into core', () => {
    const offenders = [];
    for (const name of BUNDLED) {
      for (const file of sourceFiles(name)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
          // ../../../src/... climbs out of packages/<name>/lib into core.
          if (/(^|\/)\.\.\/\.\.\/\.\.\/src(\/|$)/.test(m[1])) {
            offenders.push(
              `${name}: ${path.relative(ROOT, file)} requires ${m[1]}`
            );
          }
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a package importing core internals is not self-contained and cannot ' +
        'become an installable artifact until those imports are real API:\n  ' +
        offenders.join('\n  ')
    );
  });

  it('every bundled package has no runtime dependencies', () => {
    const offenders = [];
    for (const name of BUNDLED) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8')
      );
      const deps = Object.keys(manifest.dependencies || {});
      if (deps.length) offenders.push(`${name}: ${deps.join(', ')}`);
    }
    assert.deepEqual(
      offenders,
      [],
      'packages with dependencies are a later slice; inlining them needs each ' +
        'dependency checked for identity the way event-kit was:\n  ' +
        offenders.join('\n  ')
    );
  });

  it('keeps event-kit external', () => {
    assert.ok(
      EXTERNAL.includes('event-kit'),
      'core uses event-kit too; a bundled copy breaks instanceof against it'
    );
    assert.ok(EXTERNAL.includes('chevron'), 'the editor global is provided');
    assert.ok(EXTERNAL.includes('electron'), 'electron is provided');
  });

  const describeApp = fs.existsSync(APP) ? describe : describe.skip;

  describeApp('in the packaged app', () => {
    it('each bundled package is one index.js with no lib/', () => {
      const problems = [];
      for (const name of BUNDLED) {
        const root = path.join(APP, 'node_modules', name);
        if (!fs.existsSync(root)) {
          problems.push(`${name}: not in the packaged app`);
          continue;
        }
        if (!fs.existsSync(path.join(root, 'index.js'))) {
          problems.push(`${name}: no index.js`);
        }
        if (fs.existsSync(path.join(root, 'lib'))) {
          problems.push(`${name}: lib/ survived; the bundle is dead weight`);
        }
        const manifest = JSON.parse(
          fs.readFileSync(path.join(root, 'package.json'), 'utf8')
        );
        if (manifest.main !== './index.js') {
          problems.push(`${name}: main is ${manifest.main}, not ./index.js`);
        }
      }
      assert.deepEqual(problems, [], problems.join('\n  '));
    });

    it('does not inline a second copy of event-kit', () => {
      const offenders = [];
      for (const name of BUNDLED) {
        const bundle = path.join(APP, 'node_modules', name, 'index.js');
        if (!fs.existsSync(bundle)) continue;
        const src = fs.readFileSync(bundle, 'utf8');
        // event-kit is either required (external, correct) or its classes were
        // inlined (wrong). Emitter is the one core hands back and forth.
        if (/class Emitter\b/.test(src) || /class Disposable\b/.test(src)) {
          offenders.push(`${name}: event-kit looks inlined`);
        }
      }
      assert.deepEqual(offenders, [], offenders.join('\n  '));
    });
  });
});
