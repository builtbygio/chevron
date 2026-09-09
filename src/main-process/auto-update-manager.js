const { EventEmitter } = require('events');
const https = require('https');
const path = require('path');
const {
  DEFAULT_RELEASES_URL,
  DEFAULT_API_URL,
  isNewerRelease,
  pickLatestRelease,
  summarizeRelease
} = require('./github-release-check');
const {
  IN_APP,
  DOWNLOAD_PAGE,
  UNSUPPORTED,
  readUpdateConfig,
  chooseUpdateMode
} = require('./update-config');
const getReleaseChannel = require('../get-release-channel');

const IdleState = 'idle';
const CheckingState = 'checking';
const DownloadingState = 'downloading';
const UpdateAvailableState = 'update-available';
const NoUpdateAvailableState = 'no-update-available';
const UnsupportedState = 'unsupported';
const ErrorState = 'error';

// Updates come from GitHub Releases, through electron-updater where the build
// can install them (docs/reference/auto-update.md). The states and the window
// messages are the ones the about package and the application menu already
// understand; the modes decide what happens between them:
//
//   in-app          electron-updater checks, downloads, and installs on
//                   "Restart and Install Update" (or on quit).
//   download-page   check the Releases API, open the page for the user.
//   unsupported     dev builds and tests.
//
// `options.createUpdater` and `options.readUpdateConfig` exist for the tests.
module.exports = class AutoUpdateManager extends EventEmitter {
  constructor(version, testMode, config, options = {}) {
    super();
    this.onUpdateNotAvailable = this.onUpdateNotAvailable.bind(this);
    this.onUpdateError = this.onUpdateError.bind(this);
    this.version = version;
    this.testMode = testMode;
    this.config = config;
    this.state = IdleState;
    this.updater = null;
    this.releaseVersion = null;
    this.releasePageUrl = null;
    this.iconPath = path.resolve(
      __dirname,
      '..',
      '..',
      'resources',
      'atom.png'
    );
    this.releasesUrl = process.env.CHEVRON_RELEASES_URL || DEFAULT_RELEASES_URL;
    this.releasesApiUrl =
      process.env.CHEVRON_RELEASES_API_URL || DEFAULT_API_URL;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.createUpdater = options.createUpdater || defaultCreateUpdater;
    this.getWindows =
      options.getWindows || (() => global.chevronApplication.getAllWindows());

    const isPackaged =
      options.isPackaged != null ? options.isPackaged : isPackagedApp();
    const updateConfig =
      options.updateConfig !== undefined
        ? options.updateConfig
        : isPackaged
        ? readUpdateConfig(process.resourcesPath)
        : null;
    this.updateConfig = updateConfig;
    this.mode = testMode
      ? UNSUPPORTED
      : chooseUpdateMode({
          platform: this.platform,
          isPackaged,
          updateConfig,
          env: this.env
        });
  }

  initialize() {
    if (this.mode === UNSUPPORTED) {
      this.setState(UnsupportedState);
      return;
    }
    if (this.mode === IN_APP) {
      this.setupElectronUpdater();
    }
    this.config.onDidChange('core.automaticallyUpdate', ({ newValue }) => {
      if (newValue) {
        this.scheduleUpdateCheck();
      } else {
        this.cancelScheduledUpdateCheck();
      }
    });
    if (this.config.get('core.automaticallyUpdate')) this.scheduleUpdateCheck();
  }

  setupElectronUpdater() {
    const updater = this.createUpdater();
    this.updater = updater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    // The preview releases are flagged pre-release on GitHub. A stable version
    // would otherwise never see them; a beta/nightly build always does.
    updater.allowPrerelease =
      getReleaseChannel(this.version) !== 'stable' ||
      !!this.config.get('core.allowPrereleaseUpdates');
    if (this.env.CHEVRON_UPDATE_FEED_URL) {
      updater.setFeedURL(this.env.CHEVRON_UPDATE_FEED_URL);
    }
    if (updater.logger !== undefined) updater.logger = updaterLogger();

    updater.on('checking-for-update', () => {
      this.setState(CheckingState);
      this.emitWindowEvent('checking-for-update');
    });
    updater.on('update-not-available', () => {
      this.setState(NoUpdateAvailableState);
      this.emitWindowEvent('update-not-available');
    });
    updater.on('update-available', info => {
      this.releaseVersion = info && info.version;
      this.setState(DownloadingState);
      // 'did-begin-downloading-update' is the renderer's name for this; the
      // 'update-available' message goes out once the download has finished.
      this.emitWindowEvent('did-begin-downloading-update');
      this.emit('did-begin-download');
    });
    updater.on('update-downloaded', info => {
      this.releaseVersion = (info && info.version) || this.releaseVersion;
      this.setState(UpdateAvailableState);
      this.emitUpdateAvailableEvent();
    });
    updater.on('error', error => {
      const message = error && error.message ? error.message : String(error);
      this.setState(ErrorState, message);
      this.emitWindowEvent('update-error');
      console.error(`Error checking for or downloading an update: ${message}`);
    });
  }

  emitUpdateAvailableEvent() {
    if (this.releaseVersion == null) return;
    this.emitWindowEvent('update-available', {
      releaseVersion: this.releaseVersion
    });
  }

  emitWindowEvent(eventName, payload) {
    for (let atomWindow of this.getWindows()) {
      atomWindow.sendMessage(eventName, payload);
    }
  }

  setState(state, errorMessage) {
    if (this.state === state && this.errorMessage === errorMessage) return;
    this.state = state;
    this.errorMessage = errorMessage;
    this.emit('state-changed', this.state);
  }

  getState() {
    return this.state;
  }

  getErrorMessage() {
    return this.errorMessage;
  }

  getMode() {
    return this.mode;
  }

  scheduleUpdateCheck() {
    // Only schedule update check periodically if running in release version and
    // and there is no existing scheduled update check.
    if (!/-dev/.test(this.version) && !this.checkForUpdatesIntervalID) {
      const checkForUpdates = () => this.check({ hidePopups: true });
      const fourHours = 1000 * 60 * 60 * 4;
      this.checkForUpdatesIntervalID = setInterval(checkForUpdates, fourHours);
      checkForUpdates();
    }
  }

  cancelScheduledUpdateCheck() {
    if (this.checkForUpdatesIntervalID) {
      clearInterval(this.checkForUpdatesIntervalID);
      this.checkForUpdatesIntervalID = null;
    }
  }

  check({ hidePopups } = {}) {
    switch (this.mode) {
      case IN_APP:
        return this.checkWithElectronUpdater({ hidePopups });
      case DOWNLOAD_PAGE:
        return this.checkGitHubReleases({ hidePopups });
      default:
        if (!hidePopups) this.onUpdateNotAvailable();
        return Promise.resolve();
    }
  }

  async checkWithElectronUpdater({ hidePopups } = {}) {
    if (!this.updater) return;
    try {
      const result = await this.updater.checkForUpdates();
      const available =
        result &&
        result.updateInfo &&
        isNewerRelease(result.updateInfo.version, this.version);
      if (!hidePopups && !available) {
        // The updater's own 'update-not-available' has set the state; the
        // dialog is the manual check's answer.
        this.onUpdateNotAvailable();
      }
    } catch (error) {
      // The 'error' event has set the state and logged. A manual check gets a
      // dialog with the way out that always works.
      if (!hidePopups) {
        this.onUpdateError(null, this.errorMessage || String(error));
      }
    }
  }

  async checkGitHubReleases({ hidePopups } = {}) {
    this.setState(CheckingState);
    this.emitWindowEvent('checking-for-update');
    try {
      const releases = await this.fetchGitHubReleases();
      const latest = summarizeRelease(pickLatestRelease(releases));
      if (latest && isNewerRelease(latest.tag, this.version)) {
        this.releaseVersion = latest.tag;
        this.releasePageUrl = latest.htmlUrl || `${this.releasesUrl}/latest`;
        this.setState(UpdateAvailableState);
        this.emitUpdateAvailableEvent();
        if (!hidePopups) this.showGitHubUpdateAvailable(latest);
        return;
      }
      this.setState(NoUpdateAvailableState);
      this.emitWindowEvent('update-not-available');
      if (!hidePopups) this.onUpdateNotAvailable();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      this.setState(ErrorState, message);
      this.emitWindowEvent('update-error');
      if (!hidePopups) this.onUpdateError(null, message);
    }
  }

  fetchGitHubReleases() {
    return new Promise((resolve, reject) => {
      const req = https.get(
        this.releasesApiUrl,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': `Chevron/${this.version}`
          }
        },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(
                new Error(
                  `GitHub Releases ${res.statusCode}: ${body.slice(0, 180)}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on('error', reject);
    });
  }

  showGitHubUpdateAvailable(latest) {
    const { dialog, shell } = require('electron');
    const why =
      this.platform === 'darwin'
        ? 'This build is not code-signed, so macOS will not let it update itself.'
        : 'Updates for this install come from the package you installed it with.';
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Open download page', 'Later'],
        defaultId: 0,
        cancelId: 1,
        icon: this.iconPath,
        message: `Chevron ${latest.tag} is available.`,
        title: 'Update Available',
        detail: `You have ${this.version}. ${why}\n\n${this.releasePageUrl}`
      })
      .then(({ response }) => {
        if (response === 0) {
          shell.openExternal(this.releasePageUrl);
        }
      });
  }

  install() {
    if (this.testMode) return;
    if (this.mode === IN_APP && this.updater) {
      this.updater.quitAndInstall();
      return;
    }
    const { shell } = require('electron');
    shell.openExternal(this.releasePageUrl || `${this.releasesUrl}/latest`);
  }

  onUpdateNotAvailable() {
    const { dialog } = require('electron');
    dialog.showMessageBox({
      type: 'info',
      buttons: ['OK'],
      icon: this.iconPath,
      message: 'No update available.',
      title: 'No Update Available',
      detail: `Version ${this.version} is the latest version.`
    });
  }

  onUpdateError(event, message) {
    const { dialog, shell } = require('electron');
    dialog
      .showMessageBox({
        type: 'warning',
        buttons: ['OK', 'Open download page'],
        defaultId: 0,
        cancelId: 0,
        icon: this.iconPath,
        message: 'There was an error checking for updates.',
        title: 'Update Error',
        detail: message
      })
      .then(({ response }) => {
        if (response === 1) shell.openExternal(this.releasesUrl);
      });
  }
};

function isPackagedApp() {
  try {
    return require('electron').app.isPackaged;
  } catch (error) {
    return false;
  }
}

function defaultCreateUpdater() {
  return require('electron-updater').autoUpdater;
}

// electron-updater logs through whatever has info/warn/error/debug; console
// here goes to nslog like the rest of the main process.
function updaterLogger() {
  return {
    info: (...args) => console.log('[updater]', ...args),
    warn: (...args) => console.warn('[updater]', ...args),
    error: (...args) => console.error('[updater]', ...args),
    debug: () => {}
  };
}
