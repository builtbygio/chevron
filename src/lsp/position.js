'use strict';

/**
 * Atom Point ↔ LSP Position. Both default to UTF-16 code units (JS string index).
 * UTF-8 conversion for servers that negotiate utf-8 (Phase 3 stress).
 */

/**
 * @param {{row:number, column:number}|{line:number,character:number}} point
 * @returns {{line:number, character:number}}
 */
function pointToLsp(point) {
  if (point == null) return { line: 0, character: 0 };
  if (typeof point.line === 'number') {
    return { line: point.line, character: point.character || 0 };
  }
  return { line: point.row || 0, character: point.column || 0 };
}

/**
 * @param {{line:number, character:number}} pos
 * @returns {{row:number, column:number}}
 */
function lspToPoint(pos) {
  if (pos == null) return { row: 0, column: 0 };
  return { row: pos.line || 0, column: pos.character || 0 };
}

/**
 * Convert a UTF-16 column to a UTF-8 byte offset on the given line text.
 * @param {string} lineText
 * @param {number} utf16Column
 */
function utf16ColumnToUtf8Offset(lineText, utf16Column) {
  const slice = lineText.slice(0, Math.max(0, utf16Column));
  return Buffer.byteLength(slice, 'utf8');
}

/**
 * Convert a UTF-8 byte offset to a UTF-16 column on the given line text.
 * @param {string} lineText
 * @param {number} utf8Offset
 */
function utf8OffsetToUtf16Column(lineText, utf8Offset) {
  let bytes = 0;
  for (let i = 0; i < lineText.length; i++) {
    const code = lineText.charCodeAt(i);
    // surrogate pair
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < lineText.length) {
      const next = lineText.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const charBytes = Buffer.byteLength(lineText.slice(i, i + 2), 'utf8');
        if (bytes + charBytes > utf8Offset) return i;
        bytes += charBytes;
        i++;
        continue;
      }
    }
    const charBytes = Buffer.byteLength(lineText[i], 'utf8');
    if (bytes + charBytes > utf8Offset) return i;
    bytes += charBytes;
  }
  return lineText.length;
}

/**
 * @param {string} lineText
 * @param {{line:number, character:number}} pos
 * @param {'utf-16'|'utf-8'} encoding
 */
function lspToPointWithEncoding(lineText, pos, encoding) {
  if (encoding === 'utf-8') {
    return {
      row: pos.line || 0,
      column: utf8OffsetToUtf16Column(lineText || '', pos.character || 0)
    };
  }
  return lspToPoint(pos);
}

/**
 * @param {string} lineText
 * @param {{row:number, column:number}} point
 * @param {'utf-16'|'utf-8'} encoding
 */
function pointToLspWithEncoding(lineText, point, encoding) {
  if (encoding === 'utf-8') {
    return {
      line: point.row || 0,
      character: utf16ColumnToUtf8Offset(lineText || '', point.column || 0)
    };
  }
  return pointToLsp(point);
}

module.exports = {
  pointToLsp,
  lspToPoint,
  utf16ColumnToUtf8Offset,
  utf8OffsetToUtf16Column,
  lspToPointWithEncoding,
  pointToLspWithEncoding
};
