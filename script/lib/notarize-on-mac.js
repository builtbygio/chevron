const notarize = require('electron-notarize').notarize;

module.exports = async function(packagedAppPath) {
  const appBundleId = 'dev.builtbygio.chevron';
  const appleId = process.env.AC_USER;
  const appleIdPassword = process.env.AC_PASSWORD;
  console.log(`Notarizing application at ${packagedAppPath}`);
  try {
    await notarize({
      appBundleId: appBundleId,
      appPath: packagedAppPath,
      appleId: appleId,
      appleIdPassword: appleIdPassword
    });
  } catch (e) {
    throw new Error(e);
  }
};
