'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('assert');
const path = require('path');
const {
  getPackageHome,
  getPackagesDirectory,
  getElectronVersion
} = require('../lib/paths');
const { checkEngines } = require('../lib/engines');

describe('cpm paths', () => {
  const prevChevron = process.env.CHEVRON_HOME;
  const prevAtom = process.env.ATOM_HOME;

  afterEach(() => {
    if (prevChevron === undefined) delete process.env.CHEVRON_HOME;
    else process.env.CHEVRON_HOME = prevChevron;
    if (prevAtom === undefined) delete process.env.ATOM_HOME;
    else process.env.ATOM_HOME = prevAtom;
  });

  it('prefers CHEVRON_HOME', () => {
    process.env.CHEVRON_HOME = '/tmp/chevron-home-test';
    process.env.ATOM_HOME = '/tmp/atom-home-test';
    assert.strictEqual(getPackageHome(), '/tmp/chevron-home-test');
    assert.strictEqual(
      getPackagesDirectory(),
      path.join('/tmp/chevron-home-test', 'packages')
    );
  });

  it('falls back to ATOM_HOME', () => {
    delete process.env.CHEVRON_HOME;
    process.env.ATOM_HOME = '/tmp/atom-home-test';
    assert.strictEqual(getPackageHome(), '/tmp/atom-home-test');
  });

  it('reads electronVersion from monorepo package.json when not in Electron', () => {
    const v = getElectronVersion();
    assert.ok(v, 'expected electronVersion');
    assert.match(String(v), /^\d+\.\d+/);
  });
});

describe('cpm engines', () => {
  it('warns but allows engines.atom mismatch unless strict', () => {
    const r = checkEngines(
      { engines: { atom: '>=99.0.0' } },
      '0.3.0',
      { strict: false }
    );
    assert.strictEqual(r.ok, true);
    assert.ok(r.warnings.length >= 1);
  });

  it('fails engines.atom mismatch when strict', () => {
    const r = checkEngines(
      { engines: { atom: '>=99.0.0' } },
      '0.3.0',
      { strict: true }
    );
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.length >= 1);
  });
});
