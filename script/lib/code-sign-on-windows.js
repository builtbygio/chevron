'use strict';

/**
 * Sign every .exe and .dll in the packaged Windows app with signtool, through
 * @electron/windows-sign.
 *
 * The certificate is read from the environment under the names electron-builder
 * uses, so the same CI secrets sign the app here and the NSIS installer there:
 *   WIN_CSC_LINK          a .pfx/.p12 as a path, a file: URL, or base64
 *   WIN_CSC_KEY_PASSWORD  its password
 * Without them signing is skipped and the caller is told so.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir, removeTempDir } = require('./temp-dir');

function windowsSigningFromEnv(env = process.env) {
  const link = env.WIN_CSC_LINK || env.CSC_LINK;
  if (!link) return null;
  return {
    link,
    password: env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD || ''
  };
}

// A path, a file: URL, or the certificate itself as base64 (how a CI secret
// carries a binary file). Returns a path, materialising the base64 in `dir`.
function materializeCertificate(link, dir) {
  if (link.startsWith('file://')) return new URL(link).pathname;
  if (fs.existsSync(link)) return link;
  if (/^[A-Za-z0-9+/=\s]+$/.test(link)) {
    const file = path.join(dir, 'signing-certificate.pfx');
    fs.writeFileSync(file, Buffer.from(link.replace(/\s+/g, ''), 'base64'));
    return file;
  }
  throw new Error(
    'WIN_CSC_LINK is neither an existing path, a file: URL, nor base64'
  );
}

/** @returns {Promise<boolean>} whether anything was signed */
module.exports = async function codeSignOnWindows(appDirectory) {
  const signing = windowsSigningFromEnv();
  if (!signing) {
    console.log('Skipping Windows code signing: WIN_CSC_LINK is not set.');
    return false;
  }
  const dir = makeTempDir('chevron-win-sign-');
  try {
    const certificateFile = materializeCertificate(signing.link, dir);
    const { sign } = require('@electron/windows-sign');
    console.log(`Signing executables under ${appDirectory}`);
    await sign({
      appDirectory,
      certificateFile,
      certificatePassword: signing.password,
      hashes: ['sha256'],
      timestampServer: 'http://timestamp.digicert.com'
    });
    return true;
  } finally {
    removeTempDir(dir);
  }
};

module.exports.windowsSigningFromEnv = windowsSigningFromEnv;
module.exports.materializeCertificate = materializeCertificate;
module.exports.tmpdir = os.tmpdir;
