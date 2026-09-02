'use strict';

/**
 * Compile-cache no longer claims Coffee/Babel compilers (H1 PR 11).
 * TypeScript and CSON stay. Run: node --test script/ci/legacy-transpile.test.js
 *
 * Does not require compile-cache.js (app deps). Grep the source.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('compile-cache after Coffee/Babel stub delete', () => {
  it('does not ship babel.js or coffee-script.js stubs', () => {
    assert.strictEqual(fs.existsSync(path.join(ROOT, 'src', 'babel.js')), false);
    assert.strictEqual(
      fs.existsSync(path.join(ROOT, 'src', 'coffee-script.js')),
      false
    );
  });

  it('compile-cache only wraps TypeScript, and knows nothing of CSON', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src', 'compile-cache.js'),
      'utf8'
    );
    assert.ok(src.includes("require('./typescript')"));
    assert.ok(src.includes("'.ts'"));
    assert.ok(src.includes("'.tsx'"));
    assert.ok(!src.includes("require('./babel')"));
    assert.ok(!src.includes("require('./coffee-script')"));
    assert.ok(!/\.coffee['"]/.test(src));
    assert.ok(!src.includes("'.cson'"), 'nothing in the repository is CSON');
    assert.ok(!src.includes("require('season')"), 'season is gone');
  });
});
