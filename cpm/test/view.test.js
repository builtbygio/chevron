'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const { packageForView } = require('../lib/commands/view');

describe('cpm view packageForView', () => {
  const sample = {
    name: 'demo-pack',
    description: 'Demo',
    downloads: 9,
    stars: 2,
    repository: { url: 'https://github.com/example/demo-pack' },
    releases: { latest: '2.0.0' },
    metadata: {
      name: 'demo-pack',
      version: '2.0.0',
      description: 'Demo',
      engines: { atom: '>=1.50.0' }
    },
    versions: {
      '2.0.0': {
        name: 'demo-pack',
        version: '2.0.0',
        description: 'Demo',
        engines: { atom: '>=1.50.0' }
      },
      '1.0.0': {
        name: 'demo-pack',
        version: '1.0.0',
        description: 'Demo old',
        engines: { atom: '>=1.0.0 <1.40.0' }
      }
    }
  };

  it('flattens latest with top-level version for settings-view', () => {
    const pack = packageForView(sample, null);
    assert.strictEqual(pack.name, 'demo-pack');
    assert.strictEqual(pack.version, '2.0.0');
    assert.strictEqual(pack.description, 'Demo');
    assert.ok(pack.engines && pack.engines.atom);
  });

  it('picks newest engines.atom match for --compatible', () => {
    const pack = packageForView(sample, '1.30.0');
    assert.strictEqual(pack.version, '1.0.0');
  });

  it('returns null version when nothing is compatible', () => {
    const pack = packageForView(sample, '0.100.0');
    assert.strictEqual(pack.name, 'demo-pack');
    assert.strictEqual(pack.version, null);
  });

  it('accepts product versions with prerelease suffix', () => {
    const pack = packageForView(sample, '1.60.0-beta0');
    assert.strictEqual(pack.version, '2.0.0');
  });
});
