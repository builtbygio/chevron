'use strict';

/**
 * What encloses a line: the foldable ranges it sits inside, outermost first.
 * Shared by breadcrumbs and sticky scroll.
 *
 * docs/reference/code-context.md
 */

export interface RowRange {
  startRow: number;
  endRow: number;
}

/**
 * The ranges containing `row`, outermost first. A range whose first line *is*
 * the row counts as enclosing it.
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

  // Outermost first; for equal starts, the one that reaches furthest.
  found.sort((a, b) => a.startRow - b.startRow || b.endRow - a.endRow);

  // Two ranges opening on the same line read as one block.
  const distinct: RowRange[] = [];
  for (const range of found) {
    const last = distinct[distinct.length - 1];
    if (last && last.startRow === range.startRow) continue;
    distinct.push(range);
  }
  return distinct;
}

/** A line tidied for display: no indent, no trailing brace, cut to length. */
export function labelForLine(text: string, maxLength: number = 80): string {
  if (typeof text !== 'string') return '';
  let label = text.trim().replace(/[\s{([,]+$/, '');
  if (label.length > maxLength) label = label.slice(0, maxLength - 1) + '…';
  return label;
}

// Above this, both features are off: the walk costs seconds on a very large
// file and the cache is invalidated on every edit. Numbers in the doc.
const MAX_LINES = 10000;

/**
 * Foldable ranges for an editor, cached until the caller invalidates. The walk
 * is a whole-tree one, and sticky scroll asks on every scroll.
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

    // Checked before asking: the cost is in the asking.
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
      // A mode mid-reparse is not worth an exception in a status bar.
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
