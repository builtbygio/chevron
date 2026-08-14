'use strict';

/**
 * Remaining bootstrap patch bridges. Class C (decaff / debabel) is empty.
 * Safety nets that were no-ops on owned pins are deleted.
 */

const DECAFFEINATE_PACKAGES = [];

const DEBABEL_PACKAGES = [];

const SAFETY_NET_PATCHES = ['patch-packages-remote-ipc.js'];

module.exports = {
  DECAFFEINATE_PACKAGES,
  DEBABEL_PACKAGES,
  SAFETY_NET_PATCHES
};
