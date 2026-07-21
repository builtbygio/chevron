'use strict';

/**
 * Live registry smoke (skipped if CPM_SKIP_LIVE_REGISTRY=1 or offline).
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  searchPackages,
  getPackage,
  resolveInstallSpec
} = require('../lib/registry');

const skip = process.env.CPM_SKIP_LIVE_REGISTRY === '1';

describe('cpm registry live (Pulsar API)', { skip }, () => {
  it('searches for linter', async () => {
    const hits = await searchPackages('linter');
    assert.ok(Array.isArray(hits));
    assert.ok(hits.length > 0, 'expected search hits');
    assert.ok(hits.some(h => h.name === 'linter'));
  });

  it('views linter metadata', async () => {
    const pkg = await getPackage('linter');
    assert.strictEqual(pkg.name, 'linter');
    assert.ok(pkg.releases && pkg.releases.latest);
  });

  it('resolves install tarball for linter', async () => {
    const resolved = await resolveInstallSpec('linter');
    assert.strictEqual(resolved.name, 'linter');
    assert.ok(resolved.version);
    assert.ok(
      resolved.spec.includes('tarball') || resolved.spec.startsWith('git+'),
      `unexpected spec ${resolved.spec}`
    );
  });
});
