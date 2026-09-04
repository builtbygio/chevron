'use strict';

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');
const { isForeignPrebuildPath } = require('./packaging-policy');

module.exports = function(filePath) {
  if (isForeignPrebuildPath(filePath)) return false;
  return (
    !EXCLUDED_PATHS_REGEXP.test(filePath) ||
    INCLUDED_PATHS_REGEXP.test(filePath)
  );
};

const EXCLUDE_REGEXPS_SOURCES = [
  escapeRegExp('.DS_Store'),
  escapeRegExp('.jshintrc'),
  escapeRegExp('.npmignore'),
  escapeRegExp('.pairs'),
  escapeRegExp('.idea'),
  escapeRegExp('.editorconfig'),
  escapeRegExp('.lint'),
  escapeRegExp('.lintignore'),
  escapeRegExp('.eslintrc'),
  escapeRegExp('.jshintignore'),
  escapeRegExp('coffeelint.json'),
  escapeRegExp('.coffeelintignore'),
  escapeRegExp('.gitattributes'),
  escapeRegExp('.gitkeep'),
  escapeRegExp(path.join('git-utils', 'deps')),
  escapeRegExp(path.join('less', 'dist')),
  escapeRegExp(path.join('npm', 'doc')),
  escapeRegExp(path.join('npm', 'html')),
  escapeRegExp(path.join('npm', 'man')),
  escapeRegExp(path.join('npm', 'node_modules', '.bin', 'beep')),
  escapeRegExp(path.join('npm', 'node_modules', '.bin', 'clear')),
  escapeRegExp(path.join('npm', 'node_modules', '.bin', 'starwars')),
  escapeRegExp(path.join('pegjs', 'examples')),
  escapeRegExp(path.join('get-parameter-names', 'node_modules', 'testla')),
  escapeRegExp(
    path.join('get-parameter-names', 'node_modules', '.bin', 'testla')
  ),
  escapeRegExp(path.join('jasmine-reporters', 'ext')),
  escapeRegExp(path.join('node_modules', 'nan')) + '\\b',
  escapeRegExp(path.join('node_modules', 'native-mate')),
  escapeRegExp(path.join('build', 'binding.Makefile')),
  escapeRegExp(path.join('build', 'config.gypi')),
  escapeRegExp(path.join('build', 'gyp-mac-tool')),
  escapeRegExp(path.join('build', 'Makefile')),
  escapeRegExp(path.join('build', 'Release', 'obj.target')),
  escapeRegExp(path.join('build', 'Release', 'obj')),
  escapeRegExp(path.join('build', 'Release', '.deps')),
  escapeRegExp(path.join('deps', 'libgit2')),

  // These are only required in dev-mode, when pegjs grammars aren't precompiled
  escapeRegExp(path.join('node_modules', 'loophole')),
  escapeRegExp(path.join('node_modules', 'pegjs')),
  escapeRegExp(path.join('node_modules', '.bin', 'pegjs')),
  escapeRegExp(
    path.join('node_modules', 'spellchecker', 'vendor', 'hunspell') + path.sep
  ) + '.*',

  // node_modules of the fuzzy-native package are only required for building it.
  escapeRegExp(path.join('node_modules', 'fuzzy-native', 'node_modules')),

  // Ignore *.cc and *.h files from native modules
  escapeRegExp(path.sep) + '.+\\.(cc|h)$',

  // Ignore build files
  escapeRegExp(path.sep) + 'binding\\.gyp$',
  escapeRegExp(path.sep) + '.+\\.target.mk$',
  escapeRegExp(path.sep) + 'linker\\.lock$',
  escapeRegExp(path.join('build', 'Release') + path.sep) + '.+\\.node\\.dSYM',
  escapeRegExp(path.join('build', 'Release') + path.sep) +
    '.*\\.(pdb|lib|exp|map|ipdb|iobj)',

  // Ignore node_module files we won't need at runtime
  'node_modules' +
    escapeRegExp(path.sep) +
    '.*' +
    escapeRegExp(path.sep) +
    '_*te?sts?_*' +
    escapeRegExp(path.sep),

  'node_modules' +
    escapeRegExp(path.sep) +
    '.*' +
    escapeRegExp(path.sep) +
    'tests?' +
    escapeRegExp(path.sep),

  'node_modules' +
    escapeRegExp(path.sep) +
    '.*' +
    escapeRegExp(path.sep) +
    'examples?' +
    escapeRegExp(path.sep),
  'node_modules' + escapeRegExp(path.sep) + '.*' + '\\.d\\.ts$',
  'node_modules' + escapeRegExp(path.sep) + '.*' + '\\.js\\.map$',
  '.*' + escapeRegExp(path.sep) + 'test.*\\.html$',

  // specific spec folders hand-picked
  'node_modules' +
    escapeRegExp(path.sep) +
    '(dev-live-reload|deprecation-cop|one-dark-ui|incompatible-packages|git-diff|line-ending-selector|link|grammar-selector|json-schema-traverse|exception-reporting|one-light-ui|autoflow|about|go-to-line|sylvester|apparatus)' +
    escapeRegExp(path.sep) +
    'spec' +
    escapeRegExp(path.sep),

  // season's csonc CLI has no caller and is the only thing requiring yargs,
  // which it nests a whole 3.x tree for. main is lib/cson.js, which the
  // library half still needs. docs/decisions/retiring-textmate-grammars.md.
  escapeRegExp(path.join('node_modules', 'season', 'bin')),
  escapeRegExp(path.join('node_modules', 'season', 'lib', 'csonc.js')),
  escapeRegExp(path.join('node_modules', 'season', 'node_modules')),

  // babel-core spec
  'node_modules' +
    escapeRegExp(path.sep) +
    'babel-core' +
    escapeRegExp(path.sep) +
    'lib' +
    escapeRegExp(path.sep) +
    'transformation' +
    escapeRegExp(path.sep) +
    'transforers' +
    escapeRegExp(path.sep) +
    'spec' +
    escapeRegExp(path.sep)
];

