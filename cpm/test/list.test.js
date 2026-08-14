'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = path.join(__dirname, '..', 'lib', 'cli.js');

function runCpm(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

describe('cpm list / ls / outdated (settings-view contract)', () => {
  let tmp;

  afterEach(() => {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = null;
    }
  });

  it('ls --json returns { user, core, dev, git }', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-ls-'));
    const userDir = path.join(tmp, 'packages');
    const devDir = path.join(tmp, 'dev', 'packages');
    fs.mkdirSync(path.join(userDir, 'hello-user'), { recursive: true });
    fs.writeFileSync(
      path.join(userDir, 'hello-user', 'package.json'),
      JSON.stringify({ name: 'hello-user', version: '1.2.3' })
    );
    fs.mkdirSync(path.join(devDir, 'hello-dev'), { recursive: true });
    fs.writeFileSync(
      path.join(devDir, 'hello-dev', 'package.json'),
      JSON.stringify({ name: 'hello-dev', version: '0.1.0' })
    );

    const out = runCpm(['ls', '--json'], { CHEVRON_HOME: tmp });
    assert.strictEqual(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.ok(Array.isArray(parsed.user));
    assert.ok(Array.isArray(parsed.core));
    assert.ok(Array.isArray(parsed.dev));
    assert.ok(Array.isArray(parsed.git));
    assert.ok(parsed.user.some(p => p.name === 'hello-user'));
    assert.ok(parsed.dev.some(p => p.name === 'hello-dev'));
    assert.ok(parsed.core.length > 10, 'expected bundled core packages');
  });

  it('list --json is the same shape as ls --json', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-list-'));
    fs.mkdirSync(path.join(tmp, 'packages'), { recursive: true });
    const ls = runCpm(['ls', '--json'], { CHEVRON_HOME: tmp });
    const list = runCpm(['list', '--json'], { CHEVRON_HOME: tmp });
    assert.strictEqual(ls.status, 0, ls.stderr);
    assert.strictEqual(list.status, 0, list.stderr);
    assert.deepStrictEqual(JSON.parse(ls.stdout), JSON.parse(list.stdout));
  });

  it('puts git checkouts in git, not user', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-git-'));
    const gitPkg = path.join(tmp, 'packages', 'from-git');
    fs.mkdirSync(path.join(gitPkg, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(gitPkg, 'package.json'),
      JSON.stringify({ name: 'from-git', version: '9.9.9' })
    );
    const parsed = JSON.parse(
      runCpm(['ls', '--json'], { CHEVRON_HOME: tmp }).stdout
    );
    assert.ok(parsed.git.some(p => p.name === 'from-git'));
    assert.ok(!parsed.user.some(p => p.name === 'from-git'));
  });

  it('outdated --json is a JSON array', () => {
    const out = runCpm(['outdated', '--json', '--compatible', '1.0.1']);
    assert.strictEqual(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.ok(Array.isArray(parsed));
  });
});
