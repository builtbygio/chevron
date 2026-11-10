'use strict';

/**
 * Commit diffs number gutter rows by asking each patch region which kind it
 * is. The packaged app bundles those classes, and esbuild renames them
 * (_Unchanged, or an empty name). Looking the kind up with constructor.name
 * then returns undefined, and the gutter calls toString on it.
 *
 * Run: node --test script/ci/patch-line-numbers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const chevronStub = { Range: class Range {} };
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'chevron') return chevronStub;
  return origRequire.apply(this, arguments);
};

const { Addition, Deletion, Unchanged, NoNewline } = require(path.join(
  ROOT,
  'packages',
  'github',
  'lib',
  'models',
  'patch',
  'region.js'
));
const { default: Hunk } = require(path.join(
  ROOT,
  'packages',
  'github',
  'lib',
  'models',
  'patch',
  'hunk.js'
));

function rename(klass, name) {
  Object.defineProperty(klass, 'name', { value: name });
}

// The names esbuild actually emits for this package.
rename(Addition, '');
rename(Deletion, '');
rename(Unchanged, '_Unchanged');
rename(NoNewline, '_NoNewline');

function marker(start, end) {
  return {
    id: start,
    getRange() {
      return {
        start: { row: start },
        end: { row: end },
        intersectsRow(row) {
          return row >= start && row <= end;
        },
        getRowCount() {
          return end - start + 1;
        }
      };
    }
  };
}

describe('patch regions keep their kind after the bundle renames them', () => {
  it('dispatches on layerName, not constructor.name', () => {
    assert.equal(new Addition(marker(0, 0)).constructor.name, '');
    assert.equal(new Unchanged(marker(0, 0)).constructor.name, '_Unchanged');
    assert.equal(
      new Addition(marker(0, 0)).when({ addition: () => 'add', unchanged: () => 'ctx' }),
      'add'
    );
    assert.equal(
      new Deletion(marker(0, 0)).when({ deletion: () => 'del', addition: () => 'add' }),
      'del'
    );
    assert.equal(
      new Unchanged(marker(0, 0)).when({ unchanged: () => 'ctx', addition: () => 'add' }),
      'ctx'
    );
    assert.equal(
      new NoNewline(marker(0, 0)).when({ nonewline: () => 'nl', unchanged: () => 'ctx' }),
      'nl'
    );
  });

  it('numbers an unchanged row and leaves an addition blank', () => {
    const hunk = new Hunk({
      oldStartRow: 10,
      newStartRow: 20,
      oldRowCount: 2,
      newRowCount: 3,
      sectionHeading: '',
      marker: marker(0, 2),
      regions: [new Unchanged(marker(0, 1)), new Addition(marker(2, 2))]
    });

    assert.equal(hunk.getOldRowAt(0), 10);
    assert.equal(hunk.getOldRowAt(1), 11);
    assert.equal(hunk.getOldRowAt(2), null);
    assert.equal(hunk.getNewRowAt(0), 20);
    assert.equal(hunk.getNewRowAt(2), 22);
  });

  it('pads a missing line number instead of calling toString on it', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'packages', 'github', 'lib', 'views', 'multi-file-patch-view.js'),
      'utf8'
    );
    const pad = source.slice(source.indexOf('  pad(num)'), source.indexOf('  measurePerformance('));
    assert.match(pad, /num == null/);
    assert.doesNotMatch(pad, /num === null/);
  });
});
