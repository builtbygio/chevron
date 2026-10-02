'use strict';

const fs = require('fs');
const path = require('path');

const SPEC_FILE = /(?:[-.]spec|[.-]test)\.(?:[cm]?[jt]s|coffee)$/;

function hasSpecFile(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'fixtures' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() ? hasSpecFile(full) : SPEC_FILE.test(entry.name)) {
      return true;
    }
  }
  return false;
}

// The package's `spec` or `test` folder, if it holds specs.
//
// A folder with only fixtures is not one: bookmarks, encoding-selector and
// status-bar were vendored without their specs, ran zero of them, and passed.
// Shared by script/test and jasmine.yml's shard split so they agree.
function packageTestDir(packagePath) {
  for (const subdir of ['spec', 'test']) {
    const dir = path.join(packagePath, subdir);
    if (fs.existsSync(dir) && hasSpecFile(dir)) return subdir;
  }
  return null;
}

module.exports = { packageTestDir };
