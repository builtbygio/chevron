'use strict';

/**
 * Stream B: remaining Class C bridges (decaff / debabel) that bootstrap still
 * applies onto node_modules. Used by CI so the set cannot grow unnoticed.
 */

const DECAFFEINATE_PACKAGES = [
  'autocomplete-chevron-api',
  'autocomplete-css',
  'bookmarks',
  'wrap-guide'
];

const DEBABEL_PACKAGES = [
  'archive-view',
  'bookmarks',
  'keybinding-resolver',
  'open-on-github',
  'styleguide',
  'symbols-view',
  'timecop'
];

const SAFETY_NET_PATCHES = [
  'patch-packages-remote-ipc.js',
  'patch-github-remote.js',
  'patch-tree-view-stats.js',
  'patch-settings-view-registry.js'
];

module.exports = {
  DECAFFEINATE_PACKAGES,
  DEBABEL_PACKAGES,
  SAFETY_NET_PATCHES
};
