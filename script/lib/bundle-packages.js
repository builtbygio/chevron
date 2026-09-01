'use strict';

/**
 * Bundle a package into one self-contained index.js.
 *
 * Step 2 of docs/decisions/build-architecture.md. A package that is one file
 * with its dependencies inlined is a package that can be shipped as a single
 * signed artifact -- bundled into the app or fetched from the registry, same
 * bytes either way. See docs/reference/package-artifact-format.md.
 *
 * Rolled out package by package rather than by globbing the catalog, because
 * a package has to be checked for two things before it can join the list:
 *
 *   1. It must not reach into core. lsp-ui requires ../../../src/lsp,
 *      ../../../src/text-editor-element and ../../../src/get-window-load-settings.
 *      Bundling those would inline copies of core modules into the package;
 *      leaving them external means the package depends on paths that are not
 *      API. Either way it is not self-contained, so it cannot be an artifact
 *      until those imports become a real interface. Excluded, deliberately.
 *   2. Its runtime dependencies must be inlineable. Anything native, or
 *      anything whose identity core checks, has to stay external.
 *
 * What stays external, and why it is not just "node builtins":
 *
 *   chevron / atom   the editor global, provided at run time
 *   electron         provided by the runtime
 *   event-kit        core uses it too. A bundled second copy would hand core
 *                    Disposables from a different class, so instanceof checks
 *                    against core's copy would fail. These packages declare no
 *                    dependencies and resolve it from the app's hoisted
 *                    node_modules, which is exactly why it is easy to miss.
 *
 * After bundling, everything that went into the bundle is removed and main is
 * rewritten to ./index.js. Removing the inputs is the point rather than
 * tidiness: if anything still reaches into them, the build or the smoke test
 * says so immediately instead of the bundle silently being dead weight beside
 * the sources it was meant to replace.
 *
 * "Everything that went into the bundle" is esbuild's own metafile, not lib/.
 * Deleting lib/ alone left the three autocomplete packages shipping their
 * completions.json twice -- inlined in the bundle and still sitting beside it,
 * 436K of duplicate data that nothing read. The metafile is the only thing
 * that knows what was actually inlined.
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

// Native modules can never be inlined -- esbuild has no loader for .node, and
// a compiled binary is not something a bundle can absorb. They stay external
// and are required from node_modules at run time, exactly as they are today.
//
// This was mistaken for a blocker: six packages sat in BLOCKED as "native"
// when what they needed was the native module marked external, the same
// treatment event-kit gets. Bundling still pays off for them -- one entry
// point, the JavaScript resolved ahead of time.
//
// It does mean these cannot become fully self-contained registry artifacts.
// That is the native-module track, deliberately out of scope here.
const NATIVE = [
  '@atom/fuzzy-native',
  'ctags',
  'keytar',
  'oniguruma',
  'pathwatcher',
  'spellchecker',
  'superstring'
];

// Packages whose value is a file on disk rather than code. Inlining them
// moves the code away from the asset it points at: @vscode/ripgrep computes
// rgPath as path.join(__dirname, '../bin/rg'), so once it is inlined into
// fuzzy-finder's bundle __dirname is the package root and the path becomes
// node_modules/bin/rg. The binary is still there; nothing can find it.
const BINARY_ASSETS = ['@vscode/ripgrep'];

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
  'lsp-diagnostics-stub',
  'lsp-servers',
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

// Not bundled, with the reason. A package leaves this list by having its
// reason removed, not by someone trying it again and finding it works.
const BLOCKED = {
              // Not the native module -- fs-admin would simply be external like the
  // others. lsp-ui requires ../../../src/lsp, ../../../src/text-editor-element
  // and ../../../src/get-window-load-settings, and bundling it inlines 45 core
  // modules into the package: decoration.js, cursor.js, selection.js, the
  // tokenizer. Those carry state and identity core also uses, so it is the
  // grim problem at 45x. Blocked until those imports are a real interface.
  // Two problems, both of which the guards caught before this shipped: it
  // forks lib/worker.js by path, a second entry point the bundle does not
  // reach, and lib/helpers.js locates files through __dirname in three places.
  // Bundling it cost all 17 github: commands -- the package still activated,
  // registered nothing, and reported no error.
  // Three separate obstacles, not one. lib/worker.js is loaded as a second
  // renderer by path; lib/graphql/load-recovered.js locates a data directory
  // as path.join(__dirname, '..', '..', 'graphql', 'recovered'); and
  // lib/helpers.js:200 does require.resolve(path.join(__dirname, 'shared',
  // relPath)) -- a dynamic require of a computed path, which no bundler can
  // follow. The last one is the real blocker; the others have known fixes.
  github: 'dynamic require.resolve of a computed path in lib/helpers.js',
  'lsp-ui': 'requires ../../../src/; bundling inlines 45 core modules',
  // htmlparser2 imports the 'entities/decode' subpath, which does not resolve
  // in the installed entities version. A dependency-resolution problem, not a
  // bundling one.
  'markdown-preview': "htmlparser2 imports 'entities/decode', which does not resolve"
};
function bundleOne(packageName) {
  const packageRoot = path.join(
    CONFIG.intermediateAppPath,
    'node_modules',
    packageName
  );
  const manifestPath = path.join(packageRoot, 'package.json');
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
    // Resolve the way the runtime does. Without this esbuild honours the
    // "import" branch of a dependency's exports map and inlines its ESM build,
    // where require() would have taken the CommonJS one -- a different file
    // with, sometimes, a different shape.
    //
    // natural does `require('underscore')._`, an old idiom the UMD build
    // supports and the ESM build does not, so spell-check bundled cleanly and
    // then failed to activate with "Cannot read properties of undefined
    // (reading 'without')". Nothing about the bundle looked wrong; it had
    // simply inlined a different underscore.
    //
    // mainFields alone does not fix it: an exports map takes precedence over
    // main, so the conditions are what decide.
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
