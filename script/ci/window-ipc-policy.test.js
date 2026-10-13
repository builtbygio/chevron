'use strict';

/**
 * chevron:window-method calls only the AtomWindow methods renderers send,
 * and chevron:set-user-settings writes only the config file main owns.
 *
 * Run: node --test script/ci/window-ipc-policy.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  WINDOW_METHODS,
  isAllowedWindowMethod,
  userSettingsTarget
} = require(path.join(ROOT, 'src', 'main-process', 'window-ipc-policy'));

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Every method name a renderer sends on chevron:window-method.
function sentMethods() {
  const sent = new Set();
  for (const rel of ['src/application-delegate.js', 'src/initialize-test-window.js']) {
    const re = /ipcHelpers\.call\(\s*'chevron:window-method',\s*'([A-Za-z]+)'/g;
    for (const match of read(rel).matchAll(re)) sent.add(match[1]);
  }
  return sent;
}

describe('chevron:window-method', () => {
  it('allows exactly the methods renderers send', () => {
    assert.deepEqual([...sentMethods()].sort(), [...WINDOW_METHODS].sort());
  });

  it('allows only methods AtomWindow defines', () => {
    const source = read('src/main-process/atom-window.js');
    for (const method of WINDOW_METHODS) {
      assert.match(
        source,
        new RegExp(`^\\s+(?:async\\s+)?${method}\\(`, 'm'),
        `${method} is not an AtomWindow method`
      );
    }
  });

  it('refuses anything else', () => {
    for (const method of [
      'constructor',
      '__proto__',
      'hasOwnProperty',
      'loadURL',
      'handleEvents',
      'sendMessage',
      '',
      null,
      undefined,
      42,
      ['close']
    ]) {
      assert.equal(isAllowedWindowMethod(method), false, String(method));
    }
  });

  it('is checked before the window is touched', () => {
    const source = read('src/main-process/atom-application.js');
    const handler = source.slice(source.indexOf("'chevron:window-method'"));
    assert.ok(
      handler.indexOf('isAllowedWindowMethod(method)') <
        handler.indexOf('window[method]('),
      'the allowlist check must come before the call'
    );
  });
});

describe('chevron:set-user-settings', () => {
  const config = path.join(path.sep, 'home', 'someone', '.chevron', 'config.json');

  it('writes the config file main owns', () => {
    assert.equal(userSettingsTarget(undefined, config), config);
    assert.equal(userSettingsTarget(null, config), config);
    assert.equal(userSettingsTarget(config, config), config);
    const roundabout = path.join(path.dirname(config), '..', '.chevron', 'config.json');
    assert.equal(userSettingsTarget(roundabout, config), config);
  });

  it('refuses any other path', () => {
    for (const requested of [
      path.join(path.sep, 'home', 'someone', '.bashrc'),
      path.join(path.dirname(config), 'keymap.json'),
      'config.json',
      '',
      42,
      {}
    ]) {
      assert.equal(userSettingsTarget(requested, config), null, String(requested));
    }
  });

  it('is what the handler writes to', () => {
    const source = read('src/main-process/atom-application.js');
    const handler = source.slice(source.indexOf("'chevron:set-user-settings'"));
    assert.match(handler, /userSettingsTarget\(filePath, this\.configFilePath\)/);
    assert.match(handler, /ConfigFile\.at\(target\)/);
  });
});
