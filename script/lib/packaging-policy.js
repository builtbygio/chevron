'use strict';

/**
 * Stream D: packaging / startup-snapshot policy.
 * Custom V8 snapshot is attempted whenever the host can run mksnapshot.
 * Escape hatch: CHEVRON_SKIP_MKSNAPSHOT=1.
 */

const path = require('path');

const PACKAGER_MODULE = '@electron/packager';

const STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR = 43;

/**
 * Electron's host arch. Used to be require('@electron/get').getHostArch,
 * which only resolved because electron-packager 15 hoisted @electron/get.
 * @electron/packager 18 nests it, so resolve here.
 */
function getHostArch(env = process.env, nodeArch = process.arch) {
  const override = env.npm_config_arch || env.npm_config_target_arch;
  const arch = override || nodeArch;
  if (arch === 'arm') {
    const version =
      process.config &&
      process.config.variables &&
      String(process.config.variables.arm_version);
    return version === '6' ? 'armv6l' : 'armv7l';
  }
  return arch;
}

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
  // Frozen (architecture Q2 / H1 PR 12): Darwin stays stock. Do not staff
  // constructor-heap bisection. CI #125: eval-only + custom isolate cwd
  // still produces a valid pair (~17 MB blob / ~19 MB context) then
  // Chevron exits during smoke (ECONNREFUSED, empty renderer) on both
  // darwin-x64 and darwin-arm64. Linux and Windows boot.
  // CHEVRON_FORCE_MKSNAPSHOT=1 still retries.
  if (platform === 'darwin') {
    return { skip: true, reason: 'darwin-boot-crash' };
  }
  // linux-x64 generates a valid snapshot and boots, but spell-check fails to
  // activate in roughly half of CI smoke runs (PR #240: fail, fail, pass,
  // pass). Root cause not identified. The snapshot has been off on every
  // platform for all of 1.1.0 because the tree-view exclusion discarded it, so
  // gating here keeps shipped behaviour unchanged rather than trading a silent
  // build failure for an intermittent one. CHEVRON_FORCE_MKSNAPSHOT=1 still
  // retries; lift this once spell-check is understood and cold start measured.
  if (platform === 'linux') {
    return { skip: true, reason: 'linux-spell-check-flake' };
  }
  return { skip: false, reason: 'generate' };
}

function stockSnapshotNote(electronVersion, reason) {
  const why = {
    'env-skip': 'CHEVRON_SKIP_MKSNAPSHOT is set; unset it to retry.',
    'darwin-boot-crash':
      'Frozen on darwin: a valid snapshot pair still leaves the renderer ' +
      'empty at boot. CHEVRON_FORCE_MKSNAPSHOT=1 retries.',
    'linux-spell-check-flake':
      'Gated on linux: spell-check fails to activate in about half of smoke ' +
      'runs with a snapshot baked. CHEVRON_FORCE_MKSNAPSHOT=1 retries.',
    'host-unsupported': 'electron-mksnapshot does not run on this host.'
  }[reason];
  return (
    `Custom startup snapshot skipped on Electron ${electronVersion}. ` +
    "Using Electron's stock V8 snapshots. " +
    (why || 'CHEVRON_FORCE_MKSNAPSHOT=1 retries.')
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
    path.join('**', 'node_modules', '@vscode', 'ripgrep', 'bin', '**'),
    path.join('**', 'resources', 'atom.png'),
    path.join('**', 'resources', 'chevron.png'),
    path.join('**', 'resources', 'icons', '**'),
    // cpm installs catalog packages by copying a directory, and it is a
    // separate process: it cannot opendir inside the archive. Left packed,
    // clicking Install fails with
    //   ENOTDIR: not a directory, opendir '…/app.asar/catalog/chevron-lsp-c'
    path.join('**', 'catalog', '**')
  ];
}

function asarUnpackExpression() {
  return `{${asarUnpackGlobs().join(',')}}`;
}

module.exports = {
  STOCK_SNAPSHOT_MIN_ELECTRON_MAJOR,
  PACKAGER_MODULE,
  getHostArch,
  electronMajor,
  shouldSkipCustomSnapshot,
  stockSnapshotNote,
  isForeignPrebuildPath,
  asarUnpackGlobs,
  asarUnpackExpression
};
