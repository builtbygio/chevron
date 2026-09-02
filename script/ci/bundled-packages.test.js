'use strict';

/**
 * Bundled packages are self-contained, and the list only grows deliberately.
 *
 * Checks two ways a package can look bundleable and not be -- reaching into
 * core, or having runtime dependencies -- plus that event-kit stays external,
 * since a second copy breaks core's instanceof checks.
 *
 * Run: node --test script/ci/bundled-packages.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');
const {
  BUNDLED,
  EXTERNAL,
  BLOCKED,
  SURVIVES_BUNDLING
} = require('../lib/bundle-packages');

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

  it('nothing is blocked any more', () => {
    // Every catalog package bundles. BLOCKED is kept because the next package
    // to hit a real obstacle should record it here rather than be dropped from
    // the list silently, but it is empty and should stay that way.
    assert.deepEqual(
      Object.keys(BLOCKED),
      [],
      'a package was blocked; the reason belongs in BLOCKED and in a PR ' +
        'description, not in someone\'s memory'
    );
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

  it('no bundled package is also recorded as blocked', () => {
    const both = BUNDLED.filter(name => BLOCKED[name]);
    assert.deepEqual(
      both,
      [],
      'a package cannot be both bundled and blocked; if the reason is gone, ' +
        'remove the BLOCKED entry:\n  ' + both.join('\n  ')
    );
    for (const name of Object.keys(BLOCKED)) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'packages', name, 'package.json')),
        `${name} is recorded as blocked but is not a package`
      );
      assert.ok(
        BLOCKED[name] && BLOCKED[name].length > 10,
        `${name} is blocked without a reason anyone can act on`
      );
    }
  });

  it('no bundled package locates its own files through __dirname', () => {
    // esbuild rewrites __dirname to the output directory, so code in lib/
    // doing path.resolve(__dirname, '..') lands on the package's parent once
    // bundled at the root. The failure is silent -- a package activates with
    // its data missing. Scoped to lib/, which is what the bundle reaches.
    const offenders = [];
    for (const name of BUNDLED) {
      for (const file of sourceFiles(name)) {
        const src = fs.readFileSync(file, 'utf8');
        src.split('\n').forEach((line, i) => {
          if (/\b__dirname\b/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
            offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
          }
        });
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'bundling moves the code to the package root, so __dirname no longer ' +
        'points where it did; asset paths built from it break silently:\n  ' +
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
    it('each bundled package ships one index.js and no other code', () => {
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
        // A surviving lib/ is only wrong if it still holds code. snippets
        // keeps lib/snippets.json, its built-in snippets, which the package
        // reads by path at run time and esbuild therefore never absorbed --
        // deleting it would remove the data the bundle depends on.
        const strayCode = [];
        const walk = dir => {
          if (!fs.existsSync(dir)) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
              continue;
            }
            if (/\.(js|ts)$/.test(entry.name)) {
              strayCode.push(path.relative(root, full));
            }
          }
        };
        walk(path.join(root, 'lib'));
        // esbuild only reaches what main requires, so a file loaded another
        // way survives -- correctly. Each one is declared with a reason in
        // SURVIVES_BUNDLING, so a genuine leftover is still caught.
        const declared = Object.keys(SURVIVES_BUNDLING[name] || {});
        const unexpected = strayCode.filter(
          f => !declared.includes(f.split(path.sep).join('/'))
        );
        if (unexpected.length) {
          problems.push(
            `${name}: code survived bundling in lib/: ${unexpected.join(', ')}`
          );
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

    it('ships nothing that the bundle already inlined', () => {
      // Scoped to what the bundle absorbed, which only esbuild's metafile
      // knows. Maintenance scripts and spec/ at package roots are never bundle
      // inputs; whether they should ship at all is a separate question.
      const problems = [];
      for (const name of BUNDLED) {
        const root = path.join(APP, 'node_modules', name);
        if (!fs.existsSync(root)) continue;
        if (fs.existsSync(path.join(root, 'completions.json'))) {
          problems.push(`${name}: completions.json is inlined and still ships`);
        }
      }
      assert.deepEqual(problems, [], problems.join('\n  '));
    });

    it('no bundle computes a path from __dirname', () => {
      // A dependency locating its own files via __dirname breaks when
      // inlined -- @vscode/ripgrep's rgPath became node_modules/bin/rg.
      // Matches only __dirname in a path computation, not `sandbox.__dirname`.
      const offenders = [];
      for (const name of BUNDLED) {
        const bundle = path.join(APP, 'node_modules', name, 'index.js');
        if (!fs.existsSync(bundle)) continue;
        const src = fs.readFileSync(bundle, 'utf8');
        src.split('\n').forEach((line, i) => {
          if (/\bpath\d*\.(join|resolve)\s*\(\s*__dirname/.test(line)) {
            offenders.push(`${name}:${i + 1}  ${line.trim().slice(0, 90)}`);
          }
        });
      }
      assert.deepEqual(
        offenders,
        [],
        'inlined code that resolves paths from __dirname points somewhere ' +
          'else once bundled; the dependency has to stay external:\n  ' +
          offenders.join('\n  ')
      );
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
