const { net, protocol } = require('electron');
const fs = require('fs-plus');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  pathContained,
  relativePathFromAtomUrl
} = require('./atom-protocol-path');

// Handles requests with the 'atom' and 'chevron' protocols.
//
// It's created by {AtomApplication} upon instantiation and is used to create a
// custom resource loader for 'atom://' and 'chevron://' URLs (same search paths).
//
// The following directories are searched in order:
//   * $ATOM_HOME/assets  (config home; may be ~/.atom or ~/.chevron)
//   * $ATOM_HOME/dev/packages (unless in safe mode)
//   * $ATOM_HOME/packages
//   * RESOURCE_PATH/node_modules
//
// Security (Electron BP P0.1): resolved files must stay under the chosen root.
// Traversal via atom://../../… must not escape package/asset trees.

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

  // Register both product schemes; packages still use atom:// as the public API.
  registerAtomProtocol() {
    for (const scheme of ['atom', 'chevron']) {
      this.registerScheme(scheme);
    }
  }

  registerScheme(scheme) {
    if (typeof protocol.registerFileProtocol === 'function') {
      protocol.registerFileProtocol(scheme, (request, callback) => {
        callback(this.resolveAtomUrl(request.url));
      });
    } else {
      // Electron 25+ replacement; registerFileProtocol was removed after
      // a long deprecation. Serve the resolved file via net.fetch.
      protocol.handle(scheme, request => {
        const filePath = this.resolveAtomUrl(request.url);
        if (!filePath) return new Response('', { status: 404 });
        return net.fetch(pathToFileURL(filePath).toString());
      });
    }
  }

  resolveAtomUrl(url) {
    const relativePath = relativePathFromAtomUrl(url);
    if (!relativePath) return undefined;

    const atomHome = process.env.ATOM_HOME;
    if (!atomHome) return undefined;

    // assets/* only under $ATOM_HOME/assets
    if (
      relativePath === 'assets' ||
      relativePath.startsWith('assets' + path.sep)
    ) {
      const assetsRoot = path.resolve(atomHome, 'assets');
      const assetsPath = path.resolve(atomHome, relativePath);
      if (pathContained(assetsRoot, assetsPath)) {
        const stat = fs.statSyncNoException(assetsPath);
        if (stat && stat.isFile()) return assetsPath;
      }
      return undefined;
    }

    for (const loadPath of this.loadPaths) {
      if (!loadPath) continue;
      const root = path.resolve(loadPath);
      const candidate = path.resolve(root, relativePath);
      if (!pathContained(root, candidate)) continue;
      const stat = fs.statSyncNoException(candidate);
      if (stat && stat.isFile()) return candidate;
    }

    return undefined;
  }
};

// Re-export helpers for tests / tooling.
module.exports.pathContained = pathContained;
module.exports.relativePathFromAtomUrl = relativePathFromAtomUrl;
