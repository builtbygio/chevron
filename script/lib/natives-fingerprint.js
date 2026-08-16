'use strict';

/**
 * Fingerprint for Electron-native rebuild skip.
 *
 * When this matches the last successful rebuild and critical .node files exist,
 * bootstrap-modern can skip force-rebuilding natives (saves most of CI time
 * when node_modules is restored from cache).
 *
 * Inputs:
 *  - full Electron version
 *  - host Node version, platform, arch
 *  - package-lock.json (any dep change may affect natives)
 *  - script package-lock (node-gyp / rebuild tooling)
 *  - bootstrap native rebuild list identity
 *
 * Override: CHEVRON_FORCE_NATIVE_REBUILD=1 always rebuilds.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');

const FINGERPRINT_PATH = path.join(
  CONFIG.repositoryRootPath,
  'node_modules',
  '.natives-fingerprint'
);

// Must stay aligned with script/bootstrap-modern critical rebuild list.
const CRITICAL_NATIVE_PACKAGES = [
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
  'oniguruma',
  '@derekstride/tree-sitter-sql',
  'tree-sitter-less',
  'tree-sitter-perl',
  'tree-sitter-clojure-orchard'
];

const CRITICAL_NODE_FILES = [
  path.join('superstring', 'build', 'Release', 'superstring.node'),
  path.join('pathwatcher', 'build', 'Release', 'pathwatcher.node')
];

function fileSha1(filePath) {
  if (!fs.existsSync(filePath)) return 'missing';
  return crypto
    .createHash('sha1')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function envFlag(name) {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

module.exports = {
  FINGERPRINT_PATH,
  CRITICAL_NATIVE_PACKAGES,
  CRITICAL_NODE_FILES,

  compute() {
    const root = CONFIG.repositoryRootPath;
    const electronVersion = CONFIG.appMetadata.electronVersion || 'unknown';
    const parts = [
      'v2',
      electronVersion,
      process.platform,
      process.arch,
      process.version,
      fileSha1(path.join(root, 'package-lock.json')),
      fileSha1(path.join(root, 'script', 'package-lock.json')),
      CRITICAL_NATIVE_PACKAGES.join(',')
    ];
    return crypto
      .createHash('sha1')
      .update(parts.join('\n'))
      .digest('hex');
  },

  read() {
    try {
      if (!fs.existsSync(FINGERPRINT_PATH)) return null;
      return fs.readFileSync(FINGERPRINT_PATH, 'utf8').trim();
    } catch (error) {
      return null;
    }
  },

  write(fingerprint) {
    const value = fingerprint || this.compute();
    fs.mkdirSync(path.dirname(FINGERPRINT_PATH), { recursive: true });
    fs.writeFileSync(FINGERPRINT_PATH, value);
    return value;
  },

  criticalNodesPresent() {
    const root = path.join(CONFIG.repositoryRootPath, 'node_modules');
    return CRITICAL_NODE_FILES.every(rel => {
      const full = path.join(root, rel);
      try {
        return fs.statSync(full).isFile() && fs.statSync(full).size > 0;
      } catch (error) {
        return false;
      }
    });
  },

  /**
   * @returns {{ skip: boolean, reason: string, fingerprint: string }}
   */
  shouldSkipRebuild() {
    const fingerprint = this.compute();
    if (envFlag('CHEVRON_FORCE_NATIVE_REBUILD')) {
      return {
        skip: false,
        reason: 'CHEVRON_FORCE_NATIVE_REBUILD set',
        fingerprint
      };
    }
    const previous = this.read();
    if (!previous) {
      return { skip: false, reason: 'no previous natives fingerprint', fingerprint };
    }
    if (previous !== fingerprint) {
      return {
        skip: false,
        reason: 'natives fingerprint changed',
        fingerprint
      };
    }
    if (!this.criticalNodesPresent()) {
      return {
        skip: false,
        reason: 'critical .node artifacts missing',
        fingerprint
      };
    }
    return {
      skip: true,
      reason: 'fingerprint match + critical .node present',
      fingerprint
    };
  }
};
