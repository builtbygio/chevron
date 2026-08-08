'use strict';

/**
 * Built-in server table (PATH only — no download).
 * Phase 1: TypeScript. Phase 3: + rust-analyzer, pyright.
 */

const path = require('path');
const fs = require('fs');

function which(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;
  // Already absolute
  if (cmd.startsWith('/') || cmd.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(cmd)) {
    try {
      fs.accessSync(cmd, fs.constants.X_OK);
      return cmd;
    } catch (_) {
      return fs.existsSync(cmd) ? cmd : null;
    }
  }
  const pathEnv = process.env.PATH || '';
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (_) {
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch (__) {
          /* continue */
        }
      }
    }
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
 * All built-in registrations that have a binary on PATH.
 * @param {{ resourcePath?: string }} [options]
 * @returns {Array<object>}
 */
function resolveBuiltinRegistrations(options = {}) {
  const out = [];

  // TypeScript / JavaScript family
  const tsls = which('typescript-language-server');
  if (tsls) {
    const tsserverPath = resolveTsserverPath(options.resourcePath);
    out.push({
      id: 'typescript',
      scopes: [
        'source.ts',
        'source.tsx',
        'source.js',
        'source.js.jsx',
        'source.jsx',
        'source.flow'
      ],
      command: tsls,
      args: ['--stdio'],
      initializationOptions: tsserverPath
        ? { tsserver: { path: tsserverPath } }
        : {},
      source: 'builtin'
    });
  }

  // Rust — often negotiates utf-8 positionEncoding
  const rustAnalyzer = which('rust-analyzer');
  if (rustAnalyzer) {
    out.push({
      id: 'rust-analyzer',
      scopes: ['source.rust'],
      command: rustAnalyzer,
      args: [],
      initializationOptions: {},
      source: 'builtin'
    });
  }

  // Python via pyright
  const pyright = which('pyright-langserver') || which('pyright');
  if (pyright) {
    const args = pyright.endsWith('pyright') || pyright.endsWith('pyright.CMD')
      ? ['--langserver']
      : ['--stdio'];
    // pyright-langserver uses --stdio; bare pyright uses --langserver
    const isLangserver =
      path.basename(pyright).toLowerCase().includes('langserver');
    out.push({
      id: 'pyright',
      scopes: ['source.python'],
      command: pyright,
      args: isLangserver ? ['--stdio'] : args,
      initializationOptions: {},
      source: 'builtin'
    });
  }

  return out;
}

/**
 * @deprecated Phase 1 helper — prefer resolveRegistration from registry.js
 */
function resolveBuiltinServer(scopeName, options = {}) {
  const regs = resolveBuiltinRegistrations(options);
  for (const reg of regs) {
    for (const s of reg.scopes) {
      if (
        scopeName === s ||
        (scopeName && scopeName.startsWith(s + '.'))
      ) {
        return {
          serverId: reg.id,
          command: reg.command,
          args: reg.args,
          initializationOptions: reg.initializationOptions
        };
      }
    }
  }
  return null;
}

function resolveTypescriptLanguageServer() {
  const p = which('typescript-language-server');
  if (p) return { command: p, args: ['--stdio'] };
  const npx = which('npx');
  if (npx) {
    return {
      command: npx,
      args: ['--yes', 'typescript-language-server', '--stdio']
    };
  }
  return null;
}

module.exports = {
  which,
  resolveBuiltinRegistrations,
  resolveBuiltinServer,
  resolveTypescriptLanguageServer,
  resolveTsserverPath
};
