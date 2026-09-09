'use strict';

/**
 * Wayland by default on Linux, without overriding anyone who chose.
 *
 * Run: node --test script/ci/ozone-platform.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { ozonePlatformHintToApply, hasOzoneSwitch } = require(path.join(
  ROOT,
  'src',
  'main-process',
  'ozone-platform'
));

describe('ozonePlatformHintToApply', () => {
  it('asks for auto on a plain Linux launch', () => {
    assert.equal(
      ozonePlatformHintToApply({
        platform: 'linux',
        argv: ['chevron', '.'],
        env: {}
      }),
      'auto'
    );
  });

  it('does nothing off Linux', () => {
    for (const platform of ['darwin', 'win32']) {
      assert.equal(
        ozonePlatformHintToApply({ platform, argv: [], env: {} }),
        null
      );
    }
  });

  it('defers to an explicit --ozone-platform or --ozone-platform-hint', () => {
    for (const argv of [
      ['chevron', '--ozone-platform=x11'],
      ['chevron', '--ozone-platform-hint=wayland'],
      ['chevron', '--ozone-platform', 'x11']
    ]) {
      assert.equal(
        ozonePlatformHintToApply({ platform: 'linux', argv, env: {} }),
        null,
        argv.join(' ')
      );
    }
  });

  it('defers to ELECTRON_OZONE_PLATFORM_HINT, which CI sets to x11 for Xvfb', () => {
    assert.equal(
      ozonePlatformHintToApply({
        platform: 'linux',
        argv: [],
        env: { ELECTRON_OZONE_PLATFORM_HINT: 'x11' }
      }),
      null
    );
    assert.equal(
      ozonePlatformHintToApply({
        platform: 'linux',
        argv: [],
        env: { ELECTRON_OZONE_PLATFORM_HINT: '' }
      }),
      'auto',
      'an empty variable is not a choice'
    );
  });

  it('does not mistake a path or a similar flag for the ozone switch', () => {
    assert.equal(
      hasOzoneSwitch(['chevron', '/home/me/ozone-platform-notes.md']),
      false
    );
    assert.equal(
      hasOzoneSwitch(['chevron', '--ozone-platform-hints=x']),
      false
    );
  });
});
