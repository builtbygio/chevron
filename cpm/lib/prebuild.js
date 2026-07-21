'use strict';

/**
 * Phase 3: prefer prebuilt native binaries before source rebuild.
 *
 * Strategies (in order):
 * 1. package.json `chevron.prebuilds` URL template (Chevron-specific)
 * 2. `prebuild-install` when the package declares binary/prebuilds support
 * 3. Caller falls back to @electron/rebuild (source)
 */

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const { getElectronVersion } = require('./paths');

function packageNeedsNative(packagePath) {
  return fs.existsSync(path.join(packagePath, 'binding.gyp'));
}

function findNodeBinaries(packagePath) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !fs.existsSync(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' && depth > 0) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.name.endsWith('.node')) out.push(full);
    }
  };
  walk(packagePath, 0);
  return out;
}

function hasNativeBinary(packagePath) {
  return findNodeBinaries(packagePath).length > 0;
}

function readPackageJson(packagePath) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8')
    );
  } catch (_) {
    return null;
  }
}

/**
 * Expand templates:
 * {name} {version} {platform} {arch} {electron} {abi}
 * abi is approximate NODE_MODULE_VERSION when available.
 */
function expandPrebuildTemplate(template, ctx) {
  return String(template)
    .replace(/\{name\}/g, ctx.name || '')
    .replace(/\{version\}/g, ctx.version || '')
    .replace(/\{platform\}/g, ctx.platform || process.platform)
    .replace(/\{arch\}/g, ctx.arch || process.arch)
    .replace(/\{electron\}/g, ctx.electron || '')
    .replace(/\{abi\}/g, ctx.abi || process.versions.modules || '');
}

function getAbiHint() {
  return process.versions.modules || '';
}

/**
 * Try Chevron-specific prebuild URL(s) from package.json:
 *   "chevron": { "prebuilds": "https://…/{platform}-{arch}-electron{electron}.node" }
 *   or "prebuilds": [ url, url ]
 */
async function tryChevronPrebuildUrl(packagePath, electronVersion) {
  const meta = readPackageJson(packagePath);
  if (!meta) return { ok: false, reason: 'no package.json' };

  const cfg = (meta.chevron && meta.chevron.prebuilds) || meta.prebuildsUrl;
  if (!cfg) return { ok: false, reason: 'no chevron.prebuilds' };

  const urls = Array.isArray(cfg) ? cfg : [cfg];
  const ctx = {
    name: meta.name,
    version: meta.version,
    platform: process.platform,
    arch: process.arch,
    electron: electronVersion,
    abi: getAbiHint()
  };

  const destDir = path.join(packagePath, 'build', 'Release');
  await fse.ensureDir(destDir);

  for (const tmpl of urls) {
    const url = expandPrebuildTemplate(tmpl, ctx);
    try {
      process.stdout.write(`cpm prebuild: fetching ${url}\n`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'chevron-cpm' },
        redirect: 'follow'
      });
      if (!res.ok) {
        process.stderr.write(
          `cpm prebuild: HTTP ${res.status} for ${url}\n`
        );
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // .node single file or .tar.gz — detect gzip magic
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        const tarPath = path.join(packagePath, '.cpm-prebuild.tgz');
        await fse.writeFile(tarPath, buf);
        const r = spawnSync(
          'tar',
          ['-xzf', tarPath, '-C', packagePath],
          { encoding: 'utf8' }
        );
        await fse.remove(tarPath).catch(() => {});
        if (r.status !== 0) {
          process.stderr.write(
            `cpm prebuild: tar extract failed: ${r.stderr || r.stdout}\n`
          );
          continue;
        }
      } else {
        // Assume raw .node binary
        const moduleName = (meta.binary && meta.binary.module_name) || meta.name;
        const safe = String(moduleName).replace(/[^\w.-]+/g, '_') || 'binding';
        await fse.writeFile(path.join(destDir, `${safe}.node`), buf);
      }
      if (hasNativeBinary(packagePath)) {
        return { ok: true, strategy: 'chevron-url', url };
      }
    } catch (err) {
      process.stderr.write(`cpm prebuild: ${err.message}\n`);
    }
  }
  return { ok: false, reason: 'chevron prebuild URLs failed' };
}

/**
 * Run prebuild-install in the package directory when supported.
 */
function tryPrebuildInstallCli(packagePath, electronVersion) {
  const meta = readPackageJson(packagePath);
  if (!meta) return { ok: false, reason: 'no package.json' };

  const supports =
    meta.binary ||
    (meta.dependencies && meta.dependencies['prebuild-install']) ||
    (meta.optionalDependencies &&
      meta.optionalDependencies['prebuild-install']) ||
    (meta.devDependencies && meta.devDependencies['prebuild-install']) ||
    fs.existsSync(path.join(packagePath, 'prebuilds'));

  if (!supports) {
    return { ok: false, reason: 'package does not declare prebuild support' };
  }

  // Prefer local bin, then npx from cpm's node_modules
  const candidates = [
    path.join(packagePath, 'node_modules', '.bin', 'prebuild-install'),
    path.join(__dirname, '..', 'node_modules', '.bin', 'prebuild-install')
  ];
  let bin = candidates.find(p => fs.existsSync(p));
  const args = [
    '--runtime',
    'electron',
    '--target',
    electronVersion,
    '--verbose'
  ];

  const env = {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers'
  };

  let result;
  if (bin) {
    result = spawnSync(bin, args, {
      cwd: packagePath,
      encoding: 'utf8',
      env
    });
  } else {
    let entry;
    try {
      entry = require.resolve('prebuild-install/bin.js');
    } catch (_) {
      try {
        entry = require.resolve('prebuild-install');
      } catch (e2) {
        return { ok: false, reason: 'prebuild-install not installed in cpm' };
      }
    }
    result = spawnSync(process.execPath, [entry, ...args], {
      cwd: packagePath,
      encoding: 'utf8',
      env
    });
  }

  if (result.status === 0 && hasNativeBinary(packagePath)) {
    return { ok: true, strategy: 'prebuild-install' };
  }
  return {
    ok: false,
    reason: (result.stderr || result.stdout || 'prebuild-install failed').slice(
      0,
      500
    )
  };
}

/**
 * Attempt all prebuild strategies. Returns { ok, strategy?, reason? }.
 */
async function tryPrebuilds(packagePath, options = {}) {
  if (!packageNeedsNative(packagePath)) {
    return { ok: true, strategy: 'no-native' };
  }
  if (options.forceSource) {
    return { ok: false, reason: 'forceSource' };
  }

  const electronVersion =
    options.electronVersion || getElectronVersion();
  if (!electronVersion) {
    return { ok: false, reason: 'no electron version' };
  }

  if (hasNativeBinary(packagePath) && !options.force) {
    return { ok: true, strategy: 'already-present' };
  }

  const chevron = await tryChevronPrebuildUrl(packagePath, electronVersion);
  if (chevron.ok) return chevron;

  const pbi = tryPrebuildInstallCli(packagePath, electronVersion);
  if (pbi.ok) return pbi;

  return {
    ok: false,
    reason: [chevron.reason, pbi.reason].filter(Boolean).join('; ')
  };
}

module.exports = {
  packageNeedsNative,
  findNodeBinaries,
  hasNativeBinary,
  expandPrebuildTemplate,
  tryPrebuilds,
  tryChevronPrebuildUrl,
  tryPrebuildInstallCli
};
