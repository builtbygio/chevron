'use strict';

/**
 * Language-server binary distribution for cpm (LSP Phase 5).
 *
 * Packages declare:
 *   "chevron": {
 *     "languageServer": {
 *       "id": "rust-analyzer",
 *       "scopes": ["source.rust"],
 *       "command": "bin/rust-analyzer",
 *       "args": [],
 *       "tag": "2025-01-20",
 *       "prebuilds": {
 *         "linux-x64": "https://…/rust-analyzer-x86_64-unknown-linux-gnu.gz",
 *         "darwin-arm64": "https://…/rust-analyzer-aarch64-apple-darwin.gz",
 *         …
 *       }
 *     }
 *   }
 *
 * Templates in prebuild URLs may use {tag} {platform} {arch} {name} {version} {target}.
 * After install, the package activates and registers via chevron.lsp with an absolute path.
 *
 * Keeps N1: nothing is bundled in the product installer — users opt in via
 *   cpm install ./packages/chevron-lsp-rust
 * or a published name when available.
 *
 * See docs/lsp-server-distribution.md and docs/cpm-prebuilds.md.
 */

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { createWriteStream, createReadStream } = require('fs');

function readPackageJson(packagePath) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8')
    );
  } catch (_) {
    return null;
  }
}

function getLanguageServerMeta(meta) {
  if (!meta || !meta.chevron || !meta.chevron.languageServer) return null;
  return meta.chevron.languageServer;
}

/** platform-arch key, e.g. darwin-arm64 */
function platformKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

/**
 * Rust-analyzer-style target triples for common hosts.
 */
function rustcTarget(platform = process.platform, arch = process.arch) {
  const map = {
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc'
  };
  return map[platformKey(platform, arch)] || null;
}

function expandLsTemplate(template, ctx) {
  return String(template)
    .replace(/\{name\}/g, ctx.name || '')
    .replace(/\{version\}/g, ctx.version || '')
    .replace(/\{tag\}/g, ctx.tag || '')
    .replace(/\{platform\}/g, ctx.platform || process.platform)
    .replace(/\{arch\}/g, ctx.arch || process.arch)
    .replace(/\{target\}/g, ctx.target || '')
    .replace(/\{key\}/g, ctx.key || platformKey());
}

/**
 * Resolve absolute path to the language-server command if present.
 * @returns {string|null}
 */
function resolveLanguageServerBinary(packagePath, meta) {
  const ls = getLanguageServerMeta(meta || readPackageJson(packagePath));
  if (!ls || !ls.command) return null;

  const rel = ls.command;
  const abs = path.isAbsolute(rel) ? rel : path.join(packagePath, rel);
  const candidates = [abs];
  if (process.platform === 'win32') {
    candidates.push(abs + '.exe', abs + '.cmd', abs + '.bat');
  }
  // node_modules/.bin style
  if (!path.isAbsolute(rel)) {
    candidates.push(path.join(packagePath, 'node_modules', '.bin', path.basename(rel)));
    if (process.platform === 'win32') {
      candidates.push(
        path.join(packagePath, 'node_modules', '.bin', path.basename(rel) + '.cmd')
      );
    }
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch (_) {
      /* continue */
    }
  }
  return null;
}

function pickPrebuildUrl(ls, platform = process.platform, arch = process.arch) {
  if (!ls || !ls.prebuilds) return null;
  const key = platformKey(platform, arch);
  const pre = ls.prebuilds;
  if (typeof pre === 'string') return pre;
  if (typeof pre === 'object') {
    if (pre[key]) return pre[key];
    // allow target triple keys
    const target = rustcTarget(platform, arch);
    if (target && pre[target]) return pre[target];
  }
  return null;
}

/**
 * Download and install a language-server binary into the package tree.
 * @param {string} packagePath
 * @param {{ fetchImpl?: typeof fetch, platform?: string, arch?: string }} [opts]
 */
