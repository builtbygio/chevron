/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let PackageManager;
const _ = require('underscore-plus');
const {BufferedProcess, CompositeDisposable, Emitter} = require('chevron');
const semver = require('semver');

const Client = require('./atom-io-client');

module.exports =
(PackageManager = (function() {
  PackageManager = class PackageManager {
    static initClass() {
      // Millisecond expiry for cached loadOutdated, etc. values
      this.prototype.CACHE_EXPIRY = 1000*60*10;
    }

    constructor() {
      this.setProxyServers = this.setProxyServers.bind(this);
      this.setProxyServersAsync = this.setProxyServersAsync.bind(this);
      this.packagePromises = [];
      this.apmCache = {
        loadOutdated: {
          value: null,
          expiry: 0
        }
      };

      this.emitter = new Emitter;
    }

    getClient() {
      return this.client != null ? this.client : (this.client = new Client(this));
    }

    isPackageInstalled(packageName) {
      if (chevron.packages.isPackageLoaded(packageName)) {
        return true;
      } else {
        return chevron.packages.getAvailablePackageNames().indexOf(packageName) > -1;
      }
    }

    packageHasSettings(packageName) {
      let left;
      const grammars = (left = chevron.grammars.getGrammars()) != null ? left : [];
      for (var grammar of Array.from(grammars)) {
        if (grammar.path) {
          if (grammar.packageName === packageName) { return true; }
        }
      }

      const pack = chevron.packages.getLoadedPackage(packageName);
      if ((pack != null) && !chevron.packages.isPackageActive(packageName)) { pack.activateConfig(); }
      const schema = chevron.config.getSchema(packageName);
      return (schema != null) && (schema.type !== 'any');
    }

    setProxyServers(callback) {
      const {
        session
      } = chevron.getCurrentWindow().webContents;
      return session.resolveProxy('https://api.pulsar-edit.dev', httpProxy => {
        this.applyProxyToEnv('http_proxy', httpProxy);
        return session.resolveProxy('https://api.pulsar-edit.dev', httpsProxy => {
          this.applyProxyToEnv('https_proxy', httpsProxy);
          return callback();
        });
      });
    }

    setProxyServersAsync(callback) {
      const httpProxyPromise = chevron.resolveProxy('https://api.pulsar-edit.dev').then(proxy => this.applyProxyToEnv('http_proxy', proxy));
      const httpsProxyPromise = chevron.resolveProxy('https://api.pulsar-edit.dev').then(proxy => this.applyProxyToEnv('https_proxy', proxy));
      return Promise.all([httpProxyPromise, httpsProxyPromise]).then(callback);
    }

    applyProxyToEnv(envName, proxy) {
      if (proxy != null) {
        proxy = proxy.split(' ');
        switch (proxy[0].trim().toUpperCase()) {
          case 'DIRECT': delete process.env[envName]; break;
          case 'PROXY':  process.env[envName] = 'http://' + proxy[1]; break;
        }
      }
    }

    runCommand(args, callback) {
      const command = chevron.packages.getApmPath();
      const outputLines = [];
      const stdout = lines => outputLines.push(lines);
      const errorLines = [];
      const stderr = lines => errorLines.push(lines);
      const exit = code => callback(code, outputLines.join('\n'), errorLines.join('\n'));

      // Deliberately no --no-color. It is an apm-era flag: cpm's `list` does
      // not declare it and does not allowUnknownOption, so commander exits
      // with "unknown option '--no-color'" before running anything. Every call
      // through here failed, which is why the Packages and Themes panels list
      // nothing and "Fetching local packages failed." is thrown on startup.
      // cpm emits no colour to suppress -- `ls --json` is JSON.
      //
      // cpm's `rebuild` does accept it, added as a no-op for
      // Package.runRebuildProcess, which is why that caller kept working and
      // this one did not.

      if (chevron.config.get('core.useProxySettingsWhenCallingApm')) {
        const bufferedProcess = new BufferedProcess({command, args, stdout, stderr, exit, autoStart: false});
        if (chevron.resolveProxy != null) {
          this.setProxyServersAsync(() => bufferedProcess.start());
        } else {
          this.setProxyServers(() => bufferedProcess.start());
        }
        return bufferedProcess;
      } else {
        return new BufferedProcess({command, args, stdout, stderr, exit});
      }
    }

    loadInstalled(callback) {
      const args = ['ls', '--json'];
      const errorMessage = 'Fetching local packages failed.';
      const apmProcess = this.runCommand(args, function(code, stdout, stderr) {
        let error;
        if (code === 0) {
          let packages;
          try {
            let left;
            packages = (left = JSON.parse(stdout)) != null ? left : [];
          } catch (parseError) {
            error = createJsonParseError(errorMessage, parseError, stdout);
            return callback(error);
          }
          return callback(null, packages);
        } else {
          error = new Error(errorMessage);
          error.stdout = stdout;
          error.stderr = stderr;
          return callback(error);
        }
      });

      return handleProcessErrors(apmProcess, errorMessage, callback);
    }

    getVersionPinnedPackages() {
      let left;
      return (left = chevron.config.get('core.versionPinnedPackages')) != null ? left : [];
    }

    clearOutdatedCache() {
      return this.apmCache.loadOutdated = {
        value: null,
        expiry: 0
      };
    }

    loadCompatiblePackageVersion(packageName, callback) {
      // Asked the registry for the newest version matching this product. There
      // is no registry; package-card treats an error as "no update available".
      callback(
        new Error(
          `Chevron ships an owned catalog; no registry version for '${packageName}'.`
        )
      );
    }

    getInstalled() {
      return new Promise((resolve, reject) => {
        return this.loadInstalled(function(error, result) {
          if (error) {
            return reject(error);
          } else {
            return resolve(result);
          }
        });
      });
    }

    // Chevron ships an owned catalog and does not install community packages,
    // so there is no registry to feature from and nothing can be out of date.
    // These resolve empty rather than throwing: the Packages and Themes panels
    // call them on open, and an empty list is the truthful answer.
    getFeatured(_loadThemes) {
      return Promise.resolve([]);
    }

    getOutdated(_clearCache) {
      return Promise.resolve([]);
    }

    getPackage(packageName) {
      // No registry: package metadata for anything not installed cannot be
      // fetched. Reject with the reason rather than spawning a cpm command
      // that no longer exists.
      return Promise.reject(
        new Error(
          `Chevron ships an owned catalog and cannot look up '${packageName}' in a package registry.`
        )
      );
    }

    // Restored: #239 removed both of these with the registry client, but
    // package-card.js still calls them from displayNotInstalledState, so
    // rendering any card in that state threw
    // "this.packageManager.normalizeVersion is not a function" and the whole
    // Packages panel came up empty.
    //
    // The original read engines.atom. Across the catalog today 83 packages
    // declare both engines.atom and engines.chevron, 6 declare only chevron
    // and 1 only atom, so chevron is preferred with atom as the fallback --
    // reading only atom would silently treat those 6 as unconstrained.
    satisfiesVersion(version, metadata) {
      const engines = metadata.engines || {};
      const engine = engines.chevron || engines.atom || '*';
      if (!semver.validRange(engine)) return false;
      return semver.satisfies(version, engine);
    }

    // chevron.getVersion() can carry a prerelease suffix (1.2.0-beta1);
    // engines ranges are written against the release version.
    normalizeVersion(version) {
      return typeof version === 'string' ? version.split('-')[0] : version;
    }

    update(pack, newVersion, callback) {
      // Updating means fetching a newer version from a registry. There is
      // none. getOutdated() resolves empty, so nothing should reach here.
      const error = new Error(
        `Chevron ships an owned catalog; '${pack && pack.name}' cannot be updated from a registry.`
      );
      if (typeof callback === 'function') callback(error);
      return error;
    }

    install(pack, callback) {
      const error = new Error(
        `Chevron ships an owned catalog; '${pack && pack.name}' cannot be installed from a registry.`
      );
      if (typeof callback === 'function') callback(error);
      return error;
    }

    uninstall(pack, callback) {
      const {name} = pack;

      if (chevron.packages.isPackageActive(name)) { chevron.packages.deactivatePackage(name); }

      const errorMessage = `Uninstalling \u201C${name}\u201D failed.`;
      const onError = error => {
        this.emitPackageEvent('uninstall-failed', pack, error);
        return (typeof callback === 'function' ? callback(error) : undefined);
      };

      this.emitPackageEvent('uninstalling', pack);
      const apmProcess = this.runCommand(['uninstall', '--hard', name], (code, stdout, stderr) => {
        if (code === 0) {
          this.clearOutdatedCache();
          this.unload(name);
          this.removePackageNameFromDisabledPackages(name);
          if (typeof callback === 'function') {
            callback();
          }
          return this.emitPackageEvent('uninstalled', pack);
        } else {
          const error = new Error(errorMessage);
          error.stdout = stdout;
          error.stderr = stderr;
          return onError(error);
        }
      });

      return handleProcessErrors(apmProcess, errorMessage, onError);
    }

    installAlternative(pack, alternativePackageName, callback) {
      const eventArg = {pack, alternative: alternativePackageName};
      this.emitter.emit('package-installing-alternative', eventArg);

      const uninstallPromise = new Promise((resolve, reject) => {
        return this.uninstall(pack, function(error) {
          if (error) { return reject(error); } else { return resolve(); }
        });
      });

      const installPromise = new Promise((resolve, reject) => {
        return this.install({name: alternativePackageName}, function(error) {
          if (error) { return reject(error); } else { return resolve(); }
        });
      });

      return Promise.all([uninstallPromise, installPromise]).then(() => {
        callback(null, eventArg);
        return this.emitter.emit('package-installed-alternative', eventArg);
    }).catch(error => {
        console.error(error.message, error.stack);
        callback(error, eventArg);
        eventArg.error = error;
        return this.emitter.emit('package-install-alternative-failed', eventArg);
      });
    }

    canUpgrade(installedPackage, availableVersion) {
      if (installedPackage == null) { return false; }

      const installedVersion = installedPackage.metadata.version;
      if (!semver.valid(installedVersion)) { return false; }
      if (!semver.valid(availableVersion)) { return false; }

      return semver.gt(availableVersion, installedVersion);
    }

    getPackageTitle({name}) {
      return _.undasherize(_.uncamelcase(name));
    }

    getRepositoryUrl({metadata}) {
      let left;
      const {repository} = metadata;
      let repoUrl = (left = (repository != null ? repository.url : undefined) != null ? (repository != null ? repository.url : undefined) : repository) != null ? left : '';
      if (repoUrl.match('git@github')) {
        const repoName = repoUrl.split(':')[1];
        repoUrl = `https://github.com/${repoName}`;
      }
      return repoUrl.replace(/\.git$/, '').replace(/\/+$/, '').replace(/^git\+/, '');
    }

    getRepositoryBugUri({metadata}) {
      let bugUri;
      const {bugs} = metadata;
      if (typeof bugs === 'string') {
        bugUri = bugs;
      } else {
        let left;
        bugUri = (left = (bugs != null ? bugs.url : undefined) != null ? (bugs != null ? bugs.url : undefined) : (bugs != null ? bugs.email : undefined)) != null ? left : this.getRepositoryUrl({metadata}) + '/issues/new';
        if (bugUri.includes('@')) {
          bugUri = 'mailto:' + bugUri;
        }
      }
      return bugUri;
    }

    checkNativeBuildTools() {
      // This probed `cpm install --check`, which existed to verify a native
      // toolchain before installing a community package. There is no install
      // path any more; error-view already treats a rejection as "unknown".
      return Promise.reject(
        new Error('Native build tooling is not probed: Chevron does not install packages.')
      );
    }
    removePackageNameFromDisabledPackages(packageName) {
      return chevron.config.removeAtKeyPath('core.disabledPackages', packageName);
    }

    // Emits the appropriate event for the given package.
    //
    // All events are either of the form `theme-foo` or `package-foo` depending on
    // whether the event is for a theme or a normal package. This method standardizes
    // the logic to determine if a package is a theme or not and formats the event
    // name appropriately.
    //
    // eventName - The event name suffix {String} of the event to emit.
    // pack - The package for which the event is being emitted.
    // error - Any error information to be included in the case of an error.
    emitPackageEvent(eventName, pack, error) {
      const theme = pack.theme != null ? pack.theme : (pack.metadata != null ? pack.metadata.theme : undefined);
      eventName = theme ? `theme-${eventName}` : `package-${eventName}`;
      return this.emitter.emit(eventName, {pack, error});
    }

    on(selectors, callback) {
      const subscriptions = new CompositeDisposable;
      for (var selector of Array.from(selectors.split(" "))) {
        subscriptions.add(this.emitter.on(selector, callback));
      }
      return subscriptions;
    }
  };
  PackageManager.initClass();
  return PackageManager;
})());

var createJsonParseError = function(message, parseError, stdout) {
  const error = new Error(message);
  error.stdout = '';
  error.stderr = `${parseError.message}: ${stdout}`;
  return error;
};

const createProcessError = function(message, processError) {
  const error = new Error(message);
  error.stdout = '';
  error.stderr = processError.message;
  return error;
};

var handleProcessErrors = (apmProcess, message, callback) => apmProcess.onWillThrowError(function({error, handle}) {
  handle();
  return callback(createProcessError(message, error));
});
