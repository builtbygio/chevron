'use strict';

/**
 * User config/keymap/snippets: JSON default, dual-read CSON (H1 PR 5).
 * Run: node --test script/ci/user-config-path.test.js
 *
 * Does not require('season') — the unit-and-cpm job has no app node_modules.
 * CSON fixtures are JSON (valid CSON) so migrate can JSON.parse them.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');
const {
  preferCson,
  resolveUserDataFile,
  migrateStemToJson,
  migrateUserDataFiles
} = require('../../src/user-config-path');

let tmp;

function write(filePath, contents) {
  fs.writeFileSync(filePath, contents);
}

function writeJsonShapedCson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

describe('preferCson', () => {
  it('is off unless CHEVRON_CONFIG_CSON=1', () => {
    assert.strictEqual(preferCson({}), false);
    assert.strictEqual(preferCson({ CHEVRON_CONFIG_CSON: '0' }), false);
    assert.strictEqual(preferCson({ CHEVRON_CONFIG_CSON: '1' }), true);
  });
});

describe('resolveUserDataFile', () => {
  beforeEach(() => {
    tmp = makeTempDir('chevron-config-');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('defaults new homes to config.json', () => {
    const r = resolveUserDataFile(tmp, 'config', {});
    assert.strictEqual(r.filePath, path.join(tmp, 'config.json'));
    assert.strictEqual(r.format, 'json');
    assert.ok(!r.shouldMigrate);
  });

  it('uses existing config.json', () => {
    write(path.join(tmp, 'config.json'), '{}');
    const r = resolveUserDataFile(tmp, 'config', {});
    assert.strictEqual(r.filePath, path.join(tmp, 'config.json'));
    assert.strictEqual(r.format, 'json');
  });

  it('reads config.cson when json is absent', () => {
    write(path.join(tmp, 'config.cson'), '{"*":{"core":{"telemetryConsent":"no"}}}');
    const r = resolveUserDataFile(tmp, 'config', {});
    assert.strictEqual(r.filePath, path.join(tmp, 'config.cson'));
    assert.strictEqual(r.format, 'cson');
    assert.strictEqual(r.shouldMigrate, true);
  });

  it('prefers json when both exist', () => {
    write(path.join(tmp, 'config.json'), '{"*":{}}');
    write(path.join(tmp, 'config.cson'), '{"stale":true}');
    const r = resolveUserDataFile(tmp, 'config', {});
    assert.strictEqual(r.filePath, path.join(tmp, 'config.json'));
    assert.strictEqual(r.format, 'json');
  });

  it('CHEVRON_CONFIG_CSON=1 prefers cson and new files are cson', () => {
    const env = { CHEVRON_CONFIG_CSON: '1' };
    assert.strictEqual(
      resolveUserDataFile(tmp, 'config', env).filePath,
      path.join(tmp, 'config.cson')
    );
    write(path.join(tmp, 'config.cson'), '{}');
    write(path.join(tmp, 'config.json'), '{}');
    assert.strictEqual(
      resolveUserDataFile(tmp, 'config', env).filePath,
      path.join(tmp, 'config.cson')
    );
  });
});

describe('migrateStemToJson', () => {
  beforeEach(() => {
    tmp = makeTempDir('chevron-config-');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('copies cson to json and leaves cson in place', () => {
    const cson = path.join(tmp, 'config.cson');
    writeJsonShapedCson(cson, { '*': { core: { telemetryConsent: 'no' } } });
    const r = migrateStemToJson(tmp, 'config', {});
    assert.strictEqual(r.migrated, true);
    assert.strictEqual(r.to, path.join(tmp, 'config.json'));
    assert.ok(fs.existsSync(cson));
    const json = JSON.parse(fs.readFileSync(r.to, 'utf8'));
    assert.strictEqual(json['*'].core.telemetryConsent, 'no');
  });

  it('never overwrites an existing config.json', () => {
    write(path.join(tmp, 'config.json'), '{"keep":true}');
    writeJsonShapedCson(path.join(tmp, 'config.cson'), { stale: true });
    const r = migrateStemToJson(tmp, 'config', {});
    assert.strictEqual(r.migrated, false);
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(tmp, 'config.json'), 'utf8')),
      { keep: true }
    );
  });

  it('does nothing when CHEVRON_CONFIG_CSON=1', () => {
    writeJsonShapedCson(path.join(tmp, 'config.cson'), { '*': {} });
    const r = migrateStemToJson(tmp, 'config', { CHEVRON_CONFIG_CSON: '1' });
    assert.strictEqual(r.migrated, false);
    assert.strictEqual(fs.existsSync(path.join(tmp, 'config.json')), false);
  });

  it('migrates keymap and snippets the same way', () => {
    writeJsonShapedCson(path.join(tmp, 'keymap.cson'), {
      'atom-workspace': { 'ctrl-x': 'core:close' }
    });
    writeJsonShapedCson(path.join(tmp, 'snippets.cson'), {
      '.source.js': { log: { prefix: 'log', body: 'console.log' } }
    });
    const all = migrateUserDataFiles(tmp, {});
    assert.strictEqual(all.keymap.migrated, true);
    assert.strictEqual(all.snippets.migrated, true);
    assert.ok(fs.existsSync(path.join(tmp, 'keymap.cson')));
    assert.ok(fs.existsSync(path.join(tmp, 'snippets.cson')));
    assert.ok(fs.existsSync(path.join(tmp, 'keymap.json')));
    assert.ok(fs.existsSync(path.join(tmp, 'snippets.json')));
  });
});

describe('season stays', () => {
  it('is still an app dependency', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
    );
    assert.ok(pkg.dependencies.season, 'season must stay (pin CSON + dual-read)');
  });
});
