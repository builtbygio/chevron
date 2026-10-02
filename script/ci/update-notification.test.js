'use strict';

/**
 * A downloaded update is announced once: "ready, installs on restart" with a
 * Restart now button, or, for a build that updates from the release page,
 * "available" with a link to it.
 *
 * Run: node --test script/ci/update-notification.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const path = require('path');

const { notifyUpdate, NotifiedUpdateVersion } = require(path.resolve(
  __dirname, '..', '..', 'packages', 'about', 'lib', 'update-notification'
));

let shown, storage, restarts, opened;

function deps() {
  return {
    notifications: {
      addInfo(message, options) {
        const notification = { message, options, dismissed: false, dismiss() { this.dismissed = true; } };
        shown.push(notification);
        return notification;
      }
    },
    storage,
    restartAndInstall: () => restarts++,
    openExternal: url => opened.push(url)
  };
}

beforeEach(() => {
  shown = [];
  restarts = 0;
  opened = [];
  const items = {};
  storage = { getItem: k => (k in items ? items[k] : null), setItem: (k, v) => { items[k] = String(v); } };
});

describe('notifyUpdate', () => {
  it('announces a downloaded update with Restart now', () => {
    notifyUpdate({ releaseVersion: '1.5.0', installable: true }, deps());
    assert.equal(shown.length, 1);
    assert.match(shown[0].message, /1\.5\.0 is ready to install/);
    assert.match(shown[0].options.description, /next time Chevron restarts/);
    shown[0].options.buttons.find(b => b.text === 'Restart now').onDidClick();
    assert.equal(restarts, 1);
    assert.equal(shown[0].dismissed, true);
  });

  it('points a release-page build at the release', () => {
    notifyUpdate({ releaseVersion: '1.5.0', installable: false, releasePageUrl: 'https://x/r/1.5.0' }, deps());
    assert.match(shown[0].message, /1\.5\.0 is available/);
    shown[0].options.buttons.find(b => b.text === 'Open release page').onDidClick();
    assert.deepEqual(opened, ['https://x/r/1.5.0']);
    assert.equal(restarts, 0);
  });

  it('announces each version once, across windows', () => {
    notifyUpdate({ releaseVersion: '1.5.0', installable: true }, deps());
    notifyUpdate({ releaseVersion: '1.5.0', installable: true }, deps());
    assert.equal(shown.length, 1);
    notifyUpdate({ releaseVersion: '1.5.1', installable: true }, deps());
    assert.equal(shown.length, 2);
    assert.equal(storage.getItem(NotifiedUpdateVersion), '1.5.1');
  });

  it('stays quiet when a manual check has already shown a dialog', () => {
    notifyUpdate({ releaseVersion: '1.5.0', installable: false, alreadyShown: true }, deps());
    assert.equal(shown.length, 0);
    notifyUpdate({ releaseVersion: '1.5.0', installable: false }, deps());
    assert.equal(shown.length, 0, 'the version counts as announced');
  });

  it('ignores a message without a version', () => {
    assert.equal(notifyUpdate({}, deps()), null);
    assert.equal(shown.length, 0);
  });
});
