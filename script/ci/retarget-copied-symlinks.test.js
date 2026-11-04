'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  retargetCopiedSymlinks
} = require('../lib/retarget-copied-symlinks');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

function tempTree() {
  return makeTempDir('chevron-symlinks-');
}

describe('retargetCopiedSymlinks', () => {
  it('points fs.cp absolute symlinks back inside the copied tree', () => {
    const root = tempTree();
    const source = path.join(root, 'src', 'git-core');
    const dest = path.join(root, 'dest', 'git-core');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(source, 'git'), 'bin');
    fs.writeFileSync(path.join(dest, 'git'), 'bin');
    const link = path.join(dest, 'git-add');
    try {
      fs.symlinkSync(path.join(source, 'git'), link);
    } catch (error) {
      if (error.code === 'EPERM') return;
      throw error;
    }

    retargetCopiedSymlinks(path.join(root, 'dest'), path.join(root, 'src'));

    assert.strictEqual(fs.readlinkSync(link), 'git');
    assert.strictEqual(
      fs.realpathSync(link),
      fs.realpathSync(path.join(dest, 'git'))
    );
    removeTempDir(root);
  });

  it('leaves a link that points outside both trees alone', () => {
    const root = tempTree();
    const outside = path.join(root, 'outside');
    const dest = path.join(root, 'dest');
    fs.mkdirSync(outside, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(outside, 'other'), 'x');
    const link = path.join(dest, 'other');
    try {
      fs.symlinkSync(path.join(outside, 'other'), link);
    } catch (error) {
      if (error.code === 'EPERM') return;
      throw error;
    }

    retargetCopiedSymlinks(dest, path.join(root, 'src'));

    assert.strictEqual(fs.readlinkSync(link), path.join(outside, 'other'));
    removeTempDir(root);
  });
});
