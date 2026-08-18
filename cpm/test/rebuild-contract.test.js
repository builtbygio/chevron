'use strict';

/**
 * Mirrors Package.runRebuildProcess: spawn getApmPath-equivalent with
 * args ['rebuild', '--no-color'], cwd = package, collect { code, stdout, stderr }.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = path.join(__dirname, '..', 'lib', 'cli.js');

function runRebuildLikeEditor(cwd) {
  const result = spawnSync(
    process.execPath,
    [cli, 'rebuild', '--no-color'],
    { cwd, encoding: 'utf8', env: process.env }
  );
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

describe('§5.5.1 rebuild contract (BufferedProcess shape)', () => {
  it('returns { code, stdout, stderr } for a pure-JS package cwd', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-contract-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'cpm-contract-js', version: '1.0.0' })
    );

    const out = runRebuildLikeEditor(tmp);
    assert.ok(typeof out.code === 'number');
    assert.ok(typeof out.stdout === 'string');
    assert.ok(typeof out.stderr === 'string');
    // Pure JS: rebuild should succeed under host node (no binding.gyp)
    assert.strictEqual(
      out.code,
      0,
      `expected success, got ${out.code}\nstdout=${out.stdout}\nstderr=${out.stderr}`
    );
  });

  it('non-zero code + stderr for invalid package cwd', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-contract-bad-'));
    const out = runRebuildLikeEditor(tmp);
    assert.notStrictEqual(out.code, 0);
    assert.ok(
      out.stderr.length > 0,
      'Package.rebuild stores stderr on failure'
    );
  });

  it('no apm shim ships: cpm is the only published bin', () => {
    // Retired in H3 PR 23. Nothing installs an `apm` name any more, and
    // PackageManager#getApmPath falls back to bin/cpm when the shim is
    // absent, so removing it degrades rather than breaks.
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'bin', 'apm')));
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'bin', 'apm.cmd')));
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    );
    assert.deepStrictEqual(Object.keys(pkg.bin), ['cpm']);
  });
});
