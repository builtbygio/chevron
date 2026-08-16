'use strict';

/**
 * H2 PR 14: first-mate / oniguruma are not required at module evaluate
 * of GrammarRegistry or TextEditor. They boot when a TextMate grammar
 * is assigned. first-mate is not deleted.
 * Run: node --test script/ci/lazy-first-mate.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('lazy first-mate (H2 PR 14)', () => {
  it('grammar-registry does not top-level require first-mate', () => {
    const src = read('src/grammar-registry.js');
    assert.ok(
      !/^const FirstMate = require\('first-mate'\)/m.test(src),
      'GrammarRegistry must not require first-mate at load'
    );
    assert.match(src, /loadFirstMate/);
    assert.match(src, /PendingTextMateGrammar/);
    assert.match(src, /first-mate is not deleted by H2/);
  });

  it('text-editor does not top-level require first-mate', () => {
    const src = read('src/text-editor.js');
    assert.ok(!/require\('first-mate'\)/.test(src));
  });

  it('text-mate-language-mode lazy-requires oniguruma', () => {
    const src = read('src/text-mate-language-mode.js');
    assert.ok(!/^const \{ OnigRegExp \} = require\('oniguruma'\)/m.test(src));
    assert.match(src, /getOnigRegExp/);
  });

  it('snapshot excludes first-mate so the custom blob does not bake it in', () => {
    const src = read('script/lib/snapshot-exclude.js');
    assert.match(src, /first-mate/);
    assert.match(src, /oniguruma/);
  });

  it('does not delete first-mate or oniguruma deps', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.dependencies['first-mate']);
    assert.ok(pkg.dependencies.oniguruma);
  });

  it('PendingTextMateGrammar scores with JS regex without first-mate', () => {
    const { toJsRegex } = require('../../src/pending-text-mate-grammar');
    const re = toJsRegex('^#!.*\\bnode\\b');
    assert.ok(re.test('#!/usr/bin/env node'));
    assert.strictEqual(toJsRegex(null), null);
  });

  it('Null Grammar exposes empty fileTypes so path scoring cannot throw', () => {
    const NullGrammar = require('../../src/null-grammar');
    assert.ok(Array.isArray(NullGrammar.fileTypes));
    assert.strictEqual(NullGrammar.fileTypes.length, 0);
  });

  it('grammarAddedOrUpdated does not assume updateForInjection', () => {
    const src = read('src/grammar-registry.js');
    assert.match(
      src,
      /typeof languageMode\.updateForInjection === 'function'/
    );
  });
});
