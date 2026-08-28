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
const {
  entriesFor,
  lockText,
  parseVer: splitVer
} = require('../lib/lockfile-packages');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function parseVer(version) {
  const v = splitVer(version);
  assert.ok(v, `unparseable version: ${version}`);
  return v;
}

describe('runtime SCA declarations', () => {
  const pkg = readJson('package.json');

  it('root overrides pin marked, DOMPurify, and dugite tar', () => {
    assert.strictEqual(pkg.overrides.dompurify, '3.4.13');
    assert.strictEqual(pkg.overrides.marked, '4.3.0');
    assert.strictEqual(pkg.overrides.dugite.tar, '7.5.21');
  });

  it('deprecation-cop declares the same marked / DOMPurify', () => {
    const cop = readJson('packages/deprecation-cop/package.json');
    assert.strictEqual(cop.dependencies.dompurify, '3.4.13');
    assert.strictEqual(cop.dependencies.marked, '4.3.0');
  });

  it('owned sanitizer packages are workspace:@builtbygio packages', () => {
    for (const name of [
      'markdown-preview',
      'autocomplete-plus',
      'github',
      'notifications',
      'settings-view'
    ]) {
      const spec = pkg.dependencies[name];
      assert.strictEqual(
        spec,
        `workspace:@builtbygio/${name}@*`,
        `${name} is an in-repo editor package now, got ${spec}`
      );
    }
  });
});

describe('runtime SCA lockfile', () => {
  it('every resolved marked is 4.3.x', () => {
    const hits = entriesFor(ROOT, 'marked').filter(h => splitVer(h.version));
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
    const hits = entriesFor(ROOT, 'dompurify').filter(h => splitVer(h.version));
    assert.ok(hits.length > 0, 'no dompurify entries in lockfile');
    for (const hit of hits) {
      const v = parseVer(hit.version);
      assert.ok(
        v.major > 3 || (v.major === 3 && v.minor >= 4),
        `${hit.key} dompurify ${hit.version} (want >= 3.4)`
      );
    }
  });

  it('dugite uses tar 7.5.21+ (CVE range <=7.5.18)', () => {
    const tars = entriesFor(ROOT, 'tar').filter(h => splitVer(h.version));
    assert.ok(tars.length > 0, 'no tar entries in lockfile');
    for (const hit of tars) {
      const v = parseVer(hit.version);
      assert.ok(
        v.major > 7 || (v.major === 7 && (v.minor > 5 || (v.minor === 5 && v.patch >= 21))),
        `tar ${hit.key} ${hit.version} (want >= 7.5.21)`
      );
    }
  });

  it('does not resolve the deprecated request package', () => {
    const { text } = lockText(ROOT);
    assert.ok(
      !/^ {2}request@/m.test(text),
      'pnpm-lock.yaml still lists request@'
    );
  });

  it('does not resolve got (dugite download uses Node https)', () => {
    const { text } = lockText(ROOT);
    assert.ok(!/^ {2}got@/m.test(text), 'pnpm-lock.yaml still lists got@');
  });

  it('ls-archive is the builtbygio fork on tar 7', () => {
    const { text } = lockText(ROOT);
    assert.ok(
      text.includes('builtbygio/ls-archive') ||
        /ls-archive@2\./.test(text),
      'lockfile must pin builtbygio/ls-archive (tar 7)'
    );
    const tars = entriesFor(ROOT, 'tar').filter(h => splitVer(h.version));
    const tar7 = tars.filter(h => parseVer(h.version).major === 7);
    assert.ok(tar7.length > 0, 'no tar 7 for ls-archive in lockfile');
  });
});
