'use strict';

/**
 * A proposed change to a file, split into hunks you can take or leave.
 *
 * This is the half of a review surface that has nothing to do with drawing:
 * given the text as it is and the text something wants it to be, work out the
 * hunks, and rebuild the text from whichever ones were accepted. Rejecting a
 * hunk is not "undo it afterwards" — the rejected change is never made.
 *
 * Kept out of the git packages on purpose. Those diff a working tree against
 * an index; this diffs against text that does not exist yet, which is what a
 * language server refactor or an agent proposes.
 *
 * docs/reference/change-review.md
 */

/** Lines either side of a change, so a hunk reads in context. */
const DEFAULT_CONTEXT = 3;

/**
 * Above this many differing lines the diff stops being worth computing
 * exactly: the whole file is offered as one hunk instead. A proposal that
 * rewrites ten thousand lines is reviewed by reading the file, not by
 * picking through hunks.
 */
const MAX_DIFF_LINES = 4000;

export type SegmentType = 'equal' | 'remove' | 'add';

export interface Segment {
  type: SegmentType;
  lines: string[];
}

export interface Hunk {
  id: string;
  /** First line of the hunk in the original, 0-based. */
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The segments that make up the hunk, context included. */
  segments: Segment[];
}

export interface Proposal {
  path: string;
  hunks: Hunk[];
  /** True when the two texts are identical. */
  unchanged: boolean;
}

// The trailing empty element that `split` leaves after a final newline is
// kept, not dropped. It carries whether the file ends with a newline, which
// is a real difference a proposal is allowed to make: without it, adding a
// trailing newline produces no hunks at all, and a file created from nothing
// loses its last one. Keeping it makes split/join exact for every input.
function splitLines(text: string): string[] {
  return text.split('\n');
}

function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Line segments describing how to get from `oldLines` to `newLines`.
 *
 * Common prefix and suffix are matched off first, which is what makes this
 * cheap for the shape of edit that actually happens: a few lines changed in
 * the middle of a file. Only what is left goes through the quadratic part.
 */
export function diffSegments(oldLines: string[], newLines: string[]): Segment[] {
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);

  const segments: Segment[] = [];
  if (prefix > 0) {
    segments.push({ type: 'equal', lines: oldLines.slice(0, prefix) });
  }

  if (oldMiddle.length > MAX_DIFF_LINES || newMiddle.length > MAX_DIFF_LINES) {
    // Too big to pick apart usefully; offer it whole.
    if (oldMiddle.length) segments.push({ type: 'remove', lines: oldMiddle });
    if (newMiddle.length) segments.push({ type: 'add', lines: newMiddle });
  } else {
    segments.push(...middleSegments(oldMiddle, newMiddle));
  }

  if (suffix > 0) {
    segments.push({
      type: 'equal',
      lines: oldLines.slice(oldLines.length - suffix)
    });
  }

  return segments.filter(segment => segment.lines.length > 0);
}

/** Longest common subsequence, walked back into segments. */
function middleSegments(oldLines: string[], newLines: string[]): Segment[] {
  if (oldLines.length === 0 && newLines.length === 0) return [];
  if (oldLines.length === 0) return [{ type: 'add', lines: newLines }];
  if (newLines.length === 0) return [{ type: 'remove', lines: oldLines }];

  const rows = oldLines.length + 1;
  const columns = newLines.length + 1;
  const lengths = new Uint32Array(rows * columns);

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lengths[i * columns + j] =
        oldLines[i] === newLines[j]
          ? lengths[(i + 1) * columns + (j + 1)] + 1
          : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + (j + 1)]);
    }
  }

  const segments: Segment[] = [];
  const push = (type: SegmentType, line: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.lines.push(line);
    else segments.push({ type, lines: [line] });
  };

  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      push('equal', oldLines[i]);
      i++;
      j++;
    } else if (lengths[(i + 1) * columns + j] >= lengths[i * columns + (j + 1)]) {
      push('remove', oldLines[i]);
      i++;
    } else {
      push('add', newLines[j]);
      j++;
    }
  }
  while (i < oldLines.length) push('remove', oldLines[i++]);
  while (j < newLines.length) push('add', newLines[j++]);

  return segments;
}

/**
 * Group the segments into hunks: runs of change, each carrying up to
 * `context` unchanged lines either side. Two changes closer together than
 * twice the context become one hunk, because splitting them would print the
 * same lines twice and ask about them separately.
 */
