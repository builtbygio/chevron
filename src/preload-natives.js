'use strict';

/**
 * Natives (and hard Node deps) that keep the **editor** window at
 * sandbox:false + Node in the preload world. Do not add entries casually —
 * each one is a reason the main editor cannot yet enable Chromium sandbox.
 *
 * Phase N5 hardens guests + secondary package windows without sandboxing
 * this editor host. Phase S prep: inventory + package-host isolation
 * (see docs/security-phase-s.md).
 *
 * Migration classes:
 *   renderer-hot  — must stay co-located with TextEditor / grammars for now
 *   renderer      — loaded in editor process; candidate for later IPC
 *   package-t1    — owned/bundled package native; not a core boot require
 *   main-only     — should not be required from package code; main process
 *
 * processAffinity: where the addon actually runs today.
 */

const editorNatives = [
  {
    name: 'superstring',
    usedBy: 'Text buffer, tree-sitter Patch, nested text-buffer installs',
    migrationClass: 'renderer-hot',
    processAffinity: 'editor-preload',
    loadSites: [
      'src/tree-sitter-language-mode.js',
      'node_modules/text-buffer (dependency)'
    ]
  },
  {
    name: 'pathwatcher',
    usedBy: 'Directory/File watching (core + themes)',
    migrationClass: 'renderer',
    processAffinity: 'editor-preload',
    loadSites: [
      'src/git-repository-provider.js',
      'src/default-directory-provider.ts',
      'src/theme-manager.js',
      'src/workspace.js',
      'exports/atom.js'
    ]
  },
  {
    name: '@atom/watcher',
    usedBy: 'Native path watching (path-watcher.js)',
    migrationClass: 'renderer',
    processAffinity: 'editor-preload',
    loadSites: ['src/path-watcher.js']
  },
  {
    name: '@atom/nsfw',
    usedBy: 'Fallback native FS events',
    migrationClass: 'renderer',
    processAffinity: 'editor-preload',
    loadSites: ['src/path-watcher.js']
  },
  {
    name: 'tree-sitter',
    usedBy: 'Tree-sitter language modes + grammar .node bindings',
    migrationClass: 'renderer-hot',
    processAffinity: 'editor-preload',
    loadSites: ['src/tree-sitter-language-mode.js']
  },
  {
    name: 'oniguruma',
    usedBy: 'TextMate grammar regex engine',
    migrationClass: 'renderer-hot',
    processAffinity: 'editor-preload',
    loadSites: ['src/text-mate-language-mode.js']
  },
  {
    name: 'scrollbar-style',
    usedBy: 'workspace-element scrollbar metrics',
    migrationClass: 'renderer',
    processAffinity: 'editor-preload',
    loadSites: ['src/workspace-element.js']
  },
  {
    name: 'git-utils',
    usedBy: 'GitRepository native bindings',
    migrationClass: 'renderer',
    processAffinity: 'editor-preload',
    loadSites: ['src/git-repository.js']
  },
  {
    name: 'nslog',
    usedBy: 'main-process logging (not preload, listed for completeness)',
    migrationClass: 'main-only',
    processAffinity: 'main',
    loadSites: ['src/main-process/start.js']
  },
  {
    name: 'fs-admin',
    usedBy: 'elevated file ops (command-installer)',
    migrationClass: 'main-only',
    processAffinity: 'main',
    loadSites: [
      'src/command-installer.js',
      'script/lib/install-application.js'
    ]
  },
  {
    name: 'keytar',
    usedBy: 'github package credentials (bundled package native)',
    migrationClass: 'package-t1',
    processAffinity: 'editor-preload',
    loadSites: ['node_modules/github (bundled)']
  },
  {
    name: '@atom/fuzzy-native',
    usedBy: 'fuzzy-finder scoring',
    migrationClass: 'package-t1',
    processAffinity: 'editor-preload',
    loadSites: ['node_modules/fuzzy-finder (bundled)']
  },
  {
    name: 'keyboard-layout',
    usedBy: 'keystroke layout detection',
    migrationClass: 'renderer',
    processAffinity: 'editor-preload',
    loadSites: ['atom-keymap / keybinding paths']
  },
  {
    name: 'spellchecker',
    usedBy: 'spell-check package native',
    migrationClass: 'package-t1',
    processAffinity: 'editor-preload',
    loadSites: ['node_modules/spell-check (bundled)']
  }
];

/** Module ids that load native addons (used by S1.0 community restrict). */
const nativeAddonModuleIds = editorNatives.map(entry => entry.name);

module.exports = {
  editorNatives,

  nativeAddonModuleIds,

  /**
   * Module ids treated as "privileged" for optional require auditing
   * (CHEVRON_AUDIT_PACKAGE_REQUIRES=1) and community restrict.
   * Not a blocklist for core/bundled.
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
  ],

  /** Why Chromium sandbox cannot be true on the editor BrowserWindow yet. */
  sandboxBlockedReasons: [
    'Preload must load .node addons (superstring, pathwatcher, tree-sitter, …)',
    'Packages share the preload Node world and may require natives at runtime',
    'Electron sandboxed preload cannot require arbitrary native modules',
    'Hackable package model: community/bundled code may require() natives at activate',
    'Hot-path natives (superstring/tree-sitter/oniguruma) have no proven IPC host yet (Phase S Option A spike)'
  ],

  /**
   * Phase N5 already sandboxed / hardened (not the editor BrowserWindow).
   * Kept here so Phase S planning does not re-litigate guests and workers.
   */
  n5HardenedSurfaces: [
    {
      surface: 'guest <webview>',
      sandbox: true,
      node: false,
      notes: 'will-attach-webview + N4 nav/permissions (chevron-guest partition)'
    },
    {
      surface: 'package secondary BrowserWindow (github workers)',
      sandbox: false,
      node: true,
      notes:
        'Node kept for dugite; fixed prefs, file: nav only, deny window.open/perms (N5.1); Phase S3 → utilityProcess'
    }
  ],

  /** Ordered steps before considering editor sandbox:true (Phase S). */
  phaseSPrerequisites: [
    'S0: Inventory + plan (docs/security-phase-s.md)',
    'S1: Package host isolation — community cannot load arbitrary .node / native addons',
    'S2: Relocate main-only natives; tag renderer-hot vs movable',
    'S3: Replace github hidden BrowserWindow workers with utility process / main git IPC',
    'S5: Option A spike (superstring-in-main) OR accept Option C (sandbox stays false; host isolation is the model)',
    'S6: Explicit product decision + release notes before flipping webPreferences.sandbox'
  ],

  migrationClasses: {
    'renderer-hot':
      'Co-located with editor for latency; do not move without Option A spike',
    renderer: 'Editor process today; candidate for main/utility IPC later',
    'package-t1': 'Owned bundled package native; keep until package host / utilityProcess',
    'main-only': 'Must not be a package/preload sandbox blocker narrative'
  }
};
