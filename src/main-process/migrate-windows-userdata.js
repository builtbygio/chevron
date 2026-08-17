'use strict';

/**
 * Windows userData migration: %LOCALAPPDATA%\atom -> %LOCALAPPDATA%\chevron.
 *
 * Implements step 2 of the rollout in docs/windows-userdata-migrate.md: the
 * migration lands **inert**, behind CHEVRON_USERDATA_MIGRATE=1, so it can be
 * exercised on a real Windows profile before the intermediate package.json
 * name is flipped (H3 PR 23b). Flipping the name is a separate change.
 *
 * Principles, from that document:
 *   - copy, never move, so a downgrade is not a data-loss event
 *   - skip regenerable caches
 *   - never overwrite anything already at the destination
 *   - one-shot marker, written even on partial failure
 *   - fail open: a failed migration must never be a failed launch
 *
 * Dependencies are injectable so this is testable off Windows.
 */

const nodeFs = require('fs');
const nodePath = require('path');

const MARKER = 'migrated-from-atom.json';

/**
 * What travels. Ordered most- to least-important so a partial copy still
 * leaves the user with their settings.
 */
const ENTRIES = [
  'config.json',
  'config.cson',
  'trusted-projects.json',
  'storage',
  'packages',
  'Local Storage',
  'Session Storage'
];

/** Regenerable or Chromium-owned; copying these is pure cost. */
const SKIP = new Set([
  'compile-cache',
  'blob-store',
  'Cache',
  'GPUCache',
  'Code Cache',
  'Crashpad',
  MARKER
]);

function truthyEnv(value) {
  return value === '1' || value === 'true';
}

/** `atom` for stable, `atom-<channel>` otherwise — mirrors generate-metadata. */
function legacyDirName(channel) {
  return !channel || channel === 'stable' ? 'atom' : `atom-${channel}`;
}

function copyRecursive(fs, path, from, to, errors) {
  let stat;
  try {
    stat = fs.statSync(from);
  } catch (err) {
    errors.push({ path: from, message: err.message });
    return 0;
  }

  if (!stat.isDirectory()) {
    try {
      fs.copyFileSync(from, to);
      return 1;
    } catch (err) {
      errors.push({ path: from, message: err.message });
      return 0;
    }
  }

  try {
    fs.mkdirSync(to, { recursive: true });
  } catch (err) {
    errors.push({ path: to, message: err.message });
    return 0;
  }

  let n = 0;
  let names;
  try {
    names = fs.readdirSync(from);
  } catch (err) {
    errors.push({ path: from, message: err.message });
    return n;
  }
  for (const name of names) {
    if (SKIP.has(name)) continue;
    const target = path.join(to, name);
    // Never overwrite: first writer wins, at every level.
    if (fs.existsSync(target) && !fs.statSync(path.join(from, name)).isDirectory()) {
      continue;
    }
    n += copyRecursive(fs, path, path.join(from, name), target, errors);
  }
  return n;
}

/**
 * @param {object} [options]
 * @param {string} [options.platform]      defaults to process.platform
 * @param {object} [options.env]           defaults to process.env
 * @param {string} options.userDataPath    destination (Electron userData)
 * @param {string} [options.channel]       release channel
 * @param {string} [options.legacyPath]    override the source, for tests
 * @param {object} [options.fs]            fs module
 * @param {object} [options.path]          path module
 * @param {Function} [options.log]
 * @returns {{migrated: boolean, reason?: string, copied?: string[], errors?: Array}}
 */
function migrateWindowsUserData(options = {}) {
  const {
    platform = process.platform,
    env = process.env,
    userDataPath,
    channel,
    legacyPath,
    fs = nodeFs,
    path = nodePath,
    log = () => {}
  } = options;

  if (platform !== 'win32') return { migrated: false, reason: 'not-win32' };
  if (truthyEnv(env.CHEVRON_SKIP_USERDATA_MIGRATE)) {
    return { migrated: false, reason: 'skipped-by-env' };
  }
  // Step 2 of the rollout: inert unless explicitly enabled.
  if (!truthyEnv(env.CHEVRON_USERDATA_MIGRATE)) {
    return { migrated: false, reason: 'not-enabled' };
  }
  if (!userDataPath) return { migrated: false, reason: 'no-userdata-path' };

  const legacy =
    legacyPath || path.join(path.dirname(userDataPath), legacyDirName(channel));

  // Before the name flip, userData *is* the legacy tree. Copying it onto
  // itself would be nonsense, so this is the normal pre-flip outcome.
  if (path.resolve(legacy) === path.resolve(userDataPath)) {
    return { migrated: false, reason: 'same-tree' };
  }
  if (!fs.existsSync(legacy)) return { migrated: false, reason: 'no-legacy-tree' };
  if (fs.existsSync(path.join(userDataPath, MARKER))) {
    return { migrated: false, reason: 'already-migrated' };
  }

  const copied = [];
  const errors = [];
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    for (const entry of ENTRIES) {
      const from = path.join(legacy, entry);
      const to = path.join(userDataPath, entry);
      if (!fs.existsSync(from)) continue;
      if (fs.existsSync(to)) continue; // never overwrite
      const n = copyRecursive(fs, path, from, to, errors);
      if (n > 0) copied.push(entry);
    }

    // Written even on partial failure. Retrying on the next boot would copy
    // over a profile the user has since edited.
    fs.writeFileSync(
      path.join(userDataPath, MARKER),
      JSON.stringify(
        { from: legacy, at: new Date().toISOString(), copied, errors },
        null,
        2
      )
    );
  } catch (err) {
    // Fail open. A failed migration must not be a failed launch.
    log(`[chevron] userData migration failed: ${err.message}`);
    return { migrated: false, reason: 'error', errors: [{ message: err.message }] };
  }

  log(
    `[chevron] migrated userData from ${legacy}: ${copied.length} entr` +
      `${copied.length === 1 ? 'y' : 'ies'}` +
      (errors.length ? `, ${errors.length} error(s)` : '')
  );
  return { migrated: true, copied, errors };
}

module.exports = {
  migrateWindowsUserData,
  legacyDirName,
  ENTRIES,
  SKIP: [...SKIP],
  MARKER
};
