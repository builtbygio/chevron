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

  it('the natural log4js patch is retired, not merely deleted', () => {
    // natural@0.4.0 declared log4js "*", which resolves to 6.9.1 where
    // logger.setLevel is undefined, so it threw at require time. The fix was
    // not to fork natural: spell-check declared the dependency and never used
    // it, so 0.77.6 dropped it and the patch became unnecessary.
    assert.ok(
      !entries.has('natural@0.4.0'),
      'natural patch was retired by spell-check 0.77.6'
    );
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'patches', 'natural@0.4.0.patch')),
      'the patch file should be gone with its entry'
    );

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
    // spell-check is an in-repo editor package now; assert the vendored copy
    // is the one that dropped natural, rather than the pin string.
    assert.strictEqual(
      pkg.dependencies['spell-check'],
      'workspace:@builtbygio/spell-check@*'
    );
    // spell-check is vendored now, so the source of truth is in-repo.
    const vendored = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'packages', 'spell-check', 'package.json'),
        'utf8'
      )
    );
    assert.ok(
      !vendored.dependencies.natural,
      'vendored spell-check must not depend on natural'
    );

    // Installed-tree facts: only run where the root package.json is installed.
    const modules = path.join(ROOT, 'node_modules');
    if (!fs.existsSync(path.join(modules, 'spell-check'))) return;
    assert.ok(
      !fs.existsSync(path.join(modules, 'log4js')),
      'log4js entered the tree only through natural@0.4.0'
    );

    const lock = fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8');
    assert.doesNotMatch(lock, /natural@0\.4\.0/);
  });
});
