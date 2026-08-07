'use strict';

/**
 * Built-in server table (PATH only — no download). Phase 1: TypeScript family.
 */

const path = require('path');
const fs = require('fs');

function which(cmd) {
  const pathEnv = process.env.PATH || '';
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (_) {
        /* continue */
      }
    }
  }
  return null;
}

function resolveTypescriptLanguageServer() {
  const fromPath = which('typescript-language-server');
  if (fromPath) return { command: fromPath, args: ['--stdio'] };

  // npx is last-resort and slow; prefer global binary
  const npx = which('npx');
  if (npx) {
    return {
      command: npx,
      args: ['--yes', 'typescript-language-server', '--stdio']
    };
  }
  return null;
}

function resolveTsserverPath(resourcePath) {
  const candidates = [];
  if (resourcePath) {
    candidates.push(
      path.join(resourcePath, 'node_modules', 'typescript', 'lib', 'tsserver.js')
    );
  }
  try {
    candidates.push(require.resolve('typescript/lib/tsserver.js'));
  } catch (_) {
    /* ignore */
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * @param {string} scopeName
 * @param {{resourcePath?: string}} options
 * @returns {null|{serverId: string, command: string, args: string[], initializationOptions?: object}}
 */
function resolveBuiltinServer(scopeName, options = {}) {
  const { isTypescriptScope } = require('./language-id');
  if (!isTypescriptScope(scopeName)) return null;

  const bin = resolveTypescriptLanguageServer();
  if (!bin) return null;

  const tsserverPath = resolveTsserverPath(options.resourcePath);
  const initializationOptions = tsserverPath
    ? { tsserver: { path: tsserverPath } }
    : {};

  return {
    serverId: 'typescript',
    command: bin.command,
    args: bin.args,
    initializationOptions
  };
}

module.exports = {
  resolveBuiltinServer,
  resolveTypescriptLanguageServer,
  resolveTsserverPath,
  which
};
