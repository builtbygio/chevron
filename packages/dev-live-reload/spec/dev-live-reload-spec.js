describe('Dev Live Reload', () => {
  describe('package activation', () => {
    let [pack, mainModule] = [];

    beforeEach(() => {
      pack = chevron.packages.loadPackage('dev-live-reload');
      pack.requireMainModule();
      mainModule = pack.mainModule;
      spyOn(mainModule, 'startWatching');
    });

    describe('when the window is not in dev mode', () => {
      beforeEach(() => spyOn(chevron, 'inDevMode').andReturn(false));

      it('does not watch files', async () => {
        spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true);

        await chevron.packages.activatePackage('dev-live-reload');
        expect(mainModule.startWatching).not.toHaveBeenCalled();
      });
    });

    describe('when the window is in spec mode', () => {
      beforeEach(() => spyOn(chevron, 'inSpecMode').andReturn(true));

      it('does not watch files', async () => {
        spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true);

        await chevron.packages.activatePackage('dev-live-reload');
        expect(mainModule.startWatching).not.toHaveBeenCalled();
      });
    });

    describe('when the window is in dev mode', () => {
      beforeEach(() => {
        spyOn(chevron, 'inDevMode').andReturn(true);
        spyOn(chevron, 'inSpecMode').andReturn(false);
      });

      it('watches files', async () => {
        spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true);

        await chevron.packages.activatePackage('dev-live-reload');
        expect(mainModule.startWatching).toHaveBeenCalled();
      });
    });

    describe('when the window is in both dev mode and spec mode', () => {
      beforeEach(() => {
        spyOn(chevron, 'inDevMode').andReturn(true);
        spyOn(chevron, 'inSpecMode').andReturn(true);
      });

      it('does not watch files', async () => {
        spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true);

        await chevron.packages.activatePackage('dev-live-reload');
        expect(mainModule.startWatching).not.toHaveBeenCalled();
      });
    });

    describe('when the package is activated before initial packages have been activated', () => {
      beforeEach(() => {
        spyOn(chevron, 'inDevMode').andReturn(true);
        spyOn(chevron, 'inSpecMode').andReturn(false);
      });

      it('waits until all initial packages have been activated before watching files', async () => {
        await chevron.packages.activatePackage('dev-live-reload');
        expect(mainModule.startWatching).not.toHaveBeenCalled();

        chevron.packages.emitter.emit('did-activate-initial-packages');
        expect(mainModule.startWatching).toHaveBeenCalled();
      });
    });
  });

  describe('package deactivation', () => {
    beforeEach(() => {
      spyOn(chevron, 'inDevMode').andReturn(true);
      spyOn(chevron, 'inSpecMode').andReturn(false);
    });

    it('stops watching all files', async () => {
      spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true);
      const { mainModule } = await chevron.packages.activatePackage(
        'dev-live-reload'
      );
      expect(mainModule.uiWatcher).not.toBeNull();

      spyOn(mainModule.uiWatcher, 'destroy');

      await chevron.packages.deactivatePackage('dev-live-reload');
      expect(mainModule.uiWatcher.destroy).toHaveBeenCalled();
    });

    it('unsubscribes from the onDidActivateInitialPackages subscription if it is disabled before all initial packages are activated', async () => {
      const { mainModule } = await chevron.packages.activatePackage(
        'dev-live-reload'
      );
      expect(mainModule.activatedDisposable.disposed).toBe(false);

      await chevron.packages.deactivatePackage('dev-live-reload');
      expect(mainModule.activatedDisposable.disposed).toBe(true);

      spyOn(mainModule, 'startWatching');
      chevron.packages.emitter.emit('did-activate-initial-packages');
      expect(mainModule.startWatching).not.toHaveBeenCalled();
    });

    it('removes its commands', async () => {
      spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true);
      await chevron.packages.activatePackage('dev-live-reload');
      expect(
        chevron.commands
          .findCommands({ target: chevron.views.getView(chevron.workspace) })
          .filter(command => command.name.startsWith('dev-live-reload')).length
      ).toBeGreaterThan(0);

      await chevron.packages.deactivatePackage('dev-live-reload');
      expect(
        chevron.commands
          .findCommands({ target: chevron.views.getView(chevron.workspace) })
          .filter(command => command.name.startsWith('dev-live-reload')).length
      ).toBe(0);
    });
  });
});
