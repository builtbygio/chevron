// Load settings without electron.remote (IPC to main).
// Safe for the startup snapshot: only uses ipcRenderer at call time.
const rendererIpc = require('./renderer-ipc');

let windowLoadSettings = null;

module.exports = () => {
  if (!windowLoadSettings) {
    const json = rendererIpc.getLoadSettingsJSON();
    windowLoadSettings = JSON.parse(json || '{}');
  }
  return windowLoadSettings;
};
