'use strict';

/**
 * Electron 44's clipboard methods return promises and no longer take a
 * `type` argument. Linux selection clipboard moved to `clipboard.selection`.
 * Chevron's public clipboard API and the sendSync IPC that serves it are
 * synchronous, so this keeps the last known string and refreshes it from
 * the system clipboard without blocking the handler.
 */

function createClipboardCompat(clipboard) {
  const cache = { standard: '', selection: '' };

  function bucket(type) {
    return type === 'selection' ? 'selection' : 'standard';
  }

  function apiFor(type) {
    if (type === 'selection' && clipboard && clipboard.selection) {
      return clipboard.selection;
    }
    return clipboard;
  }

  function remember(result, type) {
    if (result && typeof result.then === 'function') {
      result
        .then(text => {
          if (typeof text === 'string') cache[bucket(type)] = text;
        })
        .catch(() => {});
      return;
    }
    if (typeof result === 'string') cache[bucket(type)] = result;
  }

  function refresh(type) {
    const api = apiFor(type);
    if (!api || typeof api.readText !== 'function') return;
    try {
      // Electron 43: readText('selection'). Electron 44: selection.readText().
      const result =
        type === 'selection' && !(clipboard && clipboard.selection)
          ? api.readText('selection')
          : api.readText();
      remember(result, type);
    } catch (error) {
      /* ignore */
    }
  }

  function writeText(text, type) {
    const value = text == null ? '' : String(text);
    cache[bucket(type)] = value;
    const api = apiFor(type);
    if (!api || typeof api.writeText !== 'function') return;
    try {
      const result =
        type === 'selection' && !(clipboard && clipboard.selection)
          ? api.writeText(value, 'selection')
          : api.writeText(value);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (error) {
      /* ignore */
    }
  }

  function readText(type) {
    refresh(type);
    return cache[bucket(type)];
  }

  function installRefresh(app) {
    const pull = () => {
      refresh();
      refresh('selection');
    };
    if (app && typeof app.on === 'function') {
      app.on('browser-window-focus', pull);
    }
    if (app && typeof app.whenReady === 'function') {
      app.whenReady().then(pull).catch(() => {});
    } else {
      pull();
    }
  }

  return { writeText, readText, refresh, installRefresh };
}

module.exports = { createClipboardCompat };
