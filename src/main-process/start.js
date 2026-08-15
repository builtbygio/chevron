const { app } = require('electron');
const nslog = require('nslog');
const path = require('path');
const temp = require('temp');
const parseCommandLine = require('./parse-command-line');
const startCrashReporter = require('../crash-reporter-start');
const getReleaseChannel = require('../get-release-channel');
const atomPaths = require('../atom-paths');
const fs = require('fs');
const CSON = require('season');
const Config = require('../config');
const { resolveUserDataFile } = require('../user-config-path');
const StartupTime = require('../startup-time');

StartupTime.setStartTime();

// @electron/remote removed — renderer uses IPC remote-compat (see remote-compat.js).

module.exports = function start(resourcePath, devResourcePath, startTime) {
  global.shellStartTime = startTime;
  StartupTime.addMarker('main-process:start');

  process.on('uncaughtException', function(error = {}) {
    if (error.message != null) {
      console.log(error.message);
    }

    if (error.stack != null) {
      console.log(error.stack);
    }
  });

  process.on('unhandledRejection', function(error = {}) {
    if (error.message != null) {
      console.log(error.message);
    }

    if (error.stack != null) {
      console.log(error.stack);
    }
  });

  // Electron BP P1.3: do not enable experimental web platform features by
  // default (security checklist). Opt in with CHEVRON_EXPERIMENTAL_WEB_FEATURES=1
  // or core.enableExperimentalWebFeatures when needed for dogfood.
  // (Flag applied after config load below.)

  // Linux: set WM_CLASS / Wayland app_id so shells can match chevron.desktop
  // (generic binary icon otherwise when launched without a desktop entry).
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('class', 'Chevron');
  }

  const args = parseCommandLine(process.argv.slice(1));

  // This must happen after parseCommandLine() because yargs uses console.log
  // to display the usage message.
  const previousConsoleLog = console.log;
  console.log = nslog;

  args.resourcePath = normalizeDriveLetterName(resourcePath);
  args.devResourcePath = normalizeDriveLetterName(devResourcePath);

  atomPaths.setAtomHome(app.getPath('home'));
  atomPaths.setUserData(app);

  const config = getConfig();
  const colorProfile = config.get('core.colorProfile');
  if (colorProfile && colorProfile !== 'default') {
    app.commandLine.appendSwitch('force-color-profile', colorProfile);
  }

  // Electron BP P1.2 / P1.3 — policy env for renderer/preload children.
  applySecurityPolicyEnv(config);

  if (handleStartupEventWithSquirrel()) {
    return;
  } else if (args.test && args.mainProcess) {
    app.setPath(
      'userData',
      temp.mkdirSync('atom-user-data-dir-for-main-process-tests')
    );
    console.log = previousConsoleLog;
    app.on('ready', function() {
      const testRunner = require(path.join(
        args.resourcePath,
        'spec/main-process/mocha-test-runner'
      ));
      testRunner(args.pathsToOpen);
    });
    return;
  }

  const releaseChannel = getReleaseChannel(app.getVersion());
  let appUserModelId = 'com.squirrel.atom.' + process.arch;

  // If the release channel is not stable, we append it to the app user model id.
  // This allows having the different release channels as separate items in the taskbar.
  if (releaseChannel !== 'stable') {
    appUserModelId += `-${releaseChannel}`;
  }

  // NB: This prevents Win10 from showing dupe items in the taskbar.
  app.setAppUserModelId(appUserModelId);

  // Linux: match packaged/installed .desktop StartupWMClass so shells
  // (especially Wayland) can associate the window with the Chevron icon.
  if (process.platform === 'linux' && typeof app.setDesktopName === 'function') {
    const desktopName =
      releaseChannel === 'stable' ? 'chevron.desktop' : `chevron-${releaseChannel}.desktop`;
    try {
      app.setDesktopName(desktopName);
    } catch (_) {
      /* older Electron */
    }
  }
  if (process.platform === 'linux' && typeof app.setName === 'function') {
    try {
      // productName from package.json; keep simple to avoid load-order deps.
      app.setName('Chevron');
    } catch (_) {
      /* ignore */
    }
  }

  function addPathToOpen(event, pathToOpen) {
    event.preventDefault();
    args.pathsToOpen.push(pathToOpen);
  }

  function addUrlToOpen(event, urlToOpen) {
    event.preventDefault();
    args.urlsToOpen.push(urlToOpen);
  }

  app.on('open-file', addPathToOpen);
  app.on('open-url', addUrlToOpen);
  app.on('will-finish-launching', () =>
    startCrashReporter({
      // Chevron: never upload crash reports to third parties
      uploadToServer: false,
      releaseChannel
    })
  );

  if (args.userDataDir != null) {
    app.setPath('userData', args.userDataDir);
  } else if (args.test || args.benchmark || args.benchmarkTest) {
    app.setPath('userData', temp.mkdirSync('atom-test-data'));
  }

  StartupTime.addMarker('main-process:electron-onready:start');
  app.on('ready', function() {
    StartupTime.addMarker('main-process:electron-onready:end');
    app.removeListener('open-file', addPathToOpen);
    app.removeListener('open-url', addUrlToOpen);
    const AtomApplication = require(path.join(
      args.resourcePath,
      'src',
      'main-process',
      'atom-application'
    ));
    AtomApplication.open(args);
  });
};

