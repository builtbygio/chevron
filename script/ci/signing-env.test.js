'use strict';

/**
 * Signing and notarization read their credentials from the environment under
 * the names electron-builder uses, and skip cleanly without them.
 *
 * Run: node --test script/ci/signing-env.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { makeTempDir } = require(path.join(ROOT, 'script', 'lib', 'temp-dir'));
const mac = require(path.join(ROOT, 'script', 'lib', 'code-sign-on-mac'));
const win = require(path.join(ROOT, 'script', 'lib', 'code-sign-on-windows'));
const notarize = require(path.join(ROOT, 'script', 'lib', 'notarize-on-mac'));

describe('macOS signing', () => {
  it('needs CSC_LINK, and otherwise skips', () => {
    assert.equal(mac.signingCertificateFromEnv({}), null);
    assert.equal(
      mac.signingCertificateFromEnv({ CSC_LINK: '' }),
      null,
      'an unset secret arrives empty'
    );
    assert.deepEqual(
      mac.signingCertificateFromEnv({
        CSC_LINK: 'QUJD',
        CSC_KEY_PASSWORD: 'pw',
        CSC_NAME: 'Developer ID Application: X'
      }),
      {
        link: 'QUJD',
        password: 'pw',
        identity: 'Developer ID Application: X'
      }
    );
  });

  it('picks the Developer ID Application identity out of find-identity', () => {
    const output = [
      'Policy: Code Signing',
      '  Matching identities',
      '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Apple Development: Someone (ABCDE12345)"',
      '  2) 89ABCDEF0123456789ABCDEF0123456789ABCDEF "Developer ID Application: Someone (ABCDE12345)"',
      '     2 identities found'
    ].join('\n');
    assert.equal(
      mac.pickSigningIdentity(output),
      'Developer ID Application: Someone (ABCDE12345)'
    );
    assert.equal(mac.pickSigningIdentity('0 identities found'), null);
  });

  it('materialises a base64 certificate and passes a path through', () => {
    const dir = makeTempDir('chevron-signing-env-test-');
    const file = mac.materializeCertificate(
      Buffer.from('p12 bytes').toString('base64'),
      dir
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'p12 bytes');
    assert.equal(mac.materializeCertificate(file, dir), file);
    assert.throws(
      () => mac.materializeCertificate('/no/such/file!', dir),
      /neither/
    );
  });
});

describe('Windows signing', () => {
  it('needs WIN_CSC_LINK, and otherwise skips', () => {
    assert.equal(win.windowsSigningFromEnv({}), null);
    assert.equal(win.windowsSigningFromEnv({ WIN_CSC_LINK: '' }), null);
    assert.deepEqual(
      win.windowsSigningFromEnv({
        WIN_CSC_LINK: 'QUJD',
        WIN_CSC_KEY_PASSWORD: 'pw'
      }),
      {
        link: 'QUJD',
        password: 'pw'
      }
    );
  });

  it('materialises a base64 certificate as a .pfx', () => {
    const dir = makeTempDir('chevron-signing-env-test-');
    const file = win.materializeCertificate(
      Buffer.from('pfx').toString('base64'),
      dir
    );
    assert.ok(file.endsWith('.pfx'));
    assert.equal(fs.readFileSync(file, 'utf8'), 'pfx');
  });
});

describe('notarization', () => {
  it('accepts either an Apple ID or an App Store Connect API key, and skips without', () => {
    assert.equal(notarize.notaryCredentialsFromEnv({}), null);
    assert.equal(
      notarize.notaryCredentialsFromEnv({
        APPLE_ID: 'a',
        APPLE_APP_SPECIFIC_PASSWORD: 'p'
      }),
      null,
      'no team id'
    );
    assert.deepEqual(
      notarize.notaryCredentialsFromEnv({
        APPLE_ID: 'a',
        APPLE_APP_SPECIFIC_PASSWORD: 'p',
        APPLE_TEAM_ID: 't'
      }),
      { appleId: 'a', appleIdPassword: 'p', teamId: 't' }
    );
    assert.deepEqual(
      notarize.notaryCredentialsFromEnv({
        APPLE_API_KEY: '/k.p8',
        APPLE_API_KEY_ID: 'id',
        APPLE_API_ISSUER: 'iss'
      }),
      { appleApiKey: '/k.p8', appleApiKeyId: 'id', appleApiIssuer: 'iss' }
    );
  });
});
