'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  isBarePackageName,
  parseNameVersion,
  normalizeSearchHit,
  getRegistryBaseUrl,
  DEFAULT_REGISTRY_URL
} = require('../lib/registry');

describe('cpm registry helpers', () => {
  it('detects bare package names', () => {
    assert.strictEqual(isBarePackageName('linter'), true);
    assert.strictEqual(isBarePackageName('linter@3.4.0'), true);
    assert.strictEqual(isBarePackageName('@scope/pkg'), true);
    assert.strictEqual(isBarePackageName('./local'), false);
    assert.strictEqual(isBarePackageName('/abs/path'), false);
    assert.strictEqual(isBarePackageName('git+https://github.com/a/b'), false);
    assert.strictEqual(isBarePackageName('https://example.com/t.tgz'), false);
  });

  it('parses name@version', () => {
    assert.deepStrictEqual(parseNameVersion('linter@3.4.0'), {
      name: 'linter',
      version: '3.4.0'
    });
    assert.deepStrictEqual(parseNameVersion('@s/p@1.0.0'), {
      name: '@s/p',
      version: '1.0.0'
    });
    assert.deepStrictEqual(parseNameVersion('linter'), {
      name: 'linter',
      version: null
    });
  });

  it('normalizes search hits', () => {
    const hit = normalizeSearchHit({
      name: 'linter',
      downloads: '10',
      stargazers_count: 3,
      releases: { latest: '1.2.3' },
      metadata: { description: 'A linter', engines: { atom: '>=1.0' } }
    });
    assert.strictEqual(hit.name, 'linter');
    assert.strictEqual(hit.version, '1.2.3');
    assert.strictEqual(hit.downloads, 10);
    assert.strictEqual(hit.stars, 3);
    assert.strictEqual(hit.description, 'A linter');
  });

  it('default registry URL', () => {
    const prev = process.env.CPM_REGISTRY_URL;
    delete process.env.CPM_REGISTRY_URL;
    assert.strictEqual(getRegistryBaseUrl(), DEFAULT_REGISTRY_URL);
    process.env.CPM_REGISTRY_URL = 'https://example.test/reg/';
    assert.strictEqual(getRegistryBaseUrl(), 'https://example.test/reg');
    if (prev === undefined) delete process.env.CPM_REGISTRY_URL;
    else process.env.CPM_REGISTRY_URL = prev;
  });
});
