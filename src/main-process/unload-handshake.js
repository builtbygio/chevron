'use strict';

/**
 * Asking a window whether it can unload, without being able to wait forever.
 *
 * The handshake itself is Atom-era and still the right shape: Electron has no
 * API for an *asynchronous* veto. `will-prevent-unload` only honours
 * preventDefault when it is called synchronously, and unloading here has to
 * await saveState, workspace.confirmClose, deactivatePackages and the
 * filesystem watchers. So main asks the renderer over IPC and waits.
 *
 * What was Atom-era and wrong is that the wait had exactly one way to end: the
 * renderer's reply. A renderer that died, or that stayed responsive but never
 * answered, left the promise pending -- so `before-quit` never finished, the
 * app never quit, `will-quit` never ran, and the main process outlived every
 * window. Because it also kept listening on the single-instance socket, the
 * next launch handed off to the zombie instead of starting fresh.
 *
 * Three ways to end, and the asymmetry between them is the point:
 *
 *   reply   -- what the renderer said, including "no, the user cancelled"
 *   gone    -- unloadable: there is nothing left to save, so do not block quit
 *   stuck   -- ask the user; never discard a live window's work on a timer
 *
 * `onStuck` returns 'force' or 'wait'. 'wait' re-arms the timer rather than
 * settling, because a renderer that is slow because a person is staring at a
 * "save your changes?" prompt must not be closed out from under them.
 */

const DEFAULT_TIMEOUT_MS = 30000;

function prepareToUnloadHandshake(options) {
  const {
    send,
    onReply,
    onGone,
    onStuck,
    isGone,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    timers = { setTimeout, clearTimeout }
  } = options;

  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const disposers = [];

    const cleanup = () => {
      if (timer != null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      while (disposers.length) {
        const dispose = disposers.pop();
        try {
          if (typeof dispose === 'function') dispose();
        } catch (error) {
          // A subscription whose target is already destroyed.
        }
      }
    };

    const settle = result => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const arm = () => {
      if (!onStuck || !(timeoutMs > 0)) return;
      timer = timers.setTimeout(async () => {
        timer = null;
        if (settled) return;
        let answer;
        try {
          answer = await onStuck();
        } catch (error) {
          // Nowhere to ask: keep waiting rather than close over live work.
          answer = 'wait';
        }
        if (settled) return;
        if (answer === 'force') settle(true);
        else arm();
      }, timeoutMs);
    };

    // A window that is already gone cannot answer, and has nothing to save.
    if (typeof isGone === 'function' && isGone()) {
      settle(true);
      return;
    }

    if (typeof onReply === 'function') {
      disposers.push(onReply(result => settle(result)));
    }
    if (typeof onGone === 'function') {
      disposers.push(onGone(() => settle(true)));
    }

    arm();

    try {
      send();
    } catch (error) {
      // The renderer went away between the check and the send.
      settle(true);
    }
  });
}

module.exports = { prepareToUnloadHandshake, DEFAULT_TIMEOUT_MS };
