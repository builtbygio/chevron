'use strict';

/**
 * Boundary tests for inbound LSP → Atom position conversion (goal G7).
 *
 * The existing lsp-position.test.js proves the *conversion functions* are
 * correct. It passed the whole time `lspToPointWithEncoding` had zero call
 * sites — correct maths that nothing invoked. These tests assert the
 * providers actually convert, which is the failure that shipped.
 */

const { test, describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const {
  normalizeDefinitionResult,
  normalizeDefinitionResultForEncoding
} = require('../../src/lsp/providers/definitions');
const {
  normalizeDocumentSymbols
} = require('../../src/lsp/providers/document-symbols');
const { createSyncConverter } = require('../../src/lsp/inbound-position');

// "héllo wörld" — 11 UTF-16 code units, 13 UTF-8 bytes.
// Byte offset 13 == UTF-16 column 11 (each of é and ö is 2 bytes).
const LINE = 'héllo wörld';
const FILE = path.join('/tmp', 'chevron-utf8-fixture.txt');
const URI = `file://${FILE}`;

/** Stand in for an open editor so the sync converter finds line text. */
function withFakeWorkspace(lineText, fn) {
  const previous = global.chevron;
  global.chevron = {
    workspace: {
      getTextEditors: () => [
        {
          getPath: () => FILE,
          lineTextForBufferRow: row => (row === 0 ? lineText : '')
        }
      ]
    }
  };
  try {
    return fn();
  } finally {
    global.chevron = previous;
  }
}

describe('inbound position conversion honours positionEncoding', () => {
  it('utf-16 session: character offsets pass through unchanged', async () => {
    const result = [{ uri: URI, range: { start: { line: 0, character: 11 }, end: { line: 0, character: 11 } } }];
    const locs = await normalizeDefinitionResultForEncoding(result, 'utf-16');
    assert.strictEqual(locs[0].range.start.column, 11);
  });

  it('utf-8 session: byte offset 13 becomes column 11, not 13', async () => {
    const result = [{ uri: URI, range: { start: { line: 0, character: 13 }, end: { line: 0, character: 13 } } }];
    const locs = await withFakeWorkspace(LINE, () =>
      normalizeDefinitionResultForEncoding(result, 'utf-8')
    );
    assert.strictEqual(
      locs[0].range.start.column,
      11,
      'utf-8 byte offset must be converted to a UTF-16 column'
    );
  });

  it('utf-8 session: LocationLink targets convert too', async () => {
    const result = [
      {
        targetUri: URI,
        targetSelectionRange: {
          start: { line: 0, character: 13 },
          end: { line: 0, character: 13 }
        }
      }
    ];
    const locs = await withFakeWorkspace(LINE, () =>
      normalizeDefinitionResultForEncoding(result, 'utf-8')
    );
    assert.strictEqual(locs[0].range.start.column, 11);
  });

  it('document symbols convert with a utf-8 converter', () => {
    const symbols = [
      {
        name: 'x',
        kind: 13,
        selectionRange: {
          start: { line: 0, character: 13 },
          end: { line: 0, character: 13 }
        }
      }
    ];
    const out = withFakeWorkspace(LINE, () =>
      normalizeDocumentSymbols(symbols, createSyncConverter('utf-8'), URI)
    );
    assert.strictEqual(out[0].range.start.column, 11);
  });

  it('degrades to passthrough when the file is not open (no crash)', () => {
    const convert = createSyncConverter('utf-8');
    const point = convert({ line: 0, character: 13 }, 'file:///not/open.txt');
    assert.strictEqual(point.row, 0);
    assert.strictEqual(point.column, 13);
  });

  it('back-compat: normalizeDefinitionResult still works with one arg', () => {
    const locs = normalizeDefinitionResult([
      { uri: URI, range: { start: { line: 2, character: 4 }, end: { line: 2, character: 8 } } }
    ]);
    assert.strictEqual(locs[0].range.start.row, 2);
    assert.strictEqual(locs[0].range.start.column, 4);
  });
});
