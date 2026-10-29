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

  it('discovers harper-ls and vscode-json the same way', () => {
    for (const id of ['harper-ls', 'vscode-json']) {
      assert.ok(
        OPTIONAL_SERVER_PACKAGES.some(s => s.id === id),
        `${id} must be in OPTIONAL_SERVER_PACKAGES so Install-panel installs ` +
          'are found without waiting on consumeLsp'
      );
    }

    const mdBin = path.join(
      tmp,
      'packages',
      'chevron-lsp-markdown',
      'bin'
    );
    fs.mkdirSync(mdBin, { recursive: true });
    const harper = path.join(mdBin, 'harper-ls');
    fs.writeFileSync(harper, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(harper, 0o755);

    const jsonBin = path.join(
      tmp,
      'packages',
      'chevron-lsp-json',
      'node_modules',
      '.bin'
    );
    fs.mkdirSync(jsonBin, { recursive: true });
    const jsonLs = path.join(jsonBin, 'vscode-json-languageserver');
    fs.writeFileSync(jsonLs, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(jsonLs, 0o755);

    const regs = resolveBuiltinRegistrations({});
    const prose = regs.find(r => r.id === 'harper-ls');
    assert.ok(prose, 'harper-ls registration missing');
    assert.ok(prose.scopes.includes('source.gfm'));
    assert.ok(prose.scopes.includes('text.plain.null-grammar'));
    assert.ok(prose.command.includes('chevron-lsp-markdown'));

    const json = regs.find(r => r.id === 'vscode-json');
    assert.ok(json, 'vscode-json registration missing');
    assert.ok(json.command.includes('chevron-lsp-json'));
  });
});
