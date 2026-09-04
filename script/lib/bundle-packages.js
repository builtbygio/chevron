'use strict';

/**
 * Bundle a package into one self-contained index.js, then delete whatever the
 * bundle absorbed and point main at it.
 *
 * Step 2 of docs/decisions/build-architecture.md; artifact shape in
 * docs/reference/package-artifact-format.md.
 *
 * What to delete comes from esbuild's metafile, not from lib/ -- only the
 * metafile knows what was actually inlined.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const CONFIG = require('../config');

const ROOT = path.resolve(__dirname, '..', '..');

// esbuild reports inputs relative to the working directory; a directory left
// empty by deleting them is not something the package needs either.
function removeEmptyDirectories(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    removeEmptyDirectories(full);
    if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
  }
}

// Runtime-provided. Chosen by correctness, not size -- see
// docs/decisions/bundled-dependency-sharing.md. grim is a global deprecation
// registry that core writes and deprecation-cop reads; a copy per package
// means deprecation-cop reads its own and silently shows an empty list.
const RUNTIME_PROVIDED = ['chevron', 'atom', 'electron', 'event-kit', 'grim'];

// Native modules stay external: esbuild has no .node loader. Their packages
// still bundle usefully, but cannot become self-contained registry artifacts.
const NATIVE = [
  '@atom/fuzzy-native',
  'ctags',
  'keytar',
  'pathwatcher',
  'spellchecker',
  'superstring'
];

// Packages whose value is a file on disk rather than code. Inlining them
// moves the code away from the asset it points at: @vscode/ripgrep computes
// rgPath as path.join(__dirname, '../bin/rg'), so once it is inlined into
// fuzzy-finder's bundle __dirname is the package root and the path becomes
// node_modules/bin/rg. The binary is still there; nothing can find it.
const BINARY_ASSETS = [
  '@vscode/ripgrep',
  // dugite locates its embedded git as path.resolve(__dirname, '..', '..',
  // 'git'), so inlining it points github at a git that is not there.
  'dugite'
];

const EXTERNAL = [...RUNTIME_PROVIDED, ...NATIVE, ...BINARY_ASSETS];

// Everything that bundles cleanly today. Explicit rather than derived: what a
// package pulls in changes when its dependencies change, and a list that
// discovers itself would start bundling something new without anyone deciding
// to. BLOCKED below records the frontier and why, so the two stay in step.
const BUNDLED = [
  'about',
  'archive-view',
  'autocomplete-chevron-api',
  'autocomplete-css',
  'autocomplete-html',
  'autocomplete-plus',
  'autocomplete-snippets',
  'autoflow',
  'autosave',
  'background-tips',
  'bookmarks',
  'bracket-matcher',
  'command-palette',
  'deprecation-cop',
  'dev-live-reload',
  'encoding-selector',
  'find-and-replace',
  'fuzzy-finder',
  'git-diff',
  'github',
  'go-to-line',
  'grammar-selector',
  'image-view',
  'keybinding-resolver',
  'language-c',
  'language-html',
  'language-javascript',
  'language-ruby',
  'language-rust-bundled',
  'language-typescript',
  'line-ending-selector',
  'link',
  'markdown-preview',
  'lsp-diagnostics-stub',
  'lsp-servers',
  'lsp-ui',
  'notifications',
  'open-on-github',
  'settings-view',
  'snippets',
  'spell-check',
  'status-bar',
  'styleguide',
  'symbols-view',
  'tabs',
  'timecop',
  'tree-view',
  'welcome',
  'whitespace',
  'wrap-guide'
];

// Files that legitimately survive bundling: esbuild only reaches what main
// requires, so anything loaded by path stays in lib/. Declaring them lets the
// "no code survives bundling" check tell them from leftovers.
const SURVIVES_BUNDLING = {
  github: {
    'lib/worker.js': 'loaded as a second renderer by path',
    'lib/shared/keytar-strategy.js':
      'passed to a child process through ATOM_GITHUB_KEYTAR_STRATEGY_PATH',
    // Nothing reachable from main requires this one -- the other twelve
    // mutations are required by controllers, this one is not -- but
    // script/ci/github-pr-mutations.test.js loads it by path and asserts the
    // GraphQL it sends. Whether the app should be using it is a separate
    // question from whether it may be deleted; it may not.
    'lib/mutations/create-pull-request.js':
      'unreached from main, covered by script/ci/github-pr-mutations.test.js'
  }
};

const BLOCKED = {
            };
function bundleOne(packageName) {
  const packageRoot = path.join(
    CONFIG.intermediateAppPath,
    'node_modules',
    packageName
  );
  const manifestPath = path.join(packageRoot, 'package.json');
  const kept = new Set(Object.keys(SURVIVES_BUNDLING[packageName] || {}));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.main) {
    throw new Error(`${packageName} has no main; nothing to bundle`);
  }

  const entry = require.resolve(path.resolve(packageRoot, manifest.main));
  const outfile = path.join(packageRoot, 'index.js');

  const result = esbuild.buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: EXTERNAL,
    // Resolve the way require() does. Without this esbuild takes the "import"
    // branch of an exports map and inlines a package's ESM build, which can
    // have a different shape. mainFields does not help -- exports wins.
    conditions: ['node', 'require'],
    logLevel: 'warning',
    metafile: true,
    // Packages are first-party and shipped with the app; readable output is
    // worth more than the bytes when someone is reading a stack trace.
    minify: false,
    sourcemap: false
  });

  manifest.main = './index.js';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // Delete exactly what was inlined -- sources and any data file the bundle
  // absorbed -- and nothing else. Assets the loader still reads on its own
  // (grammars, keymaps, menus, settings, styles) are never bundle inputs, so
  // they are never in this list.
  let removed = 0;
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = path.resolve(ROOT, input);
    if (!absolute.startsWith(packageRoot + path.sep)) continue;
    if (absolute === outfile) continue;
    // A package.json can be a bundle input -- github requires its own for the
    // version string -- but the loader reads it to find the package at all.
    // Inlining it does not stop it being needed on disk, and deleting it makes
    // the package vanish. The build caught this immediately; nothing else
    // would have.
    if (absolute === manifestPath) continue;
    // A file can be both inlined and still needed on disk. github requires
    // lib/shared/keytar-strategy.js, so esbuild absorbs it, and also hands its
    // path to a child process -- which cannot read the bundle. Deleting it
    // left lib/shared holding nothing but a README.
    if (kept.has(path.relative(packageRoot, absolute).split(path.sep).join('/'))) {
      continue;
    }
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
      removed++;
    }
  }
  removeEmptyDirectories(packageRoot);

  return { size: fs.statSync(outfile).size, removed };
}

module.exports = function() {
  let total = 0;
  let totalRemoved = 0;
  const sizes = [];
  for (const packageName of BUNDLED) {
    const packageRoot = path.join(
      CONFIG.intermediateAppPath,
      'node_modules',
      packageName
    );
    if (!fs.existsSync(packageRoot)) {
      throw new Error(
        `${packageName} is in the bundle list but is not a bundled package`
      );
    }
    const { size, removed } = bundleOne(packageName);
    total += size;
    totalRemoved += removed;
    sizes.push(`${packageName} ${Math.round(size / 1024)}K`);
  }
  console.log(
    `Bundled ${BUNDLED.length} packages into one index.js each ` +
      `(${Math.round(total / 1024)}K total, ${totalRemoved} inlined files ` +
      `removed): ${sizes.join(', ')}`
  );
};

module.exports.BUNDLED = BUNDLED;
module.exports.EXTERNAL = EXTERNAL;
module.exports.NATIVE = NATIVE;
module.exports.BINARY_ASSETS = BINARY_ASSETS;
module.exports.RUNTIME_PROVIDED = RUNTIME_PROVIDED;
module.exports.BLOCKED = BLOCKED;
module.exports.SURVIVES_BUNDLING = SURVIVES_BUNDLING;
