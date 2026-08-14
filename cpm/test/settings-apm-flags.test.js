'use strict';

/**
 * settings-view still speaks apm's argv. Commander 12 rejects unknown
 * options unless we declare them.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = path.join(__dirname, '..', 'lib', 'cli.js');
const fixture = path.join(__dirname, 'fixtures', 'pure-js-package');

function runCpm(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

describe('settings-view apm flags', () => {
  let tmp;

  afterEach(() => {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = null;
    }
  });

  it('install --json writes [{ metadata }]', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-install-json-'));
    const out = runCpm(['install', fixture, '--json'], { CHEVRON_HOME: tmp });
    assert.strictEqual(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed[0].metadata.name);
    assert.ok(parsed[0].metadata.version);
  });

  it('install --check exits 0 without a spec', () => {
    const out = runCpm(['install', '--check']);
    assert.strictEqual(out.status, 0, out.stderr);
  });

  it('uninstall --hard name exits 0', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-uninstall-hard-'));
    const install = runCpm(['install', fixture], { CHEVRON_HOME: tmp });
    assert.strictEqual(install.status, 0, install.stderr);
    const name = JSON.parse(
      fs.readFileSync(path.join(fixture, 'package.json'), 'utf8')
    ).name;
    const out = runCpm(['uninstall', '--hard', name], { CHEVRON_HOME: tmp });
    assert.strictEqual(out.status, 0, out.stderr);
  });
});
