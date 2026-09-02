'use strict';

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
  escapeRegExp(path.join('oniguruma', 'deps')),
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
    '(oniguruma|dev-live-reload|deprecation-cop|one-dark-ui|incompatible-packages|git-diff|line-ending-selector|link|grammar-selector|json-schema-traverse|exception-reporting|one-light-ui|autoflow|about|go-to-line|sylvester|apparatus)' +
    escapeRegExp(path.sep) +
    'spec' +
    escapeRegExp(path.sep),

  // season ships a `csonc` command-line tool that the editor never invokes.
  // It is the only thing in the package that requires yargs, and it pulls a
  // whole yargs 3.x tree (cliui, string-width, wrap-ansi, y18n,
  // is-fullwidth-code-point) nested beside the hoisted yargs 16 -- six of the
  // repository's nested version conflicts, 304 KB, for a binary with no
  // caller. season's main is lib/cson.js and nothing there reaches csonc, so
  // dropping the CLI leaves the library intact.
  //
  // docs/decisions/retiring-textmate-grammars.md removes season outright; this
  // is the part that need not wait for it.
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

// Lint, test and build tooling. These are dependencies of the repository, not
// of the editor: `standard` pulls eslint and its plugins, `inquirer` pulls
// rxjs, and the rest are test harnesses and native-build helpers. The root
// package.json has 152 dependencies and no devDependencies, so nothing in the
// manifest distinguishes them -- and copy-assets copies every top-level entry.
//
// Named individually rather than derived. Deriving would mean trusting the
// declared dependency graph, and packages require things they do not declare:
// every bundled package with "no runtime dependencies" requires event-kit.
// Each name here was checked against a require trace of a running editor --
// 659 modules across 143 packages -- and appears in none of them.
//
// script/ci/no-dev-tooling-in-installer.test.js re-checks that nothing in the
// shipped tree requires them, so adding a real dependency on one fails rather
// than shipping broken.
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

  // Test harnesses and the lint stack. Same standard as the names above:
  // each was traced to its consumers, and every consumer is itself test or
  // lint tooling. The jasmine cluster is closed --
  // jasmine-tagged -> jasmine-focused -> jasmine-node -> jasmine-reporters,
  // with gaze and fileset reached only from jasmine-node -- and the mocha and
  // standard clusters likewise.
  //
  // chai, espree and eslint-visitor-keys are deliberately NOT here: their
  // consumer sets include packages whose role is not unambiguous, and this
  // list is only safe while every entry is.
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
  'eslint-scope'
]) {
  EXCLUDE_REGEXPS_SOURCES.push(
    '^' +
      escapeRegExp(path.join(CONFIG.repositoryRootPath, 'node_modules', devTool)) +
      '($|' +
      escapeRegExp(path.sep) +
      ')'
  );
}

// Language servers are not part of the product installer.
// docs/reference/lsp-server-distribution.md: "Chevron does not ship
// language-server binaries in the product installer." These arrive anyway
// because they are hoisted into the repository's node_modules and copy-assets
// copies every top-level entry.
//
// Nothing can reach them. resolveInstalledPackageCommand searches
// $CHEVRON_HOME/packages and <resourcePath>/packages, which() searches PATH,
// and the last resort is `npx --yes typescript-language-server` -- which would
// download a second copy rather than use the one being shipped. The
// TypeScript support that does work comes from node_modules/typescript's
// tsserver.js, resolved explicitly by resolveTsserverPath, and that stays.
for (const serverPackage of [
  'pyright',
  'typescript-language-server',
  'vscode-languageserver-protocol',
  'vscode-languageserver-types'
]) {
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
