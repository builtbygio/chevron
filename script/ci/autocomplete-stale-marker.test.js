'use strict';

/**
 * The suggestion list rebuilds its overlay when the marker dies.
 *
 * showAtBeginningOfPrefix keyed its two branches on `activeEditor === editor`
 * alone. Atom destroys a marker as a side effect of buffer changes, and drops
 * the decoration with it, so the list could leave the DOM while activeEditor
 * and suggestionMarker stayed set. Every later show() then took the
 * same-editor branch, called setBufferRange on a dead marker, and never
 * rebuilt the decoration -- completions stopped appearing in that editor until
 * something called hide().
 *
 * Observed once in a smoke failure, which reported exactly that shape:
 *
 *   suggestionList.isActive()   true      activeEditor set
 *   autocomplete-suggestion-list          absent from the DOM
 *   currentSuggestionsPromise   null      nothing in flight
 *   waited                      20000ms
 *
 * It is unrecoverable rather than slow, which is why the probe waiting longer
 * never helped.
 *
 * Run: node --test script/ci/autocomplete-stale-marker.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(
  ROOT,
  'packages',
  'autocomplete-plus',
  'lib',
  'suggestion-list.ts'
);

// The branch logic, reduced to the decision it makes. Mirrors the source; the
// assertions at the bottom check the two have not drifted.
function makeList() {
  const list = {
    activeEditor: null,
    suggestionMarker: null,
    overlayDecoration: null,
    displayBufferPosition: null,
    rebuilds: 0,
    moves: 0,

    hasLiveOverlay() {
      const marker = list.suggestionMarker;
      if (marker == null) return false;
      if (typeof marker.isDestroyed === 'function' && marker.isDestroyed()) {
        return false;
      }
      return list.overlayDecoration != null;
    },

    show(editor, position) {
      if (list.activeEditor === editor && list.hasLiveOverlay()) {
        if (position !== list.displayBufferPosition) {
          list.displayBufferPosition = position;
          list.suggestionMarker.setBufferRange(position);
          list.moves++;
        }
        return;
      }
      // destroyOverlay + rebuild
      list.suggestionMarker = null;
      list.overlayDecoration = null;
      list.activeEditor = editor;
      list.displayBufferPosition = position;
      list.suggestionMarker = makeMarker();
      list.overlayDecoration = { destroy() {} };
      list.rebuilds++;
    }
  };
  return list;
}

function makeMarker() {
  let destroyed = false;
  return {
    isDestroyed: () => destroyed,
    destroy() {
      destroyed = true;
    },
    setBufferRange() {
      if (destroyed) throw new Error('setBufferRange on a destroyed marker');
    }
  };
}

describe('suggestion list overlay', () => {
  it('reuses a live overlay rather than rebuilding on every keystroke', () => {
    const list = makeList();
    const editor = { id: 1 };
    list.show(editor, 'p1');
    list.show(editor, 'p2');
    list.show(editor, 'p3');
    assert.equal(list.rebuilds, 1, 'one rebuild, then moves');
    assert.equal(list.moves, 2);
  });

  it('rebuilds when the marker has been destroyed underneath it', () => {
    const list = makeList();
    const editor = { id: 1 };
    list.show(editor, 'p1');
    assert.equal(list.rebuilds, 1);

    // What a buffer change does: Atom destroys the marker and drops its
    // decoration. activeEditor still points at this editor.
    list.suggestionMarker.destroy();
    list.overlayDecoration = null;

    list.show(editor, 'p2');
    assert.equal(
      list.rebuilds,
      2,
      'a dead marker must force a rebuild; keying on the editor alone leaves ' +
        'the list active with nothing rendered, permanently'
    );
    assert.ok(list.hasLiveOverlay(), 'the overlay must be real again');
  });

  it('never calls setBufferRange on a destroyed marker', () => {
    const list = makeList();
    const editor = { id: 1 };
    list.show(editor, 'p1');
    list.suggestionMarker.destroy();
    list.overlayDecoration = null;
    assert.doesNotThrow(() => list.show(editor, 'p2'));
  });

  it('treats a missing decoration as dead even if the marker lives', () => {
    const list = makeList();
    const editor = { id: 1 };
    list.show(editor, 'p1');
    list.overlayDecoration = null; // decoration dropped, marker intact
    list.show(editor, 'p2');
    assert.equal(list.rebuilds, 2);
  });
});

describe('the old branch logic, to show what it did', () => {
  // Keyed on the editor alone, as the source did before this fix.
  function makeOldList() {
    const list = makeList();
    list.show = (editor, position) => {
      if (list.activeEditor === editor) {
        if (position !== list.displayBufferPosition) {
          list.displayBufferPosition = position;
          if (list.suggestionMarker) {
            list.suggestionMarker.setBufferRange(position);
          }
          list.moves++;
        }
        return;
      }
      list.suggestionMarker = makeMarker();
      list.overlayDecoration = { destroy() {} };
      list.activeEditor = editor;
      list.displayBufferPosition = position;
      list.rebuilds++;
    };
    return list;
  }

  it('never recovers once the marker dies', () => {
    const list = makeOldList();
    const editor = { id: 1 };
    list.show(editor, 'p1');

    list.suggestionMarker.destroy();
    list.overlayDecoration = null;

    // Every subsequent keystroke takes the same-editor branch.
    assert.throws(() => list.show(editor, 'p2'), /destroyed marker/);
    list.suggestionMarker = null; // as destroyOverlay would leave it
    list.show(editor, 'p3');
    list.show(editor, 'p4');

    assert.equal(list.rebuilds, 1, 'it never rebuilds');
    assert.equal(
      list.overlayDecoration,
      null,
      'so the list stays active with nothing rendered -- which is the smoke ' +
        'failure: isActive true, no element, twenty seconds'
    );
  });
});

describe('the source still has the shape this models', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');

  it('gates the reuse branch on a live overlay', () => {
    assert.match(src, /this\.activeEditor === editor && this\.hasLiveOverlay\(\)/);
    assert.match(src, /hasLiveOverlay \(\)/);
  });

  it('checks the marker is not destroyed', () => {
    const fn = src.slice(src.indexOf('hasLiveOverlay ()'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    assert.match(body, /isDestroyed/);
    assert.match(body, /overlayDecoration != null/);
  });

  it('does not strand activeEditor when the cursor path finds no marker', () => {
    const fn = src.slice(src.indexOf('showAtCursorPosition (editor)'));
    const body = fn.slice(0, fn.indexOf('\n  hide ()'));
    assert.match(
      body,
      /this\.activeEditor = null/,
      'bailing after destroyOverlay must clear activeEditor, or the list is ' +
        'left active with no overlay'
    );
  });
});
