const { conditionPromise } = require('./async-spec-helpers');
const fs = require('fs');
const path = require('path');
const temp = require('temp').track();
const ChevronEnvironment = require('../src/chevron-environment');

describe('ChevronEnvironment', () => {
  afterEach(() => {
    try {
      temp.cleanupSync();
    } catch (error) {}
  });

  describe('window sizing methods', () => {
    describe('::getPosition and ::setPosition', () => {
      let originalPosition = null;
      beforeEach(() => (originalPosition = chevron.getPosition()));

      afterEach(() => chevron.setPosition(originalPosition.x, originalPosition.y));

      it('sets the position of the window, and can retrieve the position just set', () => {
        chevron.setPosition(22, 45);
        expect(chevron.getPosition()).toEqual({ x: 22, y: 45 });
      });
    });

    describe('::getSize and ::setSize', () => {
      let originalSize = null;
      beforeEach(() => (originalSize = chevron.getSize()));
      afterEach(() => chevron.setSize(originalSize.width, originalSize.height));

      it('sets the size of the window, and can retrieve the size just set', async () => {
        const newWidth = originalSize.width - 12;
        const newHeight = originalSize.height - 23;
        await chevron.setSize(newWidth, newHeight);
        expect(chevron.getSize()).toEqual({ width: newWidth, height: newHeight });
      });
    });
  });

  describe('.isReleasedVersion()', () => {
    it('returns false if the version is a SHA and true otherwise', () => {
      let version = '0.1.0';
      spyOn(chevron, 'getVersion').andCallFake(() => version);
      expect(chevron.isReleasedVersion()).toBe(true);
      version = '36b5518';
      expect(chevron.isReleasedVersion()).toBe(false);
    });
  });

  describe('loading default config', () => {
    it('loads the default core config schema', () => {
      expect(chevron.config.get('core.excludeVcsIgnoredPaths')).toBe(true);
      expect(chevron.config.get('core.followSymlinks')).toBe(true);
      expect(chevron.config.get('editor.showInvisibles')).toBe(false);
    });
  });

  describe('window onerror handler', () => {
    let devToolsPromise = null;
    beforeEach(() => {
      devToolsPromise = Promise.resolve();
      spyOn(chevron, 'openDevTools').andReturn(devToolsPromise);
      spyOn(chevron, 'executeJavaScriptInDevTools');
    });

    it('will open the dev tools when an error is triggered', async () => {
      try {
        a + 1; // eslint-disable-line no-undef, no-unused-expressions
      } catch (e) {
        window.onerror(e.toString(), 'abc', 2, 3, e);
      }

      await devToolsPromise;
      expect(chevron.openDevTools).toHaveBeenCalled();
      expect(chevron.executeJavaScriptInDevTools).toHaveBeenCalled();
    });

    describe('::onWillThrowError', () => {
      let willThrowSpy = null;

      beforeEach(() => {
        willThrowSpy = jasmine.createSpy();
      });

      it('is called when there is an error', () => {
        let error = null;
        chevron.onWillThrowError(willThrowSpy);
        try {
          a + 1; // eslint-disable-line no-undef, no-unused-expressions
        } catch (e) {
          error = e;
          window.onerror(e.toString(), 'abc', 2, 3, e);
        }

        delete willThrowSpy.mostRecentCall.args[0].preventDefault;
        expect(willThrowSpy).toHaveBeenCalledWith({
          message: error.toString(),
          url: 'abc',
          line: 2,
          column: 3,
          originalError: error
        });
      });

      it('will not show the devtools when preventDefault() is called', () => {
        willThrowSpy.andCallFake(errorObject => errorObject.preventDefault());
        chevron.onWillThrowError(willThrowSpy);

        try {
          a + 1; // eslint-disable-line no-undef, no-unused-expressions
        } catch (e) {
          window.onerror(e.toString(), 'abc', 2, 3, e);
        }

        expect(willThrowSpy).toHaveBeenCalled();
        expect(chevron.openDevTools).not.toHaveBeenCalled();
        expect(chevron.executeJavaScriptInDevTools).not.toHaveBeenCalled();
      });
    });

    describe('::onDidThrowError', () => {
      let didThrowSpy = null;
      beforeEach(() => (didThrowSpy = jasmine.createSpy()));

      it('is called when there is an error', () => {
        let error = null;
        chevron.onDidThrowError(didThrowSpy);
        try {
          a + 1; // eslint-disable-line no-undef, no-unused-expressions
        } catch (e) {
          error = e;
          window.onerror(e.toString(), 'abc', 2, 3, e);
        }
        expect(didThrowSpy).toHaveBeenCalledWith({
          message: error.toString(),
          url: 'abc',
          line: 2,
          column: 3,
          originalError: error
        });
      });
    });
  });

  describe('.assert(condition, message, callback)', () => {
    let errors = null;

    beforeEach(() => {
      errors = [];
      spyOn(chevron, 'isReleasedVersion').andReturn(true);
      chevron.onDidFailAssertion(error => errors.push(error));
    });

    describe('if the condition is false', () => {
      it('notifies onDidFailAssertion handlers with an error object based on the call site of the assertion', () => {
        const result = chevron.assert(false, 'a == b');
        expect(result).toBe(false);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('Assertion failed: a == b');
        expect(errors[0].stack).toContain('chevron-environment-spec');
      });

      describe('if passed a callback function', () => {
        it("calls the callback with the assertion failure's error object", () => {
          let error = null;
          chevron.assert(false, 'a == b', e => (error = e));
          expect(error).toBe(errors[0]);
        });
      });

      describe('if passed metadata', () => {
        it("assigns the metadata on the assertion failure's error object", () => {
          chevron.assert(false, 'a == b', { foo: 'bar' });
          expect(errors[0].metadata).toEqual({ foo: 'bar' });
        });
      });

      describe('when Atom has been built from source', () => {
        it('throws an error', () => {
          chevron.isReleasedVersion.andReturn(false);
          expect(() => chevron.assert(false, 'testing')).toThrow(
            'Assertion failed: testing'
          );
        });
      });
    });

    describe('if the condition is true', () => {
      it('does nothing', () => {
        const result = chevron.assert(true, 'a == b');
        expect(result).toBe(true);
        expect(errors).toEqual([]);
      });
    });
  });

  describe('saving and loading', () => {
    beforeEach(() => (chevron.enablePersistence = true));

    afterEach(() => (chevron.enablePersistence = false));

    it('selects the state based on the current project paths', async () => {
      jasmine.useRealClock();

      const [dir1, dir2] = [temp.mkdirSync('dir1-'), temp.mkdirSync('dir2-')];

      const loadSettings = Object.assign(chevron.getLoadSettings(), {
        initialProjectRoots: [dir1],
        windowState: null
      });

      spyOn(chevron, 'getLoadSettings').andCallFake(() => loadSettings);
      spyOn(chevron, 'serialize').andReturn({ stuff: 'cool' });

      chevron.project.setPaths([dir1, dir2]);

      // State persistence will fail if other Atom instances are running
      expect(await chevron.stateStore.connect()).toBe(true);

      await chevron.saveState();
      expect(await chevron.loadState()).toBeFalsy();

      loadSettings.initialProjectRoots = [dir2, dir1];
      expect(await chevron.loadState()).toEqual({ stuff: 'cool' });
    });

    it('saves state when the CPU is idle after a keydown or mousedown event', () => {
      const atomEnv = new ChevronEnvironment({
        applicationDelegate: global.chevron.applicationDelegate
      });
      const idleCallbacks = [];
      atomEnv.initialize({
        window: {
          requestIdleCallback(callback) {
            idleCallbacks.push(callback);
          },
          addEventListener() {},
          removeEventListener() {}
        },
        document: document.implementation.createHTMLDocument()
      });

      spyOn(atomEnv, 'saveState');

      const keydown = new KeyboardEvent('keydown');
      atomEnv.document.dispatchEvent(keydown);
      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState).toHaveBeenCalledWith({ isUnloading: false });
      expect(atomEnv.saveState).not.toHaveBeenCalledWith({ isUnloading: true });

      atomEnv.saveState.reset();
      const mousedown = new MouseEvent('mousedown');
      atomEnv.document.dispatchEvent(mousedown);
      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState).toHaveBeenCalledWith({ isUnloading: false });
      expect(atomEnv.saveState).not.toHaveBeenCalledWith({ isUnloading: true });

      atomEnv.destroy();
    });

    it('ignores mousedown/keydown events happening after calling prepareToUnloadEditorWindow', async () => {
      const atomEnv = new ChevronEnvironment({
        applicationDelegate: global.chevron.applicationDelegate
      });
      const idleCallbacks = [];
      atomEnv.initialize({
        window: {
          requestIdleCallback(callback) {
            idleCallbacks.push(callback);
          },
          addEventListener() {},
          removeEventListener() {}
        },
        document: document.implementation.createHTMLDocument()
      });

      spyOn(atomEnv, 'saveState');

      let mousedown = new MouseEvent('mousedown');
      atomEnv.document.dispatchEvent(mousedown);
      expect(atomEnv.saveState).not.toHaveBeenCalled();
      await atomEnv.prepareToUnloadEditorWindow();
      expect(atomEnv.saveState).toHaveBeenCalledWith({ isUnloading: true });

      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState.calls.length).toBe(1);

      mousedown = new MouseEvent('mousedown');
      atomEnv.document.dispatchEvent(mousedown);
      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState.calls.length).toBe(1);

      atomEnv.destroy();
    });

    it('serializes the project state with all the options supplied in saveState', async () => {
      spyOn(chevron.project, 'serialize').andReturn({ foo: 42 });

      await chevron.saveState({ anyOption: 'any option' });
      expect(chevron.project.serialize.calls.length).toBe(1);
      expect(chevron.project.serialize.mostRecentCall.args[0]).toEqual({
        anyOption: 'any option'
      });
    });

    it('serializes the text editor registry', async () => {
      await chevron.packages.activatePackage('language-json');
      const editor = await chevron.workspace.open('sample.js');
      expect(chevron.grammars.assignLanguageMode(editor, 'source.json')).toBe(true);

      const atom2 = new ChevronEnvironment({
        applicationDelegate: chevron.applicationDelegate,
        window: document.createElement('div'),
        document: Object.assign(document.createElement('div'), {
          body: document.createElement('div'),
          head: document.createElement('div')
        })
      });
      atom2.initialize({ document, window });

      await atom2.deserialize(chevron.serialize());
      await atom2.packages.activatePackage('language-json');
      const editor2 = atom2.workspace.getActiveTextEditor();
      expect(
        editor2
          .getBuffer()
          .getLanguageMode()
          .getLanguageId()
      ).toBe('source.json');
      atom2.destroy();
    });

    describe('deserialization failures', () => {
      it('propagates unrecognized project state restoration failures', async () => {
        let err;
        spyOn(chevron.project, 'deserialize').andCallFake(() => {
          err = new Error('deserialization failure');
          return Promise.reject(err);
        });
        spyOn(chevron.notifications, 'addError');

        await chevron.deserialize({ project: 'should work' });
        expect(chevron.notifications.addError).toHaveBeenCalledWith(
          'Unable to deserialize project',
          {
            description: 'deserialization failure',
            stack: err.stack
          }
        );
      });

      it('disregards missing project folder errors', async () => {
        spyOn(chevron.project, 'deserialize').andCallFake(() => {
          const err = new Error('deserialization failure');
          err.missingProjectPaths = ['nah'];
          return Promise.reject(err);
        });
        spyOn(chevron.notifications, 'addError');

        await chevron.deserialize({ project: 'should work' });
        expect(chevron.notifications.addError).not.toHaveBeenCalled();
      });
    });
  });

  describe('openInitialEmptyEditorIfNecessary', () => {
    describe('when there are no paths set', () => {
      beforeEach(() =>
        spyOn(chevron, 'getLoadSettings').andReturn({ hasOpenFiles: false })
      );

      it('opens an empty buffer', () => {
        chevron.config.set('welcome.showOnStartup', false);
        spyOn(chevron.workspace, 'open');
        chevron.openInitialEmptyEditorIfNecessary();
        expect(chevron.workspace.open).toHaveBeenCalledWith(null, {
          pending: true
        });
      });

      it('does not open an empty buffer when a buffer is already open', async () => {
        await chevron.workspace.open();
        spyOn(chevron.workspace, 'open');
        chevron.openInitialEmptyEditorIfNecessary();
        expect(chevron.workspace.open).not.toHaveBeenCalled();
      });

      it('does not open an empty buffer when core.openEmptyEditorOnStart is false', async () => {
        chevron.config.set('core.openEmptyEditorOnStart', false);
        spyOn(chevron.workspace, 'open');
        chevron.openInitialEmptyEditorIfNecessary();
        expect(chevron.workspace.open).not.toHaveBeenCalled();
      });

      it('does not open an empty buffer when Welcome will auto-open', () => {
        chevron.config.set('welcome.showOnStartup', true);
        spyOn(chevron.workspace, 'open');
        chevron.openInitialEmptyEditorIfNecessary();
        expect(chevron.workspace.open).not.toHaveBeenCalled();
      });
    });

    describe('when the project has a path', () => {
      beforeEach(() => {
        spyOn(chevron, 'getLoadSettings').andReturn({ hasOpenFiles: true });
        spyOn(chevron.workspace, 'open');
      });

      it('does not open an empty buffer', () => {
        chevron.openInitialEmptyEditorIfNecessary();
        expect(chevron.workspace.open).not.toHaveBeenCalled();
      });
    });
  });

  describe('adding a project folder', () => {
    it('does nothing if the user dismisses the file picker', () => {
      const projectRoots = chevron.project.getPaths();
      spyOn(chevron, 'pickFolder').andCallFake(callback => callback(null));
      chevron.addProjectFolder();
      expect(chevron.project.getPaths()).toEqual(projectRoots);
    });

    describe('when there is no saved state for the added folders', () => {
      beforeEach(() => {
        spyOn(chevron, 'loadState').andReturn(Promise.resolve(null));
        spyOn(chevron, 'attemptRestoreProjectStateForPaths');
      });

      it('adds the selected folder to the project', async () => {
        chevron.project.setPaths([]);
        const tempDirectory = temp.mkdirSync('a-new-directory');
        spyOn(chevron, 'pickFolder').andCallFake(callback =>
          callback([tempDirectory])
        );
        await chevron.addProjectFolder();
        expect(chevron.project.getPaths()).toEqual([tempDirectory]);
        expect(chevron.attemptRestoreProjectStateForPaths).not.toHaveBeenCalled();
      });
    });

    describe('when there is saved state for the relevant directories', () => {
      const state = Symbol('savedState');

      beforeEach(() => {
        spyOn(chevron, 'getStateKey').andCallFake(dirs => dirs.join(':'));
        spyOn(chevron, 'loadState').andCallFake(async key =>
          key === __dirname ? state : null
        );
        spyOn(chevron, 'attemptRestoreProjectStateForPaths');
        spyOn(chevron, 'pickFolder').andCallFake(callback =>
          callback([__dirname])
        );
        chevron.project.setPaths([]);
      });

      describe('when there are no project folders', () => {
        it('attempts to restore the project state', async () => {
          await chevron.addProjectFolder();
          expect(chevron.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(
            state,
            [__dirname]
          );
          expect(chevron.project.getPaths()).toEqual([]);
        });
      });

      describe('when there are already project folders', () => {
        const openedPath = path.join(__dirname, 'fixtures');

        beforeEach(() => chevron.project.setPaths([openedPath]));

        it('does not attempt to restore the project state, instead adding the project paths', async () => {
          await chevron.addProjectFolder();
          expect(
            chevron.attemptRestoreProjectStateForPaths
          ).not.toHaveBeenCalled();
          expect(chevron.project.getPaths()).toEqual([openedPath, __dirname]);
        });
      });
    });
  });

  describe('attemptRestoreProjectStateForPaths(state, projectPaths, filesToOpen)', () => {
    describe('when the window is clean (empty or has only unnamed, unmodified buffers)', () => {
      beforeEach(async () => {
        // Unnamed, unmodified buffer doesn't count toward "clean"-ness
        await chevron.workspace.open();
      });

      it('automatically restores the saved state into the current environment', async () => {
        const projectPath = temp.mkdirSync();
        const filePath1 = path.join(projectPath, 'file-1');
        const filePath2 = path.join(projectPath, 'file-2');
        const filePath3 = path.join(projectPath, 'file-3');
        fs.writeFileSync(filePath1, 'abc');
        fs.writeFileSync(filePath2, 'def');
        fs.writeFileSync(filePath3, 'ghi');

        const env1 = new ChevronEnvironment({
          applicationDelegate: chevron.applicationDelegate
        });
        env1.project.setPaths([projectPath]);
        await env1.workspace.open(filePath1);
        await env1.workspace.open(filePath2);
        await env1.workspace.open(filePath3);
        const env1State = env1.serialize();
        env1.destroy();

        const env2 = new ChevronEnvironment({
          applicationDelegate: chevron.applicationDelegate
        });
        await env2.attemptRestoreProjectStateForPaths(
          env1State,
          [projectPath],
          [filePath2]
        );
        const restoredURIs = env2.workspace.getPaneItems().map(p => p.getURI());
        expect(restoredURIs).toEqual([filePath1, filePath2, filePath3]);
        env2.destroy();
      });

      describe('when a dock has a non-text editor', () => {
        it("doesn't prompt the user to restore state", () => {
          const dock = chevron.workspace.getLeftDock();
          dock.getActivePane().addItem({
            getTitle() {
              return 'title';
            },
            element: document.createElement('div')
          });
          const state = {};
          spyOn(chevron, 'confirm');
          chevron.attemptRestoreProjectStateForPaths(
            state,
            [__dirname],
            [__filename]
          );
          expect(chevron.confirm).not.toHaveBeenCalled();
        });
      });
    });

    describe('when the window is dirty', () => {
      let editor;

      beforeEach(async () => {
        editor = await chevron.workspace.open();
        editor.setText('new editor');
      });

      describe('when a dock has a modified editor', () => {
        it('prompts the user to restore the state', () => {
          const dock = chevron.workspace.getLeftDock();
          dock.getActivePane().addItem(editor);
          spyOn(chevron, 'confirm').andReturn(1);
          spyOn(chevron.project, 'addPath');
          spyOn(chevron.workspace, 'open');
          const state = Symbol('state');
          chevron.attemptRestoreProjectStateForPaths(
            state,
            [__dirname],
            [__filename]
          );
          expect(chevron.confirm).toHaveBeenCalled();
        });
      });

      it('prompts the user to restore the state in a new window, discarding it and adding folder to current window', async () => {
        jasmine.useRealClock();
        spyOn(chevron, 'confirm').andCallFake((options, callback) => callback(1));
        spyOn(chevron.project, 'addPath');
        spyOn(chevron.workspace, 'open');
        const state = Symbol('state');

        chevron.attemptRestoreProjectStateForPaths(
          state,
          [__dirname],
          [__filename]
        );
        expect(chevron.confirm).toHaveBeenCalled();
        await conditionPromise(() => chevron.project.addPath.callCount === 1);

        expect(chevron.project.addPath).toHaveBeenCalledWith(__dirname);
        expect(chevron.workspace.open.callCount).toBe(1);
        expect(chevron.workspace.open).toHaveBeenCalledWith(__filename);
      });

      it('prompts the user to restore the state in a new window, opening a new window', async () => {
        jasmine.useRealClock();
        spyOn(chevron, 'confirm').andCallFake((options, callback) => callback(0));
        spyOn(chevron, 'open');
        const state = Symbol('state');

        chevron.attemptRestoreProjectStateForPaths(
          state,
          [__dirname],
          [__filename]
        );
        expect(chevron.confirm).toHaveBeenCalled();
        await conditionPromise(() => chevron.open.callCount === 1);
        expect(chevron.open).toHaveBeenCalledWith({
          pathsToOpen: [__dirname, __filename],
          newWindow: true,
          devMode: chevron.inDevMode(),
          safeMode: chevron.inSafeMode()
        });
      });
    });
  });

  describe('::unloadEditorWindow()', () => {
    it('saves the BlobStore so it can be loaded after reload', () => {
      const configDirPath = temp.mkdirSync('atom-spec-environment');
      const fakeBlobStore = jasmine.createSpyObj('blob store', ['save']);
      const atomEnvironment = new ChevronEnvironment({
        applicationDelegate: chevron.applicationDelegate,
        enablePersistence: true
      });
      atomEnvironment.initialize({
        configDirPath,
        blobStore: fakeBlobStore,
        window,
        document
      });

      atomEnvironment.unloadEditorWindow();

      expect(fakeBlobStore.save).toHaveBeenCalled();

      atomEnvironment.destroy();
    });
  });

  describe('::destroy()', () => {
    it('does not throw exceptions when unsubscribing from ipc events (regression)', async () => {
      const fakeDocument = {
        addEventListener() {},
        removeEventListener() {},
        head: document.createElement('head'),
        body: document.createElement('body')
      };
      const atomEnvironment = new ChevronEnvironment({
        applicationDelegate: chevron.applicationDelegate
      });
      atomEnvironment.initialize({ window, document: fakeDocument });
      spyOn(atomEnvironment.packages, 'loadPackages').andReturn(
        Promise.resolve()
      );
      spyOn(atomEnvironment.packages, 'activate').andReturn(Promise.resolve());
      spyOn(atomEnvironment, 'displayWindow').andReturn(Promise.resolve());
      await atomEnvironment.startEditorWindow();
      atomEnvironment.unloadEditorWindow();
      atomEnvironment.destroy();
    });
  });

  describe('::whenShellEnvironmentLoaded()', () => {
    let atomEnvironment, envLoaded, spy;

    beforeEach(() => {
      let resolvePromise = null;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      envLoaded = () => {
        resolvePromise();
        return promise;
      };
      atomEnvironment = new ChevronEnvironment({
        applicationDelegate: chevron.applicationDelegate,
        updateProcessEnv() {
          return promise;
        }
      });
      atomEnvironment.initialize({ window, document });
      spy = jasmine.createSpy();
    });

    afterEach(() => atomEnvironment.destroy());

    it('is triggered once the shell environment is loaded', async () => {
      atomEnvironment.whenShellEnvironmentLoaded(spy);
      atomEnvironment.updateProcessEnvAndTriggerHooks();
      await envLoaded();
      expect(spy).toHaveBeenCalled();
    });

    it('triggers the callback immediately if the shell environment is already loaded', async () => {
      atomEnvironment.updateProcessEnvAndTriggerHooks();
      await envLoaded();
      atomEnvironment.whenShellEnvironmentLoaded(spy);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('::openLocations(locations)', () => {
    beforeEach(() => {
      chevron.project.setPaths([]);
    });

    describe('when there is no saved state', () => {
      beforeEach(() => {
        spyOn(chevron, 'loadState').andReturn(Promise.resolve(null));
      });

      describe('when the opened path exists', () => {
        it('opens a file', async () => {
          const pathToOpen = __filename;
          await chevron.openLocations([
            { pathToOpen, exists: true, isFile: true }
          ]);
          expect(chevron.project.getPaths()).toEqual([]);
        });

        it('opens a directory as a project folder', async () => {
          const pathToOpen = __dirname;
          await chevron.openLocations([
            { pathToOpen, exists: true, isDirectory: true }
          ]);
          expect(chevron.workspace.getTextEditors().map(e => e.getPath())).toEqual(
            []
          );
          expect(chevron.project.getPaths()).toEqual([pathToOpen]);
        });
      });

      describe('when the opened path does not exist', () => {
        it('opens it as a new file', async () => {
          const pathToOpen = path.join(
            __dirname,
            'this-path-does-not-exist.txt'
          );
          await chevron.openLocations([{ pathToOpen, exists: false }]);
          expect(chevron.workspace.getTextEditors().map(e => e.getPath())).toEqual(
            [pathToOpen]
          );
          expect(chevron.project.getPaths()).toEqual([]);
        });

        it('may be required to be an existing directory', async () => {
          spyOn(chevron.notifications, 'addWarning');

          const nonExistent = path.join(__dirname, 'no');
          const existingFile = __filename;
          const existingDir = path.join(__dirname, 'fixtures');

          await chevron.openLocations([
            { pathToOpen: nonExistent, isDirectory: true },
            { pathToOpen: existingFile, isDirectory: true },
            { pathToOpen: existingDir, isDirectory: true }
          ]);

          expect(chevron.workspace.getTextEditors()).toEqual([]);
          expect(chevron.project.getPaths()).toEqual([existingDir]);

          expect(chevron.notifications.addWarning).toHaveBeenCalledWith(
            'Unable to open project folders',
            {
              description: `The directories \`${nonExistent}\` and \`${existingFile}\` do not exist.`
            }
          );
        });
      });

      describe('when the opened path is handled by a registered directory provider', () => {
        let serviceDisposable;

        beforeEach(async () => {
          jasmine.useRealClock();
          serviceDisposable = chevron.packages.serviceHub.provide(
            'atom.directory-provider',
            '0.1.0',
            {
              directoryForURISync(uri) {
                if (uri.startsWith('remote://')) {
                  return {
                    getPath() {
                      return uri;
                    }
                  };
                } else {
                  return null;
                }
              }
            }
          );

          await conditionPromise(
            () => chevron.project.directoryProviders.length > 0
          );
        });

        afterEach(() => {
          serviceDisposable.dispose();
        });

        it("adds it to the project's paths as is", async () => {
          const pathToOpen = 'remote://server:7644/some/dir/path';
          spyOn(chevron.project, 'addPath');
          await chevron.openLocations([{ pathToOpen }]);
          expect(chevron.project.addPath).toHaveBeenCalledWith(pathToOpen);
        });
      });
    });

    describe('when there is saved state for the relevant directories', () => {
      const state = Symbol('savedState');

      beforeEach(() => {
        spyOn(chevron, 'getStateKey').andCallFake(dirs => dirs.join(':'));
        spyOn(chevron, 'loadState').andCallFake(function(key) {
          if (key === __dirname) {
            return Promise.resolve(state);
          } else {
            return Promise.resolve(null);
          }
        });
        spyOn(chevron, 'attemptRestoreProjectStateForPaths');
      });

      describe('when there are no project folders', () => {
        it('attempts to restore the project state', async () => {
          const pathToOpen = __dirname;
          await chevron.openLocations([{ pathToOpen, isDirectory: true }]);
          expect(chevron.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(
            state,
            [pathToOpen],
            []
          );
          expect(chevron.project.getPaths()).toEqual([]);
        });

        it('includes missing mandatory project folders in computation of initial state key', async () => {
          const existingDir = path.join(__dirname, 'fixtures');
          const missingDir = path.join(__dirname, 'no');

          chevron.loadState.andCallFake(function(key) {
            if (key === `${existingDir}:${missingDir}`) {
              return Promise.resolve(state);
            } else {
              return Promise.resolve(null);
            }
          });

          await chevron.openLocations([
            { pathToOpen: existingDir },
            { pathToOpen: missingDir, isDirectory: true }
          ]);

          expect(chevron.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(
            state,
            [existingDir],
            []
          );
          expect(chevron.project.getPaths(), [existingDir]);
        });

        it('opens the specified files', async () => {
          await chevron.openLocations([
            { pathToOpen: __dirname, isDirectory: true },
            { pathToOpen: __filename }
          ]);
          expect(chevron.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(
            state,
            [__dirname],
            [__filename]
          );
          expect(chevron.project.getPaths()).toEqual([]);
        });
      });

      describe('when there are already project folders', () => {
        beforeEach(() => chevron.project.setPaths([__dirname]));

        it('does not attempt to restore the project state, instead adding the project paths', async () => {
          const pathToOpen = path.join(__dirname, 'fixtures');
          await chevron.openLocations([
            { pathToOpen, exists: true, isDirectory: true }
          ]);
          expect(
            chevron.attemptRestoreProjectStateForPaths
          ).not.toHaveBeenCalled();
          expect(chevron.project.getPaths()).toEqual([__dirname, pathToOpen]);
        });

        it('opens the specified files', async () => {
          const pathToOpen = path.join(__dirname, 'fixtures');
          const fileToOpen = path.join(pathToOpen, 'michelle-is-awesome.txt');
          await chevron.openLocations([
            { pathToOpen, exists: true, isDirectory: true },
            { pathToOpen: fileToOpen, exists: true, isFile: true }
          ]);
          expect(
            chevron.attemptRestoreProjectStateForPaths
          ).not.toHaveBeenCalledWith(state, [pathToOpen], [fileToOpen]);
          expect(chevron.project.getPaths()).toEqual([__dirname, pathToOpen]);
        });
      });
    });
  });

  describe('::getReleaseChannel()', () => {
    let version;

    beforeEach(() => {
      spyOn(chevron, 'getVersion').andCallFake(() => version);
    });

    it('returns the correct channel based on the version number', () => {
      version = '1.5.6';
      expect(chevron.getReleaseChannel()).toBe('stable');

      version = '1.5.0-beta10';
      expect(chevron.getReleaseChannel()).toBe('beta');

      version = '1.7.0-dev-5340c91';
      expect(chevron.getReleaseChannel()).toBe('dev');
    });
  });
});
