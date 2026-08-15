'use strict';

/**
 * Bundled packages that are not needed for first paint.
 *
 * They still load (keymaps, menus, deserializer stubs) during startEditorWindow
 * unless noted, but their main modules are not required in preloadPackages()
 * and they are not activate()'d until after setup-window:end.
 *
 * Keep tree-view, tabs, status-bar, welcome, notifications, settings-view,
 * lsp-ui, themes, whitespace, wrap-guide, and git-diff off this list.
 * Welcome Guide Open Installer / theme picker require settings-view.
 * lsp-ui must be up for the trust / "no server" notifications.
 *
 * Do not defer language-*: grammars must be registered before the first
 * editor opens or .c/.js/… files stay on the null grammar (no colour).
 *
 * SNAPSHOT_STARTUP_PACKAGES is the static require() list in
 * initialize-application-window.js (electron-link cannot follow a loop).
 * Keep the two in sync. Do not add deferred packages here: they load after
 * first paint and their top-level heap is not needed in the V8 snapshot.
 */
const SNAPSHOT_STARTUP_PACKAGES = [
  'autoflow',
  'autosave',
  'bookmarks',
  'command-palette',
  'encoding-selector',
  'git-diff',
  'go-to-line',
  'grammar-selector',
  'line-ending-selector',
  'link',
  'notifications',
  'status-bar',
  'tabs',
  'tree-view',
  'welcome',
  'whitespace',
  'wrap-guide'
];

const DEFERRED_STARTUP_PACKAGES = new Set([
  'about',
  'archive-view',
  'autocomplete-chevron-api',
  'autocomplete-css',
  'autocomplete-html',
  'autocomplete-plus',
  'autocomplete-snippets',
  'background-tips',
  'bracket-matcher',
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
  'markdown-preview',
  'open-on-github',
  'package-generator',
  'snippets',
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
  SNAPSHOT_STARTUP_PACKAGES,
  isDeferredStartupPackage
};
