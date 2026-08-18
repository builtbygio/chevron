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

  it('the rpm spec template has no apm placeholder', () => {
    // create-rpm-package stopped passing apmFileName; a leftover
    // <%= apmFileName %> makes lodash.template throw and fails the whole
    // deb/rpm packaging step. Caught exactly that way on CI.
    const spec = read('resources/linux/redhat/atom.spec.in');
    assert.ok(!/apmFileName/.test(spec), 'spec still references apmFileName');
    assert.ok(!/\bapm\b/.test(spec), 'spec still installs an apm binary');
  });

  it('template placeholders all have data passed to them', () => {
    const spec = read('resources/linux/redhat/atom.spec.in');
    const used = new Set([...spec.matchAll(/<%=\s*(\w+)\s*%>/g)].map(m => m[1]));
    const src = read('script/lib/create-rpm-package.js');
    // Keys appear as `name: value`, `name,` or bare shorthand on the last
    // entry with no trailing comma — the last form is what tripped this test
    // when it was first written.
    const provided = new Set(
      [...src.matchAll(/^\s*(\w+)\s*(?::|,|$)/gm)].map(m => m[1])
    );
    const missing = [...used].filter(k => !provided.has(k));
    assert.deepStrictEqual(missing, [], `spec placeholders with no data: ${missing}`);
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
