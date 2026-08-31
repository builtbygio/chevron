'use strict';

/**
 * @vscode/ripgrep's postinstall downloads bin/rg. App npm install uses
 * --ignore-scripts, so find-in-project gets ENOENT under app.asar.unpacked
 * unless we fetch the binary explicitly.
 *
 * @vscode/ripgrep@1.15.14 talks to api.github.com (microsoft/ripgrep-prebuilt
 * v13.0.0-13). Unauthenticated GETs 403 on shared CI IPs. Pass GITHUB_TOKEN
 * and fall back to the public release asset URL if postinstall still fails.
 *
 * Do not jump to @vscode/ripgrep@1.18 — that package is ESM + per-platform
 * optionalDependencies and is not a drop-in for require() / bin/rg.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const CONFIG = require('../config');
const { makeTempDir } = require('./temp-dir');

const RG_VERSION = 'v13.0.0-13';
const RG_MULTI_ARCH_LINUX_VERSION = 'v13.0.0-4';
const RG_REPO = 'microsoft/ripgrep-prebuilt';
const RG_PACKAGE = path.join('@vscode', 'ripgrep');

function rgBinName(platform = process.platform) {
  return platform === 'win32' ? 'rg.exe' : 'rg';
}

function rgBinPath(pkgDir, platform = process.platform) {
  return path.join(pkgDir, 'bin', rgBinName(platform));
}

/** Same target map as @vscode/ripgrep@1.15.14 lib/postinstall.js. */
function rgTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  if (platform === 'win32') {
    if (arch === 'x64') return 'x86_64-pc-windows-msvc';
    if (arch === 'arm64' || arch === 'arm') return 'aarch64-pc-windows-msvc';
    return 'i686-pc-windows-msvc';
  }
  if (arch === 'x64') return 'x86_64-unknown-linux-musl';
  if (arch === 'arm64') return 'aarch64-unknown-linux-musl';
  if (arch === 'arm' || arch === 'armv7l') return 'arm-unknown-linux-gnueabihf';
  if (arch === 'ppc64') return 'powerpc64le-unknown-linux-gnu';
  if (arch === 'riscv64') return 'riscv64gc-unknown-linux-gnu';
  if (arch === 's390x') return 's390x-unknown-linux-gnu';
  return 'x86_64-unknown-linux-musl';
}

function rgFallbackVersion(target) {
  if (
    target === 'arm-unknown-linux-gnueabihf' ||
    target === 'powerpc64le-unknown-linux-gnu'
  ) {
    return RG_MULTI_ARCH_LINUX_VERSION;
  }
  return RG_VERSION;
}

function githubToken() {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.CHEVRON_GITHUB_TOKEN ||
    ''
  );
}

function downloadEnv() {
  const env = Object.assign({}, process.env);
  const token = githubToken();
  if (token && !env.GITHUB_TOKEN) env.GITHUB_TOKEN = token;
  return env;
}

function chmodRg(binPath, platform = process.platform) {
  if (platform === 'win32') return;
  try {
    fs.chmodSync(binPath, 0o755);
  } catch (_) {
    /* ignore */
  }
}

function downloadFile(url, dest, token) {
  const tmp = dest + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const curl = spawnSync(
    'curl',
    [
      '-fsSL',
      '--retry',
      '3',
      '--retry-delay',
      '2',
      '-o',
      tmp,
      ...(token ? ['-H', `Authorization: Bearer ${token}`] : []),
      '-A',
      'chevron-ensure-ripgrep',
      url
    ],
    { stdio: 'inherit' }
  );
  if (curl.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
    fs.renameSync(tmp, dest);
    return;
  }
  try {
    fs.unlinkSync(tmp);
  } catch (_) {
    /* ignore */
  }
  return downloadFileHttps(url, dest, token);
}

