'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cli = path.join(__dirname, '..', 'lib', 'cli.js');

describe('cpm rebuild CLI contract', () => {
  it('accepts rebuild --no-color with no package name (cwd package)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-rebuild-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'cpm-rebuild-fixture', version: '1.0.0' })
    );

    const result = spawnSync(
      process.execPath,
      [cli, 'rebuild', '--no-color'],
      {
        cwd: tmp,
        encoding: 'utf8',
        env: process.env
      }
    );

    // Pure JS package: rebuild should succeed (exit 0) or fail with stderr text
    // if @electron/rebuild needs electron version — still must not crash parse.
    assert.ok(
      result.status === 0 || result.status === 1,
      `unexpected status ${result.status}: ${result.stderr}`
    );
    if (result.status !== 0) {
      assert.ok(
        result.stderr && result.stderr.length > 0,
        'failure must write stderr for Package.rebuild UI'
      );
    }
  });

  it('exits non-zero for missing package directory with stderr', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-rebuild-missing-'));
    const result = spawnSync(
      process.execPath,
      [cli, 'rebuild', '--no-color'],
      { cwd: tmp, encoding: 'utf8', env: process.env }
    );
    assert.notStrictEqual(result.status, 0);
    assert.ok(/not a package|failed|Cannot/i.test(result.stderr + result.stdout));
  });
});
