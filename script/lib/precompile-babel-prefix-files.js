'use strict';

/**
 * Offline precompile of Atom-style Babel opt-in sources (issue #62 Option 3).
 *
 * Finds files starting with:
 *   /** @babel *\/, 'use babel', "use babel", /* @flow *\/, // @flow
 * and rewrites them to plain CJS/JSX-free JS that runs on Electron 43 without
 * runtime babel-core.
 *
 * Prefers esbuild (script dependency or CHEVRON_ESBUILD_PATH); falls back to
 * babel-core@5 + static/babelrc.json if esbuild is unavailable.
 *
 * Usage:
 *   node script/lib/precompile-babel-prefix-files.js [--write] [rootDir|file ...]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const write = process.argv.includes('--write');
const roots = process.argv
  .slice(2)
  .filter(a => a !== '--write')
  .map(p => path.resolve(p));

const PREFIXES = [
  '/** @babel */',
  '"use babel"',
  "'use babel'",
  '/* @flow */',
  '// @flow'
];

function resolveEsbuild() {
  if (process.env.CHEVRON_ESBUILD_PATH) {
    return require(process.env.CHEVRON_ESBUILD_PATH);
  }
  const candidates = [
    path.join(repoRoot, 'script', 'node_modules', 'esbuild'),
    path.join(repoRoot, 'node_modules', 'esbuild'),
    '/tmp/esbuild-tool/node_modules/esbuild'
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (_) {
      /* next */
    }
  }
  return null;
}

function hasBabelOptIn(sourceCode) {
  const start = sourceCode.replace(/^\uFEFF/, '').slice(0, 120);
  return PREFIXES.some(prefix => start.indexOf(prefix) === 0);
}

function stripOptInLines(sourceCode) {
  const lines = sourceCode.replace(/^\uFEFF/, '').split('\n');
  const out = [];
  let stripping = true;
  for (const line of lines) {
    if (stripping) {
      const s = line.trim();
      if (
        s === '' ||
        PREFIXES.some(p => s === p || s === p + ';') ||
        /^\/\*\*\s*@jsx\b/.test(s)
      ) {
        continue;
      }
      stripping = false;
    }
    out.push(line);
  }
  return out.join('\n');
}

