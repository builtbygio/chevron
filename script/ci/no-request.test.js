'use strict';

/**
 * Owned source must not depend on the deprecated `request` package.
 * Run: node --test script/ci/no-request.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set([
  'node_modules',
  'out',
  'electron',
  '.git',
  'vendor'
]);

function walk(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (!/\.(js|ts|mjs|cjs)$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

describe('no deprecated request package', () => {
  it('owned JS/TS does not require("request") or request-promise-native', () => {
    const files = walk(ROOT, []);
    const hits = [];
    const re = /require\(['"]request(?:-promise(?:-native)?)?['"]\)/;
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel === 'script/ci/no-request.test.js') continue;
      const text = fs.readFileSync(file, 'utf8');
      if (re.test(text)) hits.push(rel);
    }
    assert.deepStrictEqual(hits, []);
  });

  it('script/ and vsts package.json do not declare request', () => {
    for (const rel of [
      'script/package.json',
      'script/vsts/package.json',
      'package.json'
    ]) {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      assert.strictEqual(
        pkg.dependencies && pkg.dependencies.request,
        undefined,
        `${rel} still depends on request`
      );
      assert.strictEqual(
        pkg.dependencies && pkg.dependencies['request-promise-native'],
        undefined,
        `${rel} still depends on request-promise-native`
      );
      assert.strictEqual(
        pkg.dependencies && pkg.dependencies['sync-request'],
        undefined,
        `${rel} still depends on sync-request`
      );
    }
  });
});