function downloadFileHttps(url, dest, token, redirects = 0) {
  if (redirects > 5) throw new Error(`too many redirects fetching ${url}`);
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'user-agent': 'chevron-ensure-ripgrep' }
    };
    if (token) opts.headers.authorization = `Bearer ${token}`;
    https
      .get(url, opts, res => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          downloadFileHttps(res.headers.location, dest, token, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GET ${url} failed: ${res.statusCode}`));
          return;
        }
        const tmp = dest + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmp, dest);
            resolve();
          });
        });
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

function extractArchive(archive, destDir, platform = process.platform) {
  fs.mkdirSync(destDir, { recursive: true });
  if (platform === 'win32') {
    const r = spawnSync(
      'powershell',
      [
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -Path "${archive}" -DestinationPath "${destDir}" -Force`
      ],
      { stdio: 'inherit' }
    );
    if (r.status !== 0) throw new Error('Expand-Archive failed');
    return;
  }
  const r = spawnSync('tar', ['xf', archive, '-C', destDir], {
    stdio: 'inherit'
  });
  if (r.status !== 0) throw new Error(`tar xf exited ${r.status}`);
}

async function downloadRipgrepFallback(pkgDir) {
  const binDir = path.join(pkgDir, 'bin');
  const binPath = rgBinPath(pkgDir);
  const target = rgTarget();
  const version = rgFallbackVersion(target);
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const asset = `ripgrep-${version}-${target}.${ext}`;
  const url = `https://github.com/${RG_REPO}/releases/download/${version}/${asset}`;
  const tmpDir = makeTempDir('chevron-rg-');
  const archive = path.join(tmpDir, asset);
  console.log(`Downloading ripgrep fallback ${url}`);
  await downloadFile(url, archive, githubToken());
  extractArchive(archive, binDir);
  if (!fs.existsSync(binPath)) {
    throw new Error(`fallback extract did not produce ${binPath}`);
  }
  chmodRg(binPath);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
  return binPath;
}

function runPostinstall(pkgDir) {
  const postinstall = path.join(pkgDir, 'lib', 'postinstall.js');
  if (!fs.existsSync(postinstall)) {
    throw new Error(`@vscode/ripgrep postinstall missing at ${postinstall}`);
  }
  // postinstall treats an empty bin/ as success. Force when rg is missing
  // so a failed API call cannot leave a poison-empty bin/.
  const args = [postinstall];
  if (!fs.existsSync(rgBinPath(pkgDir))) args.push('--force');
  const attempts = 3;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(
        `Downloading ripgrep into ${pkgDir}${i > 1 ? ` (try ${i}/${attempts})` : ''}…`
      );
      execFileSync(process.execPath, args, {
        cwd: pkgDir,
        stdio: 'inherit',
        env: downloadEnv()
      });
      return;
    } catch (err) {
      lastErr = err;
      console.error(err.message || err);
    }
  }
  throw lastErr;
}

function ensureRipgrepAt(pkgDir) {
  if (!pkgDir || !fs.existsSync(pkgDir)) return null;
  const binPath = rgBinPath(pkgDir);
  if (fs.existsSync(binPath)) {
    chmodRg(binPath);
    return binPath;
  }

  try {
    runPostinstall(pkgDir);
  } catch (err) {
    console.error(
      `@vscode/ripgrep postinstall failed (${err.message || err}); trying release asset`
    );
    // downloadRipgrepFallback is async; run it sync via deasync-less
    // spawn of this same file would recurse. Use execFileSync of node -e? 
    // Keep a sync wrapper below.
    syncFallback(pkgDir);
  }

  if (!fs.existsSync(binPath)) {
    throw new Error(`ripgrep download finished but ${binPath} is missing`);
  }
  chmodRg(binPath);
  return binPath;
}

function syncFallback(pkgDir) {
  const script = `
    const m = require(${JSON.stringify(__filename)});
    m.downloadRipgrepFallback(${JSON.stringify(pkgDir)}).then(() => process.exit(0), e => {
      console.error(e);
      process.exit(1);
    });
  `;
  execFileSync(process.execPath, ['-e', script], {
    cwd: pkgDir,
    stdio: 'inherit',
    env: downloadEnv()
  });
}

function ensureRipgrep() {
  const dirs = [
    path.join(CONFIG.repositoryRootPath, 'node_modules', RG_PACKAGE),
    path.join(CONFIG.intermediateAppPath, 'node_modules', RG_PACKAGE)
  ];
  let last = null;
  for (const dir of dirs) {
    const found = ensureRipgrepAt(dir);
    if (found) last = found;
  }
  if (!last) {
    throw new Error(
      '@vscode/ripgrep is not installed; run script/bootstrap-modern'
    );
  }
  return last;
}

module.exports = {
  rgBinName,
  rgBinPath,
  rgTarget,
  rgFallbackVersion,
  githubToken,
  downloadRipgrepFallback,
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
