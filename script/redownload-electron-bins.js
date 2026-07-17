const { spawn } = require('child_process');
const { hostCanRunMksnapshot } = require('./lib/mksnapshot-host-support');

const electronVersion = require('./config').appMetadata.electronVersion;

if (process.env.ELECTRON_CUSTOM_VERSION !== electronVersion) {
  const electronEnv = process.env.ELECTRON_CUSTOM_VERSION;
  console.info(
    `env var ELECTRON_CUSTOM_VERSION is not set,\n` +
      `or doesn't match electronVersion in ../package.json.\n` +
      `(is: "${electronEnv}", wanted: "${electronVersion}").\n` +
      `Setting, and re-downloading chromedriver and mksnapshot.\n`
  );

  process.env.ELECTRON_CUSTOM_VERSION = electronVersion;
  const downloadChromedriverPath = require.resolve(
    'electron-chromedriver/download-chromedriver.js'
  );
  const downloadChromedriver = spawn('node', [downloadChromedriverPath]);

  downloadChromedriver.on('close', code => {
    const exitStatus = code === 0 ? 'success' : 'error';
    console.info(
      `info: Done re-downloading chromedriver. Status: ${exitStatus}`
    );
  });

  if (hostCanRunMksnapshot()) {
    const downloadMksnapshotPath = require.resolve(
      'electron-mksnapshot/download-mksnapshot.js'
    );
    const downloadMksnapshot = spawn('node', [downloadMksnapshotPath]);
    downloadMksnapshot.on('close', code => {
      const exitStatus = code === 0 ? 'success' : 'error';
      console.info(
        `info: Done re-downloading mksnapshot. Status: ${exitStatus}`
      );
    });
  } else {
    console.info(
      `info: Skipping mksnapshot re-download on ${process.platform}-${process.arch} ` +
        '(host cannot run electron-mksnapshot).\n'
    );
  }
} else {
  console.info(
    'info: env var "ELECTRON_CUSTOM_VERSION" is already set correctly.\n(No need to re-download chromedriver or mksnapshot). Skipping.\n'
  );
}