// Ignore spec directories in all bundled packages
for (let packageName in CONFIG.appMetadata.packageDependencies) {
  EXCLUDE_REGEXPS_SOURCES.push(
    '^' +
      escapeRegExp(
        path.join(
          CONFIG.repositoryRootPath,
          'node_modules',
          packageName,
          'spec'
        )
      )
  );
}

// Lint, test and build tooling: the repository's dependencies, not the
// editor's. The root manifest has no devDependencies to distinguish them and
// copy-assets copies every top-level entry, so they are named individually --
// deriving the list would mean trusting declared dependencies, and packages
// require things they do not declare. Each was checked against a require trace
// of a running editor. script/ci/no-dev-tooling-in-installer.test.js enforces
// that nothing shipped requires them.
for (const devTool of [
  'acorn',
  'ajv',
  'atom-mocha-test-runner',
  'chai-as-promised',
  'es-abstract',
  'eslint',
  'eslint-plugin-import',
  'eslint-plugin-node',
  'eslint-plugin-react',
  'eslint-utils',
  'esquery',
  'prebuildify',
  'regexpp',
  'rxjs',
  'test-until',

  // Test harnesses and the lint stack; every consumer of each is itself test
  // or lint tooling. chai, espree and eslint-visitor-keys are deliberately
  // absent -- their consumers are not unambiguously tooling.
  'deglob',
  'fileset',
  'gaze',
  'jasmine-focused',
  'jasmine-node',
  'jasmine-reporters',
  'jasmine-tagged',
  'mocha',
  'mocha-junit-reporter',
  'mocha-multi-reporters',
  'sinon',
  'standard',
  'standard-engine',
  'eslint-import-resolver-node',
  'eslint-module-utils',
  'eslint-scope',

  // What is left of the CSON chain. season and cson-parser left the tree
  // entirely with first-mate, which was their only requirer; core reads JSON
  // through src/main-process/json-file.js. coffee-script is still installed,
  // by jasmine-node via coffeestack, and is test tooling that never ships.
  'coffee-script',

  // Packages that ship, depend on something already excluded above, and are
  // required by nothing in the shipped tree. Leaving them is incoherent: they
  // could only ever throw MODULE_NOT_FOUND if anything did load them. All are
  // the lint and test stack -- the es-abstract consumers arrive through
  // eslint-plugin-import, table is the eslint formatter, espree its parser --
  // except coffeestack, which formats CoffeeScript stack traces and lost its
  // reason to exist when season went.

  'array-includes',
  'array.prototype.flatmap',
  'arraybuffer.prototype.slice',
  'coffeestack',
  'eslint-plugin-es',
  'espree',
  'inquirer',
  'object.fromentries',
  'reflect.getprototypeof',
  'string.prototype.trim',
  'table'
]) {
  EXCLUDE_REGEXPS_SOURCES.push(
    '^' +
      escapeRegExp(path.join(CONFIG.repositoryRootPath, 'node_modules', devTool)) +
      '($|' +
      escapeRegExp(path.sep) +
      ')'
  );
}

