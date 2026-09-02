'use strict';

/**
 * Locate a clangd that is already on the machine.
 *
 * PATH alone is close to sufficient on Linux and close to useless elsewhere:
 *
 *   macOS    Xcode and the command line tools carry clangd inside the
 *            toolchain, and Homebrew keeps llvm keg-only, so it is commonly
 *            installed and commonly not on PATH.
 *   Windows  nothing provides it by default, and an LLVM installer may or may
 *            not have added its bin directory to PATH.
 *
 * So PATH is tried first and well-known install locations after it. Only file
 * checks -- no spawning -- so this stays cheap and needs no privileged
 * requires.
 */

const fs = require('fs');
const path = require('path');

const EXE = process.platform === 'win32' ? 'clangd.exe' : 'clangd';

function isExecutableFile(candidate) {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') return true;
    return Boolean(stat.mode & 0o111);
  } catch (error) {
    return false;
  }
}

function fromPath() {
  const raw = process.env.PATH || '';
  for (const dir of raw.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, EXE);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

// Expanded lazily so a missing environment variable cannot throw.
function wellKnownDirectories() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (process.platform === 'darwin') {
    return [
      // Command line tools and a full Xcode, which do not put clangd on PATH.
      '/Library/Developer/CommandLineTools/usr/bin',
      '/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin',
      // Homebrew keeps llvm keg-only on both prefixes.
      '/opt/homebrew/opt/llvm/bin',
      '/usr/local/opt/llvm/bin',
      path.join(home, 'homebrew', 'opt', 'llvm', 'bin')
    ];
  }
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 =
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return [
      path.join(programFiles, 'LLVM', 'bin'),
      path.join(programFilesX86, 'LLVM', 'bin'),
      path.join(localAppData, 'Programs', 'LLVM', 'bin'),
      path.join(home, 'scoop', 'apps', 'llvm', 'current', 'bin')
    ];
  }
  return ['/usr/bin', '/usr/local/bin'];
}

// Debian and Fedora ship versioned directories; take the highest version
// rather than whichever the filesystem lists first.
function versionedLlvmDirectories() {
  if (process.platform === 'win32') return [];
  const roots = ['/usr/lib', '/usr/local/lib', '/opt'];
  const found = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const match = /^llvm-?(\d+)/.exec(entry);
      if (match) found.push({ dir: path.join(root, entry, 'bin'), version: Number(match[1]) });
    }
  }
  return found.sort((a, b) => b.version - a.version).map(entry => entry.dir);
}

function findClangd() {
  const onPath = fromPath();
  if (onPath) return { command: onPath, source: 'PATH' };

  for (const dir of wellKnownDirectories()) {
    const candidate = path.join(dir, EXE);
    if (isExecutableFile(candidate)) return { command: candidate, source: dir };
  }
  for (const dir of versionedLlvmDirectories()) {
    const candidate = path.join(dir, EXE);
    if (isExecutableFile(candidate)) return { command: candidate, source: dir };
  }
  return null;
}

module.exports = { findClangd, wellKnownDirectories, versionedLlvmDirectories };
