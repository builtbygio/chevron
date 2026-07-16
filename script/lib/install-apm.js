'use strict';

const childProcess = require('child_process');

const CONFIG = require('../config');

/**
 * Install atom-package-manager under apm/.
 *
 * @param {boolean} ci - use `npm ci` when true
 * @param {{ignoreScripts?: boolean}} [options]
 *   ignoreScripts: skip lifecycle scripts (oniguruma node-gyp). Required on
 *   modern host Node/Python; bootstrap-modern rebuilds natives under apm's
 *   bundled Node 12 after install.
 */
module.exports = function(ci, options) {
  options = options || {};
  if (ci) {
    // Tell apm not to dedupe its own dependencies during its
    // postinstall script. (Deduping during `npm ci` runs is broken.)
    process.env.NO_APM_DEDUPE = 'true';
  }
  console.log(
    options.ignoreScripts
      ? 'Installing apm (ignore-scripts; natives rebuilt later)'
      : 'Installing apm'
  );
  const args = ['--global-style', '--loglevel=error'];
  if (options.ignoreScripts) {
    // CLI flag is more reliable than npm_config_* alone under nested npm 6.
    args.push('--ignore-scripts');
  }
  args.push(ci ? 'ci' : 'install');
  childProcess.execFileSync(CONFIG.getLocalNpmBinPath(), args, {
    env: process.env,
    cwd: CONFIG.apmRootPath
  });
};
