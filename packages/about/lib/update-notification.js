// Announces an update once per version: "ready, installs on restart" when it
// has been downloaded (in-app mode), or "available" with a link to the release
// page when this build updates through it (unsigned macOS, Linux packages).

// The local storage key for the last version announced. Shared by every window,
// so a second window does not announce it again.
const NotifiedUpdateVersion = 'about:version-notified';

function notifyUpdate(details, { notifications, storage, restartAndInstall, openExternal }) {
  const version = details && details.releaseVersion;
  if (!version) return null;
  if (storage.getItem(NotifiedUpdateVersion) === version) return null;
  storage.setItem(NotifiedUpdateVersion, version);
  // A manual check's dialog has already said it.
  if (details.alreadyShown) return null;

  let notification;
  if (details.installable) {
    notification = notifications.addInfo(`Chevron ${version} is ready to install`, {
      description: 'It has been downloaded and installs the next time Chevron restarts.',
      dismissable: true,
      buttons: [
        {
          text: 'Restart now',
          onDidClick: () => {
            notification.dismiss();
            restartAndInstall();
          }
        },
        { text: 'Later', onDidClick: () => notification.dismiss() }
      ]
    });
  } else {
    notification = notifications.addInfo(`Chevron ${version} is available`, {
      description: 'This build updates from the release page.',
      dismissable: true,
      buttons: [
        {
          text: 'Open release page',
          onDidClick: () => {
            notification.dismiss();
            openExternal(details.releasePageUrl);
          }
        },
        { text: 'Later', onDidClick: () => notification.dismiss() }
      ]
    });
  }
  return notification;
}

module.exports = { notifyUpdate, NotifiedUpdateVersion };
