'use strict';

/**
 * The write-fs channels: what the renderer may declare as a project root,
 * what it may write, and what it may move to the trash.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/ipc-write-fs-payloads.test.js
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

const electronStub = {
  ipcMain: { on() {}, handle() {} },
  app: { getPath: () => os.tmpdir() },
  BrowserWindow: { fromWebContents: () => null }
};

const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return electronStub;
  return origRequire.apply(this, arguments);
};

const registerFsIpc = require('../../src/main-process/register-fs-ipc');
const { validateProjectRoots, validateWriteFilePayload } = registerFsIpc;

const NUL = '\u0000';

afterEach(() => {
  registerFsIpc.setFsIpcPolicy({ strict: true, roots: [] });
});

describe('what may be declared a project root', () => {
  it('accepts ordinary folders', () => {
    assert.equal(validateProjectRoots([path.join(os.homedir(), 'proj')]).ok, true);
    assert.equal(validateProjectRoots([]).ok, true);
  });

  it('refuses the filesystem root, which would cover everything', () => {
    const result = validateProjectRoots([path.parse(process.cwd()).root]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /too broad/);
  });

  it('refuses the home directory itself', () => {
    const result = validateProjectRoots([os.homedir()]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /too broad/);
  });

  it('accepts a folder inside home', () => {
    assert.equal(validateProjectRoots([path.join(os.homedir(), 'code', 'x')]).ok, true);
  });

  it('refuses anything that is not an absolute nul-free path', () => {
    assert.equal(validateProjectRoots('/proj').ok, false);
    assert.equal(validateProjectRoots(['relative']).ok, false);
    assert.equal(validateProjectRoots([42]).ok, false);
    assert.equal(validateProjectRoots([`${path.sep}a${NUL}b`]).ok, false);
  });

  it('refuses the whole payload when one entry is bad', () => {
    // Applying the good half would leave main and the renderer disagreeing
    // about the roots, which surfaces later as unexplained refusals.
    const result = validateProjectRoots([
      path.join(os.homedir(), 'good'),
      path.parse(process.cwd()).root
    ]);
    assert.equal(result.ok, false);
  });
});

describe('what may be written', () => {
  it('accepts strings and bytes', () => {
    assert.equal(validateWriteFilePayload('hello', 'utf8').ok, true);
    assert.equal(validateWriteFilePayload(Buffer.from('hi')).ok, true);
    assert.equal(validateWriteFilePayload(new Uint8Array([1, 2])).ok, true);
    assert.equal(validateWriteFilePayload('', undefined).ok, true);
  });

  it('refuses data that is neither', () => {
    for (const data of [null, undefined, 5, {}, [], true]) {
      assert.equal(validateWriteFilePayload(data).ok, false, String(data));
    }
  });

  it('refuses an encoding node would throw on', () => {
    assert.equal(validateWriteFilePayload('x', 'utf9').ok, false);
    assert.equal(validateWriteFilePayload('x', 5).ok, false);
    assert.equal(validateWriteFilePayload('x', 'UTF-8').ok, true);
  });
});

describe('what may be moved to the trash', () => {
  it('is confined to the roots, like a write', () => {
    const base = makeTempDir('trash-confine-', { parent: os.homedir() });
    try {
      const project = path.join(base, 'project');
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, 'f.txt'), 'x');
      fs.writeFileSync(path.join(base, 'outside.txt'), 'x');
      registerFsIpc.setFsIpcPolicy({ strict: true, roots: [project] });

      assert.equal(registerFsIpc.isAllowedFsPath(path.join(project, 'f.txt')), true);
      assert.equal(registerFsIpc.isAllowedFsPath(path.join(base, 'outside.txt')), false);
    } finally {
      removeTempDir(base);
    }
  });

  it('the handler uses the roots check, not the absolute-only one', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'main-process', 'register-renderer-ipc.js'),
      'utf8'
    );
    const at = source.indexOf("'chevron:shell-move-item-to-trash'");
    assert.notEqual(at, -1);
    const body = source.slice(at, at + 600);
    assert.match(body, /isAllowedFsPath\(fullPath\)/);
    assert.doesNotMatch(body, /isSafeAbsolutePath\(fullPath\)/);
  });
});
