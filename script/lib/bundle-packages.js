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
const EXTERNAL = ['chevron', 'atom', 'electron', 'event-kit', 'grim'];

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
  'command-palette',
  'deprecation-cop',
  'dev-live-reload',
  'encoding-selector',
  'find-and-replace',
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
  'status-bar',
  'styleguide',
  'tabs',
  'timecop',
  'welcome',
  'whitespace',
  'wrap-guide'
];

// Not bundled, with the reason. A package leaves this list by having its
// reason removed, not by someone trying it again and finding it works.
const BLOCKED = {
  'bracket-matcher': 'oniguruma (native, reached transitively)',
  'fuzzy-finder': '@atom/fuzzy-native (native)',
  github: 'keytar (native)',
  'spell-check': 'spellchecker (native)',
  'symbols-view': 'ctags (native)',
  'tree-view': 'pathwatcher (native)',
  'lsp-ui': 'fs-admin (native), and requires ../../../src/ -- not self-contained',
  'markdown-preview': 'esbuild cannot parse htmlparser2/dist/commonjs/Parser.js',
  // lib/helpers.ts computes the package root as path.resolve(__dirname, '..'),
  // which is right from lib/ and wrong from the bundle at the package root --
  // it lands on node_modules/ instead. snippets.ts then loads its built-in
  // snippets from <that>/lib/snippets, finds nothing, and the package
  // activates with no bundled snippets at all. Nothing throws. Fixing it means
  // giving the package a way to find its own root that does not depend on how
  // deep the calling file sits, which is its own change.
  snippets: "lib/helpers.ts locates package files via path.resolve(__dirname, '..')"
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
module.exports.BLOCKED = BLOCKED;
