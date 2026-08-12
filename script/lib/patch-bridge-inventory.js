'use strict';

/**
 * Remaining bootstrap patch bridges. Class C (decaff / debabel) is empty —
 * those packages now ship precompiled JS in owned pins.
 */

const DECAFFEINATE_PACKAGES = [];

const DEBABEL_PACKAGES = [];

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
