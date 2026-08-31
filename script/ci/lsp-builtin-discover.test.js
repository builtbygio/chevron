'use strict';

/**
 * Built-in table finds cpm-installed chevron-lsp-* binaries.
 * Run: node --test script/ci/lsp-builtin-discover.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');
const {
  resolveBuiltinRegistrations,
  resolveInstalledPackageCommand,
  OPTIONAL_SERVER_PACKAGES
} = require('../../src/lsp/builtin-servers');

describe('optional chevron-lsp-* discovery', () => {
  let tmp;
  let prevHome;

  before(() => {
    tmp = makeTempDir('chevron-lsp-home-');
    prevHome = process.env.CHEVRON_HOME;
    process.env.CHEVRON_HOME = tmp;
    const binDir = path.join(
      tmp,
      'packages',
      'chevron-lsp-typescript',
      'node_modules',
      '.bin'
    );
    fs.mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, 'typescript-language-server');
    fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(bin, 0o755);
  });

  after(() => {
    if (prevHome === undefined) delete process.env.CHEVRON_HOME;
    else process.env.CHEVRON_HOME = prevHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lists typescript when chevron-lsp-typescript is installed under CHEVRON_HOME', () => {
    const spec = OPTIONAL_SERVER_PACKAGES.find(s => s.id === 'typescript');
    const hit = resolveInstalledPackageCommand(spec, null);
    assert.ok(hit, 'expected installed binary');
    assert.ok(hit.includes('chevron-lsp-typescript'));

    const regs = resolveBuiltinRegistrations({});
    const ts = regs.find(r => r.id === 'typescript');
    assert.ok(ts, 'typescript registration missing');
    assert.strictEqual(ts.source, 'builtin');
    assert.ok(ts.command.includes('chevron-lsp-typescript'));
  });
});
