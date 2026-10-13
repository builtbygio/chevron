const { net, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  pathContained,
  relativePathFromAtomUrl
} = require('./atom-protocol-path');

// Handles requests with the 'chevron' protocol.
//
// It's created by {AtomApplication} upon instantiation and is used to create a
// custom resource loader for 'chevron://' URLs.
//
// The following directories are searched in order:
//   * $ATOM_HOME/assets  (config home; may be ~/.atom or ~/.chevron)
//   * $ATOM_HOME/dev/packages (unless in safe mode)
//   * $ATOM_HOME/packages
//   * RESOURCE_PATH/node_modules
//
// Security (Electron BP P0.1): resolved files must stay under the chosen root.
// Traversal via chevron://../../… must not escape package/asset trees.

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

  // chevron:// is the only product scheme (the atom:// alias went in Wave 4).
  registerAtomProtocol() {
    this.registerScheme('chevron');
  }

  // Not protocol.registerFileProtocol: deprecated since Electron 25 yet still
  // present, so a feature check that prefers it never reaches protocol.handle.
  registerScheme(scheme) {
    protocol.handle(scheme, request => {
      const filePath = this.resolveAtomUrl(request.url);
      if (!filePath) return new Response('', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    });
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
      if (
        pathContained(assetsRoot, assetsPath) &&
        isFile(assetsPath, assetsRoot)
      ) {
        return assetsPath;
      }
      return undefined;
    }

    for (const loadPath of this.loadPaths) {
      if (!loadPath) continue;
      const root = path.resolve(loadPath);
      const candidate = path.resolve(root, relativePath);
      if (!pathContained(root, candidate)) continue;
      if (isFile(candidate, packageDirectory(root, relativePath))) {
        return candidate;
      }
    }

    return undefined;
  }
};

// The boundary is the package, not the load path: `cpm link` installs a
// package as a symlink to its source, and a dev checkout's node_modules
// entries are symlinks into packages/, so only a link *inside* a package is
// an escape.
function packageDirectory(root, relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.length === 1) return root;
  const depth = parts[0].startsWith('@') && parts.length > 2 ? 2 : 1;
  return path.join(root, ...parts.slice(0, depth));
}

function isFile(filePath, boundary) {
  try {
    return (
      fs.statSync(filePath).isFile() &&
      pathContained(fs.realpathSync(boundary), fs.realpathSync(filePath))
    );
  } catch (error) {
    return false;
  }
}

// Re-export helpers for tests / tooling.
module.exports.pathContained = pathContained;
module.exports.relativePathFromAtomUrl = relativePathFromAtomUrl;
