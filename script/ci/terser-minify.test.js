'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadTerser() {
  try {
    return require(require.resolve('terser', {
      paths: [path.join(ROOT, 'script')]
    }));
  } catch (error) {
    return null;
  }
}

describe('terser 5 snapshot minify', () => {
  it('minify_sync keeps function and class names', t => {
    const terser = loadTerser();
    if (!terser || typeof terser.minify_sync !== 'function') {
      return t.skip('script dependencies are not installed');
    }
    const result = terser.minify_sync(
      'function keepMe(){ return 1; } class KeepClass { method(){ return 2; } }',
      {
        keep_fnames: true,
        keep_classnames: true,
        compress: { keep_fargs: true, keep_infinity: true }
      }
    );
    assert.equal(result.error, undefined);
    assert.match(result.code, /keepMe/);
    assert.match(result.code, /KeepClass/);
  });
});
