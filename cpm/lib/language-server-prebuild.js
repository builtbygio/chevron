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
 * See docs/reference/lsp-server-distribution.md and docs/orientation/cpm-prebuilds.md.
 */

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const tar = require('tar');
const yauzl = require('yauzl');
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

  // Some servers are commonly installed already -- clangd arrives with Xcode,
  // Homebrew, apt and the LLVM installer. Downloading 110 MB next to a copy
  // the machine already has is waste, so a package may name the command to
  // look for and the download is skipped when it is found.
  if (ls.systemCommand) {
    const onSystem = findSystemCommand(ls.systemCommand, opts);
    if (onSystem) {
      return { ok: true, strategy: 'system', path: onSystem };
    }
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

    const extracted = await unpackDownload(buf, destAbs, ls, packagePath);
    if (extracted.ok === false) return extracted;

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

// A prebuild arrives in one of four shapes, and only two were handled:
//
//   raw binary        written straight to the destination
//   gzipped binary    rust-analyzer; gunzip to the destination
//   tar.gz            harper-ls; gunzip yields a tar, not an executable
//   zip               clangd; the binary sits at clangd_<version>/bin/clangd,
//                     never at the flat path the destination names
//
// The last two produced a tar file or an empty destination where an
// executable was expected, and the download was reported as succeeding.
//
// A package may name the member explicitly with `archivePath`; otherwise the
// archive is searched for the file the command is named after, which is what
// the two upstream layouts need.

const TAR_MAGIC_OFFSET = 257;

function looksLikeTar(buffer) {
  if (buffer.length < TAR_MAGIC_OFFSET + 5) return false;
  return buffer.slice(TAR_MAGIC_OFFSET, TAR_MAGIC_OFFSET + 5).toString() === 'ustar';
}

// Depth-first search for the wanted basename, preferring a file that is
// already executable so `clangd` wins over a same-named directory or doc.
function findInTree(root, wanted) {
  let fallback = null;
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
        continue;
      }
      if (entry.name !== wanted && entry.name !== wanted + '.exe') continue;
      try {
        if (fs.statSync(full).mode & 0o111) return full;
      } catch (error) {
        /* fall through to fallback */
      }
      if (!fallback) fallback = full;
    }
    return null;
  };
  return walk(root) || fallback;
}

// yauzl rather than spawning `unzip`: Windows has no unzip, and Windows is
// exactly where a downloaded clangd matters most -- it is the one platform
// that ships nothing. Spawning also meant an empty PATH turned a missing tool
// into "unzip failed: null", which says nothing useful.
//
// Entry names are checked against the destination before writing: a zip can
// name ../../.. and walk out of the directory it is being expanded into.
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error) return reject(error);

      zip.on('error', reject);
      zip.on('end', resolve);
      zip.readEntry();

      zip.on('entry', entry => {
        const target = path.resolve(destDir, entry.fileName);
        const within =
          target === path.resolve(destDir) ||
          target.startsWith(path.resolve(destDir) + path.sep);
        if (!within) {
          return reject(new Error(`entry escapes the archive root: ${entry.fileName}`));
        }

        if (/\/$/.test(entry.fileName)) {
          fse.ensureDir(target).then(() => zip.readEntry(), reject);
          return;
        }

        zip.openReadStream(entry, (streamError, readStream) => {
          if (streamError) return reject(streamError);
          fse
            .ensureDir(path.dirname(target))
            .then(() => {
              const out = createWriteStream(target);
              readStream.pipe(out);
              out.on('error', reject);
              out.on('close', () => {
                // Keep the executable bit: it lives in the high bits of the
                // external attributes, and a clangd without it cannot run.
                const mode = (entry.externalFileAttributes >>> 16) & 0o7777;
                if (mode && process.platform !== 'win32') {
                  fs.chmod(target, mode, () => zip.readEntry());
                } else {
                  zip.readEntry();
                }
              });
            })
            .catch(reject);
        });
      });
    });
  });
}

// PATH plus the locations a package may name, for servers that are usually
// installed by something other than us.
function findSystemCommand(command, opts = {}) {
  const exe = (opts.platform || process.platform) === 'win32'
    ? command + '.exe'
    : command;
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return candidate;
    } catch (error) {
      /* keep looking */
    }
  }
  return null;
}

