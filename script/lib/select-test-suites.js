'use strict';

/**
 * Decide which Jasmine suites a `script/test` invocation runs.
 *
 * Pure and dependency-free on purpose: the CI unit job never installs
 * script/node_modules (colors, yargs, glob, …), so the selection logic lives
 * here where it can be tested without spawning script/test itself. The suite
 * *lists* are supplied as thunks and only materialised when selected, since
 * building the package list touches the filesystem.
 *
 * @param {object} options
 * @param {NodeJS.ProcessEnv} options.env
 * @param {string} options.platform  process.platform, or an override
 * @param {string} [options.arch]    process.arch
 * @param {object} [options.flags]   yargs booleans from script/test
 * @param {object} options.suites
 * @param {Function} options.suites.coreMain
 * @param {() => Function[]} options.suites.coreRender
 * @param {() => Function[]} options.suites.packages
 * @param {Function} [options.suites.benchmark]
 * @returns {Function[]} ordered, de-duplicated suites; throws when empty
 */
function selectTestSuites({ env, platform, arch, flags = {}, suites }) {
  const coreAll = env.ATOM_RUN_CORE_TESTS === 'true';
  let coreMain = env.ATOM_RUN_CORE_MAIN_TESTS === 'true' || Boolean(flags.coreMain);
  const coreRenderer =
    Boolean(flags.coreRenderer) || env.ATOM_RUN_CORE_RENDER_TESTS === 'true';
  const coreRenderer1 = env.ATOM_RUN_CORE_RENDER_TESTS === '1';
  const coreRenderer2 = env.ATOM_RUN_CORE_RENDER_TESTS === '2';
  const packageAll = Boolean(flags.package) || env.ATOM_RUN_PACKAGE_TESTS === 'true';
  const packages1 = env.ATOM_RUN_PACKAGE_TESTS === '1';
  const packages2 = env.ATOM_RUN_PACKAGE_TESTS === '2';
  const benchmark = Boolean(flags.coreBenchmark);

  // Operating system default.
  //
  // Historically a bare `script/test` on Linux (and win32 x86) ran the
  // main-process suite, because that is where CI ran it. Keep that default,
  // but only when the caller asked for nothing in particular: the CI package
  // shards set ATOM_RUN_CORE_TESTS=false precisely so they do *not* run it,
  // and forcing it here made every package shard run -- and fail on -- the
  // core main-process suite, while the `core` shard ran it as well.
  const explicitlyRequested =
    coreAll ||
    coreMain ||
    coreRenderer ||
    coreRenderer1 ||
    coreRenderer2 ||
    packageAll ||
    packages1 ||
    packages2 ||
    benchmark;
  coreMain =
    coreMain ||
    (!explicitlyRequested &&
      (platform === 'linux' || (platform === 'win32' && arch === 'x86')));

  // split package tests (used for macos in CI)
  const PACKAGES_TO_TEST_IN_PARALLEL = 23;
  // split core render test (used for windows x64 in CI)
  const CORE_RENDER_TO_TEST_IN_PARALLEL = 45;

  let selected = [];

  if (coreAll) {
    selected.push(suites.coreMain, ...suites.coreRender());
  } else {
    if (coreMain) selected.push(suites.coreMain);

    if (coreRenderer) {
      selected.push(...suites.coreRender());
    } else {
      if (coreRenderer1) {
        selected.push(...suites.coreRender().slice(0, CORE_RENDER_TO_TEST_IN_PARALLEL));
      }
      if (coreRenderer2) {
        selected.push(...suites.coreRender().slice(CORE_RENDER_TO_TEST_IN_PARALLEL));
      }
    }
  }

  if (packageAll) {
    selected.push(...suites.packages());
  } else {
    if (packages1) {
      selected.push(...suites.packages().slice(0, PACKAGES_TO_TEST_IN_PARALLEL));
    }
    if (packages2) {
      selected.push(...suites.packages().slice(PACKAGES_TO_TEST_IN_PARALLEL));
    }
  }

  if (benchmark && suites.benchmark) selected.push(suites.benchmark);

  if (flags.skipMainProcessTests) {
    selected = selected.filter(suite => suite !== suites.coreMain);
  }

  selected = Array.from(new Set(selected));

  if (selected.length === 0) {
    throw new Error('No tests was requested');
  }

  return selected;
}

module.exports = { selectTestSuites };
