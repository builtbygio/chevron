'use strict';

/**
 * Runtime SCA: declared + lockfile marked / DOMPurify / dugite tar.
 * Run: node --test script/ci/sca-runtime.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function lockEntries(lock, name) {
  const packages = lock.packages || {};
  const hits = [];
  for (const [key, value] of Object.entries(packages)) {
    if (!value || typeof value.version !== 'string') continue;
    const base = key.split('/').pop();
    if (base === name || key === `node_modules/${name}`) {
      hits.push({ key, version: value.version });
    }
  }
  return hits;
}

function parseVer(version) {
  const m = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  assert.ok(m, `unparseable version: ${version}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

describe('runtime SCA declarations', () => {
  const pkg = readJson('package.json');

  it('root overrides pin marked, DOMPurify, and dugite tar', () => {
    assert.strictEqual(pkg.overrides.dompurify, '3.4.13');
    assert.strictEqual(pkg.overrides.marked, '4.3.0');
    assert.strictEqual(pkg.overrides.dugite.tar, '6.2.1');
  });

  it('deprecation-cop declares the same marked / DOMPurify', () => {
    const cop = readJson('packages/deprecation-cop/package.json');
    assert.strictEqual(cop.dependencies.dompurify, '3.4.13');
    assert.strictEqual(cop.dependencies.marked, '4.3.0');
  });

  it('owned sanitizer packages are builtbygio git pins', () => {
    for (const name of [
      'markdown-preview',
      'autocomplete-plus',
      'github',
      'notifications',
      'settings-view'
    ]) {
      const spec = pkg.dependencies[name];
      assert.ok(
        typeof spec === 'string' && spec.includes('github.com/builtbygio/'),
        `${name} must stay a builtbygio git pin, got ${spec}`
      );
    }
  });
});

describe('runtime SCA lockfile', () => {
  const lock = readJson('package-lock.json');

  it('every resolved marked is 4.3.x', () => {
    const hits = lockEntries(lock, 'marked');
    assert.ok(hits.length > 0, 'no marked entries in lockfile');
    for (const hit of hits) {
      const v = parseVer(hit.version);
      assert.strictEqual(
        v.major,
        4,
        `${hit.key} marked ${hit.version} (want 4.3.x)`
      );
      assert.strictEqual(
        v.minor,
        3,
        `${hit.key} marked ${hit.version} (want 4.3.x)`
      );
    }
  });

  it('every resolved DOMPurify is 3.4.x+', () => {
    const hits = lockEntries(lock, 'dompurify');
    assert.ok(hits.length > 0, 'no dompurify entries in lockfile');
    for (const hit of hits) {
      const v = parseVer(hit.version);
      assert.ok(
        v.major > 3 || (v.major === 3 && v.minor >= 4),
        `${hit.key} dompurify ${hit.version} (want >= 3.4)`
      );
    }
  });

  it('dugite nested tar is 6.2.x', () => {
    const packages = lock.packages || {};
    const nested = packages['node_modules/dugite/node_modules/tar'];
    const rootTar = packages['node_modules/tar'];
    const dugiteTar = nested || (rootTar && rootTar.version.startsWith('6.') ? rootTar : null);
    assert.ok(dugiteTar, 'dugite tar not in lockfile');
    const v = parseVer(dugiteTar.version);
    assert.strictEqual(v.major, 6, `dugite tar ${dugiteTar.version}`);
    assert.ok(v.minor >= 2, `dugite tar ${dugiteTar.version}`);
  });

  it('ls-archive is the builtbygio fork on tar 7', () => {
    const packages = lock.packages || {};
    const hits = Object.entries(packages).filter(([key, value]) => {
      if (!value) return false;
      return key === 'node_modules/ls-archive' || key.endsWith('/node_modules/ls-archive');
    });
    assert.ok(hits.length > 0, 'no ls-archive entries in lockfile');
    for (const [key, value] of hits) {
      const resolved = String(value.resolved || value.from || '');
      assert.ok(
        resolved.includes('builtbygio/ls-archive') ||
          (value.version && parseVer(value.version).major >= 2),
        `${key} must be builtbygio/ls-archive (tar 7), got version=${value.version} resolved=${resolved}`
      );
    }

    const lsaTars = Object.entries(packages).filter(([key, value]) => {
      if (!value || typeof value.version !== 'string') return false;
      if (!(key === 'node_modules/tar' || key.endsWith('/node_modules/tar'))) return false;
      return key.includes('ls-archive');
    });
    const tarsToCheck =
      lsaTars.length > 0
        ? lsaTars
        : Object.entries(packages).filter(([key, value]) => {
            return (
              value &&
              typeof value.version === 'string' &&
              (key === 'node_modules/tar' || key.endsWith('/node_modules/tar')) &&
              parseVer(value.version).major === 7
            );
          });
    assert.ok(tarsToCheck.length > 0, 'no tar 7 for ls-archive in lockfile');
    for (const [key, value] of tarsToCheck) {
      assert.strictEqual(parseVer(value.version).major, 7, `${key} tar ${value.version}`);
    }
  });
});
