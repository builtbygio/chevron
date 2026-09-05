'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const Module = require('module');

const electronStub = {
  ipcMain: { on() {} },
  app: {
    getPath(name) {
      if (name === 'temp') return os.tmpdir();
      if (name === 'userData') return path.join(os.tmpdir(), 'chevron-user-data');
      return os.tmpdir();
    }
  },
  BrowserWindow: {
    fromWebContents() {
      return null;
    }
  }
};

const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return electronStub;
  return origRequire.apply(this, arguments);
};

const fs = require('fs');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

const registerFsIpc = require('../../src/main-process/register-fs-ipc');

const tmp = os.tmpdir();
const outsideProject = path.join(path.sep, 'opt', 'chevron-fs-ipc-test-root');

afterEach(() => {
  registerFsIpc.setFsIpcPolicy({ strict: true, roots: [] });
});

test('strict FS IPC denies paths outside configured roots', () => {
  registerFsIpc.setFsIpcPolicy({
    strict: true,
    roots: [tmp]
  });
  assert.equal(registerFsIpc.isAllowedFsPath(path.join(tmp, 'a')), true);
  assert.equal(registerFsIpc.isAllowedFsPath(outsideProject), false);
});

test('applyProjectRootsFromRenderer allows a newly opened project folder', () => {
  registerFsIpc.setFsIpcPolicy({
    strict: true,
    roots: [tmp]
  });
  assert.equal(registerFsIpc.isAllowedFsPath(outsideProject), false);

  registerFsIpc.applyProjectRootsFromRenderer({}, [outsideProject]);

  assert.equal(registerFsIpc.isAllowedFsPath(outsideProject), true);
  assert.equal(
    registerFsIpc.isAllowedFsPath(path.join(outsideProject, 'src', 'file.js')),
    true
  );
});

test('refresh collects projectRoots via getAllWindows, not missing .windows', () => {
  const projectDir = path.join(path.sep, 'home', 'keeper', 'Workspace', 'c_programming');
  registerFsIpc({
    resourcePath: path.join(tmp, 'app'),
    getAllWindows() {
      return [{ projectRoots: [projectDir] }];
    }
  });
  assert.equal(registerFsIpc.isAllowedFsPath(projectDir), true);
  assert.equal(
    registerFsIpc.isAllowedFsPath(path.join(projectDir, 'main.c')),
    true
  );
});

// A symlink inside a project points wherever it likes. Checking the path as
// it was spelled says it is inside the root; following it lands somewhere
// else entirely. Measured in the packaged app before this was resolved: a
// write to <project>/link/through-link.txt created a file outside every root,
// and a read of <project>/link/secret.txt returned its contents.
function symlinkFixture() {
  // Under the home directory rather than os.tmpdir(), which is an allowed
  // root in its own right and would make an escape indistinguishable.
  const base = makeTempDir('chevron-fs-ipc-link-', { parent: os.homedir() });
  const project = path.join(base, 'project');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(project);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret\n');
  fs.symlinkSync(outside, path.join(project, 'link-to-outside'));
  return { base, project, outside };
}

test('a symlink out of the project does not carry a read with it', () => {
  const { base, project } = symlinkFixture();
  try {
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    assert.equal(
      registerFsIpc.isAllowedFsPath(
        path.join(project, 'link-to-outside', 'secret.txt')
      ),
      false
    );
  } finally {
    removeTempDir(base);
  }
});

test('nor a write to a file that does not exist yet', () => {
  // The file being created has no realpath of its own; the directory it lands
  // in does, and that is the one that decides.
  const { base, project } = symlinkFixture();
  try {
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    assert.equal(
      registerFsIpc.isAllowedFsPath(
        path.join(project, 'link-to-outside', 'new-file.txt')
      ),
      false
    );
    assert.equal(
      registerFsIpc.isAllowedFsPath(
        path.join(project, 'link-to-outside', 'deep', 'deeper', 'new.txt')
      ),
      false
    );
  } finally {
    removeTempDir(base);
  }
});

