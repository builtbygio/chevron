'use strict';

/**
 * Phase N3: natives (and hard Node deps) that keep the editor window at
 * sandbox:false + Node in the preload world. Do not add entries casually —
 * each one is a reason the main editor cannot yet enable Chromium sandbox.
 *
 * See docs/security-phase-n3.md.
 */

module.exports = {
  /**
   * Native addons / bindings loaded from the editor preload / package world.
   * `usedBy` is directional, not a complete call graph.
   */
  editorNatives: [
    {
      name: 'superstring',
      usedBy: 'Text buffer, tree-sitter Patch, nested text-buffer installs'
    },
    {
      name: 'pathwatcher',
      usedBy: 'Directory/File watching (core + themes)'
    },
    {
      name: '@atom/watcher',
      usedBy: 'Native path watching (path-watcher.js)'
    },
    {
      name: '@atom/nsfw',
      usedBy: 'Fallback native FS events'
    },
    {
      name: 'tree-sitter',
      usedBy: 'Tree-sitter language modes + grammar .node bindings'
    },
    {
      name: 'oniguruma',
      usedBy: 'TextMate grammar regex engine'
    },
    {
      name: 'scrollbar-style',
      usedBy: 'workspace-element scrollbar metrics'
    },
    {
      name: 'git-utils',
      usedBy: 'GitRepository native bindings'
    },
    {
      name: 'nslog',
      usedBy: 'main-process logging (not preload, listed for completeness)'
    },
    {
      name: 'fs-admin',
      usedBy: 'elevated file ops (command-installer)'
    },
    {
      name: 'keytar',
      usedBy: 'github package credentials (bundled package native)'
    },
    {
      name: '@atom/fuzzy-native',
      usedBy: 'fuzzy-finder scoring'
    },
    {
      name: 'keyboard-layout',
      usedBy: 'keystroke layout detection'
    },
    {
      name: 'spellchecker',
      usedBy: 'spell-check package native'
    }
  ],

  /** Why Chromium sandbox cannot be true on the editor BrowserWindow yet. */
  sandboxBlockedReasons: [
    'Preload must load .node addons (superstring, pathwatcher, tree-sitter, …)',
    'Packages share the preload Node world and may require natives at runtime',
    'Electron sandboxed preload cannot require arbitrary native modules'
  ],

  /**
   * Module ids treated as "privileged" for optional require auditing
   * (CHEVRON_AUDIT_PACKAGE_REQUIRES=1). Not a blocklist yet.
   */
  privilegedModuleIds: [
    'fs',
    'fs/promises',
    'fs-plus',
    'child_process',
    'net',
    'dgram',
    'http',
    'https',
    'http2',
    'tls',
    'cluster',
    'worker_threads',
    'electron',
    'os'
  ]
};
