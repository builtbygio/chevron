'use strict';

/**
 * Resolve the language server binary this package ships.
 *
 * No require('fs'). A cpm-installed package is community code and privileged
 * requires are blocked (docs/reference/package-node-policy.md); this used to
 * throw at load and take the whole package with it. Everything looked at here
 * is inside the package root, which lives under CHEVRON_HOME and is an
 * allowed FS IPC root, so the editor's delegate can answer.
 */

const path = require('path');

function delegate() {
  const env = global.chevron || global.atom;
  return env && env.applicationDelegate;
}

function readJson(file) {
  const d = delegate();
  if (d && typeof d.readFileSync === 'function') {
    return JSON.parse(String(d.readFileSync(file, 'utf8')));
  }
  // Outside the editor (unit tests, tooling) there is no delegate and no
  // restriction either.
  return JSON.parse(require('fs').readFileSync(file, 'utf8'));
}

function isFile(candidate) {
  const d = delegate();
  try {
    if (d && typeof d.isFileSync === 'function') return Boolean(d.isFileSync(candidate));
    const fs = require('fs');
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch (error) {
    return false;
  }
}

function buildRegistration(packageRoot) {
  const meta = readJson(path.join(packageRoot, 'package.json'));
  const ls = meta.chevron && meta.chevron.languageServer;
  if (!ls) throw new Error(`${meta.name}: missing chevron.languageServer`);

  const rel = ls.command || path.join('bin', ls.id || 'server');
  const candidates = path.isAbsolute(rel)
    ? [rel]
    : [
        path.join(packageRoot, rel),
        path.join(packageRoot, 'node_modules', '.bin', path.basename(rel))
      ];
  if (process.platform === 'win32') {
    for (const c of [...candidates]) {
      candidates.push(c + '.exe', c + '.cmd', c + '.bat');
    }
  }

  let command = null;
  for (const c of candidates) {
    try {
      if (isFile(c)) {
        command = c;
        break;
      }
    } catch (_) {
      /* continue */
    }
  }
  if (!command) command = path.basename(String(rel).replace(/\.cmd$/i, ''));

  return {
    id: ls.id || meta.name,
    scopes: Array.isArray(ls.scopes) ? ls.scopes.slice() : [],
    command,
    args: Array.isArray(ls.args) ? ls.args.slice() : [],
    initializationOptions: ls.initializationOptions || {}
  };
}

function registerWithLsp(lsp, packageRoot) {
  if (!lsp || typeof lsp.registerServer !== 'function') return null;
  const spec = buildRegistration(packageRoot);
  if (!spec.scopes.length) return null;
  return lsp.registerServer(spec);
}

module.exports = { buildRegistration, registerWithLsp };