export function computeHunks(
  oldText: string,
  newText: string,
  context: number = DEFAULT_CONTEXT
): Hunk[] {
  const segments = diffSegments(splitLines(oldText), splitLines(newText));
  const hunks: Hunk[] = [];

  let oldLine = 0;
  let newLine = 0;
  let current: Hunk | null = null;
  let trailingEqual = 0;

  const finish = () => {
    if (!current) return;
    // Trim any context beyond the limit from the end.
    const last = current.segments[current.segments.length - 1];
    if (last && last.type === 'equal' && last.lines.length > context) {
      const dropped = last.lines.length - context;
      last.lines = last.lines.slice(0, context);
      current.oldLines -= dropped;
      current.newLines -= dropped;
    }
    hunks.push(current);
    current = null;
    trailingEqual = 0;
  };

  for (const segment of segments) {
    if (segment.type === 'equal') {
      if (current) {
        current.segments.push({ type: 'equal', lines: segment.lines.slice() });
        current.oldLines += segment.lines.length;
        current.newLines += segment.lines.length;
        trailingEqual += segment.lines.length;
        if (trailingEqual >= context * 2) finish();
      }
      oldLine += segment.lines.length;
      newLine += segment.lines.length;
      continue;
    }

    if (!current) {
      // Open a hunk, backing up over the context lines before the change.
      const previous = hunks.length > 0 ? hunks[hunks.length - 1] : null;
      const availableContext = Math.min(context, oldLine);
      const leading =
        availableContext > 0
          ? lastEqualLines(segments, segment, availableContext)
          : [];
      current = {
        id: `hunk-${hunks.length + 1}`,
        oldStart: oldLine - leading.length,
        newStart: newLine - leading.length,
        oldLines: leading.length,
        newLines: leading.length,
        segments: leading.length > 0 ? [{ type: 'equal', lines: leading }] : []
      };
      if (previous) {
        // Nothing to reconcile: hunks are built left to right and the
        // context never overlaps because of the finish() rule above.
      }
    }

    current.segments.push({ type: segment.type, lines: segment.lines.slice() });
    if (segment.type === 'remove') {
      current.oldLines += segment.lines.length;
      oldLine += segment.lines.length;
    } else {
      current.newLines += segment.lines.length;
      newLine += segment.lines.length;
    }
    trailingEqual = 0;
  }

  finish();
  return hunks;
}

/** The last `count` unchanged lines before `segment`. */
function lastEqualLines(
  segments: Segment[],
  segment: Segment,
  count: number
): string[] {
  const index = segments.indexOf(segment);
  for (let i = index - 1; i >= 0; i--) {
    if (segments[i].type === 'equal') {
      return segments[i].lines.slice(-count);
    }
  }
  return [];
}

/**
 * Rebuild the file taking only the accepted hunks.
 *
 * Everything a hunk does not cover is copied through unchanged, so the result
 * is the original file with some of the proposal in it — which is what "accept
 * this hunk, not that one" has to mean.
 */
export function applyHunks(
  oldText: string,
  hunks: Hunk[],
  acceptedIds: string[] | Set<string>
): string {
  const accepted =
    acceptedIds instanceof Set ? acceptedIds : new Set(acceptedIds || []);
  const oldLines = splitLines(oldText);
  const out: string[] = [];
  let cursor = 0;

  for (const hunk of hunks) {
    // Untouched lines before this hunk.
    for (; cursor < hunk.oldStart; cursor++) out.push(oldLines[cursor]);

    if (accepted.has(hunk.id)) {
      for (const segment of hunk.segments) {
        if (segment.type === 'remove') continue;
        out.push(...segment.lines);
      }
    } else {
      for (const segment of hunk.segments) {
        if (segment.type === 'add') continue;
        out.push(...segment.lines);
      }
    }
    cursor = hunk.oldStart + hunk.oldLines;
  }

  for (; cursor < oldLines.length; cursor++) out.push(oldLines[cursor]);

  return joinLines(out);
}

/** A proposal for one file. */
export function proposeChange(
  path: string,
  oldText: string,
  newText: string,
  context: number = DEFAULT_CONTEXT
): Proposal {
  if (oldText === newText) {
    return { path, hunks: [], unchanged: true };
  }
  return { path, hunks: computeHunks(oldText, newText, context), unchanged: false };
}

module.exports = {
  proposeChange,
  computeHunks,
  applyHunks,
  diffSegments,
  DEFAULT_CONTEXT,
  MAX_DIFF_LINES
};
