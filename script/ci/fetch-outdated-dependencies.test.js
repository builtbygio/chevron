'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const {
  apm
} = require(path.join(
  __dirname,
  '..',
  'lib',
  'update-dependency',
  'fetch-outdated-dependencies'
));

describe('dependency update registry check', () => {
  it('reads package metadata with global fetch', async () => {
    const original = global.fetch;
    const seen = [];
    global.fetch = async url => {
      seen.push(String(url));
      return {
        json: async () => ({ name: 'about', releases: { latest: '2.0.0' } })
      };
    };
    try {
      const result = await apm({
        dependencies: { about: 'https://example.com/about' },
        packageDependencies: { about: '1.0.0' }
      });
      assert.deepEqual(seen, ['https://atom.io/api/packages/about']);
      assert.equal(result.length, 1);
      assert.equal(result[0].moduleName, 'about');
      assert.equal(result[0].latest, '2.0.0');
      assert.equal(result[0].installed, '1.0.0');
    } finally {
      global.fetch = original;
    }
  });
});
