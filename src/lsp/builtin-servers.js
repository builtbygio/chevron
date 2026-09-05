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
 * Optional Phase 5 packages (not in the product installer). After
 * `cpm install ./packages/chevron-lsp-*` they live under
 * $CHEVRON_HOME/packages/. Dev checkouts may also have them under
 * resourcePath/packages/ if someone ran npm in that folder.
 *
 * Discovered here (main + renderer, pure Node) so T2 community restrict
 * cannot block registration — chevron-lsp-* activate() uses `fs`.
 */
const OPTIONAL_SERVER_PACKAGES = [
  {
    id: 'typescript',
    packageName: 'chevron-lsp-typescript',
    bins: [
      path.join('node_modules', '.bin', 'typescript-language-server')
    ],
    scopes: [
      'source.ts',
      'source.tsx',
      'source.js',
      'source.js.jsx',
      'source.jsx',
      'source.flow'
    ],
    args: ['--stdio']
  },
  {
    id: 'rust-analyzer',
    packageName: 'chevron-lsp-rust',
    bins: ['bin/rust-analyzer', path.join('node_modules', '.bin', 'rust-analyzer')],
    scopes: ['source.rust'],
    args: []
  },
  {
    id: 'pyright',
    packageName: 'chevron-lsp-python',
    bins: [path.join('node_modules', '.bin', 'pyright-langserver')],
    scopes: ['source.python'],
    args: ['--stdio']
  }
];

function packageSearchRoots(resourcePath) {
  const roots = [];
  const home = process.env.CHEVRON_HOME || process.env.ATOM_HOME;
  if (home) roots.push(path.join(home, 'packages'));
  if (resourcePath) roots.push(path.join(resourcePath, 'packages'));
  return roots;
}

function resolveInstalledPackageCommand(spec, resourcePath) {
  for (const root of packageSearchRoots(resourcePath)) {
    const pkgDir = path.join(root, spec.packageName);
    for (const rel of spec.bins) {
      const candidate = path.join(pkgDir, rel);
      const hit = which(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * All built-in registrations that have a binary (cpm package home, then PATH).
 * @param {{ resourcePath?: string }} [options]
 * @returns {Array<object>}
 */
function resolveBuiltinRegistrations(options = {}) {
  const out = [];
  const seen = new Set();

  function push(reg) {
    if (!reg || seen.has(reg.id)) return;
    seen.add(reg.id);
    out.push(reg);
  }

  for (const spec of OPTIONAL_SERVER_PACKAGES) {
    const installed = resolveInstalledPackageCommand(spec, options.resourcePath);
    if (!installed) continue;
    const extra = {};
    if (spec.id === 'typescript') {
      const tsserverPath = resolveTsserverPath(options.resourcePath);
      if (tsserverPath) extra.initializationOptions = { tsserver: { path: tsserverPath } };
    }
    push({
      id: spec.id,
      scopes: spec.scopes.slice(),
      command: installed,
      args: spec.args.slice(),
      initializationOptions: extra.initializationOptions || {},
      source: 'builtin'
    });
  }

  // TypeScript / JavaScript family
  const tsls = which('typescript-language-server');
  if (tsls) {
    const tsserverPath = resolveTsserverPath(options.resourcePath);
    push({
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
    push({
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
    push({
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
  packageSearchRoots,
  resolveBuiltinRegistrations,
  resolveBuiltinServer,
  resolveTypescriptLanguageServer,
  resolveTsserverPath,
  resolveInstalledPackageCommand,
  OPTIONAL_SERVER_PACKAGES
};
