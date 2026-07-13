'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');

// Marker used so we can restore package-local .npmrc after install.
const IGNORE_SCRIPTS_MARKER = '# atom-nova-temp-ignore-scripts';

/**
 * Run `apm install` (or `apm ci`) in packagePath.
 *
 * @param {string} packagePath
 * @param {boolean} [ci]
 * @param {string|string[]} [stdioOptions]
 * @param {{ignoreScripts?: boolean}} [options]
 *   ignoreScripts: skip package install scripts (needed so nested unpatched
 *   native addons like superstring are not rebuilt against Electron headers
 *   without AtomNova patches). Prefer package-local .npmrc over env alone —
 *   apm's bundled npm does not always honor npm_config_ignore_scripts.
 */
module.exports = function(packagePath, ci, stdioOptions, options) {
  options = options || {};
  const installEnv = Object.assign({}, process.env);
  // Set resource path so that apm can load metadata related to Atom.
  installEnv.ATOM_RESOURCE_PATH = CONFIG.repositoryRootPath;

  if (options.ignoreScripts) {
    installEnv.npm_config_ignore_scripts = 'true';
  }

  let npmrcPath = null;
  let npmrcPrevious = null;
  let npmrcCreated = false;

  if (options.ignoreScripts) {
    npmrcPath = path.join(packagePath, '.npmrc');
    if (fs.existsSync(npmrcPath)) {
      npmrcPrevious = fs.readFileSync(npmrcPath, 'utf8');
      // Avoid stacking markers on retry
      if (!npmrcPrevious.includes(IGNORE_SCRIPTS_MARKER)) {
        fs.appendFileSync(
          npmrcPath,
          `\n${IGNORE_SCRIPTS_MARKER}\nignore-scripts=true\n`
        );
      }
    } else {
      npmrcCreated = true;
      fs.writeFileSync(
        npmrcPath,
        `${IGNORE_SCRIPTS_MARKER}\nignore-scripts=true\n`
      );
    }
  }

  try {
    childProcess.execFileSync(CONFIG.getApmBinPath(), [ci ? 'ci' : 'install'], {
      env: installEnv,
      cwd: packagePath,
      stdio: stdioOptions || 'inherit'
    });
  } finally {
    if (npmrcPath) {
      try {
        if (npmrcCreated) {
          fs.unlinkSync(npmrcPath);
        } else if (npmrcPrevious !== null) {
          fs.writeFileSync(npmrcPath, npmrcPrevious);
        }
      } catch (e) {
        // best-effort restore
      }
    }
  }
};
