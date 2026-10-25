module.exports = {
  updateError() {
    chevron.autoUpdater.emitter.emit('update-error');
  },

  checkForUpdate() {
    chevron.autoUpdater.emitter.emit('did-begin-checking-for-update');
  },

  updateNotAvailable() {
    chevron.autoUpdater.emitter.emit('update-not-available');
  },

  downloadUpdate() {
    chevron.autoUpdater.emitter.emit('did-begin-downloading-update');
  },

  finishDownloadingUpdate(releaseVersion) {
    chevron.autoUpdater.emitter.emit('did-complete-downloading-update', {
      releaseVersion
    });
  }
};
