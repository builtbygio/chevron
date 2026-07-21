'use strict';

const fs = require('fs-extra');
const path = require('path');
const { getPackagesDirectory } = require('../paths');

async function linkPackage(targetPath) {
  const src = path.resolve(targetPath || process.cwd());
  if (!(await fs.pathExists(path.join(src, 'package.json')))) {
    process.stderr.write(`cpm link: not a package: ${src}\n`);
    return 1;
  }
  const name = require(path.join(src, 'package.json')).name;
  if (!name) {
    process.stderr.write('cpm link: package.json missing name\n');
    return 1;
  }
  const packagesDir = getPackagesDirectory();
  await fs.ensureDir(packagesDir);
  const dest = path.join(packagesDir, path.basename(name));
  if (await fs.pathExists(dest)) {
    await fs.remove(dest);
  }
  await fs.symlink(src, dest, process.platform === 'win32' ? 'junction' : 'dir');
  process.stdout.write(`Linked ${name} → ${dest}\n`);
  return 0;
}

async function unlinkPackage(name) {
  const dest = path.join(
    getPackagesDirectory(),
    name || path.basename(process.cwd())
  );
  if (!(await fs.pathExists(dest))) {
    process.stderr.write(`cpm unlink: not found: ${dest}\n`);
    return 1;
  }
  const stat = await fs.lstat(dest);
  if (!stat.isSymbolicLink() && process.platform !== 'win32') {
    process.stderr.write(
      `cpm unlink: ${dest} is not a link (refusing to delete a real package)\n`
    );
    return 1;
  }
  await fs.remove(dest);
  process.stdout.write(`Unlinked ${dest}\n`);
  return 0;
}

module.exports = { linkPackage, unlinkPackage };
