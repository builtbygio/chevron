'use strict';

/**
 * Which suites a `script/test` invocation selects.
 *
 * The nightly ran the core main-process suite on all nine shards, because an
 * OS override forced it on Linux regardless of ATOM_RUN_CORE_TESTS. The three
 * shards with no testable packages therefore ran only that suite, failed on
 * it, and reported a package-shard failure that had nothing to do with
 * packages. Selection is pure decision-making, so it is worth pinning here
 * rather than discovering it in a two-hour nightly.
 *
 * Exercises script/lib/select-test-suites.js directly. The CI unit job never
 * installs script/node_modules, so spawning script/test itself is not an
 * option here -- that is why the selection logic lives in its own module.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { selectTestSuites } = require('../../script/lib/select-test-suites');

const coreMain = () => {};
coreMain.suiteName = 'core-main-process';
const render = ['a', 'b', 'c'].map(n => {
  const f = () => {};
  f.suiteName = `core-render ${n}`;
  return f;
});
const packages = ['about', 'git-diff'].map(n => {
  const f = () => {};
  f.suiteName = `package ${n}`;
  return f;
});
const benchmark = () => {};
benchmark.suiteName = 'benchmark';

function select(env, { platform = 'linux', flags = {}, pkgs = packages } = {}) {
  return selectTestSuites({
    env,
    platform,
    arch: 'x64',
    flags,
    suites: {
      coreMain,
      coreRender: () => render,
      packages: () => pkgs,
      benchmark
    }
  }).map(s => s.suiteName);
}

describe('script/test suite selection on linux', () => {
  it('a package shard runs package suites only, never core-main-process', () => {
    const suites = select({
      ATOM_RUN_CORE_TESTS: 'false',
      ATOM_RUN_PACKAGE_TESTS: 'true'
    });
    assert.deepStrictEqual(suites, ['package about', 'package git-diff']);
  });

  it('the core shard still runs core-main-process and the render suites', () => {
    const suites = select({
      ATOM_RUN_CORE_TESTS: 'true',
      ATOM_RUN_PACKAGE_TESTS: 'false'
    });
    assert.deepStrictEqual(suites, [
      'core-main-process',
      'core-render a',
      'core-render b',
      'core-render c'
    ]);
  });

  it('a bare invocation on linux keeps the historical main-process default', () => {
    assert.deepStrictEqual(select({}), ['core-main-process']);
  });

  it('a bare invocation on darwin selects nothing and fails loudly', () => {
    assert.throws(() => select({}, { platform: 'darwin' }), /No tests was requested/);
  });

  it('a shard with nothing to run fails loudly instead of running core', () => {
    // Before the fix an empty package shard quietly fell back to the core
    // main-process suite and reported its failure as a package-shard failure.
    assert.throws(
      () =>
        select(
          { ATOM_RUN_CORE_TESTS: 'false', ATOM_RUN_PACKAGE_TESTS: 'true' },
          { pkgs: [] }
        ),
      /No tests was requested/
    );
  });

  it('--skip-main removes core-main-process from a bare linux run', () => {
    assert.throws(
      () => select({}, { flags: { skipMainProcessTests: true } }),
      /No tests was requested/
    );
  });

  it('explicit main-process request is honoured on any platform', () => {
    const suites = select(
      { ATOM_RUN_CORE_MAIN_TESTS: 'true' },
      { platform: 'darwin' }
    );
    assert.deepStrictEqual(suites, ['core-main-process']);
  });
});

describe('core render shards partition the core suites', () => {
  const fs = require('fs');
  const path = require('path');

  const suites = {
    coreMain: 'MAIN',
    coreRender: () => Array.from({ length: 73 }, (_, i) => `render-${i + 1}`),
    packages: () => ['pkg']
  };
  const select = env =>
    selectTestSuites({ env, platform: 'linux', arch: 'x64', suites });

  it('gives every core suite to exactly one shard', () => {
    const main = select({
      ATOM_RUN_CORE_MAIN_TESTS: 'true',
      ATOM_RUN_CORE_RENDER_TESTS: 'false',
      ATOM_RUN_PACKAGE_TESTS: 'false'
    });
    const first = select({
      ATOM_RUN_CORE_MAIN_TESTS: 'false',
      ATOM_RUN_CORE_RENDER_TESTS: '1',
      ATOM_RUN_PACKAGE_TESTS: 'false'
    });
    const second = select({
      ATOM_RUN_CORE_MAIN_TESTS: 'false',
      ATOM_RUN_CORE_RENDER_TESTS: '2',
      ATOM_RUN_PACKAGE_TESTS: 'false'
    });

    assert.deepEqual(main, ['MAIN']);
    assert.equal(first.filter(s => second.includes(s)).length, 0, 'no overlap');
    assert.equal(
      new Set([...first, ...second]).size,
      suites.coreRender().length,
      'every renderer suite is covered'
    );
    assert.ok(first.length > 0 && second.length > 0);
  });

  it('does not run the full suite from ci.yml', () => {
    // The unsharded opt-in step never fit a job's time limit, and lacked
    // the spec window and CJK font the render specs need. The sharded
    // workflow is gone too; script/test is a local run.
    const ci = fs.readFileSync(
      path.join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'),
      'utf8'
    );
    assert.doesNotMatch(ci, /\.\/script\/test\b/);
    assert.doesNotMatch(ci, /run_full_core_tests/);
    assert.doesNotMatch(ci, /jasmine\.yml/);
  });
});
