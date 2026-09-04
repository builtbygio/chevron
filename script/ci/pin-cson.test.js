'use strict';

/**
 * The per-package CSON→JSON conversion record that used to live here went with
 * the TextMate grammars it named: those files are deleted. What no package may
 * ship is CSON at all, which is what remains below (and per package, in
 * script/ci/language-stack.test.js).
 *
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
  'language-text',
  'language-gfm',
  'language-less',
  'language-make',
  'language-sql',
  'language-toml',
  'language-yaml',
  'language-clojure',
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

    // first-mate was the last requirer of season, which is what kept
    // season -> cson-parser -> coffee-script in the tree. Deleting the TextMate
    // engine took season and cson-parser out of node_modules entirely, so
    // there is no longer a patch to check — only their absence.
    const seasonDep = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    ).dependencies.season;
    assert.ok(!seasonDep, 'season is no longer declared');
    for (const gone of ['first-mate', 'oniguruma', 'season', 'cson-parser']) {
      assert.ok(
        !fs.existsSync(path.join(ROOT, 'node_modules', gone)),
        `${gone} is back in the tree; it left with the TextMate engine`
      );
    }

    const langDoc = fs.readFileSync(
      path.join(ROOT, 'docs', 'reference', 'language-stack.md'),
      'utf8'
    );
    assert.match(langDoc, /Pin CSON inventory/);
  });
});
