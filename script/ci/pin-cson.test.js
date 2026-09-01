'use strict';

/**
 * H2 PR 13c: owned language-* pins convert shipped CSON → JSON
 * one package at a time. season stays until this list is empty.
 * Run: node --test script/ci/pin-cson.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const CONVERTED = [
  'language-source',
  'language-hyperlink',
  'language-text',
  'language-todo',
  'language-gfm',
  'language-less',
  'language-make',
  'language-mustache',
  'language-sql',
  'language-toml',
  'language-yaml',
  'language-clojure',
  'language-coffee-script',
  'language-perl',
  'language-php',
  'language-property-list',
  'language-xml',
  'language-csharp',
  'language-git',
  'language-objective-c',
  'language-sass',
  'language-ruby-on-rails'
];

const STILL_CSON = [];

function packageRoot(name) {
  if (name === 'language-rust-bundled') {
    return path.join(ROOT, 'packages', 'language-rust-bundled');
  }
  return path.join(ROOT, 'node_modules', name);
}

function shippedCson(name) {
  const root = packageRoot(name);
  const files = [];
  if (!fs.existsSync(root)) return files;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === 'spec') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.cson')) files.push(path.relative(root, p));
    }
  }
  walk(root);
  return files;
}

describe('pin CSON → JSON (H2 PR 13c)', () => {
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs', 'reference', 'language-stack.md'),
    'utf8'
  );

  it('documents the 13c stream and does not delete season', () => {
    assert.match(doc, /PR 13c/);
    assert.match(doc, /`season` stays/i);
    const seasonDep = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    ).dependencies.season;
    assert.ok(seasonDep, 'season must stay until remaining pins convert');
  });

  it('language-source ships JSON settings and no CSON', () => {
    const cson = shippedCson('language-source');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const json = path.join(
      packageRoot('language-source'),
      'settings',
      'language-source.json'
    );
    assert.ok(fs.existsSync(json), 'settings/language-source.json');
    const parsed = JSON.parse(fs.readFileSync(json, 'utf8'));
    assert.ok(parsed['.source'], 'settings keyed on .source');
  });

  it('language-text ships JSON grammar and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-text');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-text'),
      'grammars',
      'plain text.json'
    );
    const snippets = path.join(
      packageRoot('language-text'),
      'snippets',
      'language-text.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/plain text.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-text.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'text.plain');
  });

  it('language-ruby-on-rails ships JSON grammars and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-ruby-on-rails');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const ruby = path.join(packageRoot('language-ruby-on-rails'), 'grammars', 'ruby on rails.json');
    const html = path.join(packageRoot('language-ruby-on-rails'), 'grammars', 'html (rails).json');
    const js = path.join(packageRoot('language-ruby-on-rails'), 'grammars', 'javascript (rails).json');
    const sql = path.join(packageRoot('language-ruby-on-rails'), 'grammars', 'sql (rails).json');
    const rjs = path.join(packageRoot('language-ruby-on-rails'), 'grammars', 'rjs.json');
    const snippets = path.join(packageRoot('language-ruby-on-rails'), 'snippets', 'language-ruby-on-rails.json');
    assert.ok(fs.existsSync(ruby), 'grammars/ruby on rails.json');
    assert.ok(fs.existsSync(html), 'grammars/html (rails).json');
    assert.ok(fs.existsSync(js), 'grammars/javascript (rails).json');
    assert.ok(fs.existsSync(sql), 'grammars/sql (rails).json');
    assert.ok(fs.existsSync(rjs), 'grammars/rjs.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-ruby-on-rails.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(ruby, 'utf8')).scopeName, 'source.ruby.rails');
  });

  it('language-sass ships JSON TextMate grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-sass');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const scss = path.join(packageRoot('language-sass'), 'grammars', 'scss.json');
    const sass = path.join(packageRoot('language-sass'), 'grammars', 'sass.json');
    const sassdoc = path.join(packageRoot('language-sass'), 'grammars', 'sassdoc.json');
    const ts = path.join(packageRoot('language-sass'), 'grammars', 'tree-sitter-scss.json');
    assert.ok(fs.existsSync(scss), 'grammars/scss.json');
    assert.ok(fs.existsSync(sass), 'grammars/sass.json');
    assert.ok(fs.existsSync(sassdoc), 'grammars/sassdoc.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-scss.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(scss, 'utf8')).scopeName, 'source.css.scss');
    assert.strictEqual(JSON.parse(fs.readFileSync(sass, 'utf8')).scopeName, 'source.sass');
    assert.strictEqual(JSON.parse(fs.readFileSync(sassdoc, 'utf8')).scopeName, 'source.sassdoc');
  });

  it('language-objective-c ships JSON grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-objective-c');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const objc = path.join(packageRoot('language-objective-c'), 'grammars', 'objective-c.json');
    const objcpp = path.join(packageRoot('language-objective-c'), 'grammars', 'objective-c++.json');
    const strings = path.join(packageRoot('language-objective-c'), 'grammars', 'strings file.json');
    assert.ok(fs.existsSync(objc), 'grammars/objective-c.json');
    assert.ok(fs.existsSync(objcpp), 'grammars/objective-c++.json');
    assert.ok(fs.existsSync(strings), 'grammars/strings file.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(objc, 'utf8')).scopeName, 'source.objc');
    assert.strictEqual(JSON.parse(fs.readFileSync(objcpp, 'utf8')).scopeName, 'source.objcpp');
    assert.strictEqual(JSON.parse(fs.readFileSync(strings, 'utf8')).scopeName, 'source.strings');
  });

  it('language-git ships JSON grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-git');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const commit = path.join(packageRoot('language-git'), 'grammars', 'git commit message.json');
    const config = path.join(packageRoot('language-git'), 'grammars', 'git config.json');
    const rebase = path.join(packageRoot('language-git'), 'grammars', 'git rebase message.json');
    assert.ok(fs.existsSync(commit), 'grammars/git commit message.json');
    assert.ok(fs.existsSync(config), 'grammars/git config.json');
    assert.ok(fs.existsSync(rebase), 'grammars/git rebase message.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(commit, 'utf8')).scopeName, 'text.git-commit');
    assert.strictEqual(JSON.parse(fs.readFileSync(config, 'utf8')).scopeName, 'source.git-config');
    assert.strictEqual(JSON.parse(fs.readFileSync(rebase, 'utf8')).scopeName, 'text.git-rebase');
  });

  it('language-csharp ships JSON TextMate grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-csharp');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const csharp = path.join(packageRoot('language-csharp'), 'grammars', 'csharp.json');
    const csx = path.join(packageRoot('language-csharp'), 'grammars', 'csx.json');
    const cake = path.join(packageRoot('language-csharp'), 'grammars', 'cake.json');
    const ts = path.join(packageRoot('language-csharp'), 'grammars', 'tree-sitter-c-sharp.json');
    assert.ok(fs.existsSync(csharp), 'grammars/csharp.json');
    assert.ok(fs.existsSync(csx), 'grammars/csx.json');
    assert.ok(fs.existsSync(cake), 'grammars/cake.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-c-sharp.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(csharp, 'utf8')).scopeName, 'source.cs');
    assert.strictEqual(JSON.parse(fs.readFileSync(csx, 'utf8')).scopeName, 'source.csx');
    assert.strictEqual(JSON.parse(fs.readFileSync(cake, 'utf8')).scopeName, 'source.cake');
  });

  it('language-xml ships JSON TextMate grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-xml');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const xml = path.join(
      packageRoot('language-xml'),
      'grammars',
      'xml.json'
    );
    const xsl = path.join(
      packageRoot('language-xml'),
      'grammars',
      'xsl.json'
    );
    const settings = path.join(
      packageRoot('language-xml'),
      'settings',
      'language-xml.json'
    );
    const snippets = path.join(
      packageRoot('language-xml'),
      'snippets',
      'language-xml.json'
    );
    const ts = path.join(
      packageRoot('language-xml'),
      'grammars',
      'tree-sitter-xml.json'
    );
    assert.ok(fs.existsSync(xml), 'grammars/xml.json');
    assert.ok(fs.existsSync(xsl), 'grammars/xsl.json');
    assert.ok(fs.existsSync(settings), 'settings/language-xml.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-xml.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-xml.json');
    const parsed = JSON.parse(fs.readFileSync(xml, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'text.xml');
    const xslParsed = JSON.parse(fs.readFileSync(xsl, 'utf8'));
    assert.strictEqual(xslParsed.scopeName, 'text.xml.xsl');
  });

  it('language-property-list ships JSON grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-property-list');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const oldStyle = path.join(
      packageRoot('language-property-list'),
      'grammars',
      'property list (old-style).json'
    );
    const xml = path.join(
      packageRoot('language-property-list'),
      'grammars',
      'property list (xml).json'
    );
    const settings = path.join(
      packageRoot('language-property-list'),
      'settings',
      'language-property-list.json'
    );
    const snippets = path.join(
      packageRoot('language-property-list'),
      'snippets',
      'language-property-list.json'
    );
    assert.ok(fs.existsSync(oldStyle), 'grammars/property list (old-style).json');
    assert.ok(fs.existsSync(xml), 'grammars/property list (xml).json');
    assert.ok(fs.existsSync(settings), 'settings/language-property-list.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-property-list.json');
    const parsed = JSON.parse(fs.readFileSync(oldStyle, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.plist');
    const xmlParsed = JSON.parse(fs.readFileSync(xml, 'utf8'));
    assert.strictEqual(xmlParsed.scopeName, 'text.xml.plist');
  });

  it('language-php ships JSON TextMate grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-php');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const html = path.join(
      packageRoot('language-php'),
      'grammars',
      'html.json'
    );
    const php = path.join(
      packageRoot('language-php'),
      'grammars',
      'php.json'
    );
    const settings = path.join(
      packageRoot('language-php'),
      'settings',
      'language-php.json'
    );
    const snippets = path.join(
      packageRoot('language-php'),
      'snippets',
      'language-php.json'
    );
    const ts = path.join(
      packageRoot('language-php'),
      'grammars',
      'tree-sitter-php.json'
    );
    const tsOnly = path.join(
      packageRoot('language-php'),
      'grammars',
      'tree-sitter-php-only.json'
    );
    assert.ok(fs.existsSync(html), 'grammars/html.json');
    assert.ok(fs.existsSync(php), 'grammars/php.json');
    assert.ok(fs.existsSync(settings), 'settings/language-php.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-php.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-php.json');
    assert.ok(fs.existsSync(tsOnly), 'grammars/tree-sitter-php-only.json');
    const parsed = JSON.parse(fs.readFileSync(html, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'text.html.php');
    const phpParsed = JSON.parse(fs.readFileSync(php, 'utf8'));
    assert.strictEqual(phpParsed.scopeName, 'source.php');
  });

  it('language-perl ships JSON TextMate grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-perl');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const perl = path.join(
      packageRoot('language-perl'),
      'grammars',
      'perl.json'
    );
    const perl6 = path.join(
      packageRoot('language-perl'),
      'grammars',
      'perl 6.json'
    );
    const settings = path.join(
      packageRoot('language-perl'),
      'settings',
      'language-perl.json'
    );
    const snippets = path.join(
      packageRoot('language-perl'),
      'snippets',
      'language-perl.json'
    );
    const ts = path.join(
      packageRoot('language-perl'),
      'grammars',
      'tree-sitter-perl.json'
    );
    assert.ok(fs.existsSync(perl), 'grammars/perl.json');
    assert.ok(fs.existsSync(perl6), 'grammars/perl 6.json');
    assert.ok(fs.existsSync(settings), 'settings/language-perl.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-perl.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-perl.json');
    const parsed = JSON.parse(fs.readFileSync(perl, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.perl');
    const p6 = JSON.parse(fs.readFileSync(perl6, 'utf8'));
    assert.strictEqual(p6.scopeName, 'source.perl6');
  });

  it('language-coffee-script ships JSON grammars settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-coffee-script');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const coffee = path.join(
      packageRoot('language-coffee-script'),
      'grammars',
      'coffeescript.json'
    );
    const lit = path.join(
      packageRoot('language-coffee-script'),
      'grammars',
      'coffeescript (literate).json'
    );
    const settings = path.join(
      packageRoot('language-coffee-script'),
      'settings',
      'language-coffee-script.json'
    );
    const snippets = path.join(
      packageRoot('language-coffee-script'),
      'snippets',
      'language-coffee-script.json'
    );
    assert.ok(fs.existsSync(coffee), 'grammars/coffeescript.json');
    assert.ok(fs.existsSync(lit), 'grammars/coffeescript (literate).json');
    assert.ok(fs.existsSync(settings), 'settings/language-coffee-script.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-coffee-script.json');
    const parsed = JSON.parse(fs.readFileSync(coffee, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.coffee');
    const litParsed = JSON.parse(fs.readFileSync(lit, 'utf8'));
    assert.strictEqual(litParsed.scopeName, 'source.litcoffee');
  });

  it('language-clojure ships JSON TextMate grammar settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-clojure');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-clojure'),
      'grammars',
      'clojure.json'
    );
    const settings = path.join(
      packageRoot('language-clojure'),
      'settings',
      'language-clojure.json'
    );
    const snippets = path.join(
      packageRoot('language-clojure'),
      'snippets',
      'language-clojure.json'
    );
    const ts = path.join(
      packageRoot('language-clojure'),
      'grammars',
      'tree-sitter-clojure.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/clojure.json');
    assert.ok(fs.existsSync(settings), 'settings/language-clojure.json');
    assert.ok(fs.existsSync(snippets), 'snippets/language-clojure.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-clojure.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.clojure');
  });

  it('language-yaml ships JSON TextMate grammar and settings and no shipped CSON', () => {
    const cson = shippedCson('language-yaml');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-yaml'),
      'grammars',
      'yaml.json'
    );
    const settings = path.join(
      packageRoot('language-yaml'),
      'settings',
      'language-yaml.json'
    );
    const ts = path.join(
      packageRoot('language-yaml'),
      'grammars',
      'tree-sitter-yaml.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/yaml.json');
    assert.ok(fs.existsSync(settings), 'settings/language-yaml.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-yaml.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.yaml');
  });

  it('language-toml ships JSON TextMate grammar and settings and no shipped CSON', () => {
    const cson = shippedCson('language-toml');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-toml'),
      'grammars',
      'toml.json'
    );
    const settings = path.join(
      packageRoot('language-toml'),
      'settings',
      'language-toml.json'
    );
    const ts = path.join(
      packageRoot('language-toml'),
      'grammars',
      'tree-sitter-toml.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/toml.json');
    assert.ok(fs.existsSync(settings), 'settings/language-toml.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-toml.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.toml');
  });

  it('language-sql ships JSON TextMate grammar and settings and no shipped CSON', () => {
    const cson = shippedCson('language-sql');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-sql'),
      'grammars',
      'sql.json'
    );
    const settings = path.join(
      packageRoot('language-sql'),
      'settings',
      'language-sql.json'
    );
    const ts = path.join(
      packageRoot('language-sql'),
      'grammars',
      'tree-sitter-sql.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/sql.json');
    assert.ok(fs.existsSync(settings), 'settings/language-sql.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-sql.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.sql');
  });

  it('language-mustache ships JSON grammars and no shipped CSON', () => {
    const cson = shippedCson('language-mustache');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const html = path.join(
      packageRoot('language-mustache'),
      'grammars',
      'mustache.json'
    );
    const sql = path.join(
      packageRoot('language-mustache'),
      'grammars',
      'sql with mustaches.json'
    );
    assert.ok(fs.existsSync(html), 'grammars/mustache.json');
    assert.ok(fs.existsSync(sql), 'grammars/sql with mustaches.json');
    const parsed = JSON.parse(fs.readFileSync(html, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'text.html.mustache');
    const sqlParsed = JSON.parse(fs.readFileSync(sql, 'utf8'));
    assert.strictEqual(sqlParsed.scopeName, 'source.sql.mustache');
  });

  it('language-make ships JSON grammar and settings and no shipped CSON', () => {
    const cson = shippedCson('language-make');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-make'),
      'grammars',
      'makefile.json'
    );
    const settings = path.join(
      packageRoot('language-make'),
      'settings',
      'language-make.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/makefile.json');
    assert.ok(fs.existsSync(settings), 'settings/language-make.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.makefile');
  });

  it('language-less ships JSON TextMate grammar and settings and no shipped CSON', () => {
    const cson = shippedCson('language-less');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-less'),
      'grammars',
      'less.json'
    );
    const settings = path.join(
      packageRoot('language-less'),
      'settings',
      'language-less.json'
    );
    const ts = path.join(
      packageRoot('language-less'),
      'grammars',
      'tree-sitter-less.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/less.json');
    assert.ok(fs.existsSync(settings), 'settings/language-less.json');
    assert.ok(fs.existsSync(ts), 'grammars/tree-sitter-less.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'source.css.less');
  });

  it('language-gfm ships JSON settings and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-gfm');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const settings = path.join(
      packageRoot('language-gfm'),
      'settings',
      'gfm.json'
    );
    const snippets = path.join(
      packageRoot('language-gfm'),
      'snippets',
      'gfm.json'
    );
    const grammar = path.join(
      packageRoot('language-gfm'),
      'grammars',
      'gfm.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/gfm.json');
    assert.ok(fs.existsSync(settings), 'settings/gfm.json');
    assert.ok(fs.existsSync(snippets), 'snippets/gfm.json');
    const parsed = JSON.parse(fs.readFileSync(settings, 'utf8'));
    assert.ok(parsed['.source.gfm:not(.markup.code)']);
  });

  it('language-todo ships JSON grammar and snippets and no shipped CSON', () => {
    const cson = shippedCson('language-todo');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const grammar = path.join(
      packageRoot('language-todo'),
      'grammars',
      'todo.json'
    );
    const snippets = path.join(
      packageRoot('language-todo'),
      'snippets',
      'todo.json'
    );
    assert.ok(fs.existsSync(grammar), 'grammars/todo.json');
    assert.ok(fs.existsSync(snippets), 'snippets/todo.json');
    const parsed = JSON.parse(fs.readFileSync(grammar, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'text.todo');
    assert.ok(parsed.injectionSelector);
  });

  it('language-hyperlink ships JSON grammar and no shipped CSON', () => {
    const cson = shippedCson('language-hyperlink');
    assert.deepStrictEqual(cson, [], `unexpected CSON: ${cson.join(', ')}`);
    const json = path.join(
      packageRoot('language-hyperlink'),
      'grammars',
      'hyperlink.json'
    );
    assert.ok(fs.existsSync(json), 'grammars/hyperlink.json');
    const parsed = JSON.parse(fs.readFileSync(json, 'utf8'));
    assert.strictEqual(parsed.scopeName, 'text.hyperlink');
  });

  it('converted pins have no shipped CSON', () => {
    for (const name of CONVERTED) {
      assert.deepStrictEqual(
        shippedCson(name),
        [],
        `${name} still has CSON`
      );
    }
  });

  it('remaining 13c pins still ship CSON (update this list when converting)', () => {
    assert.strictEqual(STILL_CSON.length, 0);
    for (const name of STILL_CSON) {
      const files = shippedCson(name);
      assert.ok(
        files.length > 0,
        `${name} has no shipped CSON — move it to CONVERTED`
      );
    }
    assert.match(doc, /language-todo/);
  });
});

// Wave 1 inventory: 13c only ever swept `language-*`. `season` cannot be
// deleted on that evidence alone, so sweep every catalog pin and the repo
// itself. When this is empty, the only readers left are user `.cson` and
// third-party packages — see docs/reference/language-stack.md §3a.
describe('pin CSON inventory (Wave 1)', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
  const catalog = Object.keys(pkg.packageDependencies || {}).sort();

  it('every catalog pin resolves', () => {
    const missing = catalog.filter(name => !fs.existsSync(packageRoot(name)));
    assert.deepStrictEqual(
      missing,
      [],
      `unresolved catalog pins: ${missing.join(', ')}`
    );
  });

  it('no catalog pin ships CSON', () => {
    // Guard against a sweep that scans nothing (an empty or broken catalog
    // read would otherwise pass silently). A loose floor on purpose: the
    // catalog is curated, so pinning its exact size just breaks on every trim.
    assert.ok(catalog.length >= 50, `catalog read returned only ${catalog.length} packages`);
    const offenders = [];
    for (const name of catalog) {
      for (const file of shippedCson(name)) {
        offenders.push(`${name}/${file}`);
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `catalog pins still shipping CSON: ${offenders.join(', ')}`
    );
  });

  it('the app itself ships no CSON (keymaps, menus, dot-chevron templates)', () => {
    const offenders = [];
    for (const dir of ['keymaps', 'menus', 'dot-chevron', 'src', 'static']) {
      const root = path.join(ROOT, dir);
      if (!fs.existsSync(root)) continue;
      const walk = current => {
        for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
          if (ent.name === 'node_modules') continue;
          const p = path.join(current, ent.name);
          if (ent.isDirectory()) walk(p);
          else if (ent.name.endsWith('.cson')) {
            offenders.push(path.relative(ROOT, p));
          }
        }
      };
      walk(root);
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `app still ships CSON: ${offenders.join(', ')}`
    );
  });

  it('no user-facing file reads CSON any more', () => {
    // This assertion used to run the other way: it required season in each of
    // these files, to hold the dual-read in place. CSON reading has since been
    // dropped, so it holds the opposite -- reintroducing a reader here brings
    // coffee-script back with it.
    for (const rel of [
      ['src', 'config-file.js'],
      ['src', 'user-config-path.js'],
      ['src', 'keymap-extensions.ts']
    ]) {
      const source = fs
        .readFileSync(path.join(ROOT, ...rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*(\/\/|\*).*$/gm, '');
      assert.doesNotMatch(
        source,
        /require\('season'\)/,
        `${rel.join('/')} must not read CSON`
      );
    }

    // season is still installed, and not by choice: first-mate's
    // grammar-registry requires it, so the TextMate fallback keeps
    // season -> cson-parser -> coffee-script in the tree. Removing it means
    // forking first-mate or dropping TextMate grammars -- a separate
    // decision, recorded here so the dependency is not mistaken for one core
    // still wants.
    const seasonDep = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    ).dependencies.season;
    assert.ok(seasonDep, 'season is still pulled in by first-mate');
    assert.match(
      fs.readFileSync(
        path.join(ROOT, 'node_modules', 'first-mate', 'lib', 'grammar-registry.js'),
        'utf8'
      ),
      /require\('season'\)/,
      'if first-mate stops requiring season, the whole chain can go'
    );

    const langDoc = fs.readFileSync(
      path.join(ROOT, 'docs', 'reference', 'language-stack.md'),
      'utf8'
    );
    assert.match(langDoc, /Pin CSON inventory/);
  });
});
