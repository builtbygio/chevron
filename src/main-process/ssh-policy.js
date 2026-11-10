'use strict';

/**
 * What the renderer may ask ssh/scp to touch.
 *
 * The remote command is parsed by a shell on the far side, so a path is only
 * accepted when it cannot change that command: absolute, and made of letters,
 * digits, and a few punctuation marks. No spaces, quotes, or newlines.
 */

const HOST = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REMOTE_PATH = /^\/[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;

const SSH_OPTIONS = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=10'
];

function refuse(reason) {
  return { ok: false, reason };
}

function validateHost(host) {
  if (typeof host !== 'string' || !HOST.test(host)) {
    return refuse('host must look like host or user@host');
  }
  return { ok: true, host };
}

function validateRemotePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length > 4096) {
    return refuse('path is missing or too long');
  }
  if (!REMOTE_PATH.test(filePath)) {
    return refuse('path must be absolute and contain no spaces or shell characters');
  }
  return { ok: true, path: filePath };
}

function validateRemote(host, filePath) {
  const h = validateHost(host);
  if (!h.ok) return h;
  const p = validateRemotePath(filePath);
  if (!p.ok) return p;
  return { ok: true, host: h.host, path: p.path };
}

/** `user@host:/path` as one scp argument. Both halves are already checked. */
function scpSpec(host, filePath) {
  return `${host}:${filePath}`;
}

function sshOptions() {
  return SSH_OPTIONS.slice();
}

module.exports = {
  validateHost,
  validateRemotePath,
  validateRemote,
  scpSpec,
  sshOptions
};
