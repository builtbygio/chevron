'use strict';

const fs = require('fs');
const path = require('path');

function buildRegistration(packageRoot) {
  const meta = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
  );
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
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
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
