'use strict';

/**
 * A window that never answers must not keep the application alive.
 *
 * `before-quit` awaits AtomWindow#prepareToUnload for every window. That
 * promise used to settle on exactly one event -- the renderer's reply -- so a
 * renderer that died, or that stayed responsive but never answered, left it
 * pending forever. `app.quit()` was never reached, `will-quit` never ran, and
 * the main process outlived its windows while still listening on the
 * single-instance socket, so the next launch handed off to the zombie.
 *
 * Observed: a main process alive 46 minutes after its window closed, with
 * /proc/<pid>/exe reading "(deleted)" and the socket file still in place.
 *
 * Run: node --test script/ci/unload-handshake.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  prepareToUnloadHandshake
} = require(path.join(ROOT, 'src', 'main-process', 'unload-handshake'));

// A clock the test drives, so a 30s timeout costs nothing to exercise.
function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    timers: {
      setTimeout: (fn, ms) => {
        const id = next++;
        pending.set(id, { fn, ms });
        return id;
      },
      clearTimeout: id => pending.delete(id)
    },
    pendingCount: () => pending.size,
    // Fire every armed timer once.
    async fire() {
      const due = [...pending.entries()];
      for (const [id, { fn }] of due) {
        pending.delete(id);
        await fn();
      }
    }
  };
}

const noopSubscribe = () => () => {};

describe('the unload handshake always ends', () => {
  it('settles with what the renderer said', async () => {
    for (const reply of [true, false]) {
      let deliver;
      const result = await prepareToUnloadHandshake({
        send: () => deliver(reply),
        onReply: settle => {
          deliver = settle;
          return () => {};
        },
        onGone: noopSubscribe,
        timers: fakeTimers().timers
      });
      assert.equal(result, reply, `reply ${reply} must survive`);
    }
  });

  it('does not ask a window that is already gone', async () => {
    let sent = false;
    const result = await prepareToUnloadHandshake({
      isGone: () => true,
      send: () => { sent = true; },
      onReply: noopSubscribe,
      onGone: noopSubscribe
    });
    assert.equal(result, true, 'nothing left to save, so do not block quit');
    assert.equal(sent, false, 'must not send to a destroyed renderer');
  });

  it('treats a renderer that dies mid-wait as unloadable', async () => {
    let die;
    const result = await prepareToUnloadHandshake({
      send: () => die(),
      onReply: noopSubscribe,
      onGone: settle => { die = settle; return () => {}; },
      timers: fakeTimers().timers
    });
    assert.equal(result, true);
  });

  it('survives a send that throws because the window just went', async () => {
    const result = await prepareToUnloadHandshake({
      send: () => { throw new Error('Render frame was disposed'); },
      onReply: noopSubscribe,
      onGone: noopSubscribe,
      timers: fakeTimers().timers
    });
    assert.equal(result, true);
  });

  describe('responsive but silent', () => {
    it('asks, and forces only when the user says so', async () => {
      const clock = fakeTimers();
      let asked = 0;
      const promise = prepareToUnloadHandshake({
        send: () => {},
        onReply: noopSubscribe,
        onGone: noopSubscribe,
        onStuck: async () => { asked++; return 'force'; },
        timeoutMs: 30000,
        timers: clock.timers
      });
      await clock.fire();
      assert.equal(await promise, true);
      assert.equal(asked, 1);
    });

    it('keeps waiting when the user says so, and the reply still wins', async () => {
      const clock = fakeTimers();
      let deliver;
      let asked = 0;
      const promise = prepareToUnloadHandshake({
        send: () => {},
        onReply: settle => { deliver = settle; return () => {}; },
        onGone: noopSubscribe,
        onStuck: async () => { asked++; return 'wait'; },
        timeoutMs: 30000,
        timers: clock.timers
      });

      await clock.fire();
      await clock.fire();
      assert.equal(asked, 2, 'the timer re-arms rather than settling');

      // A person answering a "save your changes?" prompt is not a hung window.
      deliver(false);
      assert.equal(await promise, false, 'a cancelled close must be honoured');
    });

    it('keeps waiting if there is nowhere to ask', async () => {
      const clock = fakeTimers();
      let settled = false;
      const promise = prepareToUnloadHandshake({
        send: () => {},
        onReply: noopSubscribe,
        onGone: noopSubscribe,
        onStuck: async () => { throw new Error('no window to attach a dialog to'); },
        timeoutMs: 30000,
        timers: clock.timers
      });
      promise.then(() => { settled = true; });
      await clock.fire();
      await new Promise(r => setImmediate(r));
      assert.equal(settled, false, 'never close over live work on an error');
    });
  });

  it('settles once and unsubscribes', async () => {
    const clock = fakeTimers();
    let deliver;
    let die;
    let disposed = 0;
    const promise = prepareToUnloadHandshake({
      send: () => {},
      onReply: settle => { deliver = settle; return () => disposed++; },
      onGone: settle => { die = settle; return () => disposed++; },
      onStuck: async () => 'force',
      timeoutMs: 30000,
      timers: clock.timers
    });

    deliver(true);
    die();
    deliver(false);

    assert.equal(await promise, true, 'first answer wins');
    assert.equal(disposed, 2, 'both subscriptions released');
    assert.equal(clock.pendingCount(), 0, 'the timer is cleared');
  });
});

describe('AtomWindow wires every ending', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'main-process', 'atom-window.js'), 'utf8'
  );
  const handshake = source.slice(
    source.indexOf('async prepareToUnload()'),
    source.indexOf('openPath(pathToOpen')
  );

  it('uses the handshake rather than a bare promise', () => {
    assert.ok(handshake.length > 0, 'prepareToUnload not found');
    assert.match(handshake, /prepareToUnloadHandshake\(/);
    assert.doesNotMatch(
      handshake,
      /new Promise\(/,
      'a hand-rolled promise here is what could not be ended'
    );
  });

  it('listens for the renderer dying, not just replying', () => {
    assert.match(handshake, /'destroyed'/);
    assert.match(handshake, /'render-process-gone'/);
    assert.match(handshake, /isDestroyed\(\)/);
  });

  it('still honours a refused close', () => {
    // resolve(false) means the user cancelled; quitting has to be unwound.
    assert.match(handshake, /this\.unloading = false/);
    assert.match(handshake, /this\.atomApplication\.quitting = false/);
  });
});
