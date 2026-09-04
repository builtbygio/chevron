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

// Packages deleted on the way to removing first-mate. The doc is expected to
// still name them: saying what went and what it cost is the point of §3.
const DELETED = [
  'language-hyperlink',
  'language-todo',
  'language-coffee-script',
  'language-mustache',
  'language-git',
  'language-text',
  'language-ruby-on-rails'
];

describe('language stack catalog (H2 PR 13)', () => {
  const doc = read('docs/reference/language-stack.md');
  const registry = read('src/grammar-registry.js');
  const pins = languagePins();

  it('names every packageDependencies language-* pin', () => {
    assert.ok(pins.length >= 26, `expected a full catalog, got ${pins.length}`);
    const missing = pins.filter(name => !doc.includes('`' + name + '`'));
    assert.deepStrictEqual(missing, [], 'language-stack.md missing pins');
  });

  // Dropped packages the doc is expected to still name, because saying what
  // was removed and what it cost is the point of the note.
  const REMOVED = DELETED;

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

  it('says what lost highlighting, and that no parser exists for it', () => {
    assert.match(doc, /## 3\. What lost highlighting/);
    for (const scope of ['text.plain', 'source.sass', 'text.git-commit', 'source.mod']) {
      assert.ok(doc.includes('`' + scope + '`'), `${scope} must be listed`);
    }
    assert.match(doc, /no tree-sitter parser is\s*\npublished for any of them/);
  });

  it('records the decision that reversed twice, and its outcome', () => {
    assert.match(doc, /Owner decision 2026-09-04: first-mate is deleted/);
    // Both superseded decisions stay readable: the wrapping and lazy-load
    // that used to exist were built for them.
    assert.match(doc, /2026-08-17, TextMate is a permanent supported fallback/);
    assert.match(doc, /2026-09-03, first-mate goes/);
    assert.match(doc, /textmate-retirement-plan\.md/);
  });

  it('grammar-registry points at the catalog and exposes getParserKindCounts', () => {
    assert.match(registry, /docs\/reference\/language-stack\.md/);
    assert.match(registry, /getParserKindCounts\s*\(/);
    assert.match(registry, /TextMate and first-mate are gone/);
  });

  it('counts the catalog, and every row is tree-sitter', () => {
    // 34 before the retirement; 27 after. Each per-package case that used to
    // live here asserted `| both` for one language — a migration state that
    // no longer exists, since the TextMate half of every row is deleted.
    assert.strictEqual(pins.length, 27);
    for (const name of pins) {
      const row = doc
        .split('\n')
        .find(line => line.startsWith('| `' + name + '`'));
      assert.ok(row, `no table row for ${name}`);
      const kind = name === 'language-source' ? 'none' : 'tree-sitter';
      assert.ok(
        row.includes('| ' + kind + ' |'),
        `${name} row should read "${kind}": ${row}`
      );
    }
  });

  it('ships no CSON grammar, settings or snippets', () => {
    for (const name of pins) {
      const dir = path.join(ROOT, 'packages', name);
      const found = [];
      const walk = current => {
        let entries;
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (error) {
          return;
        }
        for (const entry of entries) {
          if (entry.name === 'node_modules') continue;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.cson')) found.push(full);
        }
      };
      walk(dir);
      assert.deepEqual(found, [], `${name} ships CSON`);
    }
  });
});
