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

/** Packages that must stay on builtbygio git pins (ownership + rename program). */
const OWNED_BUILTBYGIO = [
  '@atom/fuzzy-native',
  '@atom/nsfw',
  'archive-view',
  'atom-pathspec',
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
  'fuzzy-finder',
  'git-utils',
  'github',
  'image-view',
  'keyboard-layout',
  'keybinding-resolver',
  'keytar',
  'language-c',
  'language-css',
  'language-go',
  'language-html',
  'language-java',
  'language-javascript',
  'language-json',
  'language-python',
  'language-ruby',
  'language-shellscript',
  'language-typescript',
  'markdown-preview',
  'notifications',
  'nslog',
  'oniguruma',
  'open-on-github',
  'pathwatcher',
  'package-generator',
  'settings-view',
  'snippets',
  'spell-check',
  'spellchecker',
  'status-bar',
  'styleguide',
  'symbols-view',
  'tabs',
  'timecop',
  'tree-view',
  'whitespace',
  'wrap-guide'
];

/** Must not reappear as app dependencies (issue #62). */
const FORBIDDEN_APP_DEPS = ['babel-core', 'coffee-script'];

function isBuiltbygioGit(url) {
  return (
    typeof url === 'string' &&
    url.includes('git+') &&
    url.includes('github.com/builtbygio/')
  );
}

describe('package pin policy', () => {
  it('owned packages pin to builtbygio git hosts', () => {
    for (const name of OWNED_BUILTBYGIO) {
      const url = pkg.dependencies[name];
      assert.ok(url, `missing dependency: ${name}`);
      assert.ok(
        isBuiltbygioGit(url),
        `${name} must be builtbygio git pin, got: ${url}`
      );
      assert.ok(
        !url.includes('github.com/atom/'),
        `${name} must not regress to atom/* host: ${url}`
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

  it('isbinaryfile@2 override is the owned 2.0.4 fork (not 3.x)', () => {
    const spec = pkg.overrides && pkg.overrides['isbinaryfile@2'];
    assert.ok(
      isBuiltbygioGit(spec),
      `isbinaryfile@2 must be builtbygio git pin, got: ${spec}`
    );
    assert.ok(
      String(spec).includes('isbinaryfile.git'),
      `expected builtbygio/isbinaryfile, got: ${spec}`
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
