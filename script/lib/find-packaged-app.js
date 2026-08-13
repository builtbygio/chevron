'use strict';

/**
 * Locate the packaged Chevron (or legacy Atom) binary under out/.
 * Used by script/test — packager layout is Chevron-linux-<arch>/chevron,
 * Chevron.app, or "Chevron x64/chevron.exe", not atom-* / atom.exe.
 */

const fs = require('fs');
const path = require('path');

function existsFile(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch (error) {
    return false;
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

function listDirs(dir, predicate) {
  try {
    return fs
      .readdirSync(dir)
      .map(name => path.join(dir, name))
      .filter(p => {
        try {
          return fs.statSync(p).isDirectory() && (!predicate || predicate(p));
        } catch (error) {
          return false;
        }
      });
  } catch (error) {
    return [];
  }
}

function findLinuxExecutable(outDir, arch, executableName) {
  const exe = executableName || 'chevron';
  const preferred = firstExisting([
    path.join(outDir, `Chevron-linux-${arch}`, exe),
    path.join(outDir, `chevron-linux-${arch}`, exe)
  ]);
  if (preferred) return preferred;

  const dirs = listDirs(outDir, p => /^(Chevron|chevron)-linux-/i.test(path.basename(p)));
  const hits = [];
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    if (existsFile(candidate)) hits.push(candidate);
  }
  const archHit = hits.find(p => p.includes(`linux-${arch}`));
  if (archHit) return archHit;
  if (hits.length === 1) return hits[0];

  const atom = firstExisting([
    path.join(outDir, `atom-linux-${arch}`, 'atom'),
    path.join(outDir, `atom-${arch}`, 'atom')
  ]);
  if (atom) return atom;

  const atomDirs = listDirs(outDir, p => /^atom-/i.test(path.basename(p)));
  for (const dir of atomDirs) {
    const candidate = path.join(dir, 'atom');
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

function findDarwinExecutable(outDir, appName) {
  const name = appName || 'Chevron';
  const preferredApp = path.join(outDir, `${name}.app`);
  const preferredBin = path.join(preferredApp, 'Contents', 'MacOS', name);
  if (existsFile(preferredBin)) return preferredBin;

  const apps = listDirs(outDir, p => /\.app$/i.test(p));
  apps.sort((a, b) => {
    const score = p => (/^Chevron/i.test(path.basename(p)) ? 0 : 1);
    return score(a) - score(b);
  });
  for (const app of apps) {
    const base = path.basename(app, '.app');
    const bin = path.join(app, 'Contents', 'MacOS', base);
    if (existsFile(bin)) return bin;
  }
  return null;
}

function findWin32Executable(outDir, arch, executableName) {
  const exe = executableName || 'chevron.exe';
  const preferred = firstExisting([
    path.join(outDir, `Chevron ${arch}`, exe),
    path.join(outDir, 'Chevron', exe),
    path.join(outDir, exe)
  ]);
  if (preferred) return preferred;

  const dirs = listDirs(outDir, p => /chevron/i.test(path.basename(p)));
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    if (existsFile(candidate)) return candidate;
  }

  const atomExe = firstExisting([
    path.join(outDir, `Atom ${arch}`, 'atom.exe'),
    path.join(outDir, 'Atom', 'atom.exe')
  ]);
  if (atomExe) return atomExe;

  const atomDirs = listDirs(outDir, p => /^atom/i.test(path.basename(p)));
  for (const dir of atomDirs) {
    const candidate = path.join(dir, 'atom.exe');
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

function findPackagedApp(options = {}) {
  const outDir = options.outDir;
  if (!outDir) return null;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const executableName = options.executableName;
  const appName = options.appName;

  if (platform === 'linux') {
    return findLinuxExecutable(outDir, arch, executableName || 'chevron');
  }
  if (platform === 'darwin') {
    return findDarwinExecutable(outDir, appName || 'Chevron');
  }
  if (platform === 'win32') {
    return findWin32Executable(outDir, arch, executableName || 'chevron.exe');
  }
  return null;
}

module.exports = {
  findPackagedApp,
  findLinuxExecutable,
  findDarwinExecutable,
  findWin32Executable
};
