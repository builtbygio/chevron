'use strict';

const fs = require('fs-extra');
const path = require('path');
const { getPackagesDirectory } = require('../paths');

async function uninstallPackage(name) {
  if (!name) {
    process.stderr.write('cpm uninstall: package name required\n');
    return 1;
  }
  const dest = path.join(getPackagesDirectory(), name);
  if (!(await fs.pathExists(dest))) {
    process.stderr.write(`cpm uninstall: not installed: ${name}\n`);
    return 1;
  }
  await fs.remove(dest);
  process.stdout.write(`Uninstalled ${name}\n`);
  return 0;
}

module.exports = { uninstallPackage };
