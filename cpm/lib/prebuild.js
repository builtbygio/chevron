'use strict';

/**
 * Prefer prebuilt native binaries before source rebuild.
 *
 * Strategies (in order):
 * 1. package.json `chevron.prebuilds` URL template (Chevron-specific)
 * 2. Bundled `prebuilds/` + `node-gyp-build` (prebuildify model — preferred)
 * 3. Legacy `prebuild-install` only if the *package* ships it (third-party;
 *    cpm itself no longer depends on prebuild-install)
 * 4. Caller falls back to @electron/rebuild (source)
 *
 * See docs/cpm-prebuilds.md.
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

function depDeclares(meta, name) {
  if (!meta) return false;
  return !!(
    (meta.dependencies && meta.dependencies[name]) ||
    (meta.optionalDependencies && meta.optionalDependencies[name]) ||
    (meta.devDependencies && meta.devDependencies[name])
  );
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

function electronEnv(electronVersion) {
  return {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_build_from_source: 'false'
  };
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
        process.stderr.write(`cpm prebuild: HTTP ${res.status} for ${url}\n`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // .node single file or .tar.gz — detect gzip magic
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        const tarPath = path.join(packagePath, '.cpm-prebuild.tgz');
        await fse.writeFile(tarPath, buf);
        const r = spawnSync('tar', ['-xzf', tarPath, '-C', packagePath], {
          encoding: 'utf8'
        });
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
 * Preferred path: prebuildify ships `prebuilds/` in the npm tarball;
 * node-gyp-build selects the right binary (or rebuilds if missing).
 *
 * Works with Electron when npm_config_runtime/target are set.
 */
function tryNodeGypBuild(packagePath, electronVersion) {
  const meta = readPackageJson(packagePath);
  if (!meta) return { ok: false, reason: 'no package.json' };

  const hasPrebuildsDir = fs.existsSync(path.join(packagePath, 'prebuilds'));
  const declaresNgb = depDeclares(meta, 'node-gyp-build');
  const installUsesNgb =
    meta.scripts &&
    typeof meta.scripts.install === 'string' &&
    meta.scripts.install.includes('node-gyp-build');

  if (!hasPrebuildsDir && !declaresNgb && !installUsesNgb) {
    return { ok: false, reason: 'no prebuildify / node-gyp-build support' };
  }

  const candidates = [
    path.join(packagePath, 'node_modules', '.bin', 'node-gyp-build'),
    path.join(__dirname, '..', 'node_modules', '.bin', 'node-gyp-build')
  ];
  let bin = candidates.find(p => fs.existsSync(p));
  const env = electronEnv(electronVersion);

  let result;
  if (bin) {
    result = spawnSync(bin, [], {
      cwd: packagePath,
      encoding: 'utf8',
      env
    });
  } else {
    let entry;
    try {
      entry = require.resolve('node-gyp-build/bin.js');
    } catch (_) {
      try {
        // package exports bin as main in some versions
        entry = require.resolve('node-gyp-build');
      } catch (e2) {
        return { ok: false, reason: 'node-gyp-build not installed in cpm' };
      }
    }
    result = spawnSync(process.execPath, [entry], {
      cwd: packagePath,
      encoding: 'utf8',
      env
    });
  }

  if (result.status === 0 && hasNativeBinary(packagePath)) {
    return { ok: true, strategy: 'node-gyp-build' };
  }

  // Bundled prebuilds alone (no compile) — node-gyp-build may exit 0 without
  // writing build/Release if runtime load path differs; still count prebuilds.
  if (hasPrebuildsDir && hasNativeBinary(packagePath)) {
    return { ok: true, strategy: 'prebuilds-dir' };
  }

  return {
    ok: false,
    reason: (
      result.stderr ||
      result.stdout ||
      'node-gyp-build failed'
    ).slice(0, 500)
  };
}

/**
 * Legacy: run prebuild-install only when the *package* itself depends on it.
 * cpm no longer ships prebuild-install; this is third-party compatibility only.
 */
function tryLegacyPrebuildInstall(packagePath, electronVersion) {
  const meta = readPackageJson(packagePath);
  if (!meta) return { ok: false, reason: 'no package.json' };

  const packageHasPbi =
    depDeclares(meta, 'prebuild-install') ||
    Boolean(meta.binary) ||
    fs.existsSync(
      path.join(packagePath, 'node_modules', '.bin', 'prebuild-install')
    );

  if (!packageHasPbi) {
    return { ok: false, reason: 'no legacy prebuild-install in package' };
  }

  const candidates = [
    path.join(packagePath, 'node_modules', '.bin', 'prebuild-install')
  ];
  // Optional: resolve from ambient install (not a cpm dependency).
  try {
    candidates.push(
      path.join(
        path.dirname(require.resolve('prebuild-install/package.json')),
        'bin.js'
      )
    );
  } catch (_) {
    /* cpm intentionally does not depend on prebuild-install */
  }

  const bin = candidates.find(p => fs.existsSync(p));
  if (!bin) {
    return {
      ok: false,
      reason: 'legacy prebuild-install not available for package'
    };
  }

  const args = [
    '--runtime',
    'electron',
    '--target',
    electronVersion,
    '--verbose'
  ];
  const env = electronEnv(electronVersion);

  const result =
    bin.endsWith('bin.js') || bin.endsWith('.js')
      ? spawnSync(process.execPath, [bin, ...args], {
          cwd: packagePath,
          encoding: 'utf8',
          env
        })
      : spawnSync(bin, args, { cwd: packagePath, encoding: 'utf8', env });

  if (result.status === 0 && hasNativeBinary(packagePath)) {
    return { ok: true, strategy: 'prebuild-install-legacy' };
  }
  return {
    ok: false,
    reason: (
      result.stderr ||
      result.stdout ||
      'prebuild-install-legacy failed'
    ).slice(0, 500)
  };
}

/** @deprecated use tryLegacyPrebuildInstall — kept for tests / call sites */
function tryPrebuildInstallCli(packagePath, electronVersion) {
  return tryLegacyPrebuildInstall(packagePath, electronVersion);
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

  const electronVersion = options.electronVersion || getElectronVersion();
  if (!electronVersion) {
    return { ok: false, reason: 'no electron version' };
  }

  if (hasNativeBinary(packagePath) && !options.force) {
    return { ok: true, strategy: 'already-present' };
  }

  const chevron = await tryChevronPrebuildUrl(packagePath, electronVersion);
  if (chevron.ok) return chevron;

  const ngb = tryNodeGypBuild(packagePath, electronVersion);
  if (ngb.ok) return ngb;

  const legacy = tryLegacyPrebuildInstall(packagePath, electronVersion);
  if (legacy.ok) return legacy;

  return {
    ok: false,
    reason: [chevron.reason, ngb.reason, legacy.reason]
      .filter(Boolean)
      .join('; ')
  };
}

module.exports = {
  packageNeedsNative,
  findNodeBinaries,
  hasNativeBinary,
  expandPrebuildTemplate,
  tryPrebuilds,
  tryChevronPrebuildUrl,
  tryNodeGypBuild,
  tryLegacyPrebuildInstall,
  tryPrebuildInstallCli
};
