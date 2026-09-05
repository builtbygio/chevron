'use strict';

/**
 * Taking some of a proposed change and leaving the rest.
 *
 * The property everything else rests on: applying every hunk gives exactly the
 * proposed text, applying none gives exactly the original, and any subset
 * gives the original with only those hunks in it. If that is wrong, a review
 * surface silently writes something nobody agreed to — which is worse than
 * having no review surface at all.
 *
 * docs/reference/change-review.md
 * Run: node --test script/ci/change-proposal.test.js
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
  const localRequire = id => require(id.startsWith('.') ? path.resolve(path.dirname(file), id) : id);
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

const {
  proposeChange,
  computeHunks,
  applyHunks,
  applyHunksToCurrent,
  locateHunk,
  diffSegments
} = loadTs(path.join(ROOT, 'src', 'change-proposal.ts'));

const lines = n => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

describe('segments', () => {
  it('says nothing changed when nothing changed', () => {
    const segments = diffSegments(['a', 'b'], ['a', 'b']);
    assert.deepStrictEqual(segments, [{ type: 'equal', lines: ['a', 'b'] }]);
  });

  it('finds a replacement in the middle', () => {
    const segments = diffSegments(['a', 'b', 'c'], ['a', 'B', 'c']);
    assert.deepStrictEqual(segments.map(s => s.type), ['equal', 'remove', 'add', 'equal']);
  });

  it('finds a pure insertion', () => {
    const segments = diffSegments(['a', 'c'], ['a', 'b', 'c']);
    assert.deepStrictEqual(segments.map(s => s.type), ['equal', 'add', 'equal']);
    assert.deepStrictEqual(segments[1].lines, ['b']);
  });

  it('finds a pure deletion', () => {
    const segments = diffSegments(['a', 'b', 'c'], ['a', 'c']);
    assert.deepStrictEqual(segments.map(s => s.type), ['equal', 'remove', 'equal']);
    assert.deepStrictEqual(segments[1].lines, ['b']);
  });

  it('handles one side being empty', () => {
    assert.deepStrictEqual(diffSegments([], ['a']), [{ type: 'add', lines: ['a'] }]);
    assert.deepStrictEqual(diffSegments(['a'], []), [{ type: 'remove', lines: ['a'] }]);
    assert.deepStrictEqual(diffSegments([], []), []);
  });
});

describe('hunks', () => {
  it('carries context either side of a change', () => {
    const before = lines(20);
    const after = before.replace('line 10\n', 'line ten\n');
    const hunks = computeHunks(before, after);
    assert.strictEqual(hunks.length, 1);
    const hunk = hunks[0];
    assert.strictEqual(hunk.oldStart, 6, 'three lines of context before line 10');
    assert.ok(
      hunk.segments.some(s => s.type === 'remove' && s.lines.includes('line 10'))
    );
    assert.ok(
      hunk.segments.some(s => s.type === 'add' && s.lines.includes('line ten'))
    );
  });

  it('splits changes that are far apart', () => {
    const before = lines(40);
    const after = before
      .replace('line 5\n', 'line five\n')
      .replace('line 35\n', 'line thirty-five\n');
    const hunks = computeHunks(before, after);
    assert.strictEqual(hunks.length, 2);
    assert.ok(hunks[0].oldStart < hunks[1].oldStart);
  });

  it('keeps changes that are close together in one hunk', () => {
    const before = lines(20);
    const after = before
      .replace('line 10\n', 'line ten\n')
      .replace('line 12\n', 'line twelve\n');
    const hunks = computeHunks(before, after);
    assert.strictEqual(
      hunks.length,
      1,
      'two lines apart is closer than twice the context'
    );
  });

  it('has no hunks when the texts match', () => {
    assert.deepStrictEqual(computeHunks(lines(5), lines(5)), []);
    assert.strictEqual(proposeChange('f.js', 'a\n', 'a\n').unchanged, true);
  });
});

describe('applying a selection', () => {
  const before = lines(40);
  const after = before
    .replace('line 5\n', 'line five\n')
    .replace('line 35\n', 'line thirty-five\n');
  const hunks = computeHunks(before, after);

  it('all hunks reproduces the proposal exactly', () => {
    assert.strictEqual(applyHunks(before, hunks, hunks.map(h => h.id)), after);
  });

  it('no hunks reproduces the original exactly', () => {
    assert.strictEqual(applyHunks(before, hunks, []), before);
  });

  it('one hunk takes that change and no other', () => {
    const result = applyHunks(before, hunks, [hunks[0].id]);
    assert.ok(result.includes('line five'), 'the accepted change is in');
    assert.ok(result.includes('line 35'), 'the rejected change is not');
    assert.ok(!result.includes('line thirty-five'));
    assert.strictEqual(
      result.split('\n').length,
      before.split('\n').length,
      'a one-for-one replacement does not change the line count'
    );
  });

  it('the other hunk, likewise', () => {
    const result = applyHunks(before, hunks, [hunks[1].id]);
    assert.ok(result.includes('line thirty-five'));
    assert.ok(result.includes('line 5\n'));
    assert.ok(!result.includes('line five'));
  });
});

describe('insertions and deletions survive a round trip', () => {
  const cases = [
    ['insertion', 'a\nb\nc\n', 'a\nNEW\nb\nc\n'],
    ['deletion', 'a\nb\nc\n', 'a\nc\n'],
    ['append at end', 'a\nb\n', 'a\nb\nc\n'],
    ['prepend at start', 'b\nc\n', 'a\nb\nc\n'],
    ['whole file replaced', 'a\nb\n', 'x\ny\n'],
    ['emptied', 'a\nb\n', ''],
    ['created from nothing', '', 'a\nb\n'],
    ['no trailing newline', 'a\nb', 'a\nB'],
    ['trailing newline added', 'a\nb', 'a\nb\n']
  ];

  for (const [name, before, after] of cases) {
    it(`${name}: all in gives the proposal, none gives the original`, () => {
      const hunks = computeHunks(before, after);
      assert.strictEqual(
        applyHunks(before, hunks, hunks.map(h => h.id)),
        after,
        'accepting everything must reproduce the proposed text'
      );
      assert.strictEqual(
        applyHunks(before, hunks, []),
        before,
        'accepting nothing must leave the file alone'
      );
    });
  }
});

describe('every subset is honest', () => {
  it('for a proposal with three separate changes', () => {
    const before = lines(60);
    const after = before
      .replace('line 5\n', 'FIVE\n')
      .replace('line 30\n', 'THIRTY\n')
      .replace('line 55\n', 'FIFTY-FIVE\n');
    const hunks = computeHunks(before, after);
    assert.strictEqual(hunks.length, 3);

    // All eight combinations: each accepted hunk's text present, each
    // rejected hunk's original line still there.
    for (let mask = 0; mask < 8; mask++) {
      const accepted = hunks.filter((_, i) => mask & (1 << i));
      const result = applyHunks(before, hunks, accepted.map(h => h.id));
      const expect = [
        ['FIVE', 'line 5'],
        ['THIRTY', 'line 30'],
        ['FIFTY-FIVE', 'line 55']
      ];
      for (let i = 0; i < 3; i++) {
        const [changed, original] = expect[i];
        if (mask & (1 << i)) {
          assert.ok(result.includes(changed), `mask ${mask}: expected ${changed}`);
        } else {
          assert.ok(
            result.includes(`${original}\n`),
            `mask ${mask}: expected ${original} left alone`
          );
        }
      }
    }
  });
});

describe('applying to a file that has moved underneath the proposal', () => {
  // A proposal is made against a snapshot and applied after someone has read
  // it -- by which time they, or something else, may have typed. Applying by
  // the original line numbers would write into the wrong place quietly, which
  // is the one failure this surface must not have.
  const before = lines(40);
  const after = before
    .replace('line 5\n', 'ALPHA\n')
    .replace('line 35\n', 'OMEGA\n');
  const hunks = computeHunks(before, after);
  const ids = hunks.map(h => h.id);

  it('is identical to the simple path when nothing moved', () => {
    const result = applyHunksToCurrent(before, hunks, ids);
    assert.strictEqual(result.text, applyHunks(before, hunks, ids));
    assert.deepStrictEqual(result.conflicted, []);
    assert.deepStrictEqual(result.applied.sort(), ids.slice().sort());
  });

  it('follows a hunk that drifted, when lines were added above it', () => {
    const drifted = 'a new first line\nanother\n' + before;
    const result = applyHunksToCurrent(drifted, hunks, ids);
    assert.deepStrictEqual(result.conflicted, [], 'both hunks still placeable');
    assert.ok(result.text.startsWith('a new first line\nanother\n'));
    assert.ok(result.text.includes('ALPHA'));
    assert.ok(result.text.includes('OMEGA'));
  });

  it('follows the later hunk when a line was removed between them', () => {
    // Removed outside either hunk's context: line 20 is far from both.
    const drifted = before.replace('line 20\n', '');
    const result = applyHunksToCurrent(drifted, hunks, ids);
    assert.deepStrictEqual(result.conflicted, [], 'both still placeable');
    assert.ok(result.text.includes('ALPHA'));
    assert.ok(result.text.includes('OMEGA'));
    assert.ok(!result.text.includes('line 20\n'), 'the removal survived');
  });

  it('conflicts when the removal is inside the hunk the proposal describes', () => {
    // Deleting a line the hunk expects as context is a change to the hunk's
    // own region, not drift around it.
    const edited = before.replace('line 4\n', '');
    const result = applyHunksToCurrent(edited, hunks, ids);
    assert.deepStrictEqual(result.conflicted, [hunks[0].id]);
    assert.deepStrictEqual(result.applied, [hunks[1].id]);
    assert.ok(!result.text.includes('ALPHA'));
  });

  it('refuses a hunk whose own lines changed, and applies the others', () => {
    const edited = before.replace('line 35\n', 'line 35 edited by hand\n');
    const result = applyHunksToCurrent(edited, hunks, ids);
    assert.deepStrictEqual(result.applied, [hunks[0].id], 'the untouched hunk went in');
    assert.deepStrictEqual(result.conflicted, [hunks[1].id]);
    assert.ok(result.text.includes('ALPHA'), 'the applicable change was applied');
    assert.ok(
      result.text.includes('line 35 edited by hand'),
      "the person's own edit survived untouched"
    );
    assert.ok(!result.text.includes('OMEGA'));
  });

  it('applies where it was, even if the same passage appears again later', () => {
    // A copy elsewhere casts no doubt on the original position: the hunk
    // still matches exactly where it was computed, which is the strongest
    // evidence available.
    const duplicated = before + before;
    const result = applyHunksToCurrent(duplicated, hunks, ids);
    assert.deepStrictEqual(result.conflicted, []);
    assert.strictEqual(
      result.text.indexOf('ALPHA'),
      duplicated.indexOf('line 5'),
      'applied to the first copy, where the hunk was computed'
    );
    assert.strictEqual(
      result.text.split('ALPHA').length - 1,
      1,
      'and only once'
    );
  });

  it('leaves the file untouched when every hunk conflicts', () => {
    const rewritten = 'nothing\nlike\nthe\noriginal\n';
    const result = applyHunksToCurrent(rewritten, hunks, ids);
    assert.strictEqual(result.text, rewritten);
    assert.deepStrictEqual(result.applied, []);
    assert.strictEqual(result.conflicted.length, 2);
  });

  it('still honours the selection', () => {
    const result = applyHunksToCurrent(before, hunks, [hunks[0].id]);
    assert.deepStrictEqual(result.applied, [hunks[0].id]);
    assert.ok(result.text.includes('ALPHA'));
    assert.ok(result.text.includes('line 35\n'));
  });
});

describe('locating a hunk', () => {
  const before = lines(20);
  const after = before.replace('line 10\n', 'TEN\n');
  const [hunk] = computeHunks(before, after);

  it('finds it where it was', () => {
    assert.strictEqual(locateHunk(before.split('\n'), hunk), hunk.oldStart);
  });

  it('finds it after a shift', () => {
    const shifted = 'extra\n' + before;
    assert.strictEqual(locateHunk(shifted.split('\n'), hunk), hunk.oldStart + 1);
  });

  it('prefers where it was, when it still matches there', () => {
    assert.strictEqual(
      locateHunk((before + before).split('\n'), hunk),
      hunk.oldStart
    );
  });

  it('gives up when it has moved and two places match equally', () => {
    // Now it does not match where it was, and matches twice elsewhere:
    // choosing one would be a guess.
    const shifted = 'extra\n' + before + before;
    assert.strictEqual(locateHunk(shifted.split('\n'), hunk), -1);
  });

  it('gives up when it is gone', () => {
    assert.strictEqual(locateHunk(['nothing', 'like', 'it'], hunk), -1);
  });
});

describe('a proposal remembers what it was made against', () => {
  it('keeps the base text, so drift can be noticed at all', () => {
    const proposal = proposeChange('f.js', 'a\nb\n', 'a\nB\n');
    assert.strictEqual(proposal.baseText, 'a\nb\n');
    assert.strictEqual(proposeChange('f.js', 'x\n', 'x\n').baseText, 'x\n');
  });
});