function handleStartupEventWithSquirrel() {
  if (process.platform !== 'win32') {
    return false;
  }

  const SquirrelUpdate = require('./squirrel-update');
  const squirrelCommand = process.argv[1];
  return SquirrelUpdate.handleStartupEvent(squirrelCommand);
}

function getConfig() {
  const config = new Config();
  const home = process.env.ATOM_HOME;
  if (!home) return config;

  const { filePath } = resolveUserDataFile(home, 'config');
  if (fs.existsSync(filePath)) {
    const configFileData = CSON.readFileSync(filePath);
    config.resetUserSettings(configFileData);
  }

  return config;
}

function normalizeDriveLetterName(filePath) {
  if (process.platform === 'win32' && filePath) {
    return filePath.replace(
      /^([a-z]):/,
      ([driveLetter]) => driveLetter.toUpperCase() + ':'
    );
  } else {
    return filePath;
  }
}

/**
 * Electron BP P1.2 / P1.3: push security policy into env for preload children.
 * Explicit env wins over config. Defaults favor hardening.
 */
function applySecurityPolicyEnv(config) {
  // Community privileged-require restrict (default ON).
  const restrictEnv = process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
  if (
    restrictEnv === undefined ||
    restrictEnv === '' ||
    restrictEnv === 'default'
  ) {
    const restrictConfig = config.get('core.restrictCommunityPackageRequires');
    process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES =
      restrictConfig === false ? '0' : '1';
  }

  // Experimental web features (default OFF).
  const expEnv = process.env.CHEVRON_EXPERIMENTAL_WEB_FEATURES;
  const expConfig = config.get('core.enableExperimentalWebFeatures');
  const enableExperimental =
    expEnv === '1' ||
    expEnv === 'true' ||
    expEnv === 'yes' ||
    expConfig === true;
  if (enableExperimental) {
    app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  }

  // FS IPC strict (default ON) — register-fs-ipc reads this.
  const fsEnv = process.env.CHEVRON_FS_IPC_STRICT;
  if (fsEnv === undefined || fsEnv === '' || fsEnv === 'default') {
    const fsStrict = config.get('core.fsIpcStrict');
    process.env.CHEVRON_FS_IPC_STRICT = fsStrict === false ? '0' : '1';
  }

  // Phase S3 complete: utilityProcess git workers are the product path.
  // Config false / CHEVRON_GITHUB_UTILITY_WORKERS=0 maps to emergency BW path.
  if (!process.env.CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW) {
    const utilEnv = process.env.CHEVRON_GITHUB_UTILITY_WORKERS;
    if (utilEnv === undefined || utilEnv === '' || utilEnv === 'default') {
      const utilConfig = config.get('core.githubUtilityWorkers');
      process.env.CHEVRON_GITHUB_UTILITY_WORKERS =
        utilConfig === false ? '0' : '1';
    }
  }
}
