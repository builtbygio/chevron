'use strict';

/**
 * Install root application dependencies with **pnpm** (workspace cutover).
 * Replaces `runApmInstall(repositoryRoot)` / host `npm ci` for app node_modules.
 *
 * - Uses pnpm-lock.yaml via `pnpm install --frozen-lockfile` in CI.
 * - Always --ignore-scripts so Electron natives are rebuilt by bootstrap-modern
 *   (patches + modern node-gyp), not random registry postinstalls.
 * - Peer skew is handled by `.npmrc` (`strict-peer-dependencies=false`,
 *   plus `legacy-peer-deps=true` for the remaining npm trees in script/ and cpm).
 */

const CONFIG = require('../config');
const execFileSync = require('./exec-file-sync');

module.exports = function installAppDependencies(ci, options) {
  options = options || {};
  const ignoreScripts = options.ignoreScripts !== false;

  // Keep default loglevel so deprecations and peer warnings stay visible
  // (fix or track them — do not hide with --loglevel=error).
  const args = ['install'];
  if (ignoreScripts) args.push('--ignore-scripts');
  if (ci) args.push('--frozen-lockfile');

  console.log(
    ci
      ? 'Installing application dependencies (pnpm install --frozen-lockfile)…'
      : 'Installing application dependencies (pnpm install)…'
  );

  execFileSync(CONFIG.getPnpmBinPath(), args, {
    env: process.env,
    cwd: CONFIG.repositoryRootPath,
    stdio: 'inherit'
  });
};
