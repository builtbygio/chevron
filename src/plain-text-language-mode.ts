'use strict';

/**
 * The language mode for buffers with no tree-sitter grammar.
 *
 * No highlighting, but folding by indentation, which needs no grammar. The
 * fold methods lived on TextMateLanguageMode and went with it; auto-indent
 * moved to src/auto-indent.ts at the time, folding did not, and editors were
 * handed text-buffer's own NullLanguageMode instead. That answers only the six
 * methods text-buffer itself calls, so a plain .txt could not fold and
 * autoflow threw on isRowCommented.
 *
 * See docs/reference/language-modes.md.
 */

const { Point, Range } = require('text-buffer');
const { Disposable } = require('event-kit');

const NON_WHITESPACE_REGEX = /\S/;
// Not frozen: a display-layer caller assigns to .length, as it does to
// text-buffer's own empty tag array.
const EMPTY = [];

module.exports = class PlainTextLanguageMode {
  constructor(buffer, grammar) {
    this.buffer = buffer;
    this.grammar = grammar;
  }

  // --- text-buffer's language mode interface -------------------------------

  bufferDidChange() {}

  bufferDidFinishTransaction() {}

  buildHighlightIterator() {
    return new NullHighlightIterator();
  }

  onDidChangeHighlighting() {
    return new Disposable(() => {});
  }

  getLanguageId() {
    return this.grammar ? this.grammar.scopeName : null;
  }

  getGrammar() {
    return this.grammar;
  }

  // --- folding, by indentation ---------------------------------------------

  isFoldableAtRow(row) {
    return this.endRowForFoldAtRow(row, 1, true) != null;
  }

  getFoldableRanges(tabLength) {
    const result = [];
    const lineCount = this.buffer.getLineCount();
    for (let row = 0; row < lineCount; row++) {
      const endRow = this.endRowForFoldAtRow(row, tabLength);
      if (endRow != null) {
        result.push(Range(Point(row, Infinity), Point(endRow, Infinity)));
      }
    }
    return result;
  }

  getFoldableRangesAtIndentLevel(indentLevel, tabLength) {
    const result = [];
    let row = 0;
    const lineCount = this.buffer.getLineCount();
    while (row < lineCount) {
      if (
        this.indentLevelForLine(this.buffer.lineForRow(row), tabLength) ===
        indentLevel
      ) {
        const endRow = this.endRowForFoldAtRow(row, tabLength);
        if (endRow != null) {
          result.push(Range(Point(row, Infinity), Point(endRow, Infinity)));
          row = endRow + 1;
          continue;
        }
      }
      row++;
    }
    return result;
  }

  getFoldableRangeContainingPoint(point, tabLength) {
    if (point.column >= this.buffer.lineLengthForRow(point.row)) {
      const endRow = this.endRowForFoldAtRow(point.row, tabLength);
      if (endRow != null) {
        return Range(Point(point.row, Infinity), Point(endRow, Infinity));
      }
    }

    for (let row = point.row - 1; row >= 0; row--) {
      const endRow = this.endRowForFoldAtRow(row, tabLength);
      if (endRow != null && endRow >= point.row) {
        return Range(Point(row, Infinity), Point(endRow, Infinity));
      }
    }
    return null;
  }

  endRowForFoldAtRow(row, tabLength, existenceOnly = false) {
    let foldEndRow;
    const line = this.buffer.lineForRow(row);
    if (line == null || !NON_WHITESPACE_REGEX.test(line)) return;
    const startIndentLevel = this.indentLevelForLine(line, tabLength);
    const lineCount = this.buffer.getLineCount();
    for (let nextRow = row + 1; nextRow < lineCount; nextRow++) {
      const nextLine = this.buffer.lineForRow(nextRow);
      if (!NON_WHITESPACE_REGEX.test(nextLine)) continue;
      if (this.indentLevelForLine(nextLine, tabLength) <= startIndentLevel) {
        break;
      }
      foldEndRow = nextRow;
      if (existenceOnly) break;
    }
    return foldEndRow;
  }

  indentLevelForLine(line, tabLength) {
    let indentLength = 0;
    for (let i = 0, { length } = line; i < length; i++) {
      const char = line[i];
      if (char === '\t') {
        indentLength += tabLength - (indentLength % tabLength);
      } else if (char === ' ') {
        indentLength++;
      } else {
        break;
      }
    }
    return indentLength / tabLength;
  }

  // --- no grammar, so nothing is a comment ---------------------------------

  isRowCommented() {
    return false;
  }

  commentStringsForPosition() {
    return {};
  }
};

class NullHighlightIterator {
  seek() {
    return EMPTY;
  }
  moveToSuccessor() {
    return false;
  }
  getPosition() {
    return Point.INFINITY;
  }
  getCloseTags() {
    return EMPTY;
  }
  getOpenTags() {
    return EMPTY;
  }
}