async function ensureLanguageServerBinary(packagePath, opts = {}) {
  const meta = readPackageJson(packagePath);
  if (!meta) return { ok: false, reason: 'no package.json' };

  const ls = getLanguageServerMeta(meta);
  if (!ls) return { ok: false, reason: 'not a language server package' };

  const existing = resolveLanguageServerBinary(packagePath, meta);
  if (existing) {
    return { ok: true, strategy: 'present', path: existing };
  }

  // npm-bin style: after arborist, node_modules/.bin may appear later;
  // without prebuilds we cannot invent a binary.
  const tmpl = pickPrebuildUrl(ls, opts.platform, opts.arch);
  if (!tmpl) {
    return {
      ok: false,
      reason:
        'language server binary missing and no prebuilds for ' +
        platformKey(opts.platform, opts.arch)
    };
  }

  const ctx = {
    name: meta.name,
    version: meta.version,
    tag: ls.tag || meta.version,
    platform: opts.platform || process.platform,
    arch: opts.arch || process.arch,
    target: rustcTarget(opts.platform, opts.arch) || '',
    key: platformKey(opts.platform, opts.arch)
  };
  const url = expandLsTemplate(tmpl, ctx);
  const fetchImpl = opts.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'fetch unavailable' };
  }

  const commandRel = ls.command || path.join('bin', ls.id || 'server');
  const destAbs = path.isAbsolute(commandRel)
    ? commandRel
    : path.join(packagePath, commandRel);
  await fse.ensureDir(path.dirname(destAbs));

  try {
    process.stdout.write(`cpm language-server: fetching ${url}\n`);
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'chevron-cpm' },
      redirect: 'follow'
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status} for ${url}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // gzip magic
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const gzPath = destAbs + '.gz';
      await fse.writeFile(gzPath, buf);
      await gunzipFile(gzPath, destAbs);
      await fse.remove(gzPath).catch(() => {});
    } else if (buf[0] === 0x1f && buf[1] === 0x8b) {
      // unreachable duplicate
    } else {
      // raw binary or zip — write as-is for non-gz
      // zip PK\x03\x04
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        const zipPath = destAbs + '.zip';
        await fse.writeFile(zipPath, buf);
        const r = spawnSync('unzip', ['-o', zipPath, '-d', path.dirname(destAbs)], {
          encoding: 'utf8'
        });
        await fse.remove(zipPath).catch(() => {});
        if (r.status !== 0) {
          return {
            ok: false,
            reason: `unzip failed: ${r.stderr || r.stdout || r.status}`
          };
        }
        // if unzip didn't produce destAbs, leave for resolve to find
      } else {
        await fse.writeFile(destAbs, buf);
      }
    }

    // Ensure executable bit on POSIX
    if (process.platform !== 'win32' && fs.existsSync(destAbs)) {
      try {
        fs.chmodSync(destAbs, 0o755);
      } catch (_) {
        /* ignore */
      }
    }

    const resolved = resolveLanguageServerBinary(packagePath, meta);
    if (resolved) {
      return { ok: true, strategy: 'download', path: resolved, url };
    }
    // dest written but resolve failed (name mismatch) — return dest if exists
    if (fs.existsSync(destAbs)) {
      return { ok: true, strategy: 'download', path: destAbs, url };
    }
    return { ok: false, reason: 'download completed but binary not found' };
  } catch (err) {
    return { ok: false, reason: err.message || String(err) };
  }
}

async function gunzipFile(src, dest) {
  await pipeline(createReadStream(src), zlib.createGunzip(), createWriteStream(dest));
}

/**
 * Build a registerServer() spec from package metadata + resolved binary path.
 */
function registrationFromPackage(packagePath) {
  const meta = readPackageJson(packagePath);
  const ls = getLanguageServerMeta(meta);
  if (!ls) return null;
  const command = resolveLanguageServerBinary(packagePath, meta);
  if (!command) {
    // Still return a PATH-based fallback for activation after manual install
    return {
      id: ls.id || meta.name,
      scopes: ls.scopes || [],
      command: ls.command ? path.basename(ls.command) : ls.id,
      args: Array.isArray(ls.args) ? ls.args : [],
      initializationOptions: ls.initializationOptions || {},
      source: 'package',
      resolved: false
    };
  }
  return {
    id: ls.id || meta.name,
    scopes: ls.scopes || [],
    command,
    args: Array.isArray(ls.args) ? ls.args : [],
    initializationOptions: ls.initializationOptions || {},
    source: 'package',
    resolved: true
  };
}

module.exports = {
  getLanguageServerMeta,
  platformKey,
  rustcTarget,
  expandLsTemplate,
  resolveLanguageServerBinary,
  pickPrebuildUrl,
  ensureLanguageServerBinary,
  registrationFromPackage,
  readPackageJson
};
