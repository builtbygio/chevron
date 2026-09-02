'use strict';

/**
 * A cursor move during the provider round trip must not drop the popup.
 *
 * autocomplete-manager has two notions of whether a request is still wanted: a
 * generation check on the promise, and shouldDisplaySuggestions, a global
 * boolean that requestHideSuggestionList lowers synchronously and nothing
 * restores. A cursorMoved landing mid-flight discards a request the generation
 * check still considers current. Latency-proportional, hence a CI-only flake.
 *
 * Run: node --test script/ci/autocomplete-inflight-hide.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANAGER = path.join(
  ROOT, 'packages', 'autocomplete-plus', 'lib', 'autocomplete-manager.ts'
);

// The manager's own logic, reduced to the parts that decide display. Field
// names and ordering mirror the source so the two cannot drift silently; the
// shape assertions at the bottom check they still match.
function makeManager({ providerLatency }) {
  const m = {
    // The editor's cursor, as a plain [row, column] the model can move.
    cursor: [0, 4],
    shouldDisplaySuggestions: false,
    hideTimeout: null,
    delayTimeout: null,
    currentSuggestionsPromise: null,
    shown: null,
    hidden: 0,
    everShown: 0,

    showSuggestionList(s) { m.shown = s; m.everShown++; },
    hideSuggestionList() {
      m.shown = null;
      m.hidden++;
      m.shouldDisplaySuggestions = false;
    },
    requestHideSuggestionList() {
      if (m.hideTimeout == null) {
        m.hideTimeout = setTimeout(() => {
          m.hideSuggestionList();
          m.hideTimeout = null;
        }, 0);
      }
      m.shouldDisplaySuggestions = false;
    },
    cancelHideSuggestionListRequest() {
      clearTimeout(m.hideTimeout);
      m.hideTimeout = null;
    },
    // The fix: a request is dropped only if the cursor actually left the
    // position it was made for -- not merely because a hide was requested.
    suggestionsStillWanted(options) {
      if (m.shouldDisplaySuggestions) return true;
      if (options == null || options.bufferPosition == null) return false;
      return (
        m.cursor[0] === options.bufferPosition[0] &&
        m.cursor[1] === options.bufferPosition[1]
      );
    },
    displaySuggestions(suggestions, options) {
      if (suggestions.length && m.suggestionsStillWanted(options)) {
        return m.showSuggestionList(suggestions);
      }
      return m.hideSuggestionList();
    },
    findSuggestions() {
      // Captured at request time, exactly as the manager does at the
      // getSuggestionsFromProviders call site.
      const options = { bufferPosition: [m.cursor[0], m.cursor[1]] };
      const p = new Promise(resolve =>
        setTimeout(() => resolve([{ text: 'probeAlpha' }, { text: 'probeBeta' }]),
                   providerLatency)
      );
      m.currentSuggestionsPromise = p;
      return p.then(suggestions => {
        if (m.currentSuggestionsPromise !== p) return;
        return m.displaySuggestions(suggestions, options);
      });
    },
    requestNewSuggestions() {
      if (m.delayTimeout != null) clearTimeout(m.delayTimeout);
      const done = m.findSuggestions();
      m.shouldDisplaySuggestions = true;
      return done;
    },
    // The typing path: cancel any pending hide, then ask for suggestions.
    bufferChanged() {
      m.cancelHideSuggestionListRequest();
      return m.requestNewSuggestions();
    },
    cursorMoved({ textChanged }) {
      if (!textChanged) m.requestHideSuggestionList();
    }
  };
  return m;
}

describe('autocomplete popup survives a cursor move in flight', () => {
  it('shows the popup when nothing interrupts (control)', async () => {
    const m = makeManager({ providerLatency: 20 });
    await m.bufferChanged();
    assert.ok(m.shown, 'the uninterrupted path must show a popup');
    assert.equal(m.shown.length, 2);
  });

  it('does not drop a request that was never superseded', async () => {
    const m = makeManager({ providerLatency: 40 });
    const done = m.bufferChanged();

    // A cursor move with textChanged: false, arriving while the provider is
    // still working. The promise is never replaced, so this request is still
    // the current one by the manager's own generation check.
    await new Promise(r => setTimeout(r, 5));
    m.cursorMoved({ textChanged: false });

    await done;

    assert.ok(
      m.shown,
      'the popup was dropped by a cursor move that arrived during the ' +
        'provider round trip. currentSuggestionsPromise still pointed at this ' +
        'request -- the manager considered it current -- but ' +
        'shouldDisplaySuggestions had been lowered synchronously by ' +
        'requestHideSuggestionList and nothing raised it again. The display ' +
        'decision needs the same generation identity the promise already has.'
    );
  });

  it('the window scales with provider latency', async () => {
    // Identical event sequences against a fast and a slow provider. Measured
    // as "was the popup ever shown", not "is it showing now": a cursor move
    // arriving AFTER the popup is up is supposed to hide it, and that correct
    // hide would otherwise be indistinguishable from the dropped request.
    const fast = makeManager({ providerLatency: 0 });
    const slow = makeManager({ providerLatency: 40 });

    const fastDone = fast.bufferChanged();
    await fastDone;
    fast.cursorMoved({ textChanged: false }); // arrives after resolution

    const slowDone = slow.bufferChanged();
    await new Promise(r => setTimeout(r, 5));
    slow.cursorMoved({ textChanged: false }); // arrives during flight
    await slowDone;

    assert.equal(
      fast.everShown, 1,
      'the fast provider resolves before the cursor event and must show'
    );
    assert.equal(
      slow.everShown, 1,
      'identical events, and only the slow provider never shows at all. The ' +
        'user sees no popup rather than a popup that appears and dismisses.'
    );
  });
});

describe('a genuine move away still cancels', () => {
  it('drops the request when the cursor actually leaves', async () => {
    // The other half of the fix. Restoring shouldDisplaySuggestions would have
    // made the flake test pass and popped a suggestion list up at a stale
    // location after the user clicked elsewhere.
    const m = makeManager({ providerLatency: 40 });
    const done = m.bufferChanged();

    await new Promise(r => setTimeout(r, 5));
    m.cursor = [12, 0]; // the user clicked somewhere else
    m.cursorMoved({ textChanged: false });

    await done;
    assert.equal(
      m.everShown, 0,
      'a request whose cursor genuinely moved away must not be shown'
    );
  });
});

describe('the manager still has the shape this models', () => {
  const src = fs.readFileSync(MANAGER, 'utf8');

  it('guards display with position identity, not the bare flag', () => {
    assert.ok(
      /if \(suggestions\.length && this\.suggestionsStillWanted\(options\)\)/.test(src),
      'displaySuggestions must not go back to reading shouldDisplaySuggestions ' +
        'directly; a mid-flight cursor event silently drops the request'
    );
    assert.ok(
      /getBufferPosition\(\)\.isEqual\(options\.bufferPosition\)/.test(src),
      'the guard must compare against the position the request was made for'
    );
  });

  it('lowers the flag synchronously in requestHideSuggestionList', () => {
    const fn = src.slice(src.indexOf('requestHideSuggestionList ('));
    const body = fn.slice(0, fn.indexOf('\n  cancel'));
    assert.ok(
      /\}, 0\)[\s\S]*this\.shouldDisplaySuggestions = false/.test(body),
      'the flag is no longer lowered outside the timeout; if it moved inside, ' +
        'this model and the bug it describes need revisiting'
    );
  });

  it('does not restore the flag when cancelling the hide', () => {
    const i = src.indexOf('cancelHideSuggestionListRequest ()');
    const body = src.slice(i, src.indexOf('}', src.indexOf('hideTimeout = null', i)));
    assert.ok(
      !/shouldDisplaySuggestions\s*=\s*true/.test(body),
      'cancelHideSuggestionListRequest now restores the flag -- that is one ' +
        'possible fix, and this test should be updated to assert it'
    );
  });
});
