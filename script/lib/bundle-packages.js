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

const EXTERNAL = ['chevron', 'atom', 'electron', 'event-kit'];

// Zero-runtime-dependency packages with JavaScript, minus lsp-ui. The twelve
// grammar-only language-* packages have no code to bundle at all.
const BUNDLED = [
  'autocomplete-chevron-api',
  'autocomplete-css',
  'autocomplete-html',
  'autocomplete-snippets',
  'go-to-line',
  'lsp-diagnostics-stub',
  'lsp-servers',
  'open-on-github',
  'whitespace',
  'wrap-guide'
];

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
