'use strict';

/**
 * What encloses a line, shared by breadcrumbs and sticky scroll.
 *
 * Both read the same foldable ranges, so the ordering and the de-duplication
 * are worth pinning once: a breadcrumb trail in the wrong order reads as a
 * different program, and sticky scroll showing two lines that open the same
 * block wastes the space it is trying to save.
 *
 * docs/reference/code-context.md
 * Run: node --test script/ci/enclosing-scopes.test.js
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
  const localRequire = id =>
    require(id.startsWith('.') ? path.resolve(path.dirname(file), id) : id);
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

const { enclosingRanges, labelForLine, FoldableRangeCache } = loadTs(
  path.join(ROOT, 'src', 'enclosing-scopes.ts')
);

const range = (startRow, endRow) => ({
  start: { row: startRow, column: 0 },
  end: { row: endRow, column: 0 }
});

describe('what encloses a row', () => {
  // class Foo {            0
  //   method bar() {       2
  //     if (x) {           4
  //     }                  6
  //   }                    7
  // }                      9
  const ranges = [range(0, 9), range(2, 7), range(4, 6)];

  it('returns them outermost first', () => {
    assert.deepStrictEqual(enclosingRanges(ranges, 5), [
      { startRow: 0, endRow: 9 },
      { startRow: 2, endRow: 7 },
      { startRow: 4, endRow: 6 }
    ]);
  });

  it('drops the ones the row is not inside', () => {
    // Row 8 is past the end of the method (2-7) but still in the class.
    assert.deepStrictEqual(enclosingRanges(ranges, 8), [
      { startRow: 0, endRow: 9 }
    ]);
    assert.deepStrictEqual(enclosingRanges(ranges, 1), [
      { startRow: 0, endRow: 9 }
    ]);
    // And a row inside the method is inside both, but not the if.
    assert.deepStrictEqual(enclosingRanges(ranges, 7), [
      { startRow: 0, endRow: 9 },
      { startRow: 2, endRow: 7 }
    ]);
  });

  it('counts the line that opens a block as inside it', () => {
    // Standing on `method bar() {` is standing in bar, which is what a
    // breadcrumb should say.
    const found = enclosingRanges(ranges, 2);
    assert.deepStrictEqual(found[found.length - 1], { startRow: 2, endRow: 7 });
  });

  it('counts the closing line too', () => {
    assert.deepStrictEqual(enclosingRanges(ranges, 9), [
      { startRow: 0, endRow: 9 }
    ]);
  });

  it('returns nothing outside every range', () => {
    assert.deepStrictEqual(enclosingRanges(ranges, 20), []);
    assert.deepStrictEqual(enclosingRanges([], 3), []);
  });

  it('survives ranges that are not ranges', () => {
    assert.deepStrictEqual(enclosingRanges(null, 1), []);
    assert.deepStrictEqual(enclosingRanges([null, {}, { start: {} }], 1), []);
  });
});

describe('two ranges opening on the same line', () => {
  it('keeps only the outer one', () => {
    // `export default class Foo {` can be foldable twice over; a reader sees
    // one line, so a trail with two entries for it says nothing extra.
    const found = enclosingRanges([range(0, 20), range(0, 10), range(3, 5)], 4);
    assert.deepStrictEqual(found, [
      { startRow: 0, endRow: 20 },
      { startRow: 3, endRow: 5 }
    ]);
  });

  it('orders equal starts by reach before de-duplicating', () => {
    const found = enclosingRanges([range(0, 10), range(0, 20)], 4);
    assert.deepStrictEqual(found, [{ startRow: 0, endRow: 20 }]);
  });
});

describe('the label for a line', () => {
  it('trims indentation and the opening brace', () => {
    assert.strictEqual(labelForLine('    function foo() {'), 'function foo()');
    assert.strictEqual(labelForLine('  class Bar {'), 'class Bar');
    assert.strictEqual(labelForLine('\tif (x) {'), 'if (x)');
  });

  it('trims a trailing comma or open paren', () => {
    assert.strictEqual(labelForLine('  describe("a thing", ('), 'describe("a thing"');
    assert.strictEqual(labelForLine('  foo,'), 'foo');
  });

  it('leaves a line that needs no trimming', () => {
    assert.strictEqual(labelForLine('const x = 1;'), 'const x = 1;');
  });

  it('cuts a long line rather than letting it push the bar wide', () => {
    const long = 'function ' + 'x'.repeat(200);
    const label = labelForLine(long, 40);
    assert.strictEqual(label.length, 40);
    assert.ok(label.endsWith('…'));
  });

  it('survives nonsense', () => {
    assert.strictEqual(labelForLine(null), '');
    assert.strictEqual(labelForLine(undefined), '');
    assert.strictEqual(labelForLine('   '), '');
  });
});

describe('the foldable range cache', () => {
  function editorWith(ranges, counter) {
    return {
      getBuffer: () => ({
        getLanguageMode: () => ({
          getFoldableRanges: () => {
            counter.calls++;
            return ranges;
          }
        })
      })
    };
  }

  it('asks the language mode once per editor', () => {
    // getFoldableRanges walks the whole syntax tree, and sticky scroll asks on
    // every scroll event. Asking each time would make scrolling cost a parse.
    const counter = { calls: 0 };
    const cache = new FoldableRangeCache();
    const editor = editorWith([range(0, 5)], counter);

    cache.get(editor);
    cache.get(editor);
    cache.get(editor);
    assert.strictEqual(counter.calls, 1);
  });

  it('asks again after being invalidated', () => {
    const counter = { calls: 0 };
    const cache = new FoldableRangeCache();
    const editor = editorWith([range(0, 5)], counter);

    cache.get(editor);
    cache.invalidate(editor);
    cache.get(editor);
    assert.strictEqual(counter.calls, 2);
  });

  it('gives nothing rather than throwing when the mode has no folds', () => {
    const cache = new FoldableRangeCache();
    assert.deepStrictEqual(cache.get({ getBuffer: () => ({ getLanguageMode: () => ({}) }) }), []);
    assert.deepStrictEqual(
      cache.get({
        getBuffer: () => {
          throw new Error('mid-reparse');
        }
      }),
      []
    );
    assert.deepStrictEqual(cache.get(null), []);
  });
});
