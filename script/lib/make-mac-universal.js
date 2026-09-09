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
    files.push(path.join(unpacked, file));
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
  listFiles,
  unpackedDifferences,
  equaliseUnpacked,
  machOToVerify,
  verifyUniversal,
  makeMacUniversal,
  adHocSign
};
