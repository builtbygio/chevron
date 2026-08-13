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
