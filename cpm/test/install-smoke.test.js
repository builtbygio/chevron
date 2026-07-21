'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const cli = path.join(__dirname, '..', 'lib', 'cli.js');
const fixture = path.join(__dirname, 'fixtures', 'pure-js-package');

function runCpm(args, envExtra = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...envExtra },
    cwd: repoRoot
  });
}

describe('cpm install smoke', () => {
  let smokeHome;

  before(() => {
    // Ensure fixture exists (created by smoke work or committed)
    assert.ok(
      fs.existsSync(path.join(fixture, 'package.json')),
      `missing fixture ${fixture}`
    );
  });

  after(() => {
    if (smokeHome && fs.existsSync(smokeHome)) {
      fs.rmSync(smokeHome, { recursive: true, force: true });
    }
  });

  it('installs a pure-JS package from a local path with deps', () => {
    smokeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-install-smoke-'));
    const env = {
      ATOM_HOME: smokeHome,
      CHEVRON_HOME: smokeHome
    };

    const install = runCpm(['install', fixture], env);
    assert.strictEqual(
      install.status,
      0,
      `install failed:\n${install.stdout}\n${install.stderr}`
    );

    const dest = path.join(smokeHome, 'packages', 'cpm-smoke-pure-js');
    assert.ok(fs.existsSync(path.join(dest, 'package.json')));
    assert.ok(
      fs.existsSync(path.join(dest, 'node_modules', 'left-pad', 'package.json')),
      'expected left-pad dependency'
    );

    const list = runCpm(['list', '--json'], env);
    assert.strictEqual(list.status, 0, list.stderr);
    const parsed = JSON.parse(list.stdout);
    assert.ok(parsed.some(p => p.name === 'cpm-smoke-pure-js'));

    const uninstall = runCpm(['uninstall', 'cpm-smoke-pure-js'], env);
    assert.strictEqual(uninstall.status, 0, uninstall.stderr);
    assert.ok(!fs.existsSync(dest));
  });
});
