'use strict';

/**
 * Every relative require inside a bundled package must resolve.
 *
 * Smoke only proves packages *activate*; it never opens a UI panel. So
 * deleting a file that a panel still requires — settings-view's Install and
 * Updates panels, say — would pass build, pass smoke, and only fail when a
 * user opened Settings.
 *
 * Now that the catalog is vendored into packages/, this is checkable
 * statically for every package at once.
 *
 * Run: node --test script/ci/package-requires-resolve.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');

function sourceFiles(dir) {
  const out = [];
  const walk = d => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'spec', 'test', '.git'].includes(ent.name)) continue;
      const full = path.join(d, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) walk(full);
      else if (/\.(js|ts)$/.test(ent.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function resolves(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.ts`,
    `${base}.json`,
    `${base}.node`,
    path.join(base, 'index.js'),
    path.join(base, 'index.ts')
  ];
  if (candidates.some(c => fs.existsSync(c) && fs.statSync(c).isFile())) {
    return true;
  }
  // A directory with its own package.json main.
  const pkg = path.join(base, 'package.json');
  return fs.existsSync(pkg);
}

describe('bundled package relative requires resolve', () => {
  const packages = fs
    .readdirSync(PACKAGES, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  it('finds the vendored catalog', () => {
    assert.ok(packages.length >= 50, `only ${packages.length} packages found`);
  });

  it('no package requires a file that does not exist', () => {
    const broken = [];
    for (const name of packages) {
      for (const file of sourceFiles(path.join(PACKAGES, name))) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/require\(\s*['"](\.[^'"]*)['"]\s*\)/g)) {
          const spec = m[1];
          // Native addons come from the rebuild, not the repo.
          if (/(^|\/)build\/(Release|Debug)\//.test(spec)) continue;
          // Generated at pack time: snippets' PEG parser (transpilePegJsPaths)
          // and superstring's browser shim.
          if (/snippet-body$|\.\/browser$/.test(spec)) continue;
          // A benchmark script, not shipped code.
          if (/\/(script|benchmarks?)\//.test(file)) continue;
          if (!resolves(file, spec)) {
            broken.push(`${path.relative(ROOT, file)} -> ${spec}`);
          }
        }
      }
    }
    assert.deepStrictEqual(
      broken,
      [],
      `dangling requires: ${broken.join(', ')}`
    );
  });
});
