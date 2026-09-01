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
    // esbuild rewrites __dirname to the output file's directory. Code that sat
    // in lib/ and did path.resolve(__dirname, '..') to find the package root
    // gets the package's parent once it is bundled at the root instead.
    //
    // snippets did exactly this, and the failure is silent: getPackageRoot()
    // returned node_modules/, snippets.ts looked for its built-in snippets
    // under <that>/lib/snippets, found nothing, and the package activated with
    // no bundled snippets. It is blocked for this reason rather than fixed
    // here.
    //
    // Scoped to lib/, which is what the bundle reaches. The update.ts and
    // fetch-*-docs scripts at package roots also use __dirname and are not
    // bundle inputs -- nothing requires them from main.
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
      // Deleting lib/ alone left the three autocomplete packages shipping
      // completions.json twice -- inlined in the bundle and still beside it,
      // 436K of duplicate data nothing read. esbuild's metafile is the only
      // thing that knows what was actually absorbed, so the bundler deletes
      // from that rather than from a guess about directory names.
      //
      // Scoped to what the bundle actually absorbed: what main reaches. These
      // packages also ship update.js / fetch-*-docs.js (maintenance scripts
      // that regenerate completions.json) and their spec/ directories. Those
      // are never bundle inputs and shipped long before bundling -- whether
      // the app should carry them at all is a real question, and a separate
      // one from this.
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
      // A dependency that locates its own files relative to __dirname breaks
      // when inlined: the code moves to the package root and the path moves
      // with it. @vscode/ripgrep sets rgPath = path.join(__dirname,
      // '../bin/rg'), which became node_modules/bin/rg once fuzzy-finder
      // inlined it -- the binary still there, nothing able to find it.
      //
      // Matches only __dirname inside a path computation. snippets and
      // bracket-matcher both contain `sandbox.__dirname = ...`, a vm sandbox
      // being given a property, which is not a lookup and not a hazard.
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
