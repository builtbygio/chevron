const { Emitter } = require('event-kit');
const AutoUpdateManager = require('../src/auto-update-manager');

// The renderer manager only relays the delegate's update IPC; the main-process
// updater is covered by script/ci/auto-update-manager.test.js.
describe('AutoUpdateManager (renderer)', () => {
  let autoUpdateManager, delegateEmitter, applicationDelegate;

  beforeEach(() => {
    delegateEmitter = new Emitter();
    const relay = name => callback => delegateEmitter.on(name, callback);
    applicationDelegate = {
      onDidBeginCheckingForUpdate: relay('checking-for-update'),
      onDidBeginDownloadingUpdate: relay('did-begin-downloading-update'),
      onDidCompleteDownloadingUpdate: relay('update-available'),
      onUpdateNotAvailable: relay('update-not-available'),
      onUpdateError: relay('update-error'),
      getAutoUpdateManagerState: () => 'idle',
      getAutoUpdateManagerErrorMessage: () => 'an error message'
    };
    autoUpdateManager = new AutoUpdateManager({ applicationDelegate });
    autoUpdateManager.initialize();
  });

  afterEach(() => {
    autoUpdateManager.destroy();
    delegateEmitter.dispose();
  });

  it('relays "checking-for-update" as did-begin-checking-for-update', () => {
    const spy = jasmine.createSpy('spy');
    autoUpdateManager.onDidBeginCheckingForUpdate(spy);
    delegateEmitter.emit('checking-for-update');
    expect(spy.callCount).toBe(1);
  });

  it('relays did-begin-downloading-update', () => {
    const spy = jasmine.createSpy('spy');
    autoUpdateManager.onDidBeginDownloadingUpdate(spy);
    delegateEmitter.emit('did-begin-downloading-update');
    expect(spy.callCount).toBe(1);
  });

  it('relays "update-available" with its details as did-complete-downloading-update', () => {
    const spy = jasmine.createSpy('spy');
    autoUpdateManager.onDidCompleteDownloadingUpdate(spy);
    delegateEmitter.emit('update-available', { releaseVersion: '1.2.3' });
    expect(spy.mostRecentCall.args[0].releaseVersion).toBe('1.2.3');
  });

  it('relays update-not-available', () => {
    const spy = jasmine.createSpy('spy');
    autoUpdateManager.onUpdateNotAvailable(spy);
    delegateEmitter.emit('update-not-available');
    expect(spy.callCount).toBe(1);
  });

  it('relays update-error and exposes the error message', () => {
    const spy = jasmine.createSpy('spy');
    autoUpdateManager.onUpdateError(spy);
    delegateEmitter.emit('update-error');
    expect(spy.callCount).toBe(1);
    expect(autoUpdateManager.getErrorMessage()).toBe('an error message');
  });

  describe('::platformSupportsUpdates', () => {
    it('is true only for a supported state outside the dev channel', () => {
      let state, releaseChannel;
      spyOn(autoUpdateManager, 'getState').andCallFake(() => state);
      spyOn(atom, 'getReleaseChannel').andCallFake(() => releaseChannel);

      state = 'idle';
      releaseChannel = 'stable';
      expect(autoUpdateManager.platformSupportsUpdates()).toBe(true);

      releaseChannel = 'dev';
      expect(autoUpdateManager.platformSupportsUpdates()).toBe(false);

      state = 'unsupported';
      releaseChannel = 'stable';
      expect(autoUpdateManager.platformSupportsUpdates()).toBe(false);
    });
  });

  describe('::destroy', () => {
    it('unsubscribes from all events', () => {
      const spy = jasmine.createSpy('spy');
      autoUpdateManager.onDidBeginCheckingForUpdate(spy);
      autoUpdateManager.onDidBeginDownloadingUpdate(spy);
      autoUpdateManager.onDidCompleteDownloadingUpdate(spy);
      autoUpdateManager.onUpdateNotAvailable(spy);
      autoUpdateManager.onUpdateError(spy);
      autoUpdateManager.destroy();

      delegateEmitter.emit('checking-for-update');
      delegateEmitter.emit('did-begin-downloading-update');
      delegateEmitter.emit('update-available', {});
      delegateEmitter.emit('update-not-available');
      delegateEmitter.emit('update-error');
      expect(spy.callCount).toBe(0);
    });
  });
});
