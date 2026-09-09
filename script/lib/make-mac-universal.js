'use strict';

/**
 * One Chevron.app for Intel and Apple Silicon Macs.
 *
 * The two per-arch builds are made on their own hosts (the natives are
 * compiled there, not cross-compiled) and merged afterwards with
 * @electron/universal: Mach-O pairs become fat binaries via lipo, everything
 * else has to be byte-identical.
 *
 * Two things about a Chevron build that @electron/universal does not expect:
 *
 * 1. The two app.asar files are merged into one (`mergeASARs`) rather than
 *    kept side by side behind a shim. The shim layout renames them
 *    app-x64.asar / app-arm64.asar, and node-pty, dugite, the ripgrep
 *    searchers and the tree-sitter loader all find their unpacked binaries
 *    by rewriting the literal string `app.asar` to `app.asar.unpacked` -- a
 *    terminal that opens and dies, git that is not found. One asar keeps
 *    every such path valid.
 *
 * 2. Packaging drops the foreign arch's prebuilds (packaging-policy.js), so
 *    the x64 build has `prebuilds/darwin-x64/` and the arm64 build
 *    `prebuilds/darwin-arm64/`. @electron/universal refuses two builds whose
 *    unpacked trees differ in which files exist, so the missing ones are
 *    copied across first; the asar listings are allowed to differ there
 *    (`singleArchFiles`), and a Mach-O identical on both sides is accepted
 *    where that is expected (`x64ArchFiles`: those prebuilds, and the
 *    x86_64-only ctags binary symbols-view vendors).
 *
 * Runs on macOS only (lipo, codesign). script/mac-universal is the CLI;
 * .github/workflows/ci.yml runs it after the two macOS builds.
 */

const fs = require('fs');
const path = require('path');
const spawnSync = require('./spawn-sync');
const { makeTempDir, removeTempDir } = require('./temp-dir');

const UNPACKED = path.join('Contents', 'Resources', 'app.asar.unpacked');
const ASAR = path.join('Contents', 'Resources', 'app.asar');

// Mach-O magic, either byte order, thin and fat.
const MACHO_MAGIC = new Set([
  0xfeedface,
  0xfeedfacf,
  0xcefaedfe,
  0xcffaedfe,
  0xcafebabe,
  0xbebafeca
]);

// Asar entries allowed to exist in one build only: per-arch prebuild folders
// and their contents (minimatch, matchBase).
const ARCH_SPECIFIC_LISTINGS = '**/{prebuilds/darwin-*,prebuilds/darwin-*/**}';

// Mach-O files expected to be the same bytes in both builds after the copy
// across, so they are kept as they are rather than reported as a mistake.
const IDENTICAL_MACHO = '**/{prebuilds/darwin-*/**,ctags-darwin}';

