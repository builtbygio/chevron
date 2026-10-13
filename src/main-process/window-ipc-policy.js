'use strict';

/**
 * What a renderer may ask of its own window and of the settings file.
 *
 * chevron:window-method used to call `window[method](...args)` for whatever
 * name arrived, so a renderer could invoke any AtomWindow method, internal
 * ones included. chevron:set-user-settings wrote the settings JSON to any
 * path the renderer named. Both now accept only what the renderer is known
 * to send. The preload world has Node already, so this is defence in depth,
 * not a privilege boundary.
 *
 * docs/process/ipc-surface-hardening.md
 */

const path = require('path');

// The names application-delegate.js and initialize-test-window.js send.
// script/ci/window-ipc-policy.test.js keeps this in step with them.
const WINDOW_METHODS = new Set([
  'close',
  'closeDevTools',
  'didClosePathWithWaitSession',
  'maximize',
  'minimize',
  'openDevTools',
  'reload',
  'setAutoHideMenuBar',
  'setDocumentEdited',
  'setFullScreen',
  'setProjectRoots',
  'setRepresentedFilename',
  'toggleDevTools',
  'unmaximize'
]);

function isAllowedWindowMethod(method) {
  return typeof method === 'string' && WINDOW_METHODS.has(method);
}

// The settings file a renderer may write: the one main already owns. A
// renderer passes its own idea of that path; anything else is refused rather
// than redirected, so a mismatch shows up instead of silently writing here.
function userSettingsTarget(requested, configFilePath) {
  if (requested == null) return configFilePath;
  if (typeof requested !== 'string' || !path.isAbsolute(requested)) return null;
  return path.resolve(requested) === path.resolve(configFilePath)
    ? configFilePath
    : null;
}

module.exports = { WINDOW_METHODS, isAllowedWindowMethod, userSettingsTarget };
