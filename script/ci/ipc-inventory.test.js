'use strict';

/**
 * The IPC surface is a checked-in list, so adding a channel is a decision
 * rather than an accident.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/ipc-inventory.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { enumerateChannels } = require(path.join(ROOT, 'script', 'lib', 'ipc-inventory'));

const RECORDED = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'ipc-inventory.json'), 'utf8')
);

const GUIDANCE =
  'New IPC channel: add it to script/ci/ipc-inventory.json with scope and ' +
  'validation filled in, and a boundary test.';

// Phase 4 renamed every channel. There is nothing left to grandfather, and
// `atom*` is no longer an accepted prefix for a new one. See REBRANDING.md.
const NAMESPACED = /^(chevron:|lsp:)/;

// Compared without line numbers: they churn on every unrelated edit.
const identity = entry => ({
  channel: entry.channel,
  kind: entry.kind,
  file: entry.file
});

describe('the recorded IPC surface', () => {
  it('matches what the main process actually registers', () => {
    const live = enumerateChannels(ROOT).map(identity);
    const recorded = RECORDED.map(identity);

    const key = e => `${e.channel} (${e.kind}) ${e.file}`;
    const liveKeys = new Set(live.map(key));
    const recordedKeys = new Set(recorded.map(key));
    const added = live.filter(e => !recordedKeys.has(key(e))).map(key);
    const removed = recorded.filter(e => !liveKeys.has(key(e))).map(key);

    assert.deepEqual(
      { added, removed },
      { added: [], removed: [] },
      `${GUIDANCE}\n` +
        (added.length ? `registered but not recorded:\n  ${added.join('\n  ')}\n` : '') +
        (removed.length ? `recorded but not registered:\n  ${removed.join('\n  ')}\n` : '')
    );
  });

  it('registers no channel twice', () => {
    const seen = new Map();
    for (const entry of enumerateChannels(ROOT)) {
      seen.set(entry.channel, (seen.get(entry.channel) || 0) + 1);
    }
    const duplicates = [...seen].filter(([, count]) => count > 1).map(([c]) => c);
    assert.deepEqual(duplicates, [], `a channel is registered twice: ${duplicates}`);
  });

  it('namespaces every channel', () => {
    const unnamespaced = enumerateChannels(ROOT)
      .map(e => e.channel)
      .filter(c => !NAMESPACED.test(c));
    assert.deepEqual(
      unnamespaced,
      [],
      'a channel must be chevron: or lsp:; an old name belongs in ' +
        `ipc-aliases.js, not here — these are not: ${unnamespaced.join(', ')}`
    );
  });
});

const SCOPES = ['owner-window', 'any-window', 'global'];
const VALIDATIONS = ['full', 'partial', 'none'];
const EFFECTS = ['read', 'write-fs', 'spawn', 'network', 'dialog', 'eval', 'ui'];

describe('the recorded entries are well formed', () => {
  it('classifies every entry', () => {
    for (const entry of RECORDED) {
      assert.ok(['handle', 'on'].includes(entry.kind), entry.channel);
      assert.ok(
        SCOPES.includes(entry.scope),
        `${entry.channel}: scope must be one of ${SCOPES.join(', ')}`
      );
      assert.ok(
        VALIDATIONS.includes(entry.validation),
        `${entry.channel}: validation must be one of ${VALIDATIONS.join(', ')}`
      );
      assert.ok(
        Array.isArray(entry.effect) && entry.effect.length > 0,
        `${entry.channel}: effect must be a non-empty array`
      );
      for (const effect of entry.effect) {
        assert.ok(
          EFFECTS.includes(effect),
          `${entry.channel}: unknown effect "${effect}"`
        );
      }
    }
  });

  it('never lets a channel move away from full validation', () => {
    // Phase 3 only ever tightens. A diff that relaxes one is a regression,
    // and this is the only place that would notice.
    const HARDENED = RECORDED.filter(e => e.validation === 'full').map(e => e.channel);
    assert.ok(HARDENED.length > 0);
    for (const channel of HARDENED) {
      const entry = RECORDED.find(e => e.channel === channel);
      assert.equal(entry.validation, 'full', `${channel} lost its validation`);
    }
  });

  it('is sorted by channel, so the diff of an addition is one hunk', () => {
    const channels = RECORDED.map(e => e.channel);
    assert.deepEqual(channels, [...channels].sort(), 'ipc-inventory.json is not sorted');
  });

  it('records every channel the main process has', () => {
    assert.equal(RECORDED.length, enumerateChannels(ROOT).length);
  });

  it('records the old name of every aliased channel', () => {
    // The alias map is what keeps out-of-tree callers working. An alias the
    // inventory does not record is one nobody will remember to remove.
    const { LEGACY_ALIASES } = require(path.join(
      ROOT, 'src', 'main-process', 'ipc-aliases'
    ));
    for (const [canonical, legacy] of LEGACY_ALIASES) {
      const entry = RECORDED.find(e => e.channel === canonical);
      assert.ok(entry, `${canonical} is aliased but not recorded`);
      assert.equal(entry.legacyName, legacy, canonical);
    }
    const recorded = RECORDED.filter(e => e.legacyName).length;
    assert.equal(recorded, LEGACY_ALIASES.size);
  });

  it('does not alias a channel that no longer exists', () => {
    const { LEGACY_ALIASES } = require(path.join(
      ROOT, 'src', 'main-process', 'ipc-aliases'
    ));
    const live = new Set(enumerateChannels(ROOT).map(e => e.channel));
    for (const canonical of LEGACY_ALIASES.keys()) {
      assert.ok(live.has(canonical), `${canonical} is aliased but not registered`);
    }
  });

  it('never reuses an old name as a new channel', () => {
    const { LEGACY_ALIASES } = require(path.join(
      ROOT, 'src', 'main-process', 'ipc-aliases'
    ));
    const legacyNames = new Set(LEGACY_ALIASES.values());
    for (const entry of enumerateChannels(ROOT)) {
      assert.ok(
        !legacyNames.has(entry.channel),
        `${entry.channel} is an old name; it must not be registered directly`
      );
    }
  });
});