function parseLipoArchs(output) {
  return String(output || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function isUniversal(archs) {
  return archs.includes('x86_64') && archs.includes('arm64');
}

function lipoArchs(file) {
  return parseLipoArchs(spawnSync('lipo', ['-archs', file]).stdout.toString());
}

function mainBinary(appPath) {
  const macOS = path.join(appPath, 'Contents', 'MacOS');
  const entries = fs.existsSync(macOS) ? fs.readdirSync(macOS) : [];
  if (entries.length === 0) {
    throw new Error(`${appPath} is not an app bundle: no Contents/MacOS`);
  }
  return path.join(macOS, entries[0]);
}

// Relative paths of every file and symlink under root, sorted. Directories
// are not listed: an empty one carries nothing worth copying.
function listFiles(root) {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full);
      else found.push(path.relative(root, full));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found.sort();
}

// The first four bytes, enough for isMachO.
function readMagic(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const magic = Buffer.alloc(4);
    const read = fs.readSync(fd, magic, 0, 4, 0);
    return magic.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function isMachO(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    MACHO_MAGIC.has(buffer.readUInt32BE(0))
  );
}

function sameBytes(a, b) {
  return a.length === b.length && a.equals(b);
}

// Files present in both trees whose bytes differ and are not Mach-O.
// @electron/universal stops at the first such file; this finds all of them
// so a fix needs one CI round, not one per file.
function nonMachODifferences(x64Root, arm64Root) {
  const arm64 = new Set(listFiles(arm64Root));
  const found = [];
  for (const file of listFiles(x64Root)) {
    if (!arm64.has(file)) continue;
    const a = path.join(x64Root, file);
    const b = path.join(arm64Root, file);
    if (fs.lstatSync(a).isSymbolicLink() || fs.lstatSync(b).isSymbolicLink()) {
      continue;
    }
    const x = fs.readFileSync(a);
    if (isMachO(x)) continue;
    if (!sameBytes(x, fs.readFileSync(b))) found.push(file);
  }
  return found;
}

// The same, inside the two asars, for entries stored in the archive (unpacked
// ones are compared on disk above).
function asarNonMachODifferences(x64Asar, arm64Asar) {
  const asar = require('@electron/asar');
  const list = archive =>
    asar
      .listPackage(archive, { isPack: false })
      .map(f => f.replace(/^[\\/]/, ''));
  const arm64 = new Set(list(arm64Asar));
  const found = [];
  for (const file of list(x64Asar)) {
    if (!arm64.has(file)) continue;
    const info = asar.statFile(x64Asar, file);
    if ('files' in info || info.unpacked || info.link) continue;
    const x = asar.extractFile(x64Asar, file);
    if (isMachO(x)) continue;
    if (!sameBytes(x, asar.extractFile(arm64Asar, file))) found.push(file);
  }
  return found;
}

// What differs, for a file the pre-flight is about to refuse: JSON compared
// by path, text by line, so the log says which key or line rather than only
// which file.
function describeDifference(x64Buffer, arm64Buffer, limit = 12) {
  const parseJson = buffer => {
    try {
      return { ok: true, value: JSON.parse(buffer.toString('utf8')) };
    } catch (error) {
      return { ok: false };
    }
  };
  const a = parseJson(x64Buffer);
  const b = parseJson(arm64Buffer);
  if (a.ok && b.ok) {
    const found = [];
    const show = value => {
      const text = JSON.stringify(value);
      return text === undefined
        ? 'undefined'
        : text.length > 80
        ? text.slice(0, 77) + '...'
        : text;
    };
    const walk = (x, y, at) => {
      if (found.length >= limit) return;
      if (Array.isArray(x) && Array.isArray(y)) {
        if (x.length !== y.length)
          found.push(`${at}: ${x.length} vs ${y.length} entries`);
        const n = Math.min(x.length, y.length);
        for (let i = 0; i < n && found.length < limit; i++)
          walk(x[i], y[i], `${at}[${i}]`);
        return;
      }
      if (x && y && typeof x === 'object' && typeof y === 'object') {
        const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
        for (const key of [...keys].sort()) {
          if (found.length >= limit) return;
          if (!(key in x)) found.push(`${at}.${key}: only in arm64`);
          else if (!(key in y)) found.push(`${at}.${key}: only in x64`);
          else walk(x[key], y[key], `${at}.${key}`);
        }
        return;
      }
      if (x !== y) found.push(`${at}: ${show(x)} vs ${show(y)}`);
    };
    walk(a.value, b.value, '$');
    return found;
  }
  const isText = buffer =>
    buffer.length < 4 * 1024 * 1024 && !buffer.includes(0);
  if (isText(x64Buffer) && isText(arm64Buffer)) {
    const linesA = x64Buffer.toString('utf8').split(/\r?\n/);
    const linesB = arm64Buffer.toString('utf8').split(/\r?\n/);
    const setA = new Set(linesA);
    const setB = new Set(linesB);
    const onlyA = linesA.filter(l => !setB.has(l)).slice(0, limit / 2);
    const onlyB = linesB.filter(l => !setA.has(l)).slice(0, limit / 2);
    return onlyA
      .map(l => `x64 only: ${l}`)
      .concat(onlyB.map(l => `arm64 only: ${l}`));
  }
  return [`binary: ${x64Buffer.length} vs ${arm64Buffer.length} bytes`];
}

// @electron/asar rewrites the merged asar's unpacked tree in place over the
// copied x64 bundle: regular files are overwritten, but symlinks are
// recreated with symlink(2), which fails with EEXIST when one is already
// there, and dugite's git-core is a directory of them. The symlinks cannot
// simply be removed first: the merge's own comparison reads the unpacked
// entries through them. So symlink(2) is made to overwrite an existing
// symlink. asar's wrapped fs binds fs.promises.symlink when it loads, which
// is why this has to be installed before @electron/asar is required.
function overwritingSymlink(original) {
  return async function symlink(target, dest, ...rest) {
    try {
      return await original.call(fs.promises, target, dest, ...rest);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing;
      try {
        existing = fs.lstatSync(dest);
      } catch (statError) {
        throw error;
      }
      if (!existing.isSymbolicLink()) throw error;
      fs.unlinkSync(dest);
      return original.call(fs.promises, target, dest, ...rest);
    }
  };
}

function installSymlinkOverwrite() {
  const asarLoaded = Object.keys(require.cache).some(file =>
    /[\\/]@electron[\\/]asar[\\/]/.test(file)
  );
  if (asarLoaded) {
    throw new Error(
      'installSymlinkOverwrite must run before @electron/asar is loaded'
    );
  }
  const original = fs.promises.symlink;
  fs.promises.symlink = overwritingSymlink(original);
  return () => {
    fs.promises.symlink = original;
  };
}

function preflight(x64AppPath, arm64AppPath) {
  const unpacked = nonMachODifferences(
    path.join(x64AppPath, UNPACKED),
    path.join(arm64AppPath, UNPACKED)
  ).map(f => path.join(UNPACKED, f));
  const inAsar = asarNonMachODifferences(
    path.join(x64AppPath, ASAR),
    path.join(arm64AppPath, ASAR)
  ).map(f => path.join(ASAR, f));
  const all = unpacked.concat(inAsar);
  if (all.length) {
    const asar = inAsar.length ? require('@electron/asar') : null;
    const read = (appPath, file) =>
      file.startsWith(UNPACKED)
        ? fs.readFileSync(path.join(appPath, file))
        : asar.extractFile(path.join(appPath, ASAR), path.relative(ASAR, file));
    const report = all.map(file => {
      const lines = describeDifference(
        read(x64AppPath, file),
        read(arm64AppPath, file)
      );
      return `${file}\n      ${lines.join('\n      ')}`;
    });
    throw new Error(
      'These files differ between the Intel and Apple Silicon builds but are ' +
        'not Mach-O, so they cannot be merged. Packaging should not ship them ' +
        '(include-path-in-packaged-app.js), or they must be made identical:\n  ' +
        report.join('\n  ')
    );
  }
}

// Which unpacked files exist on one side only. Pure, for the test.
function unpackedDifferences(x64Files, arm64Files) {
  const x64 = new Set(x64Files);
  const arm64 = new Set(arm64Files);
  return {
    onlyX64: x64Files.filter(f => !arm64.has(f)).sort(),
    onlyArm64: arm64Files.filter(f => !x64.has(f)).sort()
  };
}

// A symlink stays a symlink (dugite's git tree has them, and they must not be
// resolved into copies), a file keeps its mode (the executable bit on a
// helper binary).
function copyEntry(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(from), to);
  } else {
    fs.copyFileSync(from, to);
    fs.chmodSync(to, stat.mode);
  }
}

