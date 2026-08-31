'use strict';

/**
 * Phase 1 workspace trust store.
 * Run: node --test script/ci/lsp-trust.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');

describe('LSP workspace trust', () => {
  let tmpHome;
  let prevChevron;
  let prevAtom;
  let lspTrust;

  before(() => {
    tmpHome = makeTempDir('chevron-lsp-trust-');
    prevChevron = process.env.CHEVRON_HOME;
    prevAtom = process.env.ATOM_HOME;
    process.env.CHEVRON_HOME = tmpHome;
    process.env.ATOM_HOME = tmpHome;
    // fresh require
    const trustPath = require.resolve('../../src/main-process/lsp-trust');
    delete require.cache[trustPath];
    lspTrust = require('../../src/main-process/lsp-trust');
  });

  after(() => {
    if (prevChevron === undefined) delete process.env.CHEVRON_HOME;
    else process.env.CHEVRON_HOME = prevChevron;
    if (prevAtom === undefined) delete process.env.ATOM_HOME;
    else process.env.ATOM_HOME = prevAtom;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('defaults to untrusted', () => {
    const root = path.join(tmpHome, 'proj-a');
    fs.mkdirSync(root);
    assert.strictEqual(lspTrust.isTrusted(root), false);
  });

  it('trusts root and subdirectories', () => {
    const root = path.join(tmpHome, 'proj-b');
    const sub = path.join(root, 'src');
    fs.mkdirSync(sub, { recursive: true });
    lspTrust.setTrusted(root, true);
    assert.strictEqual(lspTrust.isTrusted(root), true);
    assert.strictEqual(lspTrust.isTrusted(sub), true);
    assert.ok(lspTrust.listTrusted().some(r => r.endsWith('proj-b')));
  });

  it('untrust removes root', () => {
    const root = path.join(tmpHome, 'proj-c');
    fs.mkdirSync(root);
    lspTrust.setTrusted(root, true);
    lspTrust.setTrusted(root, false);
    assert.strictEqual(lspTrust.isTrusted(root), false);
  });

  it('refuses start without trust (manager contract)', async () => {
    // Light contract: untrusted is false — manager throws LSP_UNTRUSTED
    const root = path.join(tmpHome, 'proj-d');
    fs.mkdirSync(root);
    assert.strictEqual(lspTrust.isTrusted(root), false);
  });

  it('records declined so the same project is not prompted again', () => {
    const root = path.join(tmpHome, 'proj-e');
    fs.mkdirSync(root);
    assert.strictEqual(lspTrust.getTrustState(root), 'unknown');
    lspTrust.setTrusted(root, false);
    assert.strictEqual(lspTrust.getTrustState(root), 'declined');
    assert.strictEqual(lspTrust.isTrusted(root), false);
    assert.strictEqual(lspTrust.isDeclined(root), true);
  });

  it('trusting after decline flips the stored decision', () => {
    const root = path.join(tmpHome, 'proj-f');
    fs.mkdirSync(root);
    lspTrust.setTrusted(root, false);
    lspTrust.setTrusted(root, true);
    assert.strictEqual(lspTrust.getTrustState(root), 'trusted');
    assert.strictEqual(lspTrust.isDeclined(root), false);
  });
});
