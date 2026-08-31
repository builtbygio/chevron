'use strict';

/**
 * Temporary directories that actually go away.
 *
 * mkdtempSync in a test or build step is easy to write and easy to leak: the
 * removal is a separate statement, so it gets forgotten, put in a place that
 * does not run on every path, or skipped when the process is signalled. Three
 * callers had leaked 1113 directories and 673 MB into /tmp before anyone
 * looked, and 406 of those came from suites that had already been deleted.
 *
 * makeTempDir registers the directory as it is created, so cleanup is not a
 * thing the caller has to remember. Handlers are installed once and cover
 * normal exit as well as SIGINT/SIGTERM/SIGHUP, because a `finally` does not
 * run when node is signalled -- the same reason the smoke test kills its
 * process group rather than the process.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const created = new Set();
let installed = false;

function removeAll() {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      // Best effort: never let cleanup fail a run that otherwise passed.
    }
  }
  created.clear();
}

function installHandlers() {
  if (installed) return;
  installed = true;
  process.on('exit', removeAll);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      removeAll();
      process.exit(1);
    });
  }
}

// `prefix` is a name fragment, not a path: 'chevron-find-app-' becomes
// <tmpdir>/chevron-find-app-XXXXXX.
function makeTempDir(prefix) {
  installHandlers();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.add(dir);
  return dir;
}

// For a caller that is done with a directory before the process ends.
function removeTempDir(dir) {
  created.delete(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {}
}

module.exports = { makeTempDir, removeTempDir, removeAll };
