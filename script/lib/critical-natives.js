'use strict';

/**
 * Critical native modules that must produce a .node after bootstrap-modern.
 * Soft-fail is opt-in via CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES=1.
 */

const fs = require('fs');
const path = require('path');

/** Packages rebuilt explicitly in bootstrap-modern (order not significant). */
const CRITICAL_REBUILD_PACKAGES = [
  'superstring',
  '@atom/watcher',
  '@atom/nsfw',
  '@atom/fuzzy-native',
  'keytar',
  'spellchecker',
  'pathwatcher',
  'git-utils',
  'scrollbar-style',
  'nslog',
  'keyboard-layout',
  'ctags',
  'fs-admin',
  'oniguruma'
];

/**
 * Relative paths under package root that count as "built".
 * First match wins.
 */
const ARTIFACT_GLOBS = {
  superstring: ['build/Release/superstring.node'],
  '@atom/watcher': ['build/Release/watcher.node'],
  '@atom/nsfw': ['build/Release/nsfw.node'],
  '@atom/fuzzy-native': ['build/Release/fuzzy-native.node'],
  keytar: ['build/Release/keytar.node'],
  spellchecker: ['build/Release/spellchecker.node'],
  pathwatcher: ['build/Release/pathwatcher.node'],
  'git-utils': ['build/Release/git.node', 'build/Release/git-utils.node'],
  'scrollbar-style': ['build/Release/scrollbar-style-observer.node', 'build/Release/scrollbar-style.node'],
  nslog: ['build/Release/nslog.node'],
  'keyboard-layout': ['build/Release/keyboard-layout-manager.node'],
  ctags: ['build/Release/ctags.node'],
  'fs-admin': ['build/Release/fs_admin.node', 'build/Release/fs-admin.node'],
  oniguruma: ['build/Release/onig_scanner.node', 'build/Release/oniguruma.node']
};

function packageDir(repoRoot, name) {
  return path.join(repoRoot, 'node_modules', ...name.split('/'));
}

function findArtifact(repoRoot, name) {
  const root = packageDir(repoRoot, name);
  if (!fs.existsSync(root)) return { present: false, reason: 'package missing' };
  const candidates = ARTIFACT_GLOBS[name] || ['build/Release'];
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return { present: true, path: abs };
    }
  }
  // Fallback: any .node under build/Release
  const release = path.join(root, 'build', 'Release');
  if (fs.existsSync(release)) {
    try {
      const hit = fs.readdirSync(release).find(f => f.endsWith('.node'));
      if (hit) return { present: true, path: path.join(release, hit) };
    } catch (_) {
      /* ignore */
    }
  }
  return { present: false, reason: 'no .node under build/Release' };
}

/**
 * @param {string} repoRoot
 * @returns {{ ok: boolean, missing: Array<{name, reason}>, found: Array<{name, path}> }}
 */
function checkCriticalNatives(repoRoot) {
  const missing = [];
  const found = [];
  for (const name of CRITICAL_REBUILD_PACKAGES) {
    const r = findArtifact(repoRoot, name);
    if (r.present) found.push({ name, path: r.path });
    else missing.push({ name, reason: r.reason || 'missing' });
  }
  return { ok: missing.length === 0, missing, found };
}

function allowNativeFailures() {
  const v = process.env.CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES;
  return v === '1' || v === 'true' || v === 'yes';
}

module.exports = {
  CRITICAL_REBUILD_PACKAGES,
  ARTIFACT_GLOBS,
  findArtifact,
  checkCriticalNatives,
  allowNativeFailures,
  packageDir
};
