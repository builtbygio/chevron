'use strict';

/**
 * H3 PR 23 slice 4 — only `chevron` and `cpm` shell commands are installed.
 * Run: node --test script/ci/shell-commands.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const installer = fs.readFileSync(
  path.join(ROOT, 'src/command-installer.js'),
  'utf8'
);
const environment = fs.readFileSync(
  path.join(ROOT, 'src/atom-environment.js'),
  'utf8'
);

describe('shell command shims (PR 23.4)', () => {
  it('installs chevron and cpm', () => {
    assert.match(installer, /installChevronCommand\s*\(/);
    assert.match(installer, /installCpmCommand\s*\(/);
  });

  it('no longer defines atom or apm installers', () => {
    assert.ok(
      !/installAtomCommand\s*\(/.test(installer),
      'installAtomCommand removed in PR 23'
    );
    assert.ok(
      !/installApmCommand\s*\(/.test(installer),
      'installApmCommand removed in PR 23'
    );
  });

  it('startup auto-install uses chevron and cpm', () => {
    assert.match(environment, /installChevronCommand\(false/);
    assert.match(environment, /installCpmCommand\(false/);
    assert.ok(
      !/installAtomCommand|installApmCommand/.test(environment),
      'startup must not install the Atom-era command names'
    );
  });

  it('the confirmation lists only the two supported commands', () => {
    assert.ok(
      !/apmCommandName|atomCommandName/.test(installer),
      'confirmation copy should not name the removed shims'
    );
  });
});