// Give both builds the same set of unpacked files, copying the missing ones
// across.
function equaliseUnpacked(x64AppPath, arm64AppPath) {
  const x64Root = path.join(x64AppPath, UNPACKED);
  const arm64Root = path.join(arm64AppPath, UNPACKED);
  const diff = unpackedDifferences(listFiles(x64Root), listFiles(arm64Root));
  const copy = (from, to, files) => {
    for (const file of files)
      copyEntry(path.join(from, file), path.join(to, file));
  };
  copy(x64Root, arm64Root, diff.onlyX64);
  copy(arm64Root, x64Root, diff.onlyArm64);
  return diff;
}

// Every Mach-O the merge must have made fat: the app binary, the Electron
// framework, each helper, and every native module the packaged app loads.
// Per-arch prebuild folders and ctags-darwin are thin by design and skipped.
function machOToVerify(appPath) {
  const files = [mainBinary(appPath)];
  const frameworks = path.join(appPath, 'Contents', 'Frameworks');
  if (fs.existsSync(frameworks)) {
    for (const entry of fs.readdirSync(frameworks)) {
      if (entry.endsWith('.framework')) {
        const name = entry.replace(/\.framework$/, '');
        const binary = path.join(frameworks, entry, name);
        if (fs.existsSync(binary)) files.push(binary);
      } else if (entry.endsWith('.app')) {
        try {
          files.push(mainBinary(path.join(frameworks, entry)));
        } catch (error) {
          // a helper without a binary is not this check's problem
        }
      }
    }
  }
  const unpacked = path.join(appPath, UNPACKED);
  for (const file of listFiles(unpacked)) {
    if (!file.endsWith('.node')) continue;
    if (/(^|\/)prebuilds\/darwin-[^/]+\//.test(file)) continue;
    const full = path.join(unpacked, file);
    // A .node for another platform ships too (fswin's Windows DLLs, through
    // text-buffer's winattr). lipo has nothing to say about those.
    if (fs.lstatSync(full).isSymbolicLink() || !isMachO(readMagic(full))) {
      continue;
    }
    files.push(full);
  }
  return files;
}

function readAsarIntegrity(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const json = spawnSync('plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    plist
  ]).stdout.toString();
  return JSON.parse(json).ElectronAsarIntegrity || {};
}

