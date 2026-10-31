'use strict';

/**
 * Locate the ripgrep binary for find-in-project and fuzzy-finder.
 *
 * Strategy (CJS, sync):
 *  1. Prefer `@vscode/ripgrep-<platform>-<arch>/bin/rg` — the 1.18+ layout
 *     (optionalDependencies; no postinstall).
 *  2. Fall back to `require('@vscode/ripgrep').rgPath` — the 1.15 layout
 *     (`bin/rg` beside the wrapper, filled by postinstall / ensure-ripgrep).
 *  3. Rewrite `app.asar` → `app.asar.unpacked` and prefer a path that exists.
 *
 * Avoids depending on Node's require(esm) for the 1.18 wrapper. Callers that
 * already have a path (tests) pass it as the first argument.
 */

const fs = require('fs');
const { createRequire } = require('module');

const requireFromHere = createRequire(__filename);

function rgBinName(platform = process.platform) {
  return platform === 'win32' ? 'rg.exe' : 'rg';
}

function platformPackageName(
  platform = process.platform,
  arch = process.env.npm_config_arch || process.arch
) {
  return `@vscode/ripgrep-${platform}-${arch}`;
}

function preferUnpacked(raw, existsFn) {
  const unpacked = String(raw).replace(/\bapp\.asar\b/, 'app.asar.unpacked');
  for (const candidate of [unpacked, raw]) {
    if (candidate && existsFn(candidate)) return candidate;
  }
  return unpacked;
}

function resolveFromPlatformPackage(resolveFn) {
  const name = platformPackageName();
  const bin = `${name}/bin/${rgBinName()}`;
  try {
    return resolveFn(bin);
  } catch {
    return null;
  }
}

function defaultLoadWrapper() {
  try {
    const mod = requireFromHere('@vscode/ripgrep');
    return mod && mod.rgPath ? mod.rgPath : null;
  } catch {
    return null;
  }
}

function resolveRgPath(
  rgPath,
  existsFn = p => fs.existsSync(p),
  resolveFn = id => requireFromHere.resolve(id),
  loadWrapper = defaultLoadWrapper
) {
  let raw = rgPath || null;
  if (!raw) {
    raw = resolveFromPlatformPackage(resolveFn) || loadWrapper();
  }
  if (!raw) {
    throw new Error(
      'ripgrep binary not found (tried platform package and @vscode/ripgrep)'
    );
  }
  return preferUnpacked(raw, existsFn);
}

module.exports = {
  resolveRgPath,
  rgBinName,
  platformPackageName,
  preferUnpacked
};
