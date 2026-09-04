'use strict';

/**
 * Guard owned package pins so merges do not silently regress builtbygio → atom.
 * Run: node --test script/ci/package-pin-policy.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

/** Catalog packages that must stay on npm:@builtbygio/<id>@ver (not atom/* git). */
// atom-keymap is gone from this list, not missing from it: the fork was
// vendored into src/keymap/ in the CSON-and-Atom-era cleanup. The
// builtbygio/atom-keymap repository is now unused.
const OWNED_BUILTBYGIO = [
  '@atom/fuzzy-native',
  '@atom/nsfw',
  'archive-view',
  'atom-pathspec',
  'atom-select-list',
  'autocomplete-chevron-api',
  'autocomplete-css',
  'autocomplete-html',
  'autocomplete-plus',
  'autocomplete-snippets',
  'autosave',
  'background-tips',
  'bookmarks',
  'bracket-matcher',
  'command-palette',
  'ctags',
  'encoding-selector',
  'find-and-replace',
  'fs-admin',
  'fuzzy-finder',
  'git-utils',
  'github',
  'image-view',
  'keyboard-layout',
  'keybinding-resolver',
  'keytar',
  'language-c',
  'language-clojure',
  'language-csharp',
  'language-css',
  'language-gfm',
  'language-go',
  'language-html',
  'language-java',
  'language-javascript',
  'language-json',
  'language-less',
  'language-make',
  'language-objective-c',
  'language-perl',
  'language-php',
  'language-property-list',
  'language-python',
  'language-ruby',
  'language-sass',
  'language-shellscript',
  'language-source',
  'language-sql',
  'language-toml',
  'language-typescript',
  'language-xml',
  'language-yaml',
  'markdown-preview',
  'notifications',
  'nslog',
  'open-on-github',
  'pathwatcher',
  'scrollbar-style',
  'settings-view',
  'snippets',
  'spell-check',
  'spellchecker',
  'status-bar',
  'styleguide',
  'symbols-view',
  'tabs',
  'text-buffer',
  'timecop',
  'tree-view',
  'whitespace',
  'wrap-guide'
];

/** Must not reappear as app dependencies (issue #62). */
const FORBIDDEN_APP_DEPS = ['babel-core', 'coffee-script', 'scandal'];

function ownedNpmId(depKey) {
  return depKey.includes('/') ? depKey.split('/').pop() : depKey;
}

function isBuiltbygioNpm(depKey, spec) {
  const id = ownedNpmId(depKey);
  return (
    typeof spec === 'string' &&
    spec.startsWith(`npm:@builtbygio/${id}@`) &&
    !spec.includes('git+') &&
    !spec.includes('github.com/atom/')
  );
}

function isBuiltbygioWorkspace(depKey, spec) {
  const id = ownedNpmId(depKey);
  return spec === `workspace:@builtbygio/${id}@*`;
}

describe('package pin policy', () => {
  it('owned editor packages are workspace; owned libs stay npm', () => {
    // Editor packages live in packages/ — community packages are cancelled, so
    // publishing them to npm bought nothing and cost a 29-of-83 drift rate.
    // Libraries and natives (first-mate, text-buffer, keytar …) stay npm pins:
    // they are real libraries with native builds, not editor packages.
    const editor = new Set(Object.keys(pkg.packageDependencies || {}));
    for (const name of OWNED_BUILTBYGIO) {
      const url = pkg.dependencies[name];
      assert.ok(url, `missing dependency: ${name}`);
      if (editor.has(name)) {
        assert.ok(
          isBuiltbygioWorkspace(name, url),
          `${name} is an editor package: expected workspace:@builtbygio/${ownedNpmId(
            name
          )}@*, got: ${url}`
        );
      } else {
        assert.ok(
          isBuiltbygioNpm(name, url),
          `${name} is a library: expected npm:@builtbygio/${ownedNpmId(
            name
          )}@ver, got: ${url}`
        );
      }
    }
  });

  it('every editor package has a directory in packages/', () => {
    for (const name of Object.keys(pkg.packageDependencies || {})) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'packages', name, 'package.json')),
        `packages/${name}/package.json missing`
      );
    }
  });

  it('packageDependencies keys exist in dependencies', () => {
    for (const name of Object.keys(pkg.packageDependencies || {})) {
      assert.ok(
        pkg.dependencies[name],
        `packageDependencies.${name} missing from dependencies`
      );
    }
  });

  it('does not reintroduce removed legacy transpile deps', () => {
    for (const name of FORBIDDEN_APP_DEPS) {
      assert.strictEqual(
        pkg.dependencies[name],
        undefined,
        `${name} must not return to app dependencies`
      );
    }
  });

  it('fs-admin override is the owned 0.15 pin (not nested 0.19)', () => {
    const spec = pkg.overrides && pkg.overrides['fs-admin'];
    assert.strictEqual(
      spec,
      '$fs-admin',
      `fs-admin override must follow the root pin, got: ${spec}`
    );
    assert.ok(
      isBuiltbygioNpm('fs-admin', pkg.dependencies['fs-admin']),
      `fs-admin must be npm:@builtbygio/fs-admin@0.15.x, got: ${pkg.dependencies['fs-admin']}`
    );
    assert.ok(
      pkg.dependencies['fs-admin'].startsWith('npm:@builtbygio/fs-admin@0.15.'),
      `fs-admin must stay on 0.15 (not nested 0.19), got: ${pkg.dependencies['fs-admin']}`
    );
  });

  it('does not keep the scandal-only isbinaryfile@2 override', () => {
    assert.strictEqual(
      pkg.overrides && pkg.overrides['isbinaryfile@2'],
      undefined,
      'isbinaryfile@2 override was only for scandal'
    );
    assert.strictEqual(
      pkg.overrides && pkg.overrides.scandal,
      undefined,
      'scandal override must not return'
    );
  });

  it('no remaining atom/* git pins in app dependencies', () => {
    const leftover = Object.entries(pkg.dependencies).filter(([, url]) =>
      String(url).includes('github.com/atom/')
    );
    assert.deepStrictEqual(
      leftover,
      [],
      `atom/* pins remain: ${leftover.map(([n]) => n).join(', ')}`
    );
  });

  it('autocomplete package uses chevron-api name (not atom-api)', () => {
    assert.strictEqual(
      pkg.dependencies['autocomplete-atom-api'],
      undefined,
      'autocomplete-atom-api key must be removed'
    );
    assert.ok(
      pkg.dependencies['autocomplete-chevron-api'],
      'autocomplete-chevron-api must be present'
    );
    assert.ok(
      pkg.packageDependencies['autocomplete-chevron-api'],
      'packageDependencies.autocomplete-chevron-api must be present'
    );
  });
});