function stripLeadingOptIn(code) {
  let out = code.replace(/^\uFEFF/, '');
  for (let n = 0; n < 10; n++) {
    let changed = false;
    for (const prefix of PREFIXES) {
      if (out.startsWith(prefix)) {
        out = out.slice(prefix.length).replace(/^\s*;?\s*\n?/, '');
        changed = true;
        break;
      }
    }
    if (!changed) {
      const m = out.match(/^\/\*\*\s*@jsx[^*]*\*\/\s*\n?/);
      if (m) {
        out = out.slice(m[0].length);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

function transformWithEsbuild(esbuild, sourceCode, filePath) {
  const prepared = stripOptInLines(sourceCode);
  const head = sourceCode.slice(0, 400);
  const hasJsx =
    /@jsx\b/.test(head) ||
    /<[A-Za-z][\w.-]*(\s|>|\/)/.test(sourceCode) ||
    /return\s*\(\s*</.test(sourceCode);
  const hasFlow = /@flow\b/.test(head);

  let loader = 'js';
  if (hasJsx) loader = 'jsx';
  else if (hasFlow) loader = 'ts';

  const result = esbuild.transformSync(prepared, {
    loader,
    jsx: 'transform',
    jsxFactory: 'etch.dom',
    jsxFragment: 'etch.dom',
    format: 'cjs',
    target: 'es2020',
    platform: 'node',
    sourcemap: false,
    charset: 'utf8',
    sourcefile: path.basename(filePath)
  });
  return fixDefaultOnlyEsbuildExport(result.code);
}

/**
 * esbuild wraps default-only ESM as { __esModule, default }. Atom packages and
 * internal requires expect module.exports to BE the default. Unwrap when there
 * are no other named exports.
 */
function fixDefaultOnlyEsbuildExport(code) {
  if (!code.includes('__toCommonJS')) return code;
  if (code.includes('Chevron: Node require() interop for default-only esbuild')) {
    return code;
  }
  return (
    code.replace(/\s*$/, '') +
    `

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
`
  );
}

function transformWithBabel5(sourceCode, filePath) {
  const babel = require(path.join(repoRoot, 'node_modules', 'babel-core'));
  const defaultOptions = require(path.join(repoRoot, 'static', 'babelrc.json'));
  try {
    const Logger = require(path.join(
      repoRoot,
      'node_modules',
      'babel-core',
      'lib',
      'transformation',
      'file',
      'logger'
    ));
    const noop = function() {};
    Logger.prototype.debug = noop;
    Logger.prototype.verbose = noop;
  } catch (_) {
    /* ignore */
  }

  let filePathForBabel = filePath;
  if (process.platform === 'win32') {
    filePathForBabel =
      'file:///' + path.resolve(filePath).replace(/\\/g, '/');
  }
  const options = { filename: filePathForBabel };
  for (const key of Object.keys(defaultOptions)) {
    options[key] = defaultOptions[key];
  }
  return babel.transform(sourceCode, options).code;
}

function transformFile(filePath, esbuild) {
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  if (!hasBabelOptIn(sourceCode)) {
    return { skipped: true };
  }

  let code;
  if (esbuild) {
    code = transformWithEsbuild(esbuild, sourceCode, filePath);
  } else {
    code = transformWithBabel5(sourceCode, filePath);
  }
  code = stripLeadingOptIn(code);
  if (hasBabelOptIn(code)) {
    code = stripOptInLines(code);
  }
  if (!code.endsWith('\n')) code += '\n';
  return { skipped: false, code, sourceCode };
}

function shouldSkipDir(name) {
  return (
    name === 'node_modules' ||
    name === '.git' ||
    name === 'out' ||
    name === 'dist' ||
    name === 'prebuilds'
  );
}

function walkJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      walkJsFiles(abs, acc);
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      acc.push(abs);
    }
  }
  return acc;
}

function defaultRoots() {
  const pkg = require(path.join(repoRoot, 'package.json'));
  const list = [path.join(repoRoot, 'packages')];
  for (const name of Object.keys(pkg.packageDependencies || {})) {
    list.push(path.join(repoRoot, 'node_modules', name));
  }
  list.push(path.join(repoRoot, 'spec', 'fixtures', 'babel'));
  return list;
}

function main() {
  const esbuild = resolveEsbuild();
  if (esbuild) {
    console.log('precompile-babel: using esbuild');
  } else {
    console.log('precompile-babel: using babel-core@5 fallback');
  }

  const targets = roots.length ? roots : defaultRoots();
  let transformed = 0;
  let skipped = 0;
  let errors = 0;

  for (const root of targets) {
    if (!fs.existsSync(root)) {
      console.warn(`skip missing: ${root}`);
      continue;
    }
    const files = fs.statSync(root).isFile() ? [root] : walkJsFiles(root);
    for (const file of files) {
      try {
        const result = transformFile(file, esbuild);
        if (result.skipped) {
          skipped++;
          continue;
        }
        const rel = path.relative(process.cwd(), file);
        if (write) {
          fs.writeFileSync(file, result.code, 'utf8');
          console.log(`wrote ${rel}`);
        } else {
          console.log(
            `would write ${rel} (${result.sourceCode.length} -> ${result.code.length})`
          );
        }
        transformed++;
      } catch (err) {
        errors++;
        console.error(
          `error ${path.relative(process.cwd(), file)}: ${err.message}`
        );
      }
    }
  }

  console.log(
    `precompile-babel: transformed=${transformed} skipped=${skipped} errors=${errors} write=${write}`
  );
  if (errors) process.exit(1);
}

main();