// Language servers are not shipped in the installer
// (docs/reference/lsp-server-distribution.md); they arrive only because the
// optional chevron-lsp-* packages are workspace members and their npm
// dependencies hoist to the root. Nothing can reach them at run time.
//
// Derived rather than listed. One server drags in a closure -- adding
// chevron-lsp-json put thirteen packages into the app, only one of them named
// vscode-json-languageserver -- so a hand-kept list is wrong the day a server
// is added. This walks what the chevron-lsp-* packages depend on and subtracts
// anything the shipped app can also reach, so a package shared with the editor
// (typescript, which ships for tsserver.js) stays.
function languageServerOnlyPackages() {
  const modules = path.join(CONFIG.repositoryRootPath, 'node_modules');
  const packagesDir = path.join(CONFIG.repositoryRootPath, 'packages');

  const manifestAt = dir => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch (error) {
      return null;
    }
  };

  const walk = (names, seen) => {
    for (const name of names) {
      if (seen.has(name)) continue;
      const manifest = manifestAt(path.join(modules, name));
      if (!manifest) continue;
      seen.add(name);
      walk(Object.keys(manifest.dependencies || {}), seen);
    }
    return seen;
  };

  let serverRoots = [];
  try {
    for (const entry of fs.readdirSync(packagesDir)) {
      if (!/^chevron-lsp-/.test(entry)) continue;
      const manifest = manifestAt(path.join(packagesDir, entry));
      if (manifest) {
        serverRoots = serverRoots.concat(Object.keys(manifest.dependencies || {}));
      }
    }
  } catch (error) {
    return [];
  }

  const serverClosure = walk(serverRoots, new Set());
  const shipped = walk(
    [
      ...Object.keys(CONFIG.appMetadata.dependencies || {}),
      ...Object.keys(CONFIG.appMetadata.packageDependencies || {})
    ],
    new Set()
  );
  return [...serverClosure].filter(name => !shipped.has(name)).sort();
}

for (const serverPackage of languageServerOnlyPackages()) {
  EXCLUDE_REGEXPS_SOURCES.push(
    '^' +
      escapeRegExp(
        path.join(CONFIG.repositoryRootPath, 'node_modules', serverPackage)
      ) +
      '($|' +
      escapeRegExp(path.sep) +
      ')'
  );
}

// Ignore Hunspell dictionaries only on macOS.
if (process.platform === 'darwin') {
  EXCLUDE_REGEXPS_SOURCES.push(
    escapeRegExp(path.join('spellchecker', 'vendor', 'hunspell_dictionaries'))
  );
}

const EXCLUDED_PATHS_REGEXP = new RegExp(
  EXCLUDE_REGEXPS_SOURCES.map(path => `(${path})`).join('|')
);

const INCLUDED_PATHS_REGEXP = new RegExp(
  escapeRegExp(
    path.join('node_modules', 'node-gyp', 'src', 'win_delay_load_hook.cc')
  )
);

function escapeRegExp(string) {
  return string.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&');
}
