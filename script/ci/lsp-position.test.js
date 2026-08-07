'use strict';

/**
 * Phase 1 position encoding helpers.
 * Run: node --test script/ci/lsp-position.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  pointToLsp,
  lspToPoint,
  utf16ColumnToUtf8Offset,
  utf8OffsetToUtf16Column
} = require('../../src/lsp/position');

describe('LSP position mapping', () => {
  it('maps Atom Point to LSP Position (utf-16 identity)', () => {
    assert.deepStrictEqual(pointToLsp({ row: 2, column: 5 }), {
      line: 2,
      character: 5
    });
    assert.deepStrictEqual(lspToPoint({ line: 1, character: 3 }), {
      row: 1,
      column: 3
    });
  });

  it('utf-16 column ↔ utf-8 offset for BMP text', () => {
    const line = 'hello';
    assert.strictEqual(utf16ColumnToUtf8Offset(line, 5), 5);
    assert.strictEqual(utf8OffsetToUtf16Column(line, 5), 5);
  });

  it('utf-16 column ↔ utf-8 offset for emoji (astral)', () => {
    // 'a' + wave emoji + 'b' — emoji is one JS code point (2 UTF-16 units) and 4 UTF-8 bytes
    const line = 'a👋b';
    assert.strictEqual(line.length, 4); // UTF-16 code units
    assert.strictEqual(Buffer.byteLength(line, 'utf8'), 6);
    // column 0 -> 0, after 'a' col 1 -> 1 byte, after emoji col 3 -> 1+4=5 bytes
    assert.strictEqual(utf16ColumnToUtf8Offset(line, 0), 0);
    assert.strictEqual(utf16ColumnToUtf8Offset(line, 1), 1);
    assert.strictEqual(utf16ColumnToUtf8Offset(line, 3), 5);
    assert.strictEqual(utf16ColumnToUtf8Offset(line, 4), 6);
    assert.strictEqual(utf8OffsetToUtf16Column(line, 0), 0);
    assert.strictEqual(utf8OffsetToUtf16Column(line, 1), 1);
    assert.strictEqual(utf8OffsetToUtf16Column(line, 5), 3);
    assert.strictEqual(utf8OffsetToUtf16Column(line, 6), 4);
  });
});
