'use strict';

/**
 * What encloses a line: the foldable ranges it sits inside, outermost first.
 *
 * Both things built on this want the same answer and would otherwise each
 * work it out. Breadcrumbs name the path to the cursor; sticky scroll pins
 * the lines that opened the blocks you have scrolled past.
 *
 * Foldable ranges rather than symbols, because every grammar is tree-sitter
 * now and declares folds, so this works without a language server — and a
 * feature that goes blank for a file whose server is not running is worse
 * than one that is slightly less clever.
 *
 * docs/reference/code-context.md
 */

export interface RowRange {
  startRow: number;
  endRow: number;
}

/**
 * The ranges containing `row`, outermost first.
 *
 * A range whose first line *is* the row counts as enclosing it: standing on
 * `function foo() {` is standing in `foo`, which is what a breadcrumb should
 * say. Sticky scroll asks for the row below the top of the viewport instead,
 * so the same rule gives it what it wants without a second definition.
 */
export function enclosingRanges(ranges: any[], row: number): RowRange[] {
  if (!Array.isArray(ranges)) return [];

  const found: RowRange[] = [];
  for (const range of ranges) {
    if (!range || !range.start || !range.end) continue;
    const startRow = range.start.row;
    const endRow = range.end.row;
    if (typeof startRow !== 'number' || typeof endRow !== 'number') continue;
    if (startRow > row || endRow < row) continue;
    found.push({ startRow, endRow });
  }

  // Outermost first, and for equal starts the one that reaches furthest.
  found.sort((a, b) => a.startRow - b.startRow || b.endRow - a.endRow);

  // Two ranges opening on the same line describe one block between them; the
  // inner adds nothing a reader can see.
  const distinct: RowRange[] = [];
  for (const range of found) {
    const last = distinct[distinct.length - 1];
    if (last && last.startRow === range.startRow) continue;
    distinct.push(range);
  }
  return distinct;
}

/**
 * The text of a line, tidied for display: no indentation, no trailing brace
 * or comma, and cut to a length that fits a bar.
 */
export function labelForLine(text: string, maxLength: number = 80): string {
  if (typeof text !== 'string') return '';
  let label = text.trim().replace(/[\s{([,]+$/, '');
  if (label.length > maxLength) label = label.slice(0, maxLength - 1) + '…';
  return label;
}

/**
 * Above this many lines, nothing is offered at all.
 *
 * Measured on a 120,000 line file: `getFoldableRanges()` found 40,003 ranges
 * and took **2.5 seconds**, blocking the renderer for all of it. The cache
 * makes a scroll cheap afterwards (0.26ms), but it is invalidated on every
 * edit — so without a limit, each pause in typing would buy a 2.5 second
 * freeze on the next scroll. A breadcrumb bar is not worth that.
 */
const MAX_LINES = 10000;

/**
 * Foldable ranges for an editor, cached until the buffer stops changing.
 *
 * `getFoldableRanges()` walks the whole syntax tree, which is far too much to
 * do on every scroll event — and scrolling is exactly when sticky scroll asks.
 * The cache is invalidated by the caller on change and grammar change; this
 * only holds it.
 */
export class FoldableRangeCache {
  private cache: WeakMap<object, any[]>;
  private maxLines: number;

  constructor(options: { maxLines?: number } = {}) {
    this.cache = new WeakMap();
    this.maxLines = options.maxLines == null ? MAX_LINES : options.maxLines;
  }

  get(editor: any): any[] {
    if (!editor) return [];
    const cached = this.cache.get(editor);
    if (cached) return cached;

    // Checked before asking, not after: the cost is in the asking.
    try {
      if (
        typeof editor.getLineCount === 'function' &&
        editor.getLineCount() > this.maxLines
      ) {
        this.cache.set(editor, []);
        return [];
      }
    } catch (error) {
      return [];
    }

    let ranges: any[] = [];
    try {
      const languageMode = editor.getBuffer().getLanguageMode();
      if (languageMode && typeof languageMode.getFoldableRanges === 'function') {
        ranges = languageMode.getFoldableRanges() || [];
      }
    } catch (error) {
      // A language mode mid-reparse is not worth an exception in a status bar.
      ranges = [];
    }
    this.cache.set(editor, ranges);
    return ranges;
  }

  invalidate(editor: any): void {
    if (editor) this.cache.delete(editor);
  }
}

module.exports = {
  enclosingRanges,
  labelForLine,
  FoldableRangeCache,
  MAX_LINES
};
