'use strict';

/**
 * electron-mksnapshot ships host-runnable tools only for:
 *   - macOS (x64 + arm64 native)
 *   - Linux/Windows x64 (including cross arch dirs like clang_x64_v8_arm64)
 *
 * On Linux/Windows arm*, download-mksnapshot.js exits with:
 *   "mksnapshot does not run on arm64"
 * and tells you to generate snapshots on an x64 machine instead.
 *
 * Native arm64 Linux CI therefore cannot produce custom Atom startup blobs;
 * we keep Electron's stock V8 snapshots (app boots normally, slightly slower).
 */
function hostCanRunMksnapshot(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') return true;
  if (typeof arch === 'string' && arch.indexOf('arm') === 0) return false;
  return true;
}

module.exports = { hostCanRunMksnapshot };
