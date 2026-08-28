'use strict';

/**
 * Wave 2: `patches/` and pnpm `patchedDependencies` must agree.
 *
 * A patch file that is not in `patchedDependencies` is never applied by pnpm,
 * so it rots silently — five of them survived the N2 "fold patches into the
 * owned forks" epic and still described fixes that had already shipped.
 * Run: node --test script/ci/patch-inventory.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function patchedDependencies() {
  const yaml = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const lines = yaml.split('\n');
  const start = lines.findIndex(l => l.trim() === 'patchedDependencies:');
  assert.ok(start >= 0, 'pnpm-workspace.yaml has no patchedDependencies');

  const entries = new Map();
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    const match = line.match(/^\s+(.+?):\s*(\S+)\s*$/);
    if (!match) continue;
    entries.set(match[1].replace(/^['"]|['"]$/g, ''), match[2]);
  }
  return entries;
}

describe('patch inventory', () => {
  const entries = patchedDependencies();
  const files = fs
    .readdirSync(path.join(ROOT, 'patches'))
    .filter(name => name.endsWith('.patch'))
    .sort();

  it('every patch file is wired into patchedDependencies', () => {
    const referenced = new Set(
      [...entries.values()].map(p => path.basename(p))
    );
    const orphans = files.filter(name => !referenced.has(name));
    assert.deepStrictEqual(
      orphans,
      [],
      `patch files pnpm never applies: ${orphans.join(', ')}`
    );
  });

  it('every patchedDependencies entry points at a file that exists', () => {
    const missing = [];
    for (const [spec, file] of entries) {
      if (!fs.existsSync(path.join(ROOT, file))) {
        missing.push(`${spec} -> ${file}`);
      }
    }
    assert.deepStrictEqual(missing, [], `missing patch files: ${missing}`);
  });

  it('each entry key matches its patch filename', () => {
    for (const [spec, file] of entries) {
      assert.strictEqual(
        path.basename(file),
        `${spec}.patch`,
        `${spec} should be patched by ${spec}.patch, not ${file}`
      );
    }
  });

  it('the natural log4js patch is still needed (Wave 2 leftover)', () => {
    // `natural@0.4.0` declares `log4js: "*"`, which resolves to log4js 6,
    // where `logger.setLevel` no longer exists. Without this patch the
    // spell-check stack throws at require time. Deleting the patch needs a
    // published owned `natural`, which does not exist yet.
    assert.ok(entries.has('natural@0.4.0'), 'natural patch must stay');
    const patch = fs.readFileSync(
      path.join(ROOT, 'patches', 'natural@0.4.0.patch'),
      'utf8'
    );
    assert.match(patch, /logger\.level = 'WARN'/);

    // The `log4js: "*"` half is an installed-tree fact, so it only runs where
    // the root package.json is installed (the post-bootstrap Linux job).
    // unit-and-cpm deliberately never installs it.
    const naturalPkg = path.join(
      ROOT,
      'node_modules',
      'natural',
      'package.json'
    );
    if (!fs.existsSync(naturalPkg)) return;
    const natural = JSON.parse(fs.readFileSync(naturalPkg, 'utf8'));
    assert.strictEqual(natural.dependencies.log4js, '*');
  });
});
