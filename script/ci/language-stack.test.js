'use strict';

/**
 * H2 PR 13: every packageDependencies language-* is named in
 * docs/language-stack.md. The exception list must not silently drift.
 * Run: node --test script/ci/language-stack.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function languagePins() {
  const pkg = JSON.parse(read('package.json'));
  return Object.keys(pkg.packageDependencies)
    .filter(name => name.startsWith('language-'))
    .sort();
}

const FIRST_TRANCHE = [];

const KEEP_TEXTMATE = [
  'language-coffee-script',
  'language-objective-c',
  'language-gfm',
  'language-git',
  'language-ruby-on-rails',
  'language-mustache',
  'language-make',
  'language-property-list',
  'language-hyperlink',
  'language-todo',
  'language-text',
  'language-source'
];

describe('language stack catalog (H2 PR 13)', () => {
  const doc = read('docs/language-stack.md');
  const registry = read('src/grammar-registry.js');
  const pins = languagePins();

  it('names every packageDependencies language-* pin', () => {
    assert.ok(pins.length >= 30, `expected a full catalog, got ${pins.length}`);
    const missing = pins.filter(name => !doc.includes('`' + name + '`'));
    assert.deepStrictEqual(missing, [], 'language-stack.md missing pins');
  });

  it('does not invent language-* pins that are not in packageDependencies', () => {
    const named = [...doc.matchAll(/`language-[a-z0-9-]+`/g)].map(m =>
      m[0].slice(1, -1)
    );
    const unknown = [...new Set(named)].filter(name => !pins.includes(name));
    assert.deepStrictEqual(unknown, [], 'doc names packages that are not pins');
  });

  it('first-tranche port list and keep-TextMate list are in the doc', () => {
    for (const name of FIRST_TRANCHE) {
      assert.ok(doc.includes('`' + name + '`'), name);
    }
    assert.match(doc, /first tranche/i);
    for (const name of KEEP_TEXTMATE) {
      assert.ok(doc.includes('`' + name + '`'), name);
    }
    assert.match(doc, /keep TextMate/);
  });

  it('is an exception list, not a first-mate delete plan', () => {
    assert.match(doc, /not a promise that first-mate dies/i);
    assert.match(doc, /optional H3/);
    assert.ok(!/delete first-mate in this PR/i.test(doc));
  });

  it('grammar-registry points at the catalog and exposes getParserKindCounts', () => {
    assert.match(registry, /docs\/language-stack\.md/);
    assert.match(registry, /getParserKindCounts\s*\(/);
    assert.match(registry, /first-mate is not deleted by H2/);
  });

  it('counts 34 bundled language packages', () => {
    assert.strictEqual(pins.length, 34);
  });

  it('language-yaml is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-yaml` \| both/);
    assert.match(doc, /@tree-sitter-grammars\/tree-sitter-yaml/);
  });

  it('language-xml is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-xml` \| both/);
    assert.match(doc, /@tree-sitter-grammars\/tree-sitter-xml/);
  });

  it('language-php is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-php` \| both/);
    assert.match(doc, /tree-sitter-php/);
  });

  it('language-toml is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-toml` \| both/);
    assert.match(doc, /@tree-sitter-grammars\/tree-sitter-toml/);
  });

  it('language-sql is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-sql` \| both/);
    assert.match(doc, /@derekstride\/tree-sitter-sql/);
  });

  it('language-less is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-less` \| both/);
    assert.match(doc, /tree-sitter-less/);
  });

  it('language-sass is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-sass` \| both/);
    assert.match(doc, /tree-sitter-scss/);
  });

  it('language-perl is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-perl` \| both/);
    assert.match(doc, /tree-sitter-perl/);
  });

  it('language-clojure is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-clojure` \| both/);
    assert.match(doc, /tree-sitter-clojure-orchard/);
  });

  it('language-csharp is catalogued as both after the 13b port', () => {
    assert.match(doc, /`language-csharp` \| both/);
    assert.match(doc, /tree-sitter-c-sharp/);
  });

  it('language-source 13c ships JSON settings', () => {
    assert.match(doc, /`language-source` \| none/);
    assert.match(doc, /JSON settings/);
    assert.match(doc, /PR 13c/);
  });

  it('language-hyperlink 13c ships JSON grammar', () => {
    assert.match(doc, /`language-hyperlink` \| TextMate/);
    assert.match(doc, /`text.hyperlink` \| JSON/);
  });

  it('language-text 13c ships JSON grammar', () => {
    assert.match(doc, /`language-text` \| TextMate/);
    assert.match(doc, /`text.plain` \| JSON/);
  });

  it('language-todo 13c ships JSON grammar', () => {
    assert.match(doc, /`language-todo` \| TextMate/);
    assert.match(doc, /`text.todo` \| JSON/);
  });

  it('language-gfm 13c ships JSON grammar settings and snippets', () => {
    assert.match(doc, /`language-gfm` \| TextMate/);
    assert.match(doc, /`source.gfm` \| JSON/);
  });

  it('language-less 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-less` \| both/);
    assert.match(doc, /`source.css.less` \| JSON/);
  });

  it('language-make 13c ships JSON grammar', () => {
    assert.match(doc, /`language-make` \| TextMate/);
    assert.match(doc, /`source.makefile` \| JSON/);
  });

  it('language-mustache 13c ships JSON grammars', () => {
    assert.match(doc, /`language-mustache` \| TextMate/);
    assert.match(doc, /`text.html.mustache`, `source.sql.mustache` \| JSON/);
  });

  it('language-sql 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-sql` \| both/);
    assert.match(doc, /`source.sql` \| JSON/);
  });

  it('language-toml 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-toml` \| both/);
    assert.match(doc, /`source.toml` \| JSON/);
  });

  it('language-yaml 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-yaml` \| both/);
    assert.match(doc, /`source.yaml` \| JSON/);
  });

  it('language-clojure 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-clojure` \| both/);
    assert.match(doc, /`source.clojure` \| JSON/);
  });
});
