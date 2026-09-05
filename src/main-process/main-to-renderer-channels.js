'use strict';

/**
 * Channels the main process sends on. A renderer trusts these as coming from
 * main, so no renderer may send them: forging one impersonates main to
 * whichever window receives it.
 *
 * Kept in sync with the code by script/ci/main-to-renderer-channels.test.js.
 *
 * docs/process/ipc-surface-hardening.md
 */

const MAIN_TO_RENDERER_CHANNELS = new Set([
  'atom-popup-menu-click',
  'atom-utility-worker-event',
  'atom-worker-window-event',
  'chevron:pty-event',
  'chevron:rg-search-close',
  'chevron:rg-search-data',
  'did-change-history-manager',
  'did-enter-full-screen',
  'did-leave-full-screen',
  'did-resolve-proxy',
  'environment',
  'lsp:event',
  'message',
  'prepare-to-unload',
  'uri-message'
]);

function isMainOnlyChannel(channel) {
  return MAIN_TO_RENDERER_CHANNELS.has(channel);
}

module.exports = { MAIN_TO_RENDERER_CHANNELS, isMainOnlyChannel };
