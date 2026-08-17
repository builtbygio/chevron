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
  'language-less'
];

const STILL_CSON = [
  'language-clojure',
  'language-coffee-script',
  'language-csharp',
  'language-git',
  'language-make',
  'language-mustache',
  'language-objective-c',
  'language-perl',
  'language-php',
  'language-property-list',
  'language-ruby-on-rails',
  'language-sass',
  'language-sql',
  'language-toml',
  'language-xml',
  'language-yaml'
];

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
    path.join(ROOT, 'docs', 'language-stack.md'),
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
    assert.strictEqual(STILL_CSON.length, 16);
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