test('ordinary paths inside the project are unaffected', () => {
  const { base, project } = symlinkFixture();
  try {
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(project, 'a.txt')), true);
    assert.equal(
      registerFsIpc.isAllowedFsPath(path.join(project, 'src', 'deep', 'b.js')),
      true
    );
    assert.equal(registerFsIpc.isAllowedFsPath(project), true);
  } finally {
    removeTempDir(base);
  }
});

test('a symlink that stays inside the project is still allowed', () => {
  const { base, project } = symlinkFixture();
  try {
    fs.mkdirSync(path.join(project, 'real'));
    fs.writeFileSync(path.join(project, 'real', 'file.txt'), 'x');
    fs.symlinkSync(path.join(project, 'real'), path.join(project, 'inner-link'));
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    assert.equal(
      registerFsIpc.isAllowedFsPath(path.join(project, 'inner-link', 'file.txt')),
      true
    );
  } finally {
    removeTempDir(base);
  }
});

test('a file is allowed under either of its names', () => {
  // On macOS /var is a symlink to /private/var, so the temp directory and
  // ATOM_HOME are both in circulation under two spellings and either can
  // arrive here. Requiring the spelled path to match a root as well as the
  // resolved one denied a file by one of its own names, and took the macOS
  // smoke run down with it.
  const { base } = symlinkFixture();
  try {
    const real = path.join(base, 'realdir');
    const link = path.join(base, 'linkroot');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'f.txt'), 'x');
    fs.symlinkSync(real, link);

    // The root recorded in its symlinked spelling, as ATOM_HOME arrives.
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [link] });
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(link, 'f.txt')), true);
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(real, 'f.txt')), true);
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(real, 'new.txt')), true);

    // And recorded resolved, with the path arriving through the link.
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [real] });
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(link, 'f.txt')), true);
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(link, 'new.txt')), true);
  } finally {
    removeTempDir(base);
  }
});

test('a root that is itself a symlink still matches its own contents', () => {
  // /var is a symlink to /private/var on macOS, so ATOM_HOME and the temp
  // directory both arrive symlinked there. Resolving the path but not the
  // root would deny every one of them.
  const { base, project } = symlinkFixture();
  try {
    const linkedRoot = path.join(base, 'linked-project');
    fs.symlinkSync(project, linkedRoot);
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [linkedRoot] });
    assert.equal(
      registerFsIpc.isAllowedFsPath(path.join(linkedRoot, 'a.txt')),
      true
    );
    assert.equal(
      registerFsIpc.isAllowedFsPath(path.join(linkedRoot, 'src', 'b.js')),
      true
    );
  } finally {
    removeTempDir(base);
  }
});

test('a symlink pointing at something missing is still followed', () => {
  // realpathSync gives up on a dangling link, and writing through one creates
  // the file it points at — so falling back to the path as spelled would put
  // a new file anywhere the link names.
  const { base, project } = symlinkFixture();
  try {
    fs.symlinkSync(path.join(base, 'nothing-here'), path.join(project, 'dangling'));
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(project, 'dangling')), false);
    assert.equal(
      registerFsIpc.isAllowedFsPath(path.join(project, 'dangling', 'x.txt')),
      false
    );
  } finally {
    removeTempDir(base);
  }
});

test('a dangling symlink that points back inside the project is allowed', () => {
  const { base, project } = symlinkFixture();
  try {
    fs.symlinkSync(path.join(project, 'not-yet'), path.join(project, 'pending'));
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    assert.equal(registerFsIpc.isAllowedFsPath(path.join(project, 'pending')), true);
  } finally {
    removeTempDir(base);
  }
});

test('a loop between symlinks is refused rather than hanging', () => {
  const { base, project } = symlinkFixture();
  try {
    fs.symlinkSync(path.join(project, 'b'), path.join(project, 'a'));
    fs.symlinkSync(path.join(project, 'a'), path.join(project, 'b'));
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });
    // Whatever it decides, it has to decide it: a loop must not hang.
    assert.equal(typeof registerFsIpc.isAllowedFsPath(path.join(project, 'a')), 'boolean');
  } finally {
    removeTempDir(base);
  }
});
