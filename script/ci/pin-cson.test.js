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

const CONVERTED = ['language-source'];

const STILL_CSON = [
  'language-clojure',
  'language-coffee-script',
  'language-csharp',
  'language-gfm',
  'language-git',
  'language-hyperlink',
  'language-less',
  'language-make',
  'language-mustache',
  'language-objective-c',
  'language-perl',
  'language-php',
  'language-property-list',
  'language-ruby-on-rails',
  'language-sass',
  'language-sql',
  'language-text',
  'language-todo',
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
    assert.strictEqual(STILL_CSON.length, 21);
    for (const name of STILL_CSON) {
      const files = shippedCson(name);
      assert.ok(
        files.length > 0,
        `${name} has no shipped CSON — move it to CONVERTED`
      );
    }
    assert.match(doc, /language-hyperlink/);
  });
});
