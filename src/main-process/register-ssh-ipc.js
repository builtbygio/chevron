'use strict';

/**
 * Read, write, and list one remote path over ssh/scp.
 * The renderer never supplies the remote command.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  validateRemote,
  scpSpec,
  sshOptions
} = require('./ssh-policy');

const MAX_BYTES = 2 * 1024 * 1024;

function run(cmd, args, deps) {
  const exec = deps.execFile || execFile;
  return new Promise((resolve, reject) => {
    exec(cmd, args, { timeout: 20000, maxBuffer: MAX_BYTES + 65536 }, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr && String(stderr).trim()) || error.message;
        const wrapped = new Error(message);
        wrapped.code = 'SSH_FAILED';
        reject(wrapped);
        return;
      }
      resolve(stdout);
    });
  });
}

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-ssh-'));
  const file = path.join(dir, 'file');
  return Promise.resolve()
    .then(() => fn(file))
    .finally(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function createSshApi(deps = {}) {
  async function read(payload = {}) {
    const spec = validateRemote(payload.host, payload.path);
    if (!spec.ok) {
      const error = new Error(spec.reason);
      error.code = 'SSH_REJECTED';
      throw error;
    }
    return withTemp(async file => {
      await run(
        'scp',
        sshOptions().concat([scpSpec(spec.host, spec.path), file]),
        deps
      );
      const text = fs.readFileSync(file, 'utf8');
      if (Buffer.byteLength(text) > MAX_BYTES) {
        throw Object.assign(new Error('remote file is too large'), { code: 'SSH_REJECTED' });
      }
      return { text };
    });
  }

  async function write(payload = {}) {
    const spec = validateRemote(payload.host, payload.path);
    if (!spec.ok) {
      const error = new Error(spec.reason);
      error.code = 'SSH_REJECTED';
      throw error;
    }
    if (typeof payload.text !== 'string') {
      const error = new Error('text must be a string');
      error.code = 'SSH_REJECTED';
      throw error;
    }
    if (Buffer.byteLength(payload.text) > MAX_BYTES) {
      const error = new Error('text is too large');
      error.code = 'SSH_REJECTED';
      throw error;
    }
    return withTemp(async file => {
      fs.writeFileSync(file, payload.text);
      await run(
        'scp',
        sshOptions().concat([file, scpSpec(spec.host, spec.path)]),
        deps
      );
      return { ok: true };
    });
  }

  async function list(payload = {}) {
    const spec = validateRemote(payload.host, payload.path);
    if (!spec.ok) {
      const error = new Error(spec.reason);
      error.code = 'SSH_REJECTED';
      throw error;
    }
    const stdout = await run(
      'ssh',
      sshOptions().concat(['--', spec.host, `ls -1 -- ${spec.path}`]),
      deps
    );
    const names = String(stdout)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 5000);
    return { names };
  }

  return { read, write, list };
}

function registerSshIpc(deps = {}) {
  const { ipcMain } = deps.ipcMain ? deps : require('electron');
  const api = createSshApi(deps);
  ipcMain.handle('chevron:ssh-read', (_event, payload) => api.read(payload || {}));
  ipcMain.handle('chevron:ssh-write', (_event, payload) => api.write(payload || {}));
  ipcMain.handle('chevron:ssh-list', (_event, payload) => api.list(payload || {}));
  return api;
}

module.exports = registerSshIpc;
module.exports.createSshApi = createSshApi;
