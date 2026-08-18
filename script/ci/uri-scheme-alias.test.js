'use strict';

/**
 * H3 PR 23.3 — openers match either product scheme.
 * Run: node --test script/ci/uri-scheme-alias.test.js
 *
 * Openers do their own URI matching (settings-view uses
 * `uri.startsWith('atom://config')`), so without a fallback a package that
 * migrated to chevron:// would silently stop matching a caller that had not:
 * the pane just never opens, with no error. This lets the 15 packages still
 * publishing atom:// migrate one at a time.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'src/workspace.js'), 'utf8');

// Mirror of the helper in workspace.js, exercised directly.
function alternateSchemeURI(uri) {
  if (typeof uri !== 'string') return null;
  if (uri.startsWith('chevron://')) return 'atom://' + uri.slice('chevron://'.length);
  if (uri.startsWith('atom://')) return 'chevron://' + uri.slice('atom://'.length);
  return null;
}

describe('opener scheme alias (PR 23.3)', () => {
  it('maps between the two product schemes', () => {
    assert.strictEqual(alternateSchemeURI('atom://config/themes'), 'chevron://config/themes');
    assert.strictEqual(alternateSchemeURI('chevron://config/themes'), 'atom://config/themes');
    assert.strictEqual(alternateSchemeURI('atom://welcome/guide'), 'chevron://welcome/guide');
  });

  it('leaves unrelated URIs alone', () => {
    assert.strictEqual(alternateSchemeURI('file:///tmp/x.js'), null);
    assert.strictEqual(alternateSchemeURI('https://atom.io/packages'), null);
    assert.strictEqual(alternateSchemeURI('/plain/path'), null);
    assert.strictEqual(alternateSchemeURI(null), null);
    assert.strictEqual(alternateSchemeURI(undefined), null);
  });

  it('a settings-view style opener matches through the alias', () => {
    const CONFIG_URI = 'atom://config';
    const opener = uri => (uri.startsWith(CONFIG_URI) ? { pane: uri } : null);
    // Caller migrated, opener has not: direct match fails, alias rescues it.
    assert.strictEqual(opener('chevron://config/updates'), null);
    assert.ok(opener(alternateSchemeURI('chevron://config/updates')));
  });

  it('workspace tries the alternate spelling at both dispatch sites', () => {
    assert.match(src, /function alternateSchemeURI/);
    // Count call sites only — the declaration reads the same, so match the
    // `const alternate = ` assignment the dispatch loops use.
    const hits = src.match(/const alternate = alternateSchemeURI\(uri\)/g) || [];
    assert.strictEqual(
      hits.length,
      2,
      'both openSync and createItemForURI must fall back'
    );
  });
});
