const { EventEmitter } = require('events');
const https = require('https');
const os = require('os');
const path = require('path');
const {
  DEFAULT_RELEASES_URL,
  DEFAULT_API_URL,
  isNewerRelease,
  pickLatestRelease,
  summarizeRelease
} = require('./github-release-check');

const IdleState = 'idle';
const CheckingState = 'checking';
const DownloadingState = 'downloading';
const UpdateAvailableState = 'update-available';
const NoUpdateAvailableState = 'no-update-available';
const UnsupportedState = 'unsupported';
const ErrorState = 'error';

let autoUpdater = null;

module.exports = class AutoUpdateManager extends EventEmitter {
  constructor(version, testMode, config) {
    super();
    this.onUpdateNotAvailable = this.onUpdateNotAvailable.bind(this);
    this.onUpdateError = this.onUpdateError.bind(this);
    this.version = version;
    this.testMode = testMode;
    this.config = config;
    this.state = IdleState;
    this.iconPath = path.resolve(
      __dirname,
      '..',
      '..',
      'resources',
      'atom.png'
    );
    // Squirrel / electron autoUpdater feed (signed builds). Unsigned preview
    // uses GitHub Releases instead — see docs/releases.md.
    this.updateUrlPrefix =
      process.env.CHEVRON_UPDATE_URL_PREFIX ||
      process.env.ATOM_UPDATE_URL_PREFIX ||
      '';
    this.releasesUrl =
      process.env.CHEVRON_RELEASES_URL || DEFAULT_RELEASES_URL;
    this.releasesApiUrl =
      process.env.CHEVRON_RELEASES_API_URL || DEFAULT_API_URL;
    this.mode = this.updateUrlPrefix ? 'squirrel' : 'github-releases';
  }

  initialize() {
    if (this.mode === 'github-releases') {
      this.setupGitHubReleaseChecks();
      return;
    }

    if (process.platform === 'win32') {
      const archSuffix = process.arch === 'ia32' ? '' : `-${process.arch}`;
      this.feedUrl =
        this.updateUrlPrefix +
        `/api/updates${archSuffix}?version=${this.version}&os_version=${
          os.release
        }`;
      autoUpdater = require('./auto-updater-win32');
    } else {
      this.feedUrl =
        this.updateUrlPrefix +
        `/api/updates?version=${this.version}&os_version=${os.release}`;
      ({ autoUpdater } = require('electron'));
    }

    autoUpdater.on('error', (event, message) => {
      this.setState(ErrorState, message);
      this.emitWindowEvent('update-error');
      console.error(`Error Downloading Update: ${message}`);
    });

    autoUpdater.setFeedURL(this.feedUrl);

    autoUpdater.on('checking-for-update', () => {
      this.setState(CheckingState);
      this.emitWindowEvent('checking-for-update');
    });

    autoUpdater.on('update-not-available', () => {
      this.setState(NoUpdateAvailableState);
      this.emitWindowEvent('update-not-available');
    });

    autoUpdater.on('update-available', () => {
      this.setState(DownloadingState);
      // We use sendMessage to send an event called 'update-available' in 'update-downloaded'
      // once the update download is complete. This mismatch between the electron
      // autoUpdater events is unfortunate but in the interest of not changing the
      // one existing event handled by applicationDelegate
      this.emitWindowEvent('did-begin-downloading-update');
      this.emit('did-begin-download');
    });

    autoUpdater.on(
      'update-downloaded',
      (event, releaseNotes, releaseVersion) => {
        this.releaseVersion = releaseVersion;
        this.setState(UpdateAvailableState);
        this.emitUpdateAvailableEvent();
      }
    );

    this.config.onDidChange('core.automaticallyUpdate', ({ newValue }) => {
      if (newValue) {
        this.scheduleUpdateCheck();
      } else {
        this.cancelScheduledUpdateCheck();
      }
    });

    if (this.config.get('core.automaticallyUpdate')) this.scheduleUpdateCheck();

    switch (process.platform) {
      case 'win32':
        if (!autoUpdater.supportsUpdates()) {
          this.setState(UnsupportedState);
        }
        break;
      case 'linux':
        this.setState(UnsupportedState);
    }
  }

  setupGitHubReleaseChecks() {
    this.config.onDidChange('core.automaticallyUpdate', ({ newValue }) => {
      if (newValue) {
        this.scheduleUpdateCheck();
      } else {
        this.cancelScheduledUpdateCheck();
      }
    });
    if (this.config.get('core.automaticallyUpdate')) this.scheduleUpdateCheck();
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
    if (this.state === state) return;
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
    if (this.mode === 'github-releases') {
      return this.checkGitHubReleases({ hidePopups });
    }

    if (!autoUpdater) {
      if (!hidePopups) this.onUpdateNotAvailable();
      return;
    }

    if (!hidePopups) {
      autoUpdater.once('update-not-available', this.onUpdateNotAvailable);
      autoUpdater.once('error', this.onUpdateError);
    }

    if (!this.testMode) autoUpdater.checkForUpdates();
  }

  async checkGitHubReleases({ hidePopups } = {}) {
    this.setState(CheckingState);
    this.emitWindowEvent('checking-for-update');
    try {
      if (this.testMode) {
        this.setState(NoUpdateAvailableState);
        if (!hidePopups) this.onUpdateNotAvailable();
        return;
      }
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
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Open download page', 'Later'],
        defaultId: 0,
        cancelId: 1,
        icon: this.iconPath,
        message: `Chevron ${latest.tag} is available.`,
        title: 'Update Available',
        detail:
          `You have ${this.version}. Unsigned preview builds are not installed ` +
          `in-app — download from GitHub Releases.\n\n${this.releasePageUrl}`
      })
      .then(({ response }) => {
        if (response === 0) {
          shell.openExternal(this.releasePageUrl);
        }
      });
  }

  install() {
    if (this.mode === 'github-releases') {
      if (this.testMode) return;
      const { shell } = require('electron');
      shell.openExternal(
        this.releasePageUrl || `${this.releasesUrl}/latest`
      );
      return;
    }
    if (!this.testMode && autoUpdater) autoUpdater.quitAndInstall();
  }

  onUpdateNotAvailable() {
    if (autoUpdater) {
      autoUpdater.removeListener('error', this.onUpdateError);
    }
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
    if (autoUpdater) {
      autoUpdater.removeListener(
        'update-not-available',
        this.onUpdateNotAvailable
      );
    }
    const { dialog } = require('electron');
    dialog.showMessageBox({
      type: 'warning',
      buttons: ['OK'],
      icon: this.iconPath,
      message: 'There was an error checking for updates.',
      title: 'Update Error',
      detail: message
    });
  }

  getWindows() {
    return global.atomApplication.getAllWindows();
  }
};
