'use strict';

/**
 * The main-process update manager, driven by a fake electron-updater: the
 * states the application menu switches on and the messages the about package
 * listens for, in each mode.
 *
 * Run: node --test script/ci/auto-update-manager.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// electron is not installed here; the manager only touches it for dialogs.
const dialogs = [];
const opened = [];
const electronStub = {
  app: { isPackaged: true },
  dialog: {
    showMessageBox: options => {
      dialogs.push(options);
      return Promise.resolve({ response: 1 });
    }
  },
  shell: { openExternal: url => opened.push(url) }
};
// Kept installed: the manager requires electron lazily, when it shows a dialog.
const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return electronStub;
  return origRequire.apply(this, arguments);
};
const AutoUpdateManager = require(path.join(
  ROOT,
  'src',
  'main-process',
  'auto-update-manager'
));

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.feed = null;
    this.installs = 0;
    this.checks = 0;
    this.next = null;
  }
  setFeedURL(url) {
    this.feed = url;
  }
  checkForUpdates() {
    this.checks++;
    return this.next ? this.next() : Promise.resolve(null);
  }
  quitAndInstall() {
    this.installs++;
  }
}

class FakeConfig {
  constructor(values) {
    this.values = values;
  }
  get(key) {
    return this.values[key];
  }
  onDidChange() {
    return { dispose() {} };
  }
}

function makeManager({
  platform = 'win32',
  codeSigned = false,
  version = '1.4.0',
  config = {},
  env = {}
} = {}) {
  const updater = new FakeUpdater();
  const messages = [];
  const windows = [
    { sendMessage: (name, detail) => messages.push({ name, detail }) }
  ];
  const manager = new AutoUpdateManager(
    version,
    false,
    new FakeConfig({ 'core.automaticallyUpdate': false, ...config }),
    {
      platform,
      env,
      isPackaged: true,
      updateConfig: { provider: 'github', owner: 'o', repo: 'r', codeSigned },
      createUpdater: () => updater,
      getWindows: () => windows
    }
  );
  const states = [];
  manager.on('state-changed', state => states.push(state));
  return { manager, updater, messages, states };
}

beforeEach(() => {
  dialogs.length = 0;
  opened.length = 0;
});

afterEach(() => {
  // scheduleUpdateCheck is never armed here: automaticallyUpdate is false.
});

describe('in-app mode', () => {
  it('is chosen for Windows and for a signed macOS build', () => {
    assert.equal(
      makeManager({ platform: 'win32' }).manager.getMode(),
      'in-app'
    );
    assert.equal(
      makeManager({ platform: 'darwin', codeSigned: true }).manager.getMode(),
      'in-app'
    );
    assert.equal(
      makeManager({ platform: 'darwin', codeSigned: false }).manager.getMode(),
      'download-page'
    );
  });

  it('walks the states the menu knows as electron-updater reports progress', () => {
    const { manager, updater, messages, states } = makeManager();
    manager.initialize();
    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '1.5.0' });
    updater.emit('update-downloaded', { version: '1.5.0' });
    assert.deepEqual(states, ['checking', 'downloading', 'update-available']);
    assert.deepEqual(messages.map(m => m.name), [
      'checking-for-update',
      'did-begin-downloading-update',
      'update-available'
    ]);
    assert.deepEqual(messages[2].detail, { releaseVersion: '1.5.0' });
    manager.install();
    assert.equal(updater.installs, 1);
  });

  it('reports no update and an error the way the about page expects', () => {
    const { manager, updater, messages, states } = makeManager();
    manager.initialize();
    updater.emit('update-not-available');
    updater.emit('error', new Error('feed unreachable'));
    assert.deepEqual(states, ['no-update-available', 'error']);
    assert.equal(manager.getErrorMessage(), 'feed unreachable');
    assert.deepEqual(messages.map(m => m.name), [
      'update-not-available',
      'update-error'
    ]);
  });

  it('downloads on its own and installs on quit', () => {
    const { manager, updater } = makeManager();
    manager.initialize();
    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, true);
  });

  it('sees pre-releases only for a beta/nightly build or when asked', () => {
    const stable = makeManager({ version: '1.4.0' });
    stable.manager.initialize();
    assert.equal(stable.updater.allowPrerelease, false);
    const beta = makeManager({ version: '1.4.0-beta1' });
    beta.manager.initialize();
    assert.equal(beta.updater.allowPrerelease, true);
    const optedIn = makeManager({
      version: '1.4.0',
      config: { 'core.allowPrereleaseUpdates': true }
    });
    optedIn.manager.initialize();
    assert.equal(optedIn.updater.allowPrerelease, true);
  });

  it('points electron-updater at CHEVRON_UPDATE_FEED_URL when set', () => {
    const { manager, updater } = makeManager({
      env: { CHEVRON_UPDATE_FEED_URL: 'http://localhost:9000/' }
    });
    manager.initialize();
    assert.equal(updater.feed, 'http://localhost:9000/');
  });

  it('answers a manual check with a dialog only when there is nothing to install', async () => {
    const { manager, updater } = makeManager();
    manager.initialize();
    updater.next = () => Promise.resolve({ updateInfo: { version: '1.4.0' } });
    await manager.check();
    assert.equal(dialogs.length, 1);
    assert.match(dialogs[0].message, /No update available/);

    updater.next = () => Promise.resolve({ updateInfo: { version: '1.5.0' } });
    await manager.check();
    assert.equal(dialogs.length, 1, 'the download itself is the feedback');

    updater.next = () => {
      updater.emit('error', new Error('boom'));
      return Promise.reject(new Error('boom'));
    };
    await manager.check();
    assert.equal(dialogs.length, 2);
    assert.match(dialogs[1].message, /error checking for updates/);
    assert.deepEqual(dialogs[1].buttons, ['OK', 'Open download page']);

    await manager.check({ hidePopups: true });
    assert.equal(dialogs.length, 2, 'the scheduled check is silent');
  });
});

describe('download-page mode', () => {
  it('checks the Releases API and offers the page for a newer release', async () => {
    const { manager, messages, states } = makeManager({
      platform: 'darwin',
      codeSigned: false
    });
    manager.initialize();
    manager.fetchGitHubReleases = () =>
      Promise.resolve([
        {
          tag_name: 'v1.5.0',
          html_url: 'https://example.test/v1.5.0',
          draft: false
        }
      ]);
    await manager.check();
    assert.deepEqual(states, ['checking', 'update-available']);
    assert.deepEqual(messages.map(m => m.name), [
      'checking-for-update',
      'update-available'
    ]);
    assert.equal(dialogs.length, 1);
    assert.match(dialogs[0].detail, /not code-signed/);
    manager.install();
    assert.deepEqual(opened, ['https://example.test/v1.5.0']);
  });

  it('says so when the running version is current', async () => {
    const { manager, states } = makeManager({ platform: 'linux' });
    manager.initialize();
    manager.fetchGitHubReleases = () =>
      Promise.resolve([{ tag_name: 'v1.4.0', draft: false }]);
    await manager.check({ hidePopups: true });
    assert.deepEqual(states, ['checking', 'no-update-available']);
    assert.equal(dialogs.length, 0);
  });
});

describe('unsupported', () => {
  it('is the mode of a test run, and it never touches electron-updater', () => {
    let created = 0;
    const manager = new AutoUpdateManager('1.4.0', true, new FakeConfig({}), {
      platform: 'win32',
      isPackaged: true,
      updateConfig: { provider: 'github', codeSigned: true },
      createUpdater: () => {
        created++;
        return new FakeUpdater();
      },
      getWindows: () => []
    });
    manager.initialize();
    assert.equal(manager.getMode(), 'unsupported');
    assert.equal(manager.getState(), 'unsupported');
    assert.equal(created, 0);
  });
});
