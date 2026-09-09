'use strict';

/**
 * Sign Chevron.app with a Developer ID Application certificate.
 *
 * The certificate comes from the environment under the names electron-builder
 * uses, so one set of CI secrets serves both tools:
 *   CSC_LINK          a .p12 as a path, a file: URL, or base64
 *   CSC_KEY_PASSWORD  its password
 *   CSC_NAME          (optional) the identity to sign with; otherwise the
 *                     Developer ID Application identity found in the cert
 * It is imported into a throwaway keychain that is deleted afterwards.
 * Without CSC_LINK signing is skipped and the caller is told so, which is how
 * the unsigned preview keeps building.
 *
 * Hardened runtime with the entitlements Electron needs to run JIT code and
 * load its native modules (resources/mac/entitlements.plist).
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const spawnSync = require('./spawn-sync');
const { makeTempDir, removeTempDir } = require('./temp-dir');
const CONFIG = require('../config');

const ENTITLEMENTS = path.join(
  CONFIG.repositoryRootPath,
  'resources',
  'mac',
  'entitlements.plist'
);
const DEVELOPER_ID = 'Developer ID Application';

function signingCertificateFromEnv(env = process.env) {
  const link = env.CSC_LINK || env.ATOM_MAC_CODE_SIGNING_CERT_PATH;
  if (!link) return null;
  return {
    link,
    password:
      env.CSC_KEY_PASSWORD || env.ATOM_MAC_CODE_SIGNING_CERT_PASSWORD || '',
    identity: env.CSC_NAME || null
  };
}

// A path, a file: URL, or the certificate itself as base64 (how a CI secret
// carries a binary file). Returns a path, materialising the base64 in `dir`.
function materializeCertificate(link, dir) {
  if (link.startsWith('file://')) return new URL(link).pathname;
  if (fs.existsSync(link)) return link;
  if (/^[A-Za-z0-9+/=\s]+$/.test(link)) {
    const file = path.join(dir, 'signing-certificate.p12');
    fs.writeFileSync(file, Buffer.from(link.replace(/\s+/g, ''), 'base64'));
    return file;
  }
  throw new Error(
    'CSC_LINK is neither an existing path, a file: URL, nor base64'
  );
}

// From `security find-identity -v -p codesigning`: the Developer ID
// Application identity, or null. Lines look like
//   1) ABCDEF0123... "Developer ID Application: Someone (TEAMID)"
function pickSigningIdentity(findIdentityOutput, preferred = DEVELOPER_ID) {
  const names = [];
  for (const line of String(findIdentityOutput || '').split('\n')) {
    const match = /^\s*\d+\)\s+[0-9A-F]+\s+"([^"]+)"/.exec(line);
    if (match) names.push(match[1]);
  }
  return names.find(name => name.startsWith(preferred)) || null;
}

function security(args, options = {}) {
  return spawnSync('security', args, {
    stdio: options.quiet ? 'pipe' : 'inherit',
    ...options
  });
}

/** @returns {Promise<boolean>} whether the app was signed */
module.exports = async function codeSignOnMac(packagedAppPath) {
  const certificate = signingCertificateFromEnv();
  if (!certificate) {
    console.log('Skipping code signing: CSC_LINK is not set.');
    return false;
  }

  const dir = makeTempDir('chevron-mac-sign-');
  const keychain = path.join(dir, 'signing.keychain-db');
  const keychainPassword = crypto.randomBytes(24).toString('hex');
  try {
    const certPath = materializeCertificate(certificate.link, dir);
    console.log(`Importing the signing certificate into a temporary keychain`);
    security(['create-keychain', '-p', keychainPassword, keychain]);
    security(['set-keychain-settings', '-lut', '3600', keychain]);
    security(['unlock-keychain', '-p', keychainPassword, keychain]);
    security(
      [
        'import',
        certPath,
        '-k',
        keychain,
        '-P',
        certificate.password,
        '-T',
        '/usr/bin/codesign',
        '-T',
        '/usr/bin/security'
      ],
      { quiet: true }
    );
    // Let codesign use the key without a UI prompt.
    security(
      [
        'set-key-partition-list',
        '-S',
        'apple-tool:,apple:,codesign:',
        '-s',
        '-k',
        keychainPassword,
        keychain
      ],
      { quiet: true }
    );
    // The new keychain has to be in the search list for codesign to see it.
    const current = security(['list-keychains', '-d', 'user'], { quiet: true })
      .stdout.toString()
      .split('\n')
      .map(line => line.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    security(['list-keychains', '-d', 'user', '-s', keychain, ...current]);

    const identity =
      certificate.identity ||
      pickSigningIdentity(
        security(['find-identity', '-v', '-p', 'codesigning', keychain], {
          quiet: true
        }).stdout.toString()
      );
    if (!identity) {
      throw new Error(
        `No "${DEVELOPER_ID}" identity in the imported certificate; set CSC_NAME to choose one`
      );
    }

    const { signAsync } = require('@electron/osx-sign');
    console.log(`Code-signing ${packagedAppPath} as "${identity}"`);
    await signAsync({
      app: packagedAppPath,
      identity,
      keychain,
      platform: 'darwin',
      type: 'distribution',
      optionsForFile: () => ({
        hardenedRuntime: true,
        entitlements: ENTITLEMENTS,
        timestamp: undefined
      })
    });
    spawnSync(
      'codesign',
      ['--verify', '--deep', '--strict', '--verbose=2', packagedAppPath],
      { stdio: 'inherit' }
    );
    return true;
  } finally {
    try {
      security(['delete-keychain', keychain], { quiet: true });
    } catch (error) {
      // it may never have been created
    }
    removeTempDir(dir);
  }
};

module.exports.signingCertificateFromEnv = signingCertificateFromEnv;
module.exports.materializeCertificate = materializeCertificate;
module.exports.pickSigningIdentity = pickSigningIdentity;
module.exports.tmpdir = os.tmpdir;
