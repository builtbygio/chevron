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

// Channels that predate the naming policy. Adding a fifth is a decision, so
// it fails here first. See REBRANDING.md.
const GRANDFATHERED = new Set([
  'did-prepare-to-unload',
  'isDefaultProtocolClient',
  'removeAsDefaultProtocolClient',
  'setAsDefaultProtocolClient'
]);

const NAMESPACED = /^(atom[-:]|lsp:|chevron:)/;

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

  it('namespaces every channel but the grandfathered ones', () => {
    const unnamespaced = enumerateChannels(ROOT)
      .map(e => e.channel)
      .filter(c => !NAMESPACED.test(c) && !GRANDFATHERED.has(c));
    assert.deepEqual(
      unnamespaced,
      [],
      'a new channel must be namespaced chevron:, lsp: or atom-/atom: — ' +
        `these are not: ${unnamespaced.join(', ')}`
    );
  });

  it('keeps the grandfathered set from growing', () => {
    const live = new Set(enumerateChannels(ROOT).map(e => e.channel));
    for (const channel of GRANDFATHERED) {
      assert.ok(
        live.has(channel),
        `${channel} is grandfathered but no longer registered — remove it ` +
          'from GRANDFATHERED rather than leaving the exemption behind'
      );
    }
    assert.equal(GRANDFATHERED.size, 4);
  });
});

describe('the recorded entries are well formed', () => {
  it('carries scope and validation on every entry', () => {
    for (const entry of RECORDED) {
      assert.ok(Object.prototype.hasOwnProperty.call(entry, 'scope'), entry.channel);
      assert.ok(Object.prototype.hasOwnProperty.call(entry, 'validation'), entry.channel);
      assert.ok(['handle', 'on'].includes(entry.kind), entry.channel);
    }
  });

  it('is sorted by channel, so the diff of an addition is one hunk', () => {
    const channels = RECORDED.map(e => e.channel);
    assert.deepEqual(channels, [...channels].sort(), 'ipc-inventory.json is not sorted');
  });

  it('records every channel the main process has', () => {
    assert.equal(RECORDED.length, enumerateChannels(ROOT).length);
  });
});