function verifyUniversal(appPath) {
  const resources = fs.readdirSync(path.join(appPath, 'Contents', 'Resources'));
  const problems = [];
  if (!resources.includes('app.asar'))
    problems.push('Contents/Resources/app.asar is missing');
  if (!resources.includes('app.asar.unpacked')) {
    problems.push('Contents/Resources/app.asar.unpacked is missing');
  }
  for (const shim of ['app-x64.asar', 'app-arm64.asar']) {
    if (resources.includes(shim)) {
      problems.push(
        `Contents/Resources/${shim} exists: the asars were kept apart instead of merged`
      );
    }
  }
  const integrity = readAsarIntegrity(appPath);
  if (!integrity['Resources/app.asar']) {
    problems.push(
      'Info.plist has no ElectronAsarIntegrity entry for Resources/app.asar'
    );
  }

  const checked = machOToVerify(appPath);
  for (const file of checked) {
    const archs = lipoArchs(file);
    if (!isUniversal(archs)) {
      problems.push(
        `${path.relative(appPath, file)} is ${archs.join(' ') || 'not Mach-O'}`
      );
    }
  }
  if (problems.length) {
    throw new Error(
      `${appPath} is not a universal build:\n  ${problems.join('\n  ')}`
    );
  }
  return { machOChecked: checked.length };
}

function assertThinBuild(appPath, expectedArch, flag) {
  const archs = lipoArchs(mainBinary(appPath));
  if (archs.length !== 1 || archs[0] !== expectedArch) {
    throw new Error(
      `${flag} should be the ${expectedArch} build, but ${appPath} is ${archs.join(
        ' '
      )}`
    );
  }
}

async function makeMacUniversal({
  x64AppPath,
  arm64AppPath,
  outAppPath,
  log = console.log
}) {
  if (process.platform !== 'darwin') {
    throw new Error('lipo and codesign are macOS tools: run this on a Mac');
  }
  x64AppPath = path.resolve(x64AppPath);
  arm64AppPath = path.resolve(arm64AppPath);
  outAppPath = path.resolve(outAppPath);
  if (path.basename(x64AppPath) !== path.basename(arm64AppPath)) {
    throw new Error(
      `the two bundles must have the same name: ${path.basename(
        x64AppPath
      )} vs ${path.basename(arm64AppPath)}`
    );
  }
  assertThinBuild(x64AppPath, 'x86_64', '--x64');
  assertThinBuild(arm64AppPath, 'arm64', '--arm64');

  // Before anything requires @electron/asar (the pre-flight does).
  const restoreSymlink = installSymlinkOverwrite();

  // Work on copies: the inputs are CI artifacts someone may want to inspect.
  const stage = makeTempDir('chevron-universal-');
  try {
    const stagedX64 = path.join(stage, 'x64', path.basename(x64AppPath));
    const stagedArm64 = path.join(stage, 'arm64', path.basename(arm64AppPath));
    for (const [from, to] of [
      [x64AppPath, stagedX64],
      [arm64AppPath, stagedArm64]
    ]) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      spawnSync('cp', ['-R', from, to]);
    }

    const diff = equaliseUnpacked(stagedX64, stagedArm64);
    preflight(stagedX64, stagedArm64);
    log(
      `Unpacked files copied across: ${
        diff.onlyArm64.length
      } arm64-only into the x64 build, ` +
        `${diff.onlyX64.length} x64-only into the arm64 build`
    );

    const { makeUniversalApp } = require('@electron/universal');
    fs.rmSync(outAppPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(outAppPath), { recursive: true });
    log(`Merging into ${outAppPath}`);
    await makeUniversalApp({
      x64AppPath: stagedX64,
      arm64AppPath: stagedArm64,
      outAppPath,
      force: true,
      mergeASARs: true,
      singleArchFiles: ARCH_SPECIFIC_LISTINGS,
      x64ArchFiles: IDENTICAL_MACHO
    });
  } finally {
    restoreSymlink();
    removeTempDir(stage);
  }

  const report = verifyUniversal(outAppPath);
  log(`Verified ${report.machOChecked} Mach-O files are x86_64 + arm64`);
  return report;
}

// lipo invalidates the per-slice signatures Electron shipped with. The
// unsigned preview is ad-hoc signed so that macOS will start it at all on
// Apple Silicon; a Developer ID goes through code-sign-on-mac.js instead.
function adHocSign(appPath) {
  spawnSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  });
  spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit'
  });
}

module.exports = {
  ARCH_SPECIFIC_LISTINGS,
  IDENTICAL_MACHO,
  UNPACKED,
  parseLipoArchs,
  isUniversal,
  isMachO,
  readMagic,
  describeDifference,
  overwritingSymlink,
  installSymlinkOverwrite,
  nonMachODifferences,
  asarNonMachODifferences,
  preflight,
  listFiles,
  unpackedDifferences,
  equaliseUnpacked,
  machOToVerify,
  verifyUniversal,
  makeMacUniversal,
  adHocSign
};
