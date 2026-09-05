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
 * Uses `--dry-run`, which needs no packaged build.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const TEST_SCRIPT = path.join(__dirname, '..', 'test');

function suitesFor(env, extraArgs = []) {
  const out = execFileSync(
    process.execPath,
    [TEST_SCRIPT, '--dry-run', '--platform', 'linux', ...extraArgs],
    {
      encoding: 'utf8',
      env: Object.assign({}, process.env, env),
      cwd: path.join(__dirname, '..', '..')
    }
  );
  return out
    .split('\n')
    .filter(line => line.startsWith('  '))
    .map(line => line.trim());
}

describe('script/test suite selection on linux', () => {
  it('a package shard runs package suites only, never core-main-process', () => {
    const suites = suitesFor({
      ATOM_RUN_CORE_TESTS: 'false',
      ATOM_RUN_PACKAGE_TESTS: 'true',
      ATOM_PACKAGES_TO_TEST: 'about,git-diff'
    });
    assert.ok(suites.length > 0, 'expected at least one package suite');
    assert.ok(
      !suites.includes('core-main-process'),
      `package shard must not run the core suite, got: ${suites.join(', ')}`
    );
    assert.ok(suites.every(s => s.startsWith('package ')), suites.join(', '));
  });

  it('the core shard still runs core-main-process and the render suites', () => {
    const suites = suitesFor({
      ATOM_RUN_CORE_TESTS: 'true',
      ATOM_RUN_PACKAGE_TESTS: 'false'
    });
    assert.ok(
      suites.includes('core-main-process'),
      'core shard lost the main-process suite'
    );
    assert.ok(
      suites.some(s => s.startsWith('core-render ')),
      'core shard lost the render suites'
    );
    assert.ok(
      !suites.some(s => s.startsWith('package ')),
      'core shard should not run package suites'
    );
  });

  it('a bare invocation on linux keeps the historical main-process default', () => {
    const suites = suitesFor({
      ATOM_RUN_CORE_TESTS: '',
      ATOM_RUN_PACKAGE_TESTS: '',
      ATOM_PACKAGES_TO_TEST: ''
    });
    assert.deepStrictEqual(suites, ['core-main-process']);
  });

  it('a shard with nothing to run fails loudly instead of running core', () => {
    // Before the fix an empty package shard quietly fell back to the core
    // main-process suite and reported its failure as a package-shard failure.
    // Now it refuses outright, which is what makes an empty shard visible.
    let threw = null;
    try {
      suitesFor({
        ATOM_RUN_CORE_TESTS: 'false',
        ATOM_RUN_PACKAGE_TESTS: 'true',
        ATOM_PACKAGES_TO_TEST: 'no-such-package-exists'
      });
    } catch (error) {
      threw = error;
    }
    assert.ok(threw, 'expected an empty shard to fail');
    const output = String(threw.stderr || '') + String(threw.message || '');
    assert.match(output, /No tests was requested/);
    assert.ok(
      !output.includes('core-main-process'),
      'an empty shard must not fall back to the core suite'
    );
  });
});
