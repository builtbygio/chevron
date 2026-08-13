'use strict';

/**
 * Bundled packages that are not needed for first paint.
 *
 * They still load (keymaps, menus, deserializer stubs) during startEditorWindow
 * unless noted, but their main modules are not required in preloadPackages()
 * and they are not activate()'d until after setup-window:end.
 *
 * Keep tree-view, tabs, status-bar, welcome, notifications, themes, snippets,
 * autocomplete, bracket-matcher, and language-* off this list.
 */
const DEFERRED_STARTUP_PACKAGES = new Set([
  'about',
  'archive-view',
  'background-tips',
  'dalek',
  'deprecation-cop',
  'dev-live-reload',
  'find-and-replace',
  'fuzzy-finder',
  'github',
  'image-view',
  'incompatible-packages',
  'keybinding-resolver',
  'lsp-diagnostics-stub',
  'lsp-servers',
  'lsp-ui',
  'markdown-preview',
  'open-on-github',
  'package-generator',
  'settings-view',
  'spell-check',
  'styleguide',
  'symbols-view',
  'timecop',
  'update-package-dependencies'
]);

function isDeferredStartupPackage(name) {
  return DEFERRED_STARTUP_PACKAGES.has(name);
}

module.exports = {
  DEFERRED_STARTUP_PACKAGES,
  isDeferredStartupPackage
};
