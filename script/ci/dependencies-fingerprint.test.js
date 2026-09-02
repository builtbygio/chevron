'use strict';

/**
 * The bootstrap fingerprint notices a changed workspace manifest.
 *
 * bootstrap-modern skips pnpm install when the fingerprint matches, which is
 * only safe if it covers everything that changes resolution. Editing a
 * package's dependencies does not touch the lockfile until an install runs, so
 * a lockfile-only fingerprint still matched and the install never happened.
 *
 * Drives the real module against real files, restoring them in a finally
 * block, because the failure mode is a fingerprint that looks plausible and
 * does not move.
 *
 * Run: node --test script/ci/dependencies-fingerprint.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const fingerprint = require('../lib/dependencies-fingerprint');

// Edit a file, run `body`, always put it back.
function withEdit(file, transform, body) {
  const original = fs.readFileSync(file, 'utf8');
  try {
    const next = transform(original);
    assert.notEqual(next, original, `the test edit to ${file} matched nothing`);
    fs.writeFileSync(file, next);
    return body();
  } finally {
    fs.writeFileSync(file, original);
  }
}

describe('dependencies fingerprint', () => {
  const ABOUT = path.join(ROOT, 'packages', 'about', 'package.json');
  const ROOT_MANIFEST = path.join(ROOT, 'package.json');

  it('is stable when nothing changes', () => {
    assert.equal(fingerprint.compute(), fingerprint.compute());
  });

  it('moves when a workspace package changes a dependency range', () => {
    const base = fingerprint.compute();
    const moved = withEdit(
      ABOUT,
      src => src.replace(/"etch"\s*:\s*"[^"]+"/, '"etch": "^0.13.0"'),
      () => fingerprint.compute()
    );
    assert.notEqual(
      moved,
      base,
      'this is the bug: a changed package manifest left the fingerprint ' +
        'untouched, so bootstrap skipped the install that would have updated ' +
        'the lockfile'
    );
  });

  it('moves when a workspace package changes a devDependency', () => {
    const base = fingerprint.compute();
    const moved = withEdit(
      path.join(ROOT, 'packages', 'git-diff', 'package.json'),
      src => src.replace(/"temp"\s*:\s*"[^"]+"/, '"temp": "^0.8.1"'),
      () => fingerprint.compute()
    );
    assert.notEqual(moved, base, 'devDependencies change resolution too');
  });

  it('moves when the root manifest changes a dependency', () => {
    const base = fingerprint.compute();
    const moved = withEdit(
      ROOT_MANIFEST,
      src => src.replace(/"etch"\s*:\s*"[^"]+"/, '"etch": "0.14.0"'),
      () => fingerprint.compute()
    );
    assert.notEqual(moved, base, 'the root manifest is a workspace manifest too');
  });

  it('ignores edits that cannot change resolution', () => {
    const base = fingerprint.compute();
    const afterDescription = withEdit(
      ABOUT,
      src => src.replace(/"description"\s*:\s*"[^"]*"/, '"description": "reworded"'),
      () => fingerprint.compute()
    );
    assert.equal(
      afterDescription,
      base,
      'a reworded description must not cost a full reinstall'
    );
  });

  it('ignores key reordering', () => {
    const base = fingerprint.compute();
    const reordered = withEdit(
      ABOUT,
      src => {
        const json = JSON.parse(src);
        const flipped = {};
        for (const key of Object.keys(json).reverse()) flipped[key] = json[key];
        return JSON.stringify(flipped, null, 2);
      },
      () => fingerprint.compute()
    );
    assert.equal(reordered, base, 'authoring order is not content');
  });

  it('hashes dependency contents, not just the field names', () => {
    // The trap this hit while being written: JSON.stringify(value, array)
    // treats the array as a key allowlist applied at EVERY level, so passing
    // the top-level field names stripped the package names inside
    // `dependencies` and hashed an empty object. Every manifest then produced
    // the same digest and the fingerprint never moved -- a silent pass, which
    // is worse than a refusal.
    const base = fingerprint.manifestPart();
    const moved = withEdit(
      ABOUT,
      src => src.replace(/"etch"\s*:\s*"[^"]+"/, '"etch": "^0.11.0"'),
      () => fingerprint.manifestPart()
    );
    assert.notEqual(
      moved,
      base,
      'manifestPart must reflect the versions inside dependencies, not only ' +
        'which dependency fields exist'
    );
  });

  it('distinguishes two different manifests', () => {
    // A serializer that flattens content would give every package the same
    // digest; this fails loudly if that ever happens again.
    const digests = new Set();
    for (const pkg of ['about', 'git-diff', 'settings-view']) {
      const file = path.join(ROOT, 'packages', pkg, 'package.json');
      if (!fs.existsSync(file)) continue;
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      digests.add(JSON.stringify(json.dependencies || {}));
    }
    assert.ok(digests.size > 1, 'these packages do not have identical deps');
  });
});
