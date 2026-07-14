const { net, protocol } = require('electron');
const fs = require('fs-plus');
const path = require('path');
const { pathToFileURL } = require('url');

// Handles requests with 'atom' protocol.
//
// It's created by {AtomApplication} upon instantiation and is used to create a
// custom resource loader for 'atom://' URLs.
//
// The following directories are searched in order:
//   * ~/.atom/assets
//   * ~/.atom/dev/packages (unless in safe mode)
//   * ~/.atom/packages
//   * RESOURCE_PATH/node_modules
//
module.exports = class AtomProtocolHandler {
  constructor(resourcePath, safeMode) {
    this.loadPaths = [];

    if (!safeMode) {
      this.loadPaths.push(path.join(process.env.ATOM_HOME, 'dev', 'packages'));
      this.loadPaths.push(path.join(resourcePath, 'packages'));
    }

    this.loadPaths.push(path.join(process.env.ATOM_HOME, 'packages'));
    this.loadPaths.push(path.join(resourcePath, 'node_modules'));

    this.registerAtomProtocol();
  }

  // Creates the 'atom' custom protocol handler.
  registerAtomProtocol() {
    if (typeof protocol.registerFileProtocol === 'function') {
      protocol.registerFileProtocol('atom', (request, callback) => {
        callback(this.resolveAtomUrl(request.url));
      });
    } else {
      // Electron 25+ replacement; registerFileProtocol was removed after
      // a long deprecation. Serve the resolved file via net.fetch.
      protocol.handle('atom', request => {
        const filePath = this.resolveAtomUrl(request.url);
        if (!filePath) return new Response('', { status: 404 });
        return net.fetch(pathToFileURL(filePath).toString());
      });
    }
  }

  resolveAtomUrl(url) {
    const relativePath = path.normalize(url.substr(7));

    let filePath;
    if (relativePath.indexOf('assets/') === 0) {
      const assetsPath = path.join(process.env.ATOM_HOME, relativePath);
      const stat = fs.statSyncNoException(assetsPath);
      if (stat && stat.isFile()) filePath = assetsPath;
    }

    if (!filePath) {
      for (let loadPath of this.loadPaths) {
        filePath = path.join(loadPath, relativePath);
        const stat = fs.statSyncNoException(filePath);
        if (stat && stat.isFile()) break;
      }
    }

    return filePath;
  }
};
