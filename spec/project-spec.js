const temp = require('temp').track();
const TextBuffer = require('text-buffer');
const Project = require('../src/project');
const fs = require('fs-plus');
const path = require('path');
const { Directory } = require('pathwatcher');
const { stopAllWatchers } = require('../src/path-watcher');
const GitRepository = require('../src/git-repository');
const { conditionPromise, timeoutPromise } = require('./async-spec-helpers');

describe('Project', () => {
  beforeEach(async () => {
    const directory = chevron.project.getDirectories()[0];
    const paths = directory ? [directory.resolve('dir')] : [null];
    chevron.project.setPaths(paths);

    // Wait for project's service consumers to be asynchronously added
    jasmine.useRealClock();
    await timeoutPromise(1);
  });

  describe('serialization', () => {
    let deserializedProject = null;
    let notQuittingProject = null;
    let quittingProject = null;

    afterEach(() => {
      if (deserializedProject != null) {
        deserializedProject.destroy();
      }
      if (notQuittingProject != null) {
        notQuittingProject.destroy();
      }
      if (quittingProject != null) {
        quittingProject.destroy();
      }
    });

    it("does not deserialize paths to directories that don't exist", async () => {
      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });
      const state = chevron.project.serialize();
      state.paths.push('/directory/that/does/not/exist');

      let err = null;
      await deserializedProject
        .deserialize(state, chevron.deserializers)
        .catch(e => {
          err = e;
        });

      expect(deserializedProject.getPaths()).toEqual(chevron.project.getPaths());
      expect(err.missingProjectPaths).toEqual([
        '/directory/that/does/not/exist'
      ]);
    });

    it('does not deserialize paths that are now files', async () => {
      const childPath = path.join(temp.mkdirSync('atom-spec-project'), 'child');
      fs.mkdirSync(childPath);

      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });
      chevron.project.setPaths([childPath]);
      const state = chevron.project.serialize();

      fs.rmdirSync(childPath);
      fs.writeFileSync(childPath, 'surprise!\n');

      let err = null;
      await deserializedProject
        .deserialize(state, chevron.deserializers)
        .catch(e => {
          err = e;
        });

      expect(deserializedProject.getPaths()).toEqual([]);
      expect(err.missingProjectPaths).toEqual([childPath]);
    });

    it('does not include unretained buffers in the serialized state', async () => {
      await chevron.project.bufferForPath('a');
      expect(chevron.project.getBuffers().length).toBe(1);

      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(deserializedProject.getBuffers().length).toBe(0);
    });

    it('keeps buffers in large-file mode, unparsed, across serialization', async () => {
      await chevron.packages.activatePackage('language-javascript');
      const buffer = await chevron.project.bufferForPath(
        require.resolve('./fixtures/sample.js'),
        { largeFileMode: true }
      );
      buffer.retain();

      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });
      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );

      const restored = deserializedProject.getBuffers()[0];
      expect(deserializedProject.isLargeFileBuffer(restored)).toBe(true);
      expect(restored.getLanguageMode().grammar.scopeName).toBe(
        'text.plain.null-grammar'
      );
      buffer.release();
    });

    it('listens for destroyed events on deserialized buffers and removes them when they are destroyed', async () => {
      await chevron.workspace.open('a');
      expect(chevron.project.getBuffers().length).toBe(1);
      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(deserializedProject.getBuffers().length).toBe(1);
      deserializedProject.getBuffers()[0].destroy();
      expect(deserializedProject.getBuffers().length).toBe(0);
    });

    it('does not deserialize buffers when their path is now a directory', async () => {
      const pathToOpen = path.join(
        temp.mkdirSync('atom-spec-project'),
        'file.txt'
      );

      await chevron.workspace.open(pathToOpen);
      expect(chevron.project.getBuffers().length).toBe(1);
      fs.mkdirSync(pathToOpen);
      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(deserializedProject.getBuffers().length).toBe(0);
    });

    it('does not deserialize buffers when their path is inaccessible', async () => {
      if (process.platform === 'win32') {
        return;
      } // chmod not supported on win32
      const pathToOpen = path.join(
        temp.mkdirSync('atom-spec-project'),
        'file.txt'
      );
      fs.writeFileSync(pathToOpen, '');

      await chevron.workspace.open(pathToOpen);
      expect(chevron.project.getBuffers().length).toBe(1);
      fs.chmodSync(pathToOpen, '000');
      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(deserializedProject.getBuffers().length).toBe(0);
    });

    it('does not deserialize buffers with their path is no longer present', async () => {
      const pathToOpen = path.join(
        temp.mkdirSync('atom-spec-project'),
        'file.txt'
      );
      fs.writeFileSync(pathToOpen, '');

      await chevron.workspace.open(pathToOpen);
      expect(chevron.project.getBuffers().length).toBe(1);
      fs.unlinkSync(pathToOpen);
      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(deserializedProject.getBuffers().length).toBe(0);
    });

    it('deserializes buffers that have never been saved before', async () => {
      const pathToOpen = path.join(
        temp.mkdirSync('atom-spec-project'),
        'file.txt'
      );

      await chevron.workspace.open(pathToOpen);
      chevron.workspace.getActiveTextEditor().setText('unsaved\n');
      expect(chevron.project.getBuffers().length).toBe(1);

      deserializedProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await deserializedProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(deserializedProject.getBuffers().length).toBe(1);
      expect(deserializedProject.getBuffers()[0].getPath()).toBe(pathToOpen);
      expect(deserializedProject.getBuffers()[0].getText()).toBe('unsaved\n');
    });

    it('serializes marker layers and history only if Atom is quitting', async () => {
      await chevron.workspace.open('a');

      const bufferA = chevron.project.getBuffers()[0];
      const layerA = bufferA.addMarkerLayer({ persistent: true });
      const markerA = layerA.markPosition([0, 3]);
      bufferA.append('!');
      notQuittingProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await notQuittingProject.deserialize(
        chevron.project.serialize({ isUnloading: false })
      );
      expect(
        notQuittingProject.getBuffers()[0].getMarkerLayer(layerA.id),
        x => x.getMarker(markerA.id)
      ).toBeUndefined();
      expect(notQuittingProject.getBuffers()[0].undo()).toBe(false);
      quittingProject = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm,
        grammarRegistry: chevron.grammars
      });

      await quittingProject.deserialize(
        chevron.project.serialize({ isUnloading: true })
      );
      expect(quittingProject.getBuffers()[0].getMarkerLayer(layerA.id), x =>
        x.getMarker(markerA.id)
      ).not.toBeUndefined();
      expect(quittingProject.getBuffers()[0].undo()).toBe(true);
    });
  });

  describe('when an editor is saved and the project has no path', () => {
    it("sets the project's path to the saved file's parent directory", async () => {
      const tempFile = temp.openSync().path;
      chevron.project.setPaths([]);
      expect(chevron.project.getPaths()[0]).toBeUndefined();

      const editor = await chevron.workspace.open();
      await editor.saveAs(tempFile);
      expect(chevron.project.getPaths()[0]).toBe(path.dirname(tempFile));
    });
  });

  describe('.replace', () => {
    let projectSpecification, projectPath1, projectPath2;
    beforeEach(() => {
      chevron.project.replace(null);
      projectPath1 = temp.mkdirSync('project-path1');
      projectPath2 = temp.mkdirSync('project-path2');
      projectSpecification = {
        paths: [projectPath1, projectPath2],
        originPath: 'originPath',
        config: {
          baz: 'buzz'
        }
      };
    });
    it('sets a project specification', () => {
      expect(chevron.config.get('baz')).toBeUndefined();
      chevron.project.replace(projectSpecification);
      expect(chevron.project.getPaths()).toEqual([projectPath1, projectPath2]);
      expect(chevron.config.get('baz')).toBe('buzz');
    });

    it('clears a project through replace with no params', () => {
      expect(chevron.config.get('baz')).toBeUndefined();
      chevron.project.replace(projectSpecification);
      expect(chevron.config.get('baz')).toBe('buzz');
      expect(chevron.project.getPaths()).toEqual([projectPath1, projectPath2]);
      chevron.project.replace();
      expect(chevron.config.get('baz')).toBeUndefined();
      expect(chevron.project.getPaths()).toEqual([]);
    });

    it('responds to change of project specification', () => {
      let wasCalled = false;
      const callback = () => {
        wasCalled = true;
      };
      chevron.project.onDidReplace(callback);
      chevron.project.replace(projectSpecification);
      expect(wasCalled).toBe(true);
      wasCalled = false;
      chevron.project.replace();
      expect(wasCalled).toBe(true);
    });
  });

  describe('before and after saving a buffer', () => {
    let buffer;
    beforeEach(async () => {
      buffer = await chevron.project.bufferForPath(
        path.join(__dirname, 'fixtures', 'sample.js')
      );
      buffer.retain();
    });

    afterEach(() => buffer.release());

    it('emits save events on the main process', async () => {
      spyOn(chevron.project.applicationDelegate, 'emitDidSavePath');
      spyOn(chevron.project.applicationDelegate, 'emitWillSavePath');

      await buffer.save();
      expect(chevron.project.applicationDelegate.emitDidSavePath.calls.length).toBe(
        1
      );
      expect(
        chevron.project.applicationDelegate.emitDidSavePath
      ).toHaveBeenCalledWith(buffer.getPath());
      expect(
        chevron.project.applicationDelegate.emitWillSavePath.calls.length
      ).toBe(1);
      expect(
        chevron.project.applicationDelegate.emitWillSavePath
      ).toHaveBeenCalledWith(buffer.getPath());
    });
  });

  describe('when a watch error is thrown from the TextBuffer', () => {
    let editor = null;
    beforeEach(async () => {
      editor = await chevron.workspace.open(require.resolve('./fixtures/dir/a'));
    });

    it('creates a warning notification', () => {
      let noteSpy;
      chevron.notifications.onDidAddNotification((noteSpy = jasmine.createSpy()));

      const error = new Error('SomeError');
      error.eventType = 'resurrect';
      editor.buffer.emitter.emit('will-throw-watch-error', {
        handle: jasmine.createSpy(),
        error
      });

      expect(noteSpy).toHaveBeenCalled();

      const notification = noteSpy.mostRecentCall.args[0];
      expect(notification.getType()).toBe('warning');
      expect(notification.getDetail()).toBe('SomeError');
      expect(notification.getMessage()).toContain('`resurrect`');
      expect(notification.getMessage()).toContain(
        path.join('fixtures', 'dir', 'a')
      );
    });
  });

  describe('when a custom repository-provider service is provided', () => {
    let fakeRepositoryProvider, fakeRepository;

    beforeEach(() => {
      fakeRepository = {
        destroy() {
          return null;
        }
      };
      fakeRepositoryProvider = {
        repositoryForDirectory(directory) {
          return Promise.resolve(fakeRepository);
        },
        repositoryForDirectorySync(directory) {
          return fakeRepository;
        }
      };
    });

    it('uses it to create repositories for any directories that need one', async () => {
      const projectPath = temp.mkdirSync('atom-project');
      chevron.project.setPaths([projectPath]);
      expect(chevron.project.getRepositories()).toEqual([null]);

      chevron.packages.serviceHub.provide(
        'atom.repository-provider',
        '0.1.0',
        fakeRepositoryProvider
      );
      await conditionPromise(
        () => chevron.project.repositoryProviders.length > 1
      );
      chevron.project.getRepositories()[0] === fakeRepository;
    });

    it('does not create any new repositories if every directory has a repository', async () => {
      const repositories = chevron.project.getRepositories();
      expect(repositories.length).toEqual(1);
      expect(repositories[0]).toBeTruthy();

      chevron.packages.serviceHub.provide(
        'atom.repository-provider',
        '0.1.0',
        fakeRepositoryProvider
      );
      await conditionPromise(
        () => chevron.project.repositoryProviders.length > 1
      );
      expect(chevron.project.getRepositories()).toBe(repositories);
    });

    it('stops using it to create repositories when the service is removed', async () => {
      chevron.project.setPaths([]);

      const disposable = chevron.packages.serviceHub.provide(
        'atom.repository-provider',
        '0.1.0',
        fakeRepositoryProvider
      );
      await conditionPromise(
        () => chevron.project.repositoryProviders.length > 1
      );
      disposable.dispose();
      chevron.project.addPath(temp.mkdirSync('atom-project'));
      expect(chevron.project.getRepositories()).toEqual([null]);
    });
  });

  describe('when a custom directory-provider service is provided', () => {
    class DummyDirectory {
      constructor(aPath) {
        this.path = aPath;
      }
      getPath() {
        return this.path;
      }
      getFile() {
        return {
          existsSync() {
            return false;
          }
        };
      }
      getSubdirectory() {
        return {
          existsSync() {
            return false;
          }
        };
      }
      isRoot() {
        return true;
      }
      existsSync() {
        return this.path.endsWith('does-exist');
      }
      contains(filePath) {
        return filePath.startsWith(this.path);
      }
      onDidChangeFiles(callback) {
        onDidChangeFilesCallback = callback;
        return { dispose: () => {} };
      }
    }

    let serviceDisposable = null;
    let onDidChangeFilesCallback = null;

    beforeEach(async () => {
      serviceDisposable = chevron.packages.serviceHub.provide(
        'atom.directory-provider',
        '0.1.0',
        {
          directoryForURISync(uri) {
            if (uri.startsWith('ssh://')) {
              return new DummyDirectory(uri);
            } else {
              return null;
            }
          }
        }
      );
      onDidChangeFilesCallback = null;

      await conditionPromise(() => chevron.project.directoryProviders.length > 0);
    });

    it("uses the provider's custom directories for any paths that it handles", () => {
      const localPath = temp.mkdirSync('local-path');
      const remotePath = 'ssh://foreign-directory:8080/does-exist';

      chevron.project.setPaths([localPath, remotePath]);

      let directories = chevron.project.getDirectories();
      expect(directories[0].getPath()).toBe(localPath);
      expect(directories[0] instanceof Directory).toBe(true);
      expect(directories[1].getPath()).toBe(remotePath);
      expect(directories[1] instanceof DummyDirectory).toBe(true);

      // It does not add new remote paths that do not exist
      const nonExistentRemotePath =
        'ssh://another-directory:8080/does-not-exist';
      chevron.project.addPath(nonExistentRemotePath);
      expect(chevron.project.getDirectories().length).toBe(2);

      // It adds new remote paths if their directories exist.
      const newRemotePath = 'ssh://another-directory:8080/does-exist';
      chevron.project.addPath(newRemotePath);
      directories = chevron.project.getDirectories();
      expect(directories[2].getPath()).toBe(newRemotePath);
      expect(directories[2] instanceof DummyDirectory).toBe(true);
    });

    it('stops using the provider when the service is removed', () => {
      serviceDisposable.dispose();
      chevron.project.setPaths(['ssh://foreign-directory:8080/does-exist']);
      expect(chevron.project.getDirectories().length).toBe(0);
    });

    it('uses the custom onDidChangeFiles as the watcher if available', async () => {
      // Ensure that all preexisting watchers are stopped
      await stopAllWatchers();

      const remotePath = 'ssh://another-directory:8080/does-exist';
      chevron.project.setPaths([remotePath]);
      await chevron.project.getWatcherPromise(remotePath);

      expect(onDidChangeFilesCallback).not.toBeNull();

      const changeSpy = jasmine.createSpy('atom.project.onDidChangeFiles');
      const disposable = chevron.project.onDidChangeFiles(changeSpy);

      const events = [{ action: 'created', path: remotePath + '/test.txt' }];
      onDidChangeFilesCallback(events);

      expect(changeSpy).toHaveBeenCalledWith(events);
      disposable.dispose();
    });
  });

  describe('.open(path)', () => {
    let absolutePath, newBufferHandler;

    beforeEach(() => {
      absolutePath = require.resolve('./fixtures/dir/a');
      newBufferHandler = jasmine.createSpy('newBufferHandler');
      chevron.project.onDidAddBuffer(newBufferHandler);
    });

    describe("when given an absolute path that isn't currently open", () => {
      it("returns a new edit session for the given path and emits 'buffer-created'", async () => {
        const editor = await chevron.workspace.open(absolutePath);
        expect(editor.buffer.getPath()).toBe(absolutePath);
        expect(newBufferHandler).toHaveBeenCalledWith(editor.buffer);
      });
    });

    describe("when given a relative path that isn't currently opened", () => {
      it("returns a new edit session for the given path (relative to the project root) and emits 'buffer-created'", async () => {
        const editor = await chevron.workspace.open(absolutePath);
        expect(editor.buffer.getPath()).toBe(absolutePath);
        expect(newBufferHandler).toHaveBeenCalledWith(editor.buffer);
      });
    });

    describe('when passed the path to a buffer that is currently opened', () => {
      it('returns a new edit session containing currently opened buffer', async () => {
        const editor = await chevron.workspace.open(absolutePath);
        newBufferHandler.reset();

        const { buffer } = await chevron.workspace.open(absolutePath);
        expect(buffer).toBe(editor.buffer);

        const { buffer: relativeBuffer } = await chevron.workspace.open('a');
        expect(relativeBuffer).toBe(editor.buffer);
        expect(newBufferHandler).not.toHaveBeenCalled();
      });
    });

    describe('when not passed a path', () => {
      it("returns a new edit session and emits 'buffer-created'", async () => {
        const editor = await chevron.workspace.open();
        expect(editor.buffer.getPath()).toBeUndefined();
        expect(newBufferHandler).toHaveBeenCalledWith(editor.buffer);
      });
    });
  });

  describe('.bufferForPath(path)', () => {
    let buffer = null;

    beforeEach(async () => {
      buffer = await chevron.project.bufferForPath('a');
      buffer.retain();
    });

    afterEach(() => buffer.release());

    describe('when opening a previously opened path', () => {
      it('does not create a new buffer', async () => {
        expect(await chevron.project.bufferForPath('a')).toBe(buffer);
        expect(await chevron.project.bufferForPath('b')).not.toBe(buffer);
        const [buffer1, buffer2] = await Promise.all([
          chevron.project.bufferForPath('c'),
          chevron.project.bufferForPath('c')
        ]);
        expect(buffer1).toBe(buffer2);
      });

      it('retries loading the buffer if it previously failed', async () => {
        spyOn(TextBuffer, 'load').andCallFake(() =>
          Promise.reject(new Error('Could not open file'))
        );
        let rejected = false;
        try {
          await chevron.project.bufferForPath('b');
        } catch (error) {
          rejected = true;
          expect(error.message).toBe('Could not open file');
        }
        expect(rejected).toBe(true);

        TextBuffer.load.andCallThrough();
        await chevron.project.bufferForPath('b');
      });

      it('creates a new buffer if the previous buffer was destroyed', async () => {
        buffer.release();
        expect(await chevron.project.bufferForPath('b')).not.toBe(buffer);
      });
    });
  });

  describe('.repositoryForDirectory(directory)', () => {
    it('resolves to null when the directory does not have a repository', async () => {
      const directory = new Directory('/tmp');
      const result = await chevron.project.repositoryForDirectory(directory);
      expect(result).toBeNull();
      expect(chevron.project.repositoryProviders.length).toBeGreaterThan(0);
      expect(chevron.project.repositoryPromisesByPath.size).toBe(0);
    });

    it('resolves to a GitRepository and is cached when the given directory is a Git repo', async () => {
      const directory = new Directory(path.join(__dirname, '..'));
      const promise = chevron.project.repositoryForDirectory(directory);
      const result = await promise;
      expect(result).toBeInstanceOf(GitRepository);
      const dirPath = directory.getRealPathSync();
      expect(result.getPath()).toBe(path.join(dirPath, '.git'));

      // Verify that the result is cached.
      expect(chevron.project.repositoryForDirectory(directory)).toBe(promise);
    });

    it('creates a new repository if a previous one with the same directory had been destroyed', async () => {
      const directory = new Directory(path.join(__dirname, '..'));

      let repository = await chevron.project.repositoryForDirectory(directory);
      expect(repository.isDestroyed()).toBe(false);
      repository.destroy();
      expect(repository.isDestroyed()).toBe(true);

      repository = await chevron.project.repositoryForDirectory(directory);
      expect(repository.isDestroyed()).toBe(false);
    });
  });

  describe('.setPaths(paths, options)', () => {
    describe('when path is a file', () => {
      it("sets its path to the file's parent directory and updates the root directory", () => {
        const filePath = require.resolve('./fixtures/dir/a');
        chevron.project.setPaths([filePath]);
        expect(chevron.project.getPaths()[0]).toEqual(path.dirname(filePath));
        expect(chevron.project.getDirectories()[0].path).toEqual(
          path.dirname(filePath)
        );
      });
    });

    describe('when path is a directory', () => {
      it('assigns the directories and repositories', () => {
        const directory1 = temp.mkdirSync('non-git-repo');
        const directory2 = temp.mkdirSync('git-repo1');
        const directory3 = temp.mkdirSync('git-repo2');

        const gitDirPath = fs.absolute(
          path.join(__dirname, 'fixtures', 'git', 'master.git')
        );
        fs.copySync(gitDirPath, path.join(directory2, '.git'));
        fs.copySync(gitDirPath, path.join(directory3, '.git'));

        chevron.project.setPaths([directory1, directory2, directory3]);

        const [repo1, repo2, repo3] = chevron.project.getRepositories();
        expect(repo1).toBeNull();
        expect(repo2.getShortHead()).toBe('master');
        expect(repo2.getPath()).toBe(
          fs.realpathSync(path.join(directory2, '.git'))
        );
        expect(repo3.getShortHead()).toBe('master');
        expect(repo3.getPath()).toBe(
          fs.realpathSync(path.join(directory3, '.git'))
        );
      });

      it('calls callbacks registered with ::onDidChangePaths', () => {
        const onDidChangePathsSpy = jasmine.createSpy('onDidChangePaths spy');
        chevron.project.onDidChangePaths(onDidChangePathsSpy);

        const paths = [temp.mkdirSync('dir1'), temp.mkdirSync('dir2')];
        chevron.project.setPaths(paths);

        expect(onDidChangePathsSpy.callCount).toBe(1);
        expect(onDidChangePathsSpy.mostRecentCall.args[0]).toEqual(paths);
      });

      it('optionally throws an error with any paths that did not exist', () => {
        const paths = [
          temp.mkdirSync('exists0'),
          '/doesnt-exists/0',
          temp.mkdirSync('exists1'),
          '/doesnt-exists/1'
        ];

        try {
          chevron.project.setPaths(paths, { mustExist: true });
          expect('no exception thrown').toBeUndefined();
        } catch (e) {
          expect(e.missingProjectPaths).toEqual([paths[1], paths[3]]);
        }

        expect(chevron.project.getPaths()).toEqual([paths[0], paths[2]]);
      });
    });

    describe('when no paths are given', () => {
      it('clears its path', () => {
        chevron.project.setPaths([]);
        expect(chevron.project.getPaths()).toEqual([]);
        expect(chevron.project.getDirectories()).toEqual([]);
      });
    });

    it('normalizes the path to remove consecutive slashes, ., and .. segments', () => {
      chevron.project.setPaths([
        `${require.resolve('./fixtures/dir/a')}${path.sep}b${path.sep}${
          path.sep
        }..`
      ]);
      expect(chevron.project.getPaths()[0]).toEqual(
        path.dirname(require.resolve('./fixtures/dir/a'))
      );
      expect(chevron.project.getDirectories()[0].path).toEqual(
        path.dirname(require.resolve('./fixtures/dir/a'))
      );
    });
  });

  describe('.addPath(path, options)', () => {
    it('calls callbacks registered with ::onDidChangePaths', () => {
      const onDidChangePathsSpy = jasmine.createSpy('onDidChangePaths spy');
      chevron.project.onDidChangePaths(onDidChangePathsSpy);

      const [oldPath] = chevron.project.getPaths();

      const newPath = temp.mkdirSync('dir');
      chevron.project.addPath(newPath);

      expect(onDidChangePathsSpy.callCount).toBe(1);
      expect(onDidChangePathsSpy.mostRecentCall.args[0]).toEqual([
        oldPath,
        newPath
      ]);
    });

    it("doesn't add redundant paths", () => {
      const onDidChangePathsSpy = jasmine.createSpy('onDidChangePaths spy');
      chevron.project.onDidChangePaths(onDidChangePathsSpy);
      const [oldPath] = chevron.project.getPaths();

      // Doesn't re-add an existing root directory
      chevron.project.addPath(oldPath);
      expect(chevron.project.getPaths()).toEqual([oldPath]);
      expect(onDidChangePathsSpy).not.toHaveBeenCalled();

      // Doesn't add an entry for a file-path within an existing root directory
      chevron.project.addPath(path.join(oldPath, 'some-file.txt'));
      expect(chevron.project.getPaths()).toEqual([oldPath]);
      expect(onDidChangePathsSpy).not.toHaveBeenCalled();

      // Does add an entry for a directory within an existing directory
      const newPath = path.join(oldPath, 'a-dir');
      chevron.project.addPath(newPath);
      expect(chevron.project.getPaths()).toEqual([oldPath, newPath]);
      expect(onDidChangePathsSpy).toHaveBeenCalled();
    });

    it("doesn't add non-existent directories", () => {
      const previousPaths = chevron.project.getPaths();
      chevron.project.addPath('/this-definitely/does-not-exist');
      expect(chevron.project.getPaths()).toEqual(previousPaths);
    });

    it('optionally throws on non-existent directories', () => {
      expect(() =>
        chevron.project.addPath('/this-definitely/does-not-exist', {
          mustExist: true
        })
      ).toThrow();
    });

    it('syncs FS IPC project roots before did-change-paths listeners', () => {
      const order = [];
      spyOn(chevron.applicationDelegate, 'setProjectRoots').andCallFake(() => {
        order.push('setProjectRoots');
      });
      chevron.project.onDidChangePaths(() => {
        order.push('did-change-paths');
      });

      const newPath = temp.mkdirSync('atom-project-fs-ipc');
      chevron.project.addPath(newPath);

      expect(order).toEqual(['setProjectRoots', 'did-change-paths']);
    });
  });

  describe('.removePath(path)', () => {
    let onDidChangePathsSpy = null;

    beforeEach(() => {
      onDidChangePathsSpy = jasmine.createSpy('onDidChangePaths listener');
      chevron.project.onDidChangePaths(onDidChangePathsSpy);
    });

    it('removes the directory and repository for the path', () => {
      const result = chevron.project.removePath(chevron.project.getPaths()[0]);
      expect(chevron.project.getDirectories()).toEqual([]);
      expect(chevron.project.getRepositories()).toEqual([]);
      expect(chevron.project.getPaths()).toEqual([]);
      expect(result).toBe(true);
      expect(onDidChangePathsSpy).toHaveBeenCalled();
    });

    it("does nothing if the path is not one of the project's root paths", () => {
      const originalPaths = chevron.project.getPaths();
      const result = chevron.project.removePath(originalPaths[0] + 'xyz');
      expect(result).toBe(false);
      expect(chevron.project.getPaths()).toEqual(originalPaths);
      expect(onDidChangePathsSpy).not.toHaveBeenCalled();
    });

    it("doesn't destroy the repository if it is shared by another root directory", () => {
      chevron.project.setPaths([__dirname, path.join(__dirname, '..', 'src')]);
      chevron.project.removePath(__dirname);
      expect(chevron.project.getPaths()).toEqual([
        path.join(__dirname, '..', 'src')
      ]);
      expect(chevron.project.getRepositories()[0].isSubmodule('src')).toBe(false);
    });

    it('removes a path that is represented as a URI', () => {
      chevron.packages.serviceHub.provide('atom.directory-provider', '0.1.0', {
        directoryForURISync(uri) {
          return {
            getPath() {
              return uri;
            },
            getSubdirectory() {
              return {};
            },
            isRoot() {
              return true;
            },
            existsSync() {
              return true;
            },
            off() {}
          };
        }
      });

      const ftpURI = 'ftp://example.com/some/folder';

      chevron.project.setPaths([ftpURI]);
      expect(chevron.project.getPaths()).toEqual([ftpURI]);

      chevron.project.removePath(ftpURI);
      expect(chevron.project.getPaths()).toEqual([]);
    });
  });

  describe('.onDidChangeFiles()', () => {
    let sub;
    let events;
    let checkCallback = () => {};

    beforeEach(() => {
      events = [];
      sub = chevron.project.onDidChangeFiles(incoming => {
        events.push(...incoming);
        checkCallback();
      });
    });

    afterEach(() => sub.dispose());

    const waitForEvents = paths => {
      const remaining = new Set(paths.map(p => fs.realpathSync(p)));
      return new Promise((resolve, reject) => {
        let expireTimeoutId;
        checkCallback = () => {
          for (let event of events) {
            remaining.delete(event.path);
          }
          if (remaining.size === 0) {
            clearTimeout(expireTimeoutId);
            resolve();
          }
        };

        const expire = () => {
          checkCallback = () => {};
          console.error('Paths not seen:', remaining);
          reject(
            new Error('Expired before all expected events were delivered.')
          );
        };

        expireTimeoutId = setTimeout(expire, 2000);
        checkCallback();
      });
    };

    it('reports filesystem changes within project paths', async () => {
      const dirOne = temp.mkdirSync('atom-spec-project-one');
      const fileOne = path.join(dirOne, 'file-one.txt');
      const fileTwo = path.join(dirOne, 'file-two.txt');
      const dirTwo = temp.mkdirSync('atom-spec-project-two');
      const fileThree = path.join(dirTwo, 'file-three.txt');

      // Ensure that all preexisting watchers are stopped
      await stopAllWatchers();

      chevron.project.setPaths([dirOne]);
      await chevron.project.getWatcherPromise(dirOne);

      expect(chevron.project.watcherPromisesByPath[dirTwo]).toEqual(undefined);
      fs.writeFileSync(fileThree, 'three\n');
      fs.writeFileSync(fileTwo, 'two\n');
      fs.writeFileSync(fileOne, 'one\n');
      await waitForEvents([fileOne, fileTwo]);
      expect(events.some(event => event.path === fileThree)).toBeFalsy();
    });
  });

  describe('.onDidAddBuffer()', () => {
    it('invokes the callback with added text buffers', async () => {
      const buffers = [];
      const added = [];

      buffers.push(
        await chevron.project.buildBuffer(require.resolve('./fixtures/dir/a'))
      );
      expect(buffers.length).toBe(1);
      chevron.project.onDidAddBuffer(buffer => added.push(buffer));

      buffers.push(
        await chevron.project.buildBuffer(require.resolve('./fixtures/dir/b'))
      );
      expect(buffers.length).toBe(2);
      expect(added).toEqual([buffers[1]]);
    });
  });

  describe('.observeBuffers()', () => {
    it('invokes the observer with current and future text buffers', async () => {
      const buffers = [];
      const observed = [];

      buffers.push(
        await chevron.project.buildBuffer(require.resolve('./fixtures/dir/a'))
      );
      buffers.push(
        await chevron.project.buildBuffer(require.resolve('./fixtures/dir/b'))
      );
      expect(buffers.length).toBe(2);
      chevron.project.observeBuffers(buffer => observed.push(buffer));
      expect(observed).toEqual(buffers);

      buffers.push(
        await chevron.project.buildBuffer(require.resolve('./fixtures/dir/b'))
      );
      expect(observed.length).toBe(3);
      expect(buffers.length).toBe(3);
      expect(observed).toEqual(buffers);
    });
  });

  describe('.observeRepositories()', () => {
    it('invokes the observer with current and future repositories', () => {
      const observed = [];

      const directory1 = temp.mkdirSync('git-repo1');
      const gitDirPath1 = fs.absolute(
        path.join(__dirname, 'fixtures', 'git', 'master.git')
      );
      fs.copySync(gitDirPath1, path.join(directory1, '.git'));

      const directory2 = temp.mkdirSync('git-repo2');
      const gitDirPath2 = fs.absolute(
        path.join(
          __dirname,
          'fixtures',
          'git',
          'repo-with-submodules',
          'git.git'
        )
      );
      fs.copySync(gitDirPath2, path.join(directory2, '.git'));

      chevron.project.setPaths([directory1]);

      const disposable = chevron.project.observeRepositories(repo =>
        observed.push(repo)
      );
      expect(observed.length).toBe(1);
      expect(observed[0].getReferenceTarget('refs/heads/master')).toBe(
        'ef046e9eecaa5255ea5e9817132d4001724d6ae1'
      );

      chevron.project.addPath(directory2);
      expect(observed.length).toBe(2);
      expect(observed[1].getReferenceTarget('refs/heads/master')).toBe(
        'd2b0ad9cbc6f6c4372e8956e5cc5af771b2342e5'
      );

      disposable.dispose();
    });
  });

  describe('.onDidAddRepository()', () => {
    it('invokes callback when a path is added and the path is the root of a repository', () => {
      const observed = [];
      const disposable = chevron.project.onDidAddRepository(repo =>
        observed.push(repo)
      );

      const projectRootPath = temp.mkdirSync();
      const fixtureRepoPath = fs.absolute(
        path.join(__dirname, 'fixtures', 'git', 'master.git')
      );
      fs.copySync(fixtureRepoPath, path.join(projectRootPath, '.git'));

      chevron.project.addPath(projectRootPath);
      expect(observed.length).toBe(1);
      expect(observed[0].getOriginURL()).toEqual(
        'https://github.com/example-user/example-repo.git'
      );

      disposable.dispose();
    });

    it('invokes callback when a path is added and the path is subdirectory of a repository', () => {
      const observed = [];
      const disposable = chevron.project.onDidAddRepository(repo =>
        observed.push(repo)
      );

      const projectRootPath = temp.mkdirSync();
      const fixtureRepoPath = fs.absolute(
        path.join(__dirname, 'fixtures', 'git', 'master.git')
      );
      fs.copySync(fixtureRepoPath, path.join(projectRootPath, '.git'));

      const projectSubDirPath = path.join(projectRootPath, 'sub-dir');
      fs.mkdirSync(projectSubDirPath);

      chevron.project.addPath(projectSubDirPath);
      expect(observed.length).toBe(1);
      expect(observed[0].getOriginURL()).toEqual(
        'https://github.com/example-user/example-repo.git'
      );

      disposable.dispose();
    });

    it('does not invoke callback when a path is added and the path is not part of a repository', () => {
      const observed = [];
      const disposable = chevron.project.onDidAddRepository(repo =>
        observed.push(repo)
      );

      chevron.project.addPath(temp.mkdirSync('not-a-repository'));
      expect(observed.length).toBe(0);

      disposable.dispose();
    });
  });

  describe('.relativize(path)', () => {
    it('returns the path, relative to whichever root directory it is inside of', () => {
      chevron.project.addPath(temp.mkdirSync('another-path'));

      let rootPath = chevron.project.getPaths()[0];
      let childPath = path.join(rootPath, 'some', 'child', 'directory');
      expect(chevron.project.relativize(childPath)).toBe(
        path.join('some', 'child', 'directory')
      );

      rootPath = chevron.project.getPaths()[1];
      childPath = path.join(rootPath, 'some', 'child', 'directory');
      expect(chevron.project.relativize(childPath)).toBe(
        path.join('some', 'child', 'directory')
      );
    });

    it('returns the given path if it is not in any of the root directories', () => {
      const randomPath = path.join('some', 'random', 'path');
      expect(chevron.project.relativize(randomPath)).toBe(randomPath);
    });
  });

  describe('.relativizePath(path)', () => {
    it('returns the root path that contains the given path, and the path relativized to that root path', () => {
      chevron.project.addPath(temp.mkdirSync('another-path'));

      let rootPath = chevron.project.getPaths()[0];
      let childPath = path.join(rootPath, 'some', 'child', 'directory');
      expect(chevron.project.relativizePath(childPath)).toEqual([
        rootPath,
        path.join('some', 'child', 'directory')
      ]);

      rootPath = chevron.project.getPaths()[1];
      childPath = path.join(rootPath, 'some', 'child', 'directory');
      expect(chevron.project.relativizePath(childPath)).toEqual([
        rootPath,
        path.join('some', 'child', 'directory')
      ]);
    });

    describe("when the given path isn't inside of any of the project's path", () => {
      it('returns null for the root path, and the given path unchanged', () => {
        const randomPath = path.join('some', 'random', 'path');
        expect(chevron.project.relativizePath(randomPath)).toEqual([
          null,
          randomPath
        ]);
      });
    });

    describe('when the given path is a URL', () => {
      it('returns null for the root path, and the given path unchanged', () => {
        const url = 'http://the-path';
        expect(chevron.project.relativizePath(url)).toEqual([null, url]);
      });
    });

    describe('when the given path is inside more than one root folder', () => {
      it('uses the root folder that is closest to the given path', () => {
        chevron.project.addPath(path.join(chevron.project.getPaths()[0], 'a-dir'));

        const inputPath = path.join(
          chevron.project.getPaths()[1],
          'somewhere/something.txt'
        );

        expect(chevron.project.getDirectories()[0].contains(inputPath)).toBe(true);
        expect(chevron.project.getDirectories()[1].contains(inputPath)).toBe(true);
        expect(chevron.project.relativizePath(inputPath)).toEqual([
          chevron.project.getPaths()[1],
          path.join('somewhere', 'something.txt')
        ]);
      });
    });
  });

  describe('.contains(path)', () => {
    it('returns whether or not the given path is in one of the root directories', () => {
      const rootPath = chevron.project.getPaths()[0];
      const childPath = path.join(rootPath, 'some', 'child', 'directory');
      expect(chevron.project.contains(childPath)).toBe(true);

      const randomPath = path.join('some', 'random', 'path');
      expect(chevron.project.contains(randomPath)).toBe(false);
    });
  });

  describe('.resolvePath(uri)', () => {
    it('normalizes disk drive letter in passed path on #win32', () => {
      expect(chevron.project.resolvePath('d:\\file.txt')).toEqual('D:\\file.txt');
    });
  });
});
