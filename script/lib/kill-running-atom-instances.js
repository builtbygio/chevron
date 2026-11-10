const { execFileSync } = require('child_process');

const CONFIG = require('../config.js');

module.exports = function() {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/F', '/IM', CONFIG.executableName], {
        stdio: 'ignore'
      });
    } else {
      execFileSync('pkill', ['-9', CONFIG.appMetadata.productName], {
        stdio: 'ignore'
      });
    }
  } catch (error) {
    // Nothing to kill, or the tool is not installed.
  }
};
