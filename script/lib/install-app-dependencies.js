'use strict';

/**
 * Install root application dependencies with **host npm** (Phase 0).
 * Replaces `runApmInstall(repositoryRoot)` for app node_modules.
 *
 * - Uses package-lock.json (lockfileVersion 2/3) via `npm ci` in CI.
 * - Always --ignore-scripts so Electron natives are rebuilt by bootstrap-modern
 *   (patches + modern node-gyp), not random registry postinstalls.
 * - --legacy-peer-deps: Atom-era tree still has peer skew; match Phase 0 spike.
 */

const CONFIG = require('../config');
const execFileSync = require('./exec-file-sync');

module.exports = function installAppDependencies(ci, options) {
  options = options || {};
  const ignoreScripts = options.ignoreScripts !== false;
  const legacyPeerDeps = options.legacyPeerDeps !== false;

  const args = [
    '--loglevel=error',
    '--no-fund',
    '--no-audit',
    '--no-update-notifier'
  ];
  if (ignoreScripts) args.push('--ignore-scripts');
  if (legacyPeerDeps) args.push('--legacy-peer-deps');
  args.push(ci ? 'ci' : 'install');

  console.log(
    ci
      ? 'Installing application dependencies (host npm ci)…'
      : 'Installing application dependencies (host npm install)…'
  );

  const env = Object.assign({}, process.env, {
    npm_config_loglevel: process.env.npm_config_loglevel || 'error',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_update_notifier: 'false'
  });

  execFileSync(CONFIG.getNpmBinPath(false), args, {
    env,
    cwd: CONFIG.repositoryRootPath,
    stdio: 'inherit'
  });
};
