'use strict';

/**
 * The names these channels had before REBRANDING.md.
 *
 * Every channel is registered under its `chevron:` name, and again under the
 * name it had, for one release. Renaming is cheap in main and expensive
 * everywhere else: out-of-tree packages call these by string, and one that has
 * not been rebuilt would simply stop working.
 *
 * A legacy name logs once per session per channel, which is the signal to
 * migrate. The aliases go away the release after.
 *
 * docs/process/ipc-surface-hardening.md -- Phase 4
 */

/**
 * canonical -> the name it had.
 *
 * chevron:did-prepare-to-unload is deliberately absent. atom-window.js
 * registers and removes that listener for each unload, and an alias
 * registered alongside it would not be removed with it. Its only sender is
 * src/application-delegate.js, which moved with the rename.
 */
const LEGACY_ALIASES = new Map([
  ['chevron:app-get-jump-list-settings-sync', 'atom-app-get-jump-list-settings-sync'],
  ['chevron:app-get-path-sync', 'atom-app-get-path-sync'],
  ['chevron:app-get-version-sync', 'atom-app-get-version-sync'],
  ['chevron:app-set-jump-list-sync', 'atom-app-set-jump-list-sync'],
  ['chevron:browser-window-call-sync', 'atom-browser-window-call-sync'],
  ['chevron:bw-id-call-sync', 'atom-bw-id-call-sync'],
  ['chevron:clipboard-read-find-text-sync', 'atom-clipboard-read-find-text-sync'],
  ['chevron:clipboard-read-text-sync', 'atom-clipboard-read-text-sync'],
  ['chevron:clipboard-write-find-text-sync', 'atom-clipboard-write-find-text-sync'],
  ['chevron:clipboard-write-text-sync', 'atom-clipboard-write-text-sync'],
  ['chevron:context-menu', 'atom-context-menu'],
  ['chevron:create-browser-window-sync', 'atom-create-browser-window-sync'],
  ['chevron:destroy-own-window-sync', 'atom-destroy-own-window-sync'],
  ['chevron:fs-copy-sync', 'atom-fs-copy-sync'],
  ['chevron:fs-exists-sync', 'atom-fs-exists-sync'],
  ['chevron:fs-list-sync', 'atom-fs-list-sync'],
  ['chevron:fs-mkdirp-sync', 'atom-fs-mkdirp-sync'],
  ['chevron:fs-move-sync', 'atom-fs-move-sync'],
  ['chevron:fs-path-kind-sync', 'atom-fs-path-kind-sync'],
  ['chevron:fs-read-file-sync', 'atom-fs-read-file-sync'],
  ['chevron:fs-readdir-sync', 'atom-fs-readdir-sync'],
  ['chevron:fs-realpath-sync', 'atom-fs-realpath-sync'],
  ['chevron:fs-refresh-roots-sync', 'atom-fs-refresh-roots-sync'],
  ['chevron:fs-rename-sync', 'atom-fs-rename-sync'],
  ['chevron:fs-rmdir-sync', 'atom-fs-rmdir-sync'],
  ['chevron:fs-stat-no-exception-sync', 'atom-fs-stat-no-exception-sync'],
  ['chevron:fs-stat-sync', 'atom-fs-stat-sync'],
  ['chevron:fs-write-file-sync', 'atom-fs-write-file-sync'],
  ['chevron:get-current-window-id-sync', 'atom-get-current-window-id-sync'],
  ['chevron:get-primary-display-work-area-size-sync', 'atom-get-primary-display-work-area-size-sync'],
  ['chevron:get-user-default-sync', 'atom-get-user-default-sync'],
  ['chevron:get-web-contents-id-sync', 'atom-get-web-contents-id-sync'],
  ['chevron:is-default-protocol-client', 'isDefaultProtocolClient'],
  ['chevron:is-default-protocol-client-sync', 'atom-is-default-protocol-client-sync'],
  ['chevron:popup-menu', 'atom-popup-menu'],
  ['chevron:remove-as-default-protocol-client', 'removeAsDefaultProtocolClient'],
  ['chevron:set-as-default-protocol-client', 'setAsDefaultProtocolClient'],
  ['chevron:set-as-default-protocol-client-sync', 'atom-set-as-default-protocol-client-sync'],
  ['chevron:settings-view-cache-ensure', 'atom-settings-view-cache-ensure'],
  ['chevron:settings-view-cache-list', 'atom-settings-view-cache-list'],
  ['chevron:settings-view-cache-unlink', 'atom-settings-view-cache-unlink'],
  ['chevron:settings-view-cache-write', 'atom-settings-view-cache-write'],
  ['chevron:shell-beep-sync', 'atom-shell-beep-sync'],
  ['chevron:shell-move-item-to-trash', 'atom-shell-move-item-to-trash'],
  ['chevron:shell-open-external', 'atom-shell-open-external'],
  ['chevron:shell-show-item-in-folder', 'atom-shell-show-item-in-folder'],
  ['chevron:show-message-box', 'atom-show-message-box'],
  ['chevron:show-message-box-sync', 'atom-show-message-box-sync'],
  ['chevron:show-open-dialog', 'atom-show-open-dialog'],
  ['chevron:show-save-dialog', 'atom-show-save-dialog'],
  ['chevron:utility-worker-capabilities', 'atom-utility-worker-capabilities'],
  ['chevron:utility-worker-create-sync', 'atom-utility-worker-create-sync'],
  ['chevron:utility-worker-destroy-sync', 'atom-utility-worker-destroy-sync'],
  ['chevron:utility-worker-enabled-sync', 'atom-utility-worker-enabled-sync'],
  ['chevron:utility-worker-is-destroyed-sync', 'atom-utility-worker-is-destroyed-sync'],
  ['chevron:utility-worker-load-sync', 'atom-utility-worker-load-sync'],
  ['chevron:utility-worker-send', 'atom-utility-worker-send'],
  ['chevron:wc-is-destroyed-sync', 'atom-wc-is-destroyed-sync'],
  ['chevron:wc-send', 'atom-wc-send'],
  ['chevron:web-contents-call-sync', 'atom-web-contents-call-sync'],
  ['chevron:webcontents-send-to-window-id', 'atom-webcontents-send-to-window-id'],
  ['chevron:window-load-settings-sync', 'atom-window-load-settings-sync'],
  ['chevron:window-set-project-roots-sync', 'atom-window-set-project-roots-sync'],
  ['chevron:window-startup-markers-sync', 'atom-window-startup-markers-sync'],
]);

