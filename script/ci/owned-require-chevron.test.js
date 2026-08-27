'use strict';

/**
 * Owned package lib/src must require('chevron'), not require('atom').
 * exports/atom.js was removed in PR 23; require('atom') is unsupported.
 * Run: node --test script/ci/owned-require-chevron.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const ATOM_REQUIRE = /require\((['"])atom\1\)/;
const ATOM_FROM = /from\s+(['"])atom\1/;
const SOURCE_EXT = new Set(['.js', '.ts', '.coffee', '.cjs', '.mjs']);

function isOwnedBuiltbygioSpec(spec) {
  const s = String(spec);
  return (
    s.startsWith('npm:@builtbygio/') ||
    (s.includes('git+') && s.includes('github.com/builtbygio/'))
  );
}

function ownedNames() {
  return Object.entries(pkg.dependencies)
    .filter(([, spec]) => isOwnedBuiltbygioSpec(spec))
    .map(([name]) => name);
}

function walkLibSrc(root) {
  const files = [];
  for (const top of ['lib', 'src']) {
    const dir = path.join(root, top);
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
        if (ent.name === 'node_modules') continue;
        const abs = path.join(cur, ent.name);
        if (ent.isDirectory()) stack.push(abs);
        else if (SOURCE_EXT.has(path.extname(ent.name))) files.push(abs);
      }
    }
  }
  return files;
}

describe('owned packages require chevron', () => {
  const names = ownedNames();

  it('scans at least one builtbygio pin', () => {
    assert.ok(names.length > 0, 'no npm/workspace/@builtbygio pins in package.json');
  });

  it("lib/ and src/ do not require('atom')", () => {
    const hits = [];
    for (const name of names) {
      const root = path.join(ROOT, 'node_modules', name);
      if (!fs.existsSync(root)) {
        hits.push(`${name}: not installed`);
        continue;
      }
      for (const file of walkLibSrc(root)) {
        const text = fs.readFileSync(file, 'utf8');
        if (ATOM_REQUIRE.test(text) || ATOM_FROM.test(text)) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepStrictEqual(hits, [], hits.join('\n'));
  });
});
