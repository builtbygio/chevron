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