const warned = new Set();

function warnOnce(legacy, canonical) {
  if (warned.has(legacy)) return;
  warned.add(legacy);
  console.warn(
    '[chevron] IPC channel "' + legacy + '" is the old name for "' + canonical +
      '" and will be removed. Update the caller.'
  );
}

/**
 * Wrap ipcMain so a registration also answers to the channel's old name.
 *
 * The canonical name stays a literal at the call site, which is what
 * script/lib/ipc-inventory.js reads. An alias registered through a variable
 * would be invisible to that enumeration, and an IPC surface nothing
 * enumerates is how this plan's first channel count came to be wrong.
 */
function withLegacyAliases(ipcMain, { onWarn = warnOnce } = {}) {
  const register = (method, channel, handler) => {
    ipcMain[method](channel, handler);
    const legacy = LEGACY_ALIASES.get(channel);
    if (!legacy) return;
    ipcMain[method](legacy, (...args) => {
      onWarn(legacy, channel);
      return handler(...args);
    });
  };
  return {
    handle: (channel, handler) => register('handle', channel, handler),
    on: (channel, handler) => register('on', channel, handler),
    removeListener: (...args) => ipcMain.removeListener(...args),
    raw: ipcMain
  };
}

module.exports = { LEGACY_ALIASES, withLegacyAliases, warnOnce };
