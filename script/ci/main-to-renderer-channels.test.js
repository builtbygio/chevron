'use strict';

/**
 * The list of channels main sends on has to match the code, or a renderer
 * could impersonate main on one the list forgot.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/main-to-renderer-channels.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  MAIN_TO_RENDERER_CHANNELS,
  isMainOnlyChannel
} = require(path.join(ROOT, 'src', 'main-process', 'main-to-renderer-channels'));
const { withoutComments } = require(path.join(ROOT, 'script', 'lib', 'ipc-inventory'));

function sendChannelsInMain() {
  const found = new Set();
  const dir = path.join(ROOT, 'src', 'main-process');
  const walk = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const code = withoutComments(fs.readFileSync(full, 'utf8'));
        for (const match of code.matchAll(/\.send\(\s*'([a-zA-Z0-9:_-]+)'/g)) {
          found.add(match[1]);
        }
      }
    }
  };
  walk(dir);
  return found;
}

describe('the main-to-renderer channel list', () => {
  it('matches what the main process actually sends', () => {
    const live = sendChannelsInMain();
    const recorded = MAIN_TO_RENDERER_CHANNELS;
    const missing = [...live].filter(c => !recorded.has(c)).sort();
    const stale = [...recorded].filter(c => !live.has(c)).sort();
    assert.deepEqual(
      { missing, stale },
      { missing: [], stale: [] },
      'main sends on a channel the list does not name, so a renderer could ' +
        'forge it: add it to src/main-process/main-to-renderer-channels.js'
    );
  });

  it('names the channels a forged message would be most useful on', () => {
    for (const channel of ['prepare-to-unload', 'lsp:event', 'chevron:pty-event']) {
      assert.ok(isMainOnlyChannel(channel), channel);
    }
  });

  it('does not claim channels main does not send', () => {
    assert.equal(isMainOnlyChannel('github:renderer-ipc'), false);
    assert.equal(isMainOnlyChannel('some-package-channel'), false);
    assert.equal(isMainOnlyChannel(''), false);
  });
});
