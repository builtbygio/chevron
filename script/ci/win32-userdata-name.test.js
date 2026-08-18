'use strict';

/**
 * H3 PR 23b — Windows userData folder is Chevron's, with no migration.
 * Run: node --test script/ci/win32-userdata-name.test.js
 *
 * There are no Windows users (owner, 2026-08-18), so the name was flipped
 * outright. See docs/windows-userdata-migrate.md.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const meta = fs.readFileSync(
  path.join(ROOT, 'script/lib/generate-metadata.js'),
  'utf8'
);

describe('win32 userData name (PR 23b)', () => {
  it('writes chevron / chevron-<channel>, not the Atom-era names', () => {
    assert.match(meta, /'chevron'\s*:\s*`chevron-\$\{CONFIG\.channel\}`/);
    assert.ok(
      !/'atom'\s*:\s*`atom-\$\{CONFIG\.channel\}`/.test(meta),
      'the Atom-era Windows userData name was removed in PR 23b'
    );
  });

  it('ships no migration machinery', () => {
    // The migration was designed and implemented, then discarded once the
    // owner confirmed there is no Windows install base to protect. If it
    // comes back, it needs the premise to change first.
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'src/main-process/migrate-windows-userdata.js')),
      'no userData migration should exist'
    );
    const start = fs.readFileSync(
      path.join(ROOT, 'src/main-process/start.js'),
      'utf8'
    );
    assert.ok(
      !/migrateWindowsUserData|USERDATA_MIGRATE/.test(start),
      'start.js must not carry migration hooks'
    );
  });

  it('the decision is recorded, not left as a pending plan', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs/windows-userdata-migrate.md'),
      'utf8'
    );
    assert.match(doc, /no migration built/i);
    assert.match(doc, /there are no Windows users/i);
  });
});
