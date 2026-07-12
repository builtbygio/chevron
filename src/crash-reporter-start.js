module.exports = function(params) {
  const { crashReporter } = require('electron');
  const os = require('os');
  const platformRelease = os.release();
  const arch = os.arch();
  const { releaseChannel } = params;

  // Local crash reporting only — never submit to atom.io or other endpoints.
  // submitURL is required by Electron but unused when uploadToServer is false.
  crashReporter.start({
    productName: 'AtomNova',
    companyName: 'AtomNova',
    submitURL: 'https://127.0.0.1/atomnova-crash-reports-disabled',
    uploadToServer: false,
    extra: { platformRelease, arch, releaseChannel }
  });
};
