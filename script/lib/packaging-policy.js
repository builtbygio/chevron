'use strict';

/**
 * Stream D: packaging / startup-snapshot policy.
 * Custom V8 snapshot is attempted whenever the host can run mksnapshot.
 * Escape hatch: CHEVRON_SKIP_MKSNAPSHOT=1.
 */

const path = require('path');

const PACKAGER_MODULE = '@electron/packager';

const STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR = 43;

function electronMajor(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} electronVersion
 * @param {{ force?: boolean, skip?: boolean, hostCanRun?: boolean }} [opts]
 */
function shouldSkipCustomSnapshot(electronVersion, opts = {}) {
  if (opts.hostCanRun === false) return { skip: true, reason: 'host-unsupported' };
  if (opts.skip && !opts.force) return { skip: true, reason: 'env-skip' };
  if (opts.force) return { skip: false, reason: 'forced' };
  const platform = opts.platform || process.platform;
  // CI #125: eval-only + custom isolate cwd still produces a valid pair
  // (~17 MB blob / ~19 MB context) then Chevron exits during smoke
  // (ECONNREFUSED, empty renderer) on both darwin-x64 and darwin-arm64.
  // Linux and Windows boot. Keep stock on Darwin.
  if (platform === 'darwin') {
    return { skip: true, reason: 'darwin-boot-crash' };
  }
  return { skip: false, reason: 'generate' };
}

function stockSnapshotNote(electronVersion) {
  return (
    `Custom startup snapshot skipped on Electron ${electronVersion}. ` +
    "Using Electron's stock V8 snapshots. Unset CHEVRON_SKIP_MKSNAPSHOT to retry."
  );
}

/**
 * Official tree-sitter-* (prebuildify) ships prebuilds/<platform>-<arch>[suffix]/.
 * Keep the host tag (and libc/napi suffixes like linux-x64-gnu); drop the rest
 * so RPM brp-strip is not asked to process foreign ELF.
 */
function isForeignPrebuildPath(
  filePath,
  platform = process.platform,
  arch = process.arch
) {
  if (!filePath) return false;
  const normalized = String(filePath).replace(/\\/g, '/');
  const match = normalized.match(/\/prebuilds\/([^/]+)/i);
  if (!match) return false;
  const host = `${platform}-${arch}`;
  return !match[1].startsWith(host);
}

/**
 * Files that must live on the real filesystem (not only inside app.asar).
 * Keep this list identical across the packager swap so rollback is a dep bump.
 */
function asarUnpackGlobs() {
  return [
    '*.node',
    'ctags-config',
    'ctags-darwin',
    'ctags-linux',
    'ctags-win32.exe',
    path.join('**', 'node_modules', 'spellchecker', '**'),
    path.join('**', 'node_modules', 'dugite', 'git', '**'),
    path.join('**', 'node_modules', 'github', 'bin', '**'),
    path.join('**', 'node_modules', 'github', 'lib', '**'),
    path.join('**', 'src', 'main-process', 'workers', '**'),
    path.join('**', 'node_modules', 'dugite', '**'),
    path.join('**', 'node_modules', 'vscode-ripgrep', 'bin', '**'),
    path.join('**', 'resources', 'atom.png'),
    path.join('**', 'resources', 'chevron.png'),
    path.join('**', 'resources', 'icons', '**')
  ];
}

function asarUnpackExpression() {
  return `{${asarUnpackGlobs().join(',')}}`;
}

module.exports = {
  STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR,
  PACKAGER_MODULE,
  electronMajor,
  shouldSkipCustomSnapshot,
  stockSnapshotNote,
  isForeignPrebuildPath,
  asarUnpackGlobs,
  asarUnpackExpression
};
