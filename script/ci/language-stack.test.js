'use strict';

/**
 * H2 PR 13: every packageDependencies language-* is named in
 * docs/reference/language-stack.md. The exception list must not silently drift.
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
  'language-text',
  'language-source'
];

describe('language stack catalog (H2 PR 13)', () => {
  const doc = read('docs/reference/language-stack.md');
  const registry = read('src/grammar-registry.js');
  const pins = languagePins();

  it('names every packageDependencies language-* pin', () => {
    assert.ok(pins.length >= 30, `expected a full catalog, got ${pins.length}`);
    const missing = pins.filter(name => !doc.includes('`' + name + '`'));
    assert.deepStrictEqual(missing, [], 'language-stack.md missing pins');
  });

  // Dropped packages the doc is expected to still name, because saying what
  // was removed and what it cost is the point of the note.
  const REMOVED = ['language-hyperlink', 'language-todo'];

  it('does not invent language-* pins that are not in packageDependencies', () => {
    const named = [...doc.matchAll(/`language-[a-z0-9-]+`/g)].map(m =>
      m[0].slice(1, -1)
    );
    const unknown = [...new Set(named)].filter(
      name => !pins.includes(name) && !REMOVED.includes(name)
    );
    assert.deepStrictEqual(unknown, [], 'doc names packages that are not pins');
  });

  it('the removed packages are gone from the catalog, not just the doc', () => {
    for (const name of REMOVED) {
      assert.ok(!pins.includes(name), `${name} is still a pin`);
      assert.ok(
        !fs.existsSync(path.join(ROOT, 'packages', name)),
        `packages/${name} still exists`
      );
    }
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

  it('is the remaining work before first-mate is deleted', () => {
    // The 2026-08-17 decision made this a standing exception list; the
    // 2026-09-03 one made it a work list. Both are in the doc, the older one
    // struck through, because the wrapping and lazy-load exist because of it.
    assert.match(doc, /Owner decision 2026-09-03: first-mate goes/);
    assert.match(doc, /gated on this list being empty/);
    assert.match(doc, /textmate-retirement-plan\.md/);
  });

  it('grammar-registry points at the catalog and exposes getParserKindCounts', () => {
    assert.match(registry, /docs\/reference\/language-stack\.md/);
    assert.match(registry, /getParserKindCounts\s*\(/);
    assert.match(registry, /first-mate is not deleted by H2/);
  });

  it('counts 32 bundled language packages', () => {
    // 34 before language-hyperlink and language-todo were dropped (PR E).
    assert.strictEqual(pins.length, 32);
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


  it('language-text 13c ships JSON grammar', () => {
    assert.match(doc, /`language-text` \| TextMate/);
    assert.match(doc, /`text.plain` \| JSON/);
  });


  it('language-gfm is ported, with its TextMate grammar kept as an include', () => {
    // Ported in the retirement plan's PR C: block grammar + an inline
    // injection. The TextMate grammar stays because 26 other grammars
    // include one of the shadowed scopes, gfm's fences among them.
    assert.match(doc, /`language-gfm` \| both/);
    assert.match(doc, /`source.gfm` \| JSON/);
  });

  it('language-less 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-less` \| both/);
    assert.match(doc, /`source.css.less` \| JSON/);
  });

  // make, objective-c and property-list were ported in the retirement plan's
  // PR D, so their rows read `both`: a tree-sitter grammar plus the TextMate
  // one, which stays as an include target.
  it('language-make 13c ships JSON grammar', () => {
    assert.match(doc, /`language-make` \| both/);
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

  it('language-coffee-script 13c ships JSON grammars', () => {
    assert.match(doc, /`language-coffee-script` \| TextMate/);
    assert.match(doc, /`source.coffee`, `source.litcoffee` \| JSON/);
  });

  it('language-perl 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-perl` \| both/);
    assert.match(doc, /`source.perl`, `source.perl6` \| JSON/);
  });

  it('language-php 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-php` \| both/);
    assert.match(doc, /`text.html.php`, `source.php` \| JSON/);
  });

  it('language-property-list 13c ships JSON grammars', () => {
    assert.match(doc, /`language-property-list` \| both/);
    assert.match(doc, /`source.plist`, `text.xml.plist` \| JSON/);
  });

  it('language-xml 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-xml` \| both/);
    assert.match(doc, /`text.xml`, `text.xml.xsl` \| JSON/);
  });

  it('language-csharp 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-csharp` \| both/);
    assert.match(doc, /`source.cs`, `source.csx`, `source.cake` \| JSON/);
  });

  it('language-git 13c ships JSON grammars', () => {
    assert.match(doc, /`language-git` \| TextMate/);
    assert.match(doc, /`text.git-commit`, `source.git-config`, `text.git-rebase` \| JSON/);
  });

  it('language-objective-c 13c ships JSON grammars', () => {
    assert.match(doc, /`language-objective-c` \| both/);
    assert.match(doc, /`source.objc`, `source.objcpp`, `source.strings` \| JSON/);
  });

  it('language-sass 13c ships JSON TextMate fallback', () => {
    assert.match(doc, /`language-sass` \| both/);
    assert.match(doc, /`source.css.scss`, `source.sass`, `source.sassdoc` \| JSON/);
  });

  it('language-ruby-on-rails 13c ships JSON grammars', () => {
    assert.match(doc, /`language-ruby-on-rails` \| TextMate/);
    assert.match(doc, /`source.ruby.rails` \+ html\/js\/sql\/rjs overlays \| JSON/);
  });
});
