'use strict';

/**
 * Workspace.scan is ripgrep only (architecture H1 PR 4).
 * CHEVRON_SEARCH_ENGINE=scandal and options.ripgrep === false
 * are no longer honored.
 */

function resolveScanEngine(_options = {}, _env = process.env) {
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
