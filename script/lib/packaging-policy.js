'use strict';

/**
 * Stream D: packaging / startup-snapshot policy.
 * Custom V8 snapshot is opt-in on Electron ≥43 (generator SIGTRAP).
 */

const STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR = 43;

function electronMajor(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} electronVersion
 * @param {{ force?: boolean, hostCanRun?: boolean }} [opts]
 */
function shouldSkipCustomSnapshot(electronVersion, opts = {}) {
  if (opts.hostCanRun === false) return { skip: true, reason: 'host-unsupported' };
  if (opts.force) return { skip: false, reason: 'forced' };
  const major = electronMajor(electronVersion);
  if (major != null && major >= STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR) {
    return { skip: true, reason: 'electron-43-stock-default' };
  }
  return { skip: false, reason: 'generate' };
}

function stockSnapshotNote(electronVersion) {
  return (
    `Custom startup snapshot skipped on Electron ${electronVersion} ` +
    '(V8 context snapshot generator is incompatible with this app blob). ' +
    "Using Electron's stock V8 snapshots. Set CHEVRON_FORCE_MKSNAPSHOT=1 to retry."
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

module.exports = {
  STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR,
  electronMajor,
  shouldSkipCustomSnapshot,
  stockSnapshotNote,
  isForeignPrebuildPath
};
