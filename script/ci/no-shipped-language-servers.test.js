'use strict';

/**
 * The product installer ships no language-server binaries.
 *
 * docs/reference/lsp-server-distribution.md: "Chevron does not ship
 * language-server binaries in the product installer." Users install them with
 * cpm, into $CHEVRON_HOME/packages.
 *
 * The policy was being violated silently. pyright (12.9 MB, 5459 files) and
 * typescript-language-server were in the shipped asar because they are hoisted
 * into the repository's node_modules and copy-assets copies every top-level
 * entry. Nothing could reach them: resolveInstalledPackageCommand searches
 * $CHEVRON_HOME/packages and <resourcePath>/packages, which() searches PATH,
 * and the fallback is `npx --yes typescript-language-server`, which downloads
 * a second copy rather than using the shipped one.
 *
 * What does provide TypeScript support is node_modules/typescript's
 * tsserver.js, found by resolveTsserverPath, and that is a library the build
 * needs anyway. This asserts it stays.
 *
 * Run: node --test script/ci/no-shipped-language-servers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');

// Server implementations, not the client. Kept as a list rather than derived
// from OPTIONAL_SERVER_PACKAGES because that names cpm package ids
// (chevron-lsp-typescript), and what gets hoisted is the npm package it wraps.
const SERVER_PACKAGES = [
  'pyright',
  'typescript-language-server',
  'vscode-languageserver-protocol',
  'vscode-languageserver-types'
];

describe('no language servers in the installer', () => {
  it('the distribution policy still says so', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'reference', 'lsp-server-distribution.md'),
      'utf8'
    );
    assert.ok(
      /does \*\*not\*\* ship language-server binaries/.test(doc),
      'this test enforces that sentence; if the policy changed, change this too'
    );
  });

  it('the packaging filter excludes them', () => {
    // Asks the filter rather than reading the source for names. The list is
    // derived from what the chevron-lsp-* packages depend on, because one
    // server drags in a closure -- adding chevron-lsp-json pulled thirteen
    // packages in, only one of them named vscode-json-languageserver.
    const include = require(path.join(
      ROOT,
      'script',
      'lib',
      'include-path-in-packaged-app.js'
    ));
    for (const name of SERVER_PACKAGES) {
      const candidate = path.join(ROOT, 'node_modules', name, 'index.js');
      assert.equal(
        include(candidate),
        false,
        `${name} must be excluded from the packaged app`
      );
    }
  });

  it('keeps packages the editor also uses', () => {
    // The subtraction is the part that matters: `debug` is reachable from a
    // language server and from the editor, and excluding it would break the
    // app rather than slim it.
    const include = require(path.join(
      ROOT,
      'script',
      'lib',
      'include-path-in-packaged-app.js'
    ));
    for (const name of ['debug', 'typescript']) {
      const candidate = path.join(ROOT, 'node_modules', name, 'index.js');
      assert.equal(
        include(candidate),
        true,
        `${name} is shared with the editor and must still ship`
      );
    }
  });

  const describeApp = fs.existsSync(APP) ? describe : describe.skip;

  describeApp('in the built app', () => {
    it('ships no language-server package', () => {
      const shipped = SERVER_PACKAGES.filter(name =>
        fs.existsSync(path.join(APP, 'node_modules', name))
      );
      assert.deepEqual(
        shipped,
        [],
        'the installer must not carry language servers; users install them ' +
          'with cpm:\n  ' + shipped.join('\n  ')
      );
    });

    it('still ships the typescript library that provides tsserver', () => {
      // resolveTsserverPath looks for exactly this, and it is the TypeScript
      // support that actually works. Removing it would be a real regression,
      // unlike removing the servers above.
      assert.ok(
        fs.existsSync(
          path.join(APP, 'node_modules', 'typescript', 'lib', 'tsserver.js')
        ),
        'node_modules/typescript/lib/tsserver.js must ship'
      );
    });
  });
});
