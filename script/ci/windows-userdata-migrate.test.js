'use strict';

/**
 * H3 PR 23b step 2 — Windows userData migration, landed inert.
 * Run: node --test script/ci/windows-userdata-migrate.test.js
 *
 * Platform and env are injected, so the win32 behaviour is exercised on any
 * host. See docs/windows-userdata-migrate.md.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  migrateWindowsUserData,
  legacyDirName,
  MARKER
} = require('../../src/main-process/migrate-windows-userdata');

const ON = { CHEVRON_USERDATA_MIGRATE: '1' };

let root;
let legacy;
let dest;

function seedLegacy(files = {}) {
  fs.mkdirSync(legacy, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(legacy, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

function run(extra = {}) {
  return migrateWindowsUserData(
    Object.assign(
      { platform: 'win32', env: ON, userDataPath: dest, legacyPath: legacy },
      extra
    )
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-udm-'));
  legacy = path.join(root, 'atom');
  dest = path.join(root, 'chevron');
});

describe('windows userData migration — gating (23b step 2)', () => {
  it('does nothing off win32', () => {
    seedLegacy({ 'config.json': '{}' });
    const res = migrateWindowsUserData({
      platform: 'linux',
      env: ON,
      userDataPath: dest,
      legacyPath: legacy
    });
    assert.strictEqual(res.migrated, false);
    assert.strictEqual(res.reason, 'not-win32');
  });

  it('is inert unless explicitly enabled', () => {
    seedLegacy({ 'config.json': '{}' });
    const res = migrateWindowsUserData({
      platform: 'win32',
      env: {},
      userDataPath: dest,
      legacyPath: legacy
    });
    assert.strictEqual(res.migrated, false);
    assert.strictEqual(res.reason, 'not-enabled');
    assert.ok(!fs.existsSync(dest), 'must not create the destination when off');
  });

  it('honours CHEVRON_SKIP_USERDATA_MIGRATE', () => {
    seedLegacy({ 'config.json': '{}' });
    const res = run({
      env: { CHEVRON_USERDATA_MIGRATE: '1', CHEVRON_SKIP_USERDATA_MIGRATE: '1' }
    });
    assert.strictEqual(res.reason, 'skipped-by-env');
  });

  it('is a no-op with no legacy tree (fresh install)', () => {
    const res = run();
    assert.strictEqual(res.migrated, false);
    assert.strictEqual(res.reason, 'no-legacy-tree');
  });

  it('refuses to copy a tree onto itself (pre-name-flip)', () => {
    seedLegacy({ 'config.json': '{}' });
    const res = migrateWindowsUserData({
      platform: 'win32',
      env: ON,
      userDataPath: legacy,
      legacyPath: legacy
    });
    assert.strictEqual(res.reason, 'same-tree');
  });

  it('derives the legacy dir name per channel', () => {
    assert.strictEqual(legacyDirName('stable'), 'atom');
    assert.strictEqual(legacyDirName(undefined), 'atom');
    assert.strictEqual(legacyDirName('beta'), 'atom-beta');
    assert.strictEqual(legacyDirName('dev'), 'atom-dev');
  });
});

describe('windows userData migration — copying (23b step 2)', () => {
  it('copies settings, trust and packages', () => {
    seedLegacy({
      'config.json': '{"core":{"fontSize":18}}',
      'trusted-projects.json': '["/work/thing"]',
      'packages/my-pkg/package.json': '{"name":"my-pkg"}',
      'storage/state.json': '{"open":true}'
    });
    const res = run();
    assert.strictEqual(res.migrated, true);
    assert.strictEqual(
      fs.readFileSync(path.join(dest, 'config.json'), 'utf8'),
      '{"core":{"fontSize":18}}'
    );
    assert.ok(fs.existsSync(path.join(dest, 'trusted-projects.json')));
    assert.ok(fs.existsSync(path.join(dest, 'packages/my-pkg/package.json')));
    assert.ok(fs.existsSync(path.join(dest, 'storage/state.json')));
  });

  it('leaves the legacy tree intact (copy, not move)', () => {
    seedLegacy({ 'config.json': '{}' });
    run();
    assert.ok(
      fs.existsSync(path.join(legacy, 'config.json')),
      'downgrade must still find the old profile'
    );
  });

  it('skips regenerable caches', () => {
    seedLegacy({
      'config.json': '{}',
      'compile-cache/x.js': 'cached',
      'blob-store/BLOB': 'blob',
      'Cache/data': 'c',
      'GPUCache/data': 'g'
    });
    run();
    for (const skipped of ['compile-cache', 'blob-store', 'Cache', 'GPUCache']) {
      assert.ok(
        !fs.existsSync(path.join(dest, skipped)),
        `${skipped} should not be copied`
      );
    }
  });

  it('never overwrites existing destination data', () => {
    seedLegacy({ 'config.json': '{"from":"legacy"}' });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'config.json'), '{"from":"new"}');
    run();
    assert.strictEqual(
      fs.readFileSync(path.join(dest, 'config.json'), 'utf8'),
      '{"from":"new"}',
      'first writer wins'
    );
  });

  it('writes a one-shot marker and does not run twice', () => {
    seedLegacy({ 'config.json': '{"v":1}' });
    const first = run();
    assert.strictEqual(first.migrated, true);

    const marker = JSON.parse(
      fs.readFileSync(path.join(dest, MARKER), 'utf8')
    );
    assert.strictEqual(marker.from, legacy);
    assert.ok(Array.isArray(marker.copied));
    assert.ok(marker.copied.includes('config.json'));

    // A second run must not re-copy over edits made since.
    fs.writeFileSync(path.join(dest, 'config.json'), '{"v":2}');
    const second = run();
    assert.strictEqual(second.migrated, false);
    assert.strictEqual(second.reason, 'already-migrated');
    assert.strictEqual(
      fs.readFileSync(path.join(dest, 'config.json'), 'utf8'),
      '{"v":2}'
    );
  });

  it('records errors in the marker rather than throwing', () => {
    seedLegacy({ 'config.json': '{}', 'packages/p/f.txt': 'x' });
    const brokenFs = Object.assign({}, fs, {
      copyFileSync(from, to) {
        if (String(from).includes('f.txt')) throw new Error('EPERM: nope');
        return fs.copyFileSync(from, to);
      }
    });
    const res = run({ fs: brokenFs });
    assert.strictEqual(res.migrated, true, 'partial failure is still a run');
    const marker = JSON.parse(fs.readFileSync(path.join(dest, MARKER), 'utf8'));
    assert.ok(marker.errors.length >= 1, 'the failure must be recorded');
    assert.ok(fs.existsSync(path.join(dest, 'config.json')), 'others still copied');
  });

  it('fails open when the destination cannot be created', () => {
    seedLegacy({ 'config.json': '{}' });
    const brokenFs = Object.assign({}, fs, {
      mkdirSync() {
        throw new Error('EACCES: denied');
      }
    });
    const res = run({ fs: brokenFs });
    assert.strictEqual(res.migrated, false);
    assert.strictEqual(res.reason, 'error');
  });
});

describe('windows userData migration — wiring (23b step 2)', () => {
  it('runs in main before the first window', () => {
    const start = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src/main-process/start.js'),
      'utf8'
    );
    assert.match(start, /migrateWindowsUserData/);
    // The FIRST app.on('ready') belongs to the `--test --main-process` branch,
    // which returns before normal startup and should not migrate user data.
    // The real startup handler is the last one.
    const startupReady = start.lastIndexOf("app.on('ready'");
    assert.ok(
      start.indexOf('migrateWindowsUserData') < startupReady,
      'must run before the startup ready handler opens a window'
    );
    const testRunnerReady = start.indexOf("app.on('ready'");
    assert.ok(
      testRunnerReady < start.indexOf('migrateWindowsUserData'),
      'the main-process test-runner path returns before the migration'
    );
  });

  it('the name flip has NOT happened yet', () => {
    // Step 3 of the rollout is a separate change; this asserts step 2 shipped
    // on its own, as docs/windows-userdata-migrate.md requires.
    const meta = fs.readFileSync(
      path.join(__dirname, '..', '..', 'script/lib/generate-metadata.js'),
      'utf8'
    );
    assert.match(
      meta,
      /'atom'\s*:\s*`atom-\$\{CONFIG\.channel\}`/,
      'generate-metadata should still write the Atom-era Windows name'
    );
  });
});
