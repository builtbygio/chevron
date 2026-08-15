'use strict';

/**
 * Which Workspace.scan implementation to use.
 *
 * Product default is ripgrep. Scandal stays one release as an escape:
 *   options.ripgrep === false
 *   or CHEVRON_SEARCH_ENGINE=scandal
 *
 * find-and-replace always passes ripgrep: config.get('useRipgrep').
 * Flipping only this helper would leave the panel on scandal.
 */

function resolveScanEngine(options = {}, env = process.env) {
  if (env && env.CHEVRON_SEARCH_ENGINE === 'scandal') return 'scandal';
  if (env && env.CHEVRON_SEARCH_ENGINE === 'ripgrep') return 'ripgrep';
  if (options && options.ripgrep === false) return 'scandal';
  return 'ripgrep';
}

let logged = false;

function logScanEngineOnce(engine, log = console.log) {
  if (logged) return;
  logged = true;
  log(`searcher=${engine}`);
}

function _resetLogForTests() {
  logged = false;
}

module.exports = {
  resolveScanEngine,
  logScanEngineOnce,
  _resetLogForTests
};
