const path = require('path');

const _ = require('underscore-plus');
const fs = require('fs-plus');
const { Emitter, Disposable, CompositeDisposable } = require('event-kit');
const TextBuffer = require('text-buffer');
const { watchPath } = require('./path-watcher');

const DefaultDirectoryProvider = require('./default-directory-provider');
const NullGrammar = require('./null-grammar');
const PlainTextLanguageMode = require('./plain-text-language-mode');
// Either separator: a watcher on Windows can report a path in either style,
// and matching only the native one is a bug that shows up on one platform.
const ROOT_CONFIG_PATTERN = /[\\/]\.chevron[\\/]config\.json$/;

// A did-change-files event that touches some root's config. Renames report
// the path they came from as well, and a config file moved away is a change
// to that root just as much as one moved in.
function isRootConfigEvent(event) {
  if (!event) return false;
  return [event.path, event.oldPath].some(
    candidate => typeof candidate === 'string' && ROOT_CONFIG_PATTERN.test(candidate)
  );
}

const Model = require('./model');
const GitRepositoryProvider = require('./git-repository-provider');

// Extended: Represents a project that's opened in Atom.
//
// An instance of this class is always available as the `atom.project` global.
module.exports = class Project extends Model {
  /*
  Section: Construction and Destruction
  */

  constructor({
    notificationManager,
    packageManager,
    config,
    applicationDelegate,
    grammarRegistry
  }) {
    super();
    this.notificationManager = notificationManager;
    this.applicationDelegate = applicationDelegate;
    this.grammarRegistry = grammarRegistry;

    this.emitter = new Emitter();
    this.buffers = [];
    this.rootDirectories = [];
    this.repositories = [];
    this.directoryProviders = [];
    this.defaultDirectoryProvider = new DefaultDirectoryProvider();
    this.repositoryPromisesByPath = new Map();
    this.repositoryProviders = [new GitRepositoryProvider(this, config)];
    this.loadPromisesByPath = {};
    this.watcherPromisesByPath = {};
    this.retiredBufferIDs = new Set();
    this.retiredBufferPaths = new Set();
    this.largeFileBufferIds = new Set();
    this.subscriptions = new CompositeDisposable();
    // The last parse error reported per root, so a broken config warns once
    // rather than on every save.
    this.rootConfigErrors = new Map();
    // Roots already told that some of their settings wait for trust.
    this.rootTrustNoticed = new Set();
    this.watchRootConfigs();
    this.consumeServices(packageManager);
  }

  /**
   * Reload a root's config when its file changes on disk.
   *
   * No watcher of its own: every root is already watched recursively for
   * did-change-files, so this is a filter on events that arrive anyway.
   * Debounced because a save arrives as several events, and because an editor
   * writing the file can produce a rename plus a modify.
   */
  watchRootConfigs() {
    const requestSync = _.debounce(() => this.syncRootConfigs(), 150);
    this.subscriptions.add(
      this.onDidChangeFiles(events => {
        if (events.some(event => isRootConfigEvent(event))) requestSync();
      })
    );
    const delegate = this.applicationDelegate;
    if (delegate && typeof delegate.onDidChangeProjectTrust === 'function') {
      this.subscriptions.add(
        delegate.onDidChangeProjectTrust(() => this.syncRootTrust())
      );
    }
  }

  /**
   * Ask which configured roots are trusted, so Config can apply the settings
   * only a trusted root may set. Roots whose config sets nothing trust
   * decides are not asked. Docs: config-precedence.md, "Trust".
   */
  async syncRootTrust() {
    const config = chevron && chevron.config;
    const delegate = this.applicationDelegate;
    if (!config || typeof config.setRootTrusted !== 'function') return;
    if (!delegate || typeof delegate.isProjectTrusted !== 'function') return;

    const roots = config
      .getConfiguredRoots()
      .filter(
        root =>
          config.isRootTrusted(root) ||
          config.getWithheldRootKeys(root).length > 0
      );
    await Promise.all(
      roots.map(async root => {
        const trusted = await delegate.isProjectTrusted(root);
        // The root may have left the project while the answer was coming.
        if (!config.getConfiguredRoots().includes(root)) return;
        config.setRootTrusted(root, trusted);
        if (!trusted) this.noticeWithheldRootSettings(root);
      })
    );
  }

  // Once per root per session: its config sets keys that are being ignored.
  noticeWithheldRootSettings(root) {
    const config = chevron.config;
    const keys = config.getWithheldRootKeys(root);
    if (keys.length === 0 || this.rootTrustNoticed.has(root)) return;
    if (!this.notificationManager) return;
    this.rootTrustNoticed.add(root);

    const file = path.join(root, '.chevron', 'config.json');
    const notification = this.notificationManager.addInfo(
      'Some project settings apply only once you trust the project',
      {
        detail:
          `${file} sets ${keys.join(', ')}.\n` +
          'A project can change editor and whitespace settings without trust; ' +
          'anything else waits, so opening a repository cannot change how ' +
          'Chevron runs things.',
        dismissable: true,
        buttons: [
          {
            text: 'Trust Project…',
            onDidClick: () => {
              notification.dismiss();
              this.requestRootTrust(root);
            }
          }
        ]
      }
    );
  }

  // The same prompt language servers use, from lsp-ui; a plain confirmation
  // when that package is not there to draw it.
  requestRootTrust(root) {
    const lsp = chevron.lsp;
    if (lsp && typeof lsp.requestTrustPrompt === 'function' && lsp.requestTrustPrompt(root)) {
      return;
    }
    chevron.confirm(
      {
        message: 'Trust this project?',
        detail:
          `${root}\n\nTrusting a project lets its .chevron/config.json change ` +
          'any setting, and lets its language servers and tasks run.',
        buttons: ['Trust', 'Cancel']
      },
      response => {
        if (response !== 0) return;
        if (lsp && typeof lsp.recordTrustDecision === 'function') {
          lsp.recordTrustDecision(root, true);
        }
      }
    );
  }

  destroyed() {
    for (let buffer of this.buffers.slice()) {
      buffer.destroy();
    }
    for (let repository of this.repositories.slice()) {
      if (repository != null) repository.destroy();
    }
    for (let path in this.watcherPromisesByPath) {
      this.watcherPromisesByPath[path].then(watcher => {
        watcher.dispose();
      });
    }
    this.rootDirectories = [];
    this.repositories = [];
  }

  reset(packageManager) {
    this.emitter.dispose();
    this.emitter = new Emitter();

    this.subscriptions.dispose();
    this.subscriptions = new CompositeDisposable();
    this.watchRootConfigs();

    for (let buffer of this.buffers) {
      if (buffer != null) buffer.destroy();
    }
    this.buffers = [];
    this.setPaths([]);
    this.loadPromisesByPath = {};
    this.retiredBufferIDs = new Set();
    this.retiredBufferPaths = new Set();
    this.largeFileBufferIds = new Set();
    this.consumeServices(packageManager);
  }

  destroyUnretainedBuffers() {
    for (let buffer of this.getBuffers()) {
      if (!buffer.isRetained()) buffer.destroy();
    }
  }

  // Layers the contents of a project's file's config
  // on top of the current global config.
  replace(projectSpecification) {
    if (projectSpecification == null) {
      chevron.config.clearProjectSettings();
      this.setPaths([]);
    } else {
      if (projectSpecification.originPath == null) {
        return;
      }

      // If no path is specified, set to directory of originPath.
      if (!Array.isArray(projectSpecification.paths)) {
        projectSpecification.paths = [
          path.dirname(projectSpecification.originPath)
        ];
      }
      chevron.config.resetProjectSettings(
        projectSpecification.config,
        projectSpecification.originPath
      );
      this.setPaths(projectSpecification.paths);
    }
    this.emitter.emit('did-replace', projectSpecification);
  }

  onDidReplace(callback) {
    return this.emitter.on('did-replace', callback);
  }

  /*
  Section: Serialization
  */

  deserialize(state) {
    this.retiredBufferIDs = new Set();
    this.retiredBufferPaths = new Set();

    const handleBufferState = bufferState => {
      if (bufferState.shouldDestroyOnFileDelete == null) {
        bufferState.shouldDestroyOnFileDelete = () =>
          chevron.config.get('core.closeDeletedFileTabs');
      }

      // Use a little guilty knowledge of the way TextBuffers are serialized.
      // This allows TextBuffers that have never been saved (but have filePaths) to be deserialized, but prevents
      // TextBuffers backed by files that have been deleted from being saved.
      bufferState.mustExist = bufferState.digestWhenLastPersisted !== false;

      return TextBuffer.deserialize(bufferState).catch(_ => {
        this.retiredBufferIDs.add(bufferState.id);
        this.retiredBufferPaths.add(bufferState.filePath);
        return null;
      });
    };

    const bufferPromises = [];
    for (let bufferState of state.buffers) {
      bufferPromises.push(handleBufferState(bufferState));
    }

    return Promise.all(bufferPromises).then(buffers => {
      this.buffers = buffers.filter(Boolean);
      const largeFileBufferIds = new Set(state.largeFileBufferIds || []);
      this.largeFileBufferIds = new Set(
        this.buffers
          .map(buffer => buffer.id)
          .filter(id => largeFileBufferIds.has(id))
      );
      for (let buffer of this.buffers) {
        // The grammar registry's own state is restored after the project's,
        // too late to stop maintainLanguageMode parsing the buffer.
        if (this.largeFileBufferIds.has(buffer.id)) {
          this.assignLargeFileLanguageMode(buffer);
        }
        this.grammarRegistry.maintainLanguageMode(buffer);
        this.subscribeToBuffer(buffer);
      }
      this.setPaths(state.paths || [], { mustExist: true, exact: true });
    });
  }

  serialize(options = {}) {
    const retained = this.buffers.filter(buffer => buffer.isRetained());
    const isUnloading = options.isUnloading === true;
    return {
      deserializer: 'Project',
      paths: this.getPaths(),
      buffers: _.compact(
        retained.map(buffer =>
          buffer.serialize({
            markerLayers: isUnloading,
            history: isUnloading
          })
        )
      ),
      largeFileBufferIds: retained
        .filter(buffer => this.isLargeFileBuffer(buffer))
        .map(buffer => buffer.id)
    };
  }

  /*
  Section: Event Subscription
  */

  // Public: Invoke the given callback when the project paths change.
  //
  // * `callback` {Function} to be called after the project paths change.
  //    * `projectPaths` An {Array} of {String} project paths.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChangePaths(callback) {
    return this.emitter.on('did-change-paths', callback);
  }

  // Public: Invoke the given callback when a text buffer is added to the
  // project.
  //
  // * `callback` {Function} to be called when a text buffer is added.
  //   * `buffer` A {TextBuffer} item.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidAddBuffer(callback) {
    return this.emitter.on('did-add-buffer', callback);
  }

  // Public: Invoke the given callback with all current and future text
  // buffers in the project.
  //
  // * `callback` {Function} to be called with current and future text buffers.
  //   * `buffer` A {TextBuffer} item.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  observeBuffers(callback) {
    for (let buffer of this.getBuffers()) {
      callback(buffer);
    }
    return this.onDidAddBuffer(callback);
  }

  // Extended: Invoke a callback when a filesystem change occurs within any open
  // project path.
  //
  // ```js
  // const disposable = atom.project.onDidChangeFiles(events => {
  //   for (const event of events) {
  //     // "created", "modified", "deleted", or "renamed"
  //     console.log(`Event action: ${event.action}`)
  //
  //     // absolute path to the filesystem entry that was touched
  //     console.log(`Event path: ${event.path}`)
  //
  //     if (event.action === 'renamed') {
  //       console.log(`.. renamed from: ${event.oldPath}`)
  //     }
  //   }
  // })
  //
  // disposable.dispose()
  // ```
  //
  // To watch paths outside of open projects, use the `watchPaths` function instead; see {PathWatcher}.
  //
  // When writing tests against functionality that uses this method, be sure to wait for the
  // {Promise} returned by {::getWatcherPromise} before manipulating the filesystem to ensure that
  // the watcher is receiving events.
  //
  // * `callback` {Function} to be called with batches of filesystem events reported by
  //   the operating system.
  //    * `events` An {Array} of objects that describe a batch of filesystem events.
  //     * `action` {String} describing the filesystem action that occurred. One of `"created"`,
  //       `"modified"`, `"deleted"`, or `"renamed"`.
  //     * `path` {String} containing the absolute path to the filesystem entry
  //       that was acted upon.
  //     * `oldPath` For rename events, {String} containing the filesystem entry's
  //       former absolute path.
  //
  // Returns a {Disposable} to manage this event subscription.
  onDidChangeFiles(callback) {
    return this.emitter.on('did-change-files', callback);
  }

  // Public: Invoke the given callback with all current and future
  // repositories in the project.
  //
  // * `callback` {Function} to be called with current and future
  //    repositories.
  //   * `repository` A {GitRepository} that is present at the time of
  //     subscription or that is added at some later time.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to
  // unsubscribe.
  observeRepositories(callback) {
    for (const repo of this.repositories) {
      if (repo != null) {
        callback(repo);
      }
    }

    return this.onDidAddRepository(callback);
  }

  // Public: Invoke the given callback when a repository is added to the
  // project.
  //
  // * `callback` {Function} to be called when a repository is added.
  //   * `repository` A {GitRepository}.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to
  // unsubscribe.
  onDidAddRepository(callback) {
    return this.emitter.on('did-add-repository', callback);
  }

  /*
  Section: Accessing the git repository
  */

  // Public: Get an {Array} of {GitRepository}s associated with the project's
  // directories.
  //
  // This method will be removed in 2.0 because it does synchronous I/O.
  // Prefer the following, which evaluates to a {Promise} that resolves to an
  // {Array} of {GitRepository} objects:
  // ```
  // Promise.all(atom.project.getDirectories().map(
  //     atom.project.repositoryForDirectory.bind(atom.project)))
  // ```
  getRepositories() {
    return this.repositories;
  }

  // Public: Get the repository for a given directory asynchronously.
  //
  // * `directory` {Directory} for which to get a {GitRepository}.
  //
  // Returns a {Promise} that resolves with either:
  // * {GitRepository} if a repository can be created for the given directory
  // * `null` if no repository can be created for the given directory.
  repositoryForDirectory(directory) {
    const pathForDirectory = directory.getRealPathSync();
    let promise = this.repositoryPromisesByPath.get(pathForDirectory);
    if (!promise) {
      const promises = this.repositoryProviders.map(provider =>
        provider.repositoryForDirectory(directory)
      );
      promise = Promise.all(promises).then(repositories => {
        const repo = repositories.find(repo => repo != null) || null;

        // If no repository is found, remove the entry for the directory in
        // @repositoryPromisesByPath in case some other RepositoryProvider is
        // registered in the future that could supply a Repository for the
        // directory.
        if (repo == null)
          this.repositoryPromisesByPath.delete(pathForDirectory);

        if (repo && repo.onDidDestroy) {
          repo.onDidDestroy(() =>
            this.repositoryPromisesByPath.delete(pathForDirectory)
          );
        }

        return repo;
      });
      this.repositoryPromisesByPath.set(pathForDirectory, promise);
    }
    return promise;
  }

  /*
  Section: Managing Paths
  */

  // Public: Get an {Array} of {String}s containing the paths of the project's
  // directories.
  getPaths() {
    try {
      return this.rootDirectories.map(rootDirectory => rootDirectory.getPath());
    } catch (e) {
      chevron.notifications.addError(
        "Please clear Atom's window state with: atom --clear-window-state"
      );
    }
  }

  // Public: Set the paths of the project's directories.
  //
  // * `projectPaths` {Array} of {String} paths.
  // * `options` An optional {Object} that may contain the following keys:
  //   * `mustExist` If `true`, throw an Error if any `projectPaths` do not exist. Any remaining `projectPaths` that
  //     do exist will still be added to the project. Default: `false`.
  //   * `exact` If `true`, only add a `projectPath` if it names an existing directory. If `false` and any `projectPath`
  //     is a file or does not exist, its parent directory will be added instead. Default: `false`.
  setPaths(projectPaths, options = {}) {
    for (let repository of this.repositories) {
      if (repository != null) repository.destroy();
    }
    this.rootDirectories = [];
    this.repositories = [];

    for (let path in this.watcherPromisesByPath) {
      this.watcherPromisesByPath[path].then(watcher => {
        watcher.dispose();
      });
    }
    this.watcherPromisesByPath = {};

    const missingProjectPaths = [];
    for (let projectPath of projectPaths) {
      try {
        this.addPath(projectPath, {
          emitEvent: false,
          mustExist: true,
          exact: options.exact === true
        });
      } catch (e) {
        if (e.missingProjectPaths != null) {
          missingProjectPaths.push(...e.missingProjectPaths);
        } else {
          throw e;
        }
      }
    }

    this.syncFsIpcProjectRoots();
    this.syncRootConfigs();
    this.emitter.emit('did-change-paths', projectPaths);

    if (options.mustExist === true && missingProjectPaths.length > 0) {
      const err = new Error('One or more project directories do not exist');
      err.missingProjectPaths = missingProjectPaths;
      throw err;
    }
  }

  // Public: Add a path to the project's list of root paths
  //
  // * `projectPath` {String} The path to the directory to add.
  // * `options` An optional {Object} that may contain the following keys:
  //   * `mustExist` If `true`, throw an Error if the `projectPath` does not exist. If `false`, a `projectPath` that does
  //     not exist is ignored. Default: `false`.
  //   * `exact` If `true`, only add `projectPath` if it names an existing directory. If `false`, if `projectPath` is a
  //     a file or does not exist, its parent directory will be added instead.
  addPath(projectPath, options = {}) {
    const directory = this.getDirectoryForProjectPath(projectPath);
    let ok = true;
    if (options.exact === true) {
      ok = directory.getPath() === projectPath;
    }
    ok = ok && directory.existsSync();

    if (!ok) {
      if (options.mustExist === true) {
        const err = new Error(`Project directory ${directory} does not exist`);
        err.missingProjectPaths = [projectPath];
        throw err;
      } else {
        return;
      }
    }

    for (let existingDirectory of this.getDirectories()) {
      if (existingDirectory.getPath() === directory.getPath()) {
        return;
      }
    }

    this.rootDirectories.push(directory);

    const didChangeCallback = events => {
      // Stop event delivery immediately on removal of a rootDirectory, even if its watcher
      // promise has yet to resolve at the time of removal
      if (this.rootDirectories.includes(directory)) {
        this.emitter.emit('did-change-files', events);
      }
    };

    // We'll use the directory's custom onDidChangeFiles callback, if available.
    // CustomDirectory::onDidChangeFiles should match the signature of
    // Project::onDidChangeFiles below (although it may resolve asynchronously)
    this.watcherPromisesByPath[directory.getPath()] =
      directory.onDidChangeFiles != null
        ? Promise.resolve(directory.onDidChangeFiles(didChangeCallback))
        : watchPath(directory.getPath(), {}, didChangeCallback);

    for (let watchedPath in this.watcherPromisesByPath) {
      if (!this.rootDirectories.find(dir => dir.getPath() === watchedPath)) {
        this.watcherPromisesByPath[watchedPath].then(watcher => {
          watcher.dispose();
        });
      }
    }

    let repo = null;
    for (let provider of this.repositoryProviders) {
      if (provider.repositoryForDirectorySync) {
        repo = provider.repositoryForDirectorySync(directory);
      }
      if (repo) {
        break;
      }
    }
    this.repositories.push(repo != null ? repo : null);
    if (repo != null) {
      this.emitter.emit('did-add-repository', repo);
    }

    if (options.emitEvent !== false) {
      this.syncFsIpcProjectRoots();
      this.syncRootConfigs();
      this.emitter.emit('did-change-paths', this.getPaths());
    }
  }

  /**
   * Load `<root>/.chevron/config.json` for each root, and forget the roots
   * that have gone. Precedence: docs/reference/config-precedence.md.
   *
   * A root without the file is not an error, and neither is one that cannot be
   * parsed: a config file somebody is halfway through editing must not take
   * the window down with it.
   */
  syncRootConfigs() {
    const config = chevron && chevron.config;
    if (!config || typeof config.setRootSettings !== 'function') return;

    const roots = this.getPaths();
    for (const stale of config.getConfiguredRoots()) {
      if (!roots.includes(stale)) config.setRootSettings(stale, null);
    }

    for (const root of roots) {
      const file = path.join(root, '.chevron', 'config.json');
      let settings = null;
      try {
        if (fs.existsSync(file)) {
          settings = JSON.parse(fs.readFileSync(file, 'utf8'));
        }
      } catch (error) {
        // The file is watched now, so a person typing invalid JSON into it
        // gets one of these per save. Warn when the problem changes, not
        // once per keystroke-and-save.
        if (chevron.notifications && this.rootConfigErrors.get(root) !== error.message) {
          chevron.notifications.addWarning(
            `Could not read ${path.join('.chevron', 'config.json')}`,
            { detail: `${root}\n${error.message}`, dismissable: true }
          );
        }
        this.rootConfigErrors.set(root, error.message);
        continue;
      }
      this.rootConfigErrors.delete(root);
      config.setRootSettings(root, settings, settings ? file : null);
    }
    this.syncRootTrust();
  }

  // Strict FS IPC collects allowed roots from the main-process window's
  // projectRoots. Refresh those before did-change-paths so tree-view's
  // lstatSyncNoException (fs-via-main) can see the new folder.
  syncFsIpcProjectRoots() {
    if (
      this.applicationDelegate &&
      typeof this.applicationDelegate.setProjectRoots === 'function'
    ) {
      try {
        this.applicationDelegate.setProjectRoots(this.getPaths());
      } catch (error) {
        // Headless / unit tests without IPC.
      }
    }
  }

  getProvidedDirectoryForProjectPath(projectPath) {
    for (let provider of this.directoryProviders) {
      if (typeof provider.directoryForURISync === 'function') {
        const directory = provider.directoryForURISync(projectPath);
        if (directory) {
          return directory;
        }
      }
    }
    return null;
  }

  getDirectoryForProjectPath(projectPath) {
    let directory = this.getProvidedDirectoryForProjectPath(projectPath);
    if (directory == null) {
      directory = this.defaultDirectoryProvider.directoryForURISync(
        projectPath
      );
    }
    return directory;
  }

  // Extended: Access a {Promise} that resolves when the filesystem watcher associated with a project
  // root directory is ready to begin receiving events.
  //
  // This is especially useful in test cases, where it's important to know that the watcher is
  // ready before manipulating the filesystem to produce events.
  //
  // * `projectPath` {String} One of the project's root directories.
  //
  // Returns a {Promise} that resolves with the {PathWatcher} associated with this project root
  // once it has initialized and is ready to start sending events. The Promise will reject with
  // an error instead if `projectPath` is not currently a root directory.
  getWatcherPromise(projectPath) {
    return (
      this.watcherPromisesByPath[projectPath] ||
      Promise.reject(new Error(`${projectPath} is not a project root`))
    );
  }

  // Public: remove a path from the project's list of root paths.
  //
  // * `projectPath` {String} The path to remove.
  removePath(projectPath) {
    // The projectPath may be a URI, in which case it should not be normalized.
    if (!this.getPaths().includes(projectPath)) {
      projectPath = this.defaultDirectoryProvider.normalizePath(projectPath);
    }

    let indexToRemove = null;
    for (let i = 0; i < this.rootDirectories.length; i++) {
      const directory = this.rootDirectories[i];
      if (directory.getPath() === projectPath) {
        indexToRemove = i;
        break;
      }
    }

    if (indexToRemove != null) {
      this.rootDirectories.splice(indexToRemove, 1);
      const [removedRepository] = this.repositories.splice(indexToRemove, 1);
      if (!this.repositories.includes(removedRepository)) {
        if (removedRepository) removedRepository.destroy();
      }
      if (this.watcherPromisesByPath[projectPath] != null) {
        this.watcherPromisesByPath[projectPath].then(w => w.dispose());
      }
      delete this.watcherPromisesByPath[projectPath];
      this.syncFsIpcProjectRoots();
      this.syncRootConfigs();
      this.emitter.emit('did-change-paths', this.getPaths());
      return true;
    } else {
      return false;
    }
  }

  // Public: Get an {Array} of {Directory}s associated with this project.
  getDirectories() {
    return this.rootDirectories;
  }

  resolvePath(uri) {
    if (!uri) {
      return;
    }

    if (uri.match(/[A-Za-z0-9+-.]+:\/\//)) {
      // leave path alone if it has a scheme
      return uri;
    } else {
      let projectPath;
      if (fs.isAbsolute(uri)) {
        return this.defaultDirectoryProvider.normalizePath(fs.resolveHome(uri));
        // TODO: what should we do here when there are multiple directories?
      } else if ((projectPath = this.getPaths()[0])) {
        return this.defaultDirectoryProvider.normalizePath(
          fs.resolveHome(path.join(projectPath, uri))
        );
      } else {
        return undefined;
      }
    }
  }

  relativize(fullPath) {
    return this.relativizePath(fullPath)[1];
  }

  // Public: Get the path to the project directory that contains the given path,
  // and the relative path from that project directory to the given path.
  //
  // * `fullPath` {String} An absolute path.
  //
  // Returns an {Array} with two elements:
  // * `projectPath` The {String} path to the project directory that contains the
  //   given path, or `null` if none is found.
  // * `relativePath` {String} The relative path from the project directory to
  //   the given path.
  relativizePath(fullPath) {
    let result = [null, fullPath];
    if (fullPath != null) {
      for (let rootDirectory of this.rootDirectories) {
        const relativePath = rootDirectory.relativize(fullPath);
        if (relativePath != null && relativePath.length < result[1].length) {
          result = [rootDirectory.getPath(), relativePath];
        }
      }
    }
    return result;
  }

  // Public: Determines whether the given path (real or symbolic) is inside the
  // project's directory.
  //
  // This method does not actually check if the path exists, it just checks their
  // locations relative to each other.
  //
  // ## Examples
  //
  // Basic operation
  //
  // ```coffee
  // # Project's root directory is /foo/bar
  // project.contains('/foo/bar/baz')        # => true
  // project.contains('/usr/lib/baz')        # => false
  // ```
  //
  // Existence of the path is not required
  //
  // ```coffee
  // # Project's root directory is /foo/bar
  // fs.existsSync('/foo/bar/baz')           # => false
  // project.contains('/foo/bar/baz')        # => true
  // ```
  //
  // * `pathToCheck` {String} path
  //
  // Returns whether the path is inside the project's root directory.
  contains(pathToCheck) {
    return this.rootDirectories.some(dir => dir.contains(pathToCheck));
  }

  /*
  Section: Private
  */

  consumeServices({ serviceHub }) {
    serviceHub.consume('atom.directory-provider', '^0.1.0', provider => {
      this.directoryProviders.unshift(provider);
      return new Disposable(() => {
        return this.directoryProviders.splice(
          this.directoryProviders.indexOf(provider),
          1
        );
      });
    });

    return serviceHub.consume(
      'atom.repository-provider',
      '^0.1.0',
      provider => {
        this.repositoryProviders.unshift(provider);
        if (this.repositories.includes(null)) {
          this.setPaths(this.getPaths());
        }
        return new Disposable(() => {
          return this.repositoryProviders.splice(
            this.repositoryProviders.indexOf(provider),
            1
          );
        });
      }
    );
  }

  // Retrieves all the {TextBuffer}s in the project; that is, the
  // buffers for all open files.
  //
  // Returns an {Array} of {TextBuffer}s.
  getBuffers() {
    return this.buffers.slice();
  }

  // Is the buffer for the given path modified?
  isPathModified(filePath) {
    const bufferForPath = this.findBufferForPath(this.resolvePath(filePath));
    return bufferForPath && bufferForPath.isModified();
  }

  findBufferForPath(filePath) {
    return _.find(this.buffers, buffer => buffer.getPath() === filePath);
  }

  findBufferForId(id) {
    return _.find(this.buffers, buffer => buffer.getId() === id);
  }

  // Only to be used in specs
  bufferForPathSync(filePath) {
    const absoluteFilePath = this.resolvePath(filePath);
    if (this.retiredBufferPaths.has(absoluteFilePath)) {
      return null;
    }

    let existingBuffer;
    if (filePath) {
      existingBuffer = this.findBufferForPath(absoluteFilePath);
    }
    return existingBuffer != null
      ? existingBuffer
      : this.buildBufferSync(absoluteFilePath);
  }

  // Only to be used when deserializing
  bufferForIdSync(id) {
    if (this.retiredBufferIDs.has(id)) {
      return null;
    }

    let existingBuffer;
    if (id) {
      existingBuffer = this.findBufferForId(id);
    }
    return existingBuffer != null ? existingBuffer : this.buildBufferSync();
  }

  // Given a file path, this retrieves or creates a new {TextBuffer}.
  //
  // If the `filePath` already has a `buffer`, that value is used instead. Otherwise,
  // `text` is used as the contents of the new buffer.
  //
  // * `filePath` A {String} representing a path. If `null`, an "Untitled" buffer is created.
  // * `options` (optional) {Object}
  //   * `largeFileMode` {Boolean} If the buffer has to be built, build it in
  //     large-file mode (see {::setLargeFileMode}). A buffer that is already
  //     open keeps the mode it has.
  //
  // Returns a {Promise} that resolves to the {TextBuffer}.
  bufferForPath(absoluteFilePath, options = {}) {
    let existingBuffer;
    if (absoluteFilePath != null) {
      existingBuffer = this.findBufferForPath(absoluteFilePath);
    }
    if (existingBuffer) {
      return Promise.resolve(existingBuffer);
    } else {
      return this.buildBuffer(absoluteFilePath, options);
    }
  }

  /*
  Section: Large-file mode
  */

  // Public: Is the buffer in large-file mode?
  //
  // A buffer in large-file mode is plain text: it is never parsed, so it has
  // no syntax highlighting or folds, and the language server and the
  // per-keystroke decorations of the bundled packages leave its editors alone.
  // {TextEditor::isLargeFileMode} asks this for the editor's buffer.
  isLargeFileBuffer(buffer) {
    return buffer != null && this.largeFileBufferIds.has(buffer.id);
  }

  // Public: Put a buffer in or out of large-file mode.
  //
  // Leaving it re-detects the buffer's language, which parses it.
  setLargeFileMode(buffer, enabled) {
    enabled = Boolean(enabled);
    if (buffer == null || this.isLargeFileBuffer(buffer) === enabled) return;
    if (enabled) {
      this.largeFileBufferIds.add(buffer.id);
      this.assignLargeFileLanguageMode(buffer);
    } else {
      this.largeFileBufferIds.delete(buffer.id);
      this.grammarRegistry.autoAssignLanguageMode(buffer);
    }
    this.emitter.emit('did-change-large-file-mode', { buffer, enabled });
  }

  // Public: Invoke the given callback when a buffer enters or leaves
  // large-file mode.
  //
  // * `callback` {Function}
  //   * `event` {Object}
  //     * `buffer` The {TextBuffer}.
  //     * `enabled` {Boolean} Whether it is now in large-file mode.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChangeLargeFileMode(callback) {
    return this.emitter.on('did-change-large-file-mode', callback);
  }

  // The override keeps the registry from auto-assigning a grammar later; the
  // registry's own mode for the null grammar folds, so it is replaced. Assigning
  // the null grammar again is a no-op, which keeps this one in place.
  assignLargeFileLanguageMode(buffer) {
    this.grammarRegistry.assignLanguageMode(buffer, NullGrammar.scopeName);
    buffer.setLanguageMode(
      new PlainTextLanguageMode(buffer, NullGrammar, { folding: false })
    );
  }

  shouldDestroyBufferOnFileDelete() {
    return chevron.config.get('core.closeDeletedFileTabs');
  }

  // Still needed when deserializing a tokenized buffer
  buildBufferSync(absoluteFilePath) {
    const params = {
      shouldDestroyOnFileDelete: this.shouldDestroyBufferOnFileDelete
    };

    let buffer;
    if (absoluteFilePath != null) {
      buffer = TextBuffer.loadSync(absoluteFilePath, params);
    } else {
      buffer = new TextBuffer(params);
    }
    this.addBuffer(buffer);
    return buffer;
  }

  // Given a file path, this sets its {TextBuffer}.
  //
  // * `absoluteFilePath` A {String} representing a path.
  // * `text` The {String} text to use as a buffer.
  //
  // Returns a {Promise} that resolves to the {TextBuffer}.
  async buildBuffer(absoluteFilePath, options = {}) {
    const params = {
      shouldDestroyOnFileDelete: this.shouldDestroyBufferOnFileDelete
    };

    let buffer;
    if (absoluteFilePath != null) {
      if (this.loadPromisesByPath[absoluteFilePath] == null) {
        this.loadPromisesByPath[absoluteFilePath] = TextBuffer.load(
          absoluteFilePath,
          params
        )
          .then(result => {
            delete this.loadPromisesByPath[absoluteFilePath];
            return result;
          })
          .catch(error => {
            delete this.loadPromisesByPath[absoluteFilePath];
            throw error;
          });
      }
      buffer = await this.loadPromisesByPath[absoluteFilePath];
    } else {
      buffer = new TextBuffer(params);
    }

    if (options.largeFileMode) {
      // Assigned before the buffer is added, so it is never parsed at all.
      this.largeFileBufferIds.add(buffer.id);
      this.assignLargeFileLanguageMode(buffer);
    } else {
      this.grammarRegistry.autoAssignLanguageMode(buffer);
    }

    this.addBuffer(buffer);
    return buffer;
  }

  addBuffer(buffer, options = {}) {
    this.buffers.push(buffer);
    this.subscriptions.add(this.grammarRegistry.maintainLanguageMode(buffer));
    this.subscribeToBuffer(buffer);
    this.emitter.emit('did-add-buffer', buffer);
    return buffer;
  }

  // Removes a {TextBuffer} association from the project.
  //
  // Returns the removed {TextBuffer}.
  removeBuffer(buffer) {
    const index = this.buffers.indexOf(buffer);
    if (index !== -1) {
      return this.removeBufferAtIndex(index);
    }
  }

  removeBufferAtIndex(index, options = {}) {
    const [buffer] = this.buffers.splice(index, 1);
    if (buffer != null) this.largeFileBufferIds.delete(buffer.id);
    return buffer != null ? buffer.destroy() : undefined;
  }

  eachBuffer(...args) {
    let subscriber;
    if (args.length > 1) {
      subscriber = args.shift();
    }
    const callback = args.shift();

    for (let buffer of this.getBuffers()) {
      callback(buffer);
    }
    if (subscriber) {
      return subscriber.subscribe(this, 'buffer-created', buffer =>
        callback(buffer)
      );
    } else {
      return this.on('buffer-created', buffer => callback(buffer));
    }
  }

  subscribeToBuffer(buffer) {
    buffer.onWillSave(async ({ path }) =>
      this.applicationDelegate.emitWillSavePath(path)
    );
    buffer.onDidSave(({ path: savedPath }) => {
      this.applicationDelegate.emitDidSavePath(savedPath);
      // Saving a root's config in Chevron itself applies immediately, without
      // waiting on the filesystem watcher. The watcher covers edits made
      // outside the editor; it does not report this reliably on every
      // platform, and "I edited it here and nothing happened" is the case
      // people meet first.
      if (isRootConfigEvent({ path: savedPath })) this.syncRootConfigs();
    });
    buffer.onDidDestroy(() => this.removeBuffer(buffer));
    // Picking a grammar for a large file parses it anyway; the rest of the
    // features may as well follow.
    buffer.onDidChangeLanguageMode(() => {
      if (
        this.isLargeFileBuffer(buffer) &&
        buffer.getLanguageMode().grammar !== NullGrammar
      ) {
        this.largeFileBufferIds.delete(buffer.id);
        this.emitter.emit('did-change-large-file-mode', {
          buffer,
          enabled: false
        });
      }
    });
    buffer.onDidChangePath(() => {
      if (!(this.getPaths().length > 0)) {
        this.setPaths([path.dirname(buffer.getPath())]);
      }
    });
    buffer.onWillThrowWatchError(({ error, handle }) => {
      handle();
      const message =
        `Unable to read file after file \`${error.eventType}\` event.` +
        `Make sure you have permission to access \`${buffer.getPath()}\`.`;
      this.notificationManager.addWarning(message, {
        detail: error.message,
        dismissable: true
      });
    });
  }
};
