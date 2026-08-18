'use strict';

/**
 * H3 PR 23 — the apm shim is retired.
 * Run: node --test script/ci/no-apm.test.js
 *
 * getApmPath() keeps its name: it is public API that packages call
 * (settings-view spawns it to list installed packages). What it resolves to
 * is cpm.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('apm shim retired (PR 23)', () => {
  it('cpm ships only the cpm bin', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'cpm/bin/apm')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'cpm/bin/apm.cmd')));
    const pkg = JSON.parse(read('cpm/package.json'));
    assert.deepStrictEqual(Object.keys(pkg.bin), ['cpm']);
  });

  it('no packaging step creates an apm name', () => {
    for (const f of [
      'script/lib/create-debian-package.js',
      'script/lib/create-rpm-package.js',
      'script/lib/install-application.js'
    ]) {
      const src = read(f);
      assert.ok(
        !/apmExecutableName/.test(src),
        `${f} still creates an apm executable name`
      );
    }
  });

  it('no legacy app/apm launcher shims are written', () => {
    const src = read('script/lib/package-application.js');
    assert.ok(!/legacyApmBin|legacyApmTop/.test(src));
    assert.ok(!/'apm\.cmd'/.test(src), 'win apm launcher still packaged');
  });

  it('getApmPath resolves cpm and has no dangling identifiers', () => {
    const src = read('src/package-manager.js');
    const fn = src.slice(src.indexOf('getApmPath()'), src.indexOf('getPackageDirPaths'));
    assert.match(fn, /cpmBin/);
    // `commandName` was only defined for the apm spelling; referencing it
    // after the shim lookup was removed would throw at runtime.
    assert.ok(!/commandName/.test(fn), 'dangling commandName reference');
    assert.ok(!/'apm'|apm\.cmd/.test(fn), 'still resolving an apm binary');
  });
});