// Some servers are a tree, not a file. clangd needs lib/clang beside
// bin/clangd -- the resource headers it reads at run time -- so extracting
// only the executable produces something that starts and then cannot find its
// builtin includes.
//
// The archive's single top-level directory is stripped, so clangd_22.1.6/bin
// becomes <root>/bin and the command path does not have to name a version.
async function installTree(unpackDir, rootAbs) {
  let entries = await fse.readdir(unpackDir);
  entries = entries.filter(name => name !== '__MACOSX');
  let source = unpackDir;
  if (entries.length === 1) {
    const only = path.join(unpackDir, entries[0]);
    if ((await fse.stat(only)).isDirectory()) source = only;
  }
  await fse.remove(rootAbs).catch(() => {});
  await fse.ensureDir(path.dirname(rootAbs));
  await fse.move(source, rootAbs, { overwrite: true });
}

async function unpackDownload(buf, destAbs, ls, packagePath) {
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;

  if (!isGzip && !isZip) {
    await fse.writeFile(destAbs, buf);
    return { ok: true };
  }

  // Outside the destination, not beside it. With extract: 'tree' the root is
  // wiped before the move, and an unpack directory under <package>/server
  // would be deleted along with it -- taking the extracted files with it and
  // failing the move with ENOENT.
  const unpackDir = packagePath
    ? path.join(packagePath, '.cpm-unpack')
    : destAbs + '.unpack';
  await fse.remove(unpackDir).catch(() => {});
  await fse.ensureDir(unpackDir);

  try {
    if (isGzip) {
      const gzPath = path.join(unpackDir, 'download.gz');
      const plain = path.join(unpackDir, 'download');
      await fse.writeFile(gzPath, buf);
      await gunzipFile(gzPath, plain);
      await fse.remove(gzPath).catch(() => {});

      const head = await fse.readFile(plain).catch(() => Buffer.alloc(0));
      if (!looksLikeTar(head)) {
        // A gzipped binary, which is what rust-analyzer ships.
        await fse.move(plain, destAbs, { overwrite: true });
        return { ok: true };
      }
      await tar.x({ file: plain, cwd: unpackDir });
      await fse.remove(plain).catch(() => {});
    } else {
      const zipPath = path.join(unpackDir, 'download.zip');
      await fse.writeFile(zipPath, buf);
      try {
        await extractZip(zipPath, unpackDir);
      } catch (error) {
        return { ok: false, reason: `zip extraction failed: ${error.message}` };
      }
      await fse.remove(zipPath).catch(() => {});
    }

    // extract: 'tree' keeps the whole archive, for a server that needs files
    // beside its executable. The root is the first segment of `command`, so
    // `server/bin/clangd` unpacks to <package>/server -- named rather than
    // derived by walking dirname twice, which would land on the package
    // itself for a one-level command and overwrite it.
    if (ls && ls.extract === 'tree') {
      const segments = String(ls.command || '').split(/[\\/]/).filter(Boolean);
      const rootRel = segments[0];
      // Needs a directory and a file inside it. With one segment the root
      // would be the command itself, so the path the command names becomes a
      // directory and nothing can run it.
      if (segments.length < 2 || rootRel === '.' || rootRel === '..') {
        return {
          ok: false,
          reason:
            'extract: tree needs command to start with a directory, got ' +
            `${ls.command}`
        };
      }
      await installTree(unpackDir, path.join(packagePath, rootRel));
      return { ok: true };
    }

    const wanted = path.basename(destAbs);
    const member = ls && ls.archivePath
      ? path.join(unpackDir, ls.archivePath)
      : findInTree(unpackDir, wanted);

    if (!member || !fs.existsSync(member)) {
      return {
        ok: false,
        reason:
          `archive did not contain ${ls && ls.archivePath ? ls.archivePath : wanted}` +
          ' (set chevron.languageServer.archivePath to name it)'
      };
    }
    await fse.move(member, destAbs, { overwrite: true });
    return { ok: true };
  } finally {
    await fse.remove(unpackDir).catch(() => {});
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
