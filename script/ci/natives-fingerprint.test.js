'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const natives = require(path.join(ROOT, 'script/lib/natives-fingerprint.js'));

describe('natives-fingerprint', () => {
  it('compute returns stable 40-char sha1', () => {
    const a = natives.compute();
    const b = natives.compute();
    assert.strictEqual(a, b);
    assert.match(a, /^[0-9a-f]{40}$/);
  });

  it('shouldSkipRebuild returns structured result', () => {
    const prev = process.env.CHEVRON_FORCE_NATIVE_REBUILD;
    try {
      delete process.env.CHEVRON_FORCE_NATIVE_REBUILD;
      const d = natives.shouldSkipRebuild();
      assert.strictEqual(typeof d.skip, 'boolean');
      assert.strictEqual(typeof d.reason, 'string');
      assert.match(d.fingerprint, /^[0-9a-f]{40}$/);
    } finally {
      if (prev === undefined) delete process.env.CHEVRON_FORCE_NATIVE_REBUILD;
      else process.env.CHEVRON_FORCE_NATIVE_REBUILD = prev;
    }
  });

  it('force env disables skip', () => {
    const prev = process.env.CHEVRON_FORCE_NATIVE_REBUILD;
    try {
      process.env.CHEVRON_FORCE_NATIVE_REBUILD = '1';
      const d = natives.shouldSkipRebuild();
      assert.strictEqual(d.skip, false);
      assert.match(d.reason, /CHEVRON_FORCE_NATIVE_REBUILD/);
    } finally {
      if (prev === undefined) delete process.env.CHEVRON_FORCE_NATIVE_REBUILD;
      else process.env.CHEVRON_FORCE_NATIVE_REBUILD = prev;
    }
  });
});
