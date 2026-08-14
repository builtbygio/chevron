'use strict';

/**
 * vscode-ripgrep's postinstall downloads bin/rg. App npm install uses
 * --ignore-scripts, so find-in-project gets ENOENT under app.asar.unpacked
 * unless we fetch the binary explicitly.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

function rgBinName(platform = process.platform) {
  return platform === 'win32' ? 'rg.exe' : 'rg';
}

function rgBinPath(pkgDir, platform = process.platform) {
  return path.join(pkgDir, 'bin', rgBinName(platform));
}

function ensureRipgrepAt(pkgDir) {
  if (!pkgDir || !fs.existsSync(pkgDir)) return null;
  const binPath = rgBinPath(pkgDir);
  if (fs.existsSync(binPath)) {
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(binPath, 0o755);
      } catch (_) {
        /* ignore */
      }
    }
    return binPath;
  }

  const postinstall = path.join(pkgDir, 'lib', 'postinstall.js');
  if (!fs.existsSync(postinstall)) {
    throw new Error(`vscode-ripgrep postinstall missing at ${postinstall}`);
  }

  console.log(`Downloading ripgrep into ${pkgDir}…`);
  execFileSync(process.execPath, [postinstall], {
    cwd: pkgDir,
    stdio: 'inherit',
    env: process.env
  });

  if (!fs.existsSync(binPath)) {
    throw new Error(`ripgrep download finished but ${binPath} is missing`);
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(binPath, 0o755);
  }
  return binPath;
}

function ensureRipgrep() {
  const dirs = [
    path.join(CONFIG.repositoryRootPath, 'node_modules', 'vscode-ripgrep'),
    path.join(CONFIG.intermediateAppPath, 'node_modules', 'vscode-ripgrep')
  ];
  let last = null;
  for (const dir of dirs) {
    const found = ensureRipgrepAt(dir);
    if (found) last = found;
  }
  if (!last) {
    throw new Error(
      'vscode-ripgrep is not installed; run script/bootstrap-modern'
    );
  }
  return last;
}

module.exports = {
  rgBinName,
  rgBinPath,
  ensureRipgrepAt,
  ensureRipgrep
};

if (require.main === module) {
  try {
    const dest = ensureRipgrep();
    console.log(`ripgrep ready: ${dest}`);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
