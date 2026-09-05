'use strict';

/**
 * Inlay hints: what the server said, turned into something drawable.
 *
 * The rendering half lives in the editor component and is exercised in the
 * packaged app by the smoke test, because the property that matters there —
 * that inserting a hint does not move any column — is a claim about the DOM
 * and about `LinesYardstick`, not about this data.
 *
 * docs/reference/inlay-hints.md
 * Run: node --test script/ci/inlay-hints.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

function loadTs(file) {
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const dir = path.dirname(file);
  const localRequire = id => {
    if (!id.startsWith('.')) return require(id);
    const resolved = path.resolve(dir, id);
    return fs.existsSync(`${resolved}.ts`)
      ? loadTs(`${resolved}.ts`)
      : require(resolved);
  };
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

const {
  normalizeInlayHints,
  labelOf,
  servesInlayHints
} = loadTs(path.join(ROOT, 'src', 'lsp', 'providers', 'inlay-hints.ts'));

describe('the label', () => {
  it('takes a plain string', () => {
    assert.strictEqual(labelOf(': number'), ': number');
  });

  it('joins the parts, which carry tooltips nothing draws yet', () => {
    assert.strictEqual(
      labelOf([{ value: ': ' }, { value: 'number', tooltip: 'a number' }]),
      ': number'
    );
  });

  it('survives shapes a server should not send', () => {
    assert.strictEqual(labelOf(null), '');
    assert.strictEqual(labelOf(undefined), '');
    assert.strictEqual(labelOf(42), '');
    assert.strictEqual(labelOf([{ notValue: 'x' }]), '');
  });
});

describe('normalize', () => {
  const hint = (overrides = {}) =>
    Object.assign(
      { position: { line: 4, character: 12 }, label: ': number', kind: 1 },
      overrides
    );

  it('reads a hint into editor coordinates', () => {
    const [result] = normalizeInlayHints([hint()]);
    assert.deepStrictEqual(result.position, { row: 4, column: 12 });
    assert.strictEqual(result.text, ': number');
    assert.strictEqual(result.kind, 'type');
    assert.strictEqual(result.paddingLeft, false);
    assert.strictEqual(result.paddingRight, false);
  });

  it('names the kinds the protocol defines', () => {
    assert.strictEqual(normalizeInlayHints([hint({ kind: 1 })])[0].kind, 'type');
    assert.strictEqual(
      normalizeInlayHints([hint({ kind: 2 })])[0].kind,
      'parameter'
    );
    assert.strictEqual(normalizeInlayHints([hint({ kind: 9 })])[0].kind, null);
    assert.strictEqual(
      normalizeInlayHints([hint({ kind: undefined })])[0].kind,
      null
    );
  });

  it('carries the padding flags, because spacing is the server\'s business', () => {
    const [result] = normalizeInlayHints([
      hint({ paddingLeft: true, paddingRight: true })
    ]);
    assert.strictEqual(result.paddingLeft, true);
    assert.strictEqual(result.paddingRight, true);
  });

  it('drops what cannot be drawn', () => {
    assert.deepStrictEqual(normalizeInlayHints([hint({ label: '' })]), []);
    assert.deepStrictEqual(normalizeInlayHints([hint({ label: [] })]), []);
    assert.deepStrictEqual(normalizeInlayHints([hint({ position: null })]), []);
    assert.deepStrictEqual(normalizeInlayHints([null]), []);
  });

  it('returns nothing for a non-array', () => {
    assert.deepStrictEqual(normalizeInlayHints(null), []);
    assert.deepStrictEqual(normalizeInlayHints({ hints: [] }), []);
  });
});

describe('capability', () => {
  it('accepts both shapes of yes', () => {
    assert.strictEqual(
      servesInlayHints({ capabilities: { inlayHintProvider: true } }),
      true
    );
    assert.strictEqual(
      servesInlayHints({
        capabilities: { inlayHintProvider: { resolveProvider: true } }
      }),
      true
    );
  });

  it('treats everything else as no', () => {
    assert.strictEqual(servesInlayHints(null), false);
    assert.strictEqual(servesInlayHints({}), false);
    assert.strictEqual(servesInlayHints({ capabilities: {} }), false);
    assert.strictEqual(
      servesInlayHints({ capabilities: { inlayHintProvider: false } }),
      false
    );
  });
});

describe('the editor knows how to draw one', () => {
  const component = fs.readFileSync(
    path.join(ROOT, 'src', 'text-editor-component.js'),
    'utf8'
  );

  it('has an inline-text decoration type', () => {
    assert.match(component, /case 'inline-text':/);
    assert.match(component, /addInlineTextDecorationToRender\(/);
  });

  it('keeps inserted text out of textNodes', () => {
    // textNodes must remain exactly the line's own characters:
    // screenPositionForPixelPosition works out a column by summing the
    // lengths of the nodes before it, so a node that is not part of the
    // line's text moves every column after it and the cursor lands wrong.
    const start = component.indexOf('insertInlineText(decoration)');
    const insert = component.slice(
      start,
      component.indexOf('appendTextNode(openScopeNode', start)
    );
    assert.ok(insert.length > 0, 'found insertInlineText');
    assert.ok(
      !/this\.textNodes\.push\(/.test(insert),
      'insertInlineText must never push the hint into textNodes'
    );
    // Splitting a node keeps both halves registered, so the array still
    // concatenates to the line.
    assert.match(insert, /this\.textNodes\.splice\(i \+ 1, 0, rest\)/);
  });

  it('asks for hints in initialize, or servers will not offer them', () => {
    const host = fs.readFileSync(
      path.join(ROOT, 'src', 'main-process', 'workers', 'lsp-host.js'),
      'utf8'
    );
    assert.match(host, /inlayHint:\s*{/);
  });
});
