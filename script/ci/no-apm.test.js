'use strict';

/**
 * H3 PR 23 — getApmPath() resolves cpm.
 * Run: node --test script/ci/no-apm.test.js
 *
 * The method keeps its name: it is public API that packages call, and
 * settings-view spawns it to list installed packages. What it resolves to is
 * the only part with live behaviour behind it, so it is the only part guarded
 * here. The rest of retiring apm was a one-time removal; asserting a deletion
 * stays deleted is ceremony, not coverage.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('getApmPath (PR 23)', () => {
  it('resolves cpm and has no dangling identifiers', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/package-manager.js'),
      'utf8'
    );
    const fn = src.slice(
      src.indexOf('getApmPath()'),
      src.indexOf('getPackageDirPaths')
    );
    assert.match(fn, /cpmBin/);
    // `commandName` was only defined for the apm spelling; referencing it
    // after the shim lookup was removed threw at runtime.
    assert.ok(!/commandName/.test(fn), 'dangling commandName reference');
    assert.ok(!/'apm'|apm\.cmd/.test(fn), 'still resolving an apm binary');
  });
});
