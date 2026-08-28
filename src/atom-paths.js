const fs = require('fs-plus');
const path = require('path');

const hasWriteAccess = dir => {
  const testFilePath = path.join(dir, 'write.test');
  try {
    fs.writeFileSync(testFilePath, new Date().toISOString(), { flag: 'w+' });
    fs.unlinkSync(testFilePath);
    return true;
  } catch (err) {
    return false;
  }
};

const getAppDirectory = () => {
  switch (process.platform) {
    case 'darwin':
      return process.execPath.substring(
        0,
        process.execPath.indexOf('.app') + 4
      );
    case 'linux':
    case 'win32':
      return path.join(process.execPath, '..');
  }
};

/**
 * Resolve the config home directory (Chevron-only product policy).
 *
 *   1. CHEVRON_HOME (explicit)
 *   2. ATOM_HOME (explicit legacy override only — unsupported)
 *   3. Portable sibling `.chevron` next to the app (if writable)
 *   4. ~/.chevron (default)
 *
 * Does **not** default to ~/.atom. Existing Atom homes are used only if the
 * user sets ATOM_HOME (or migrates data into ~/.chevron themselves).
 */
function resolveConfigHome(homePath) {
  if (process.env.CHEVRON_HOME) {
    return process.env.CHEVRON_HOME;
  }
  if (process.env.ATOM_HOME) {
    return process.env.ATOM_HOME;
  }

  const appDir = getAppDirectory();
  if (appDir) {
    const portableHomePath = path.join(appDir, '..', '.chevron');
    if (fs.existsSync(portableHomePath)) {
      if (hasWriteAccess(portableHomePath)) {
        return portableHomePath;
      }
      console.log(
        `Insufficient permission to portable home "${portableHomePath}".`
      );
    }
  }

  return path.join(homePath, '.chevron');
}

module.exports = {
  setAtomHome: homePath => {
    const resolved = resolveConfigHome(homePath);
    // CHEVRON_HOME is the product home; ATOM_HOME is a legacy mirror for
    // internal code paths that still read process.env.ATOM_HOME.
    process.env.CHEVRON_HOME = resolved;
    process.env.ATOM_HOME = resolved;
  },

  resolveConfigHome,

  setUserData: app => {
    const home = process.env.CHEVRON_HOME || process.env.ATOM_HOME;
    const electronUserDataPath = path.join(home, 'electronUserData');
    if (fs.existsSync(electronUserDataPath)) {
      if (hasWriteAccess(electronUserDataPath)) {
        app.setPath('userData', electronUserDataPath);
      } else {
        console.log(
          `Insufficient permission to Electron user data "${electronUserDataPath}".`
        );
      }
    }
  },

  getAppDirectory: getAppDirectory,

  /**
   * App package URIs. `chevron://` is the only product scheme; the `atom://`
   * alias was removed in Wave 4. Kept as a no-op normalizer so callers that
   * pass a URI through do not need to change.
   */
  normalizeAppUri: uri => uri,

  isAppUri: uri => typeof uri === 'string' && uri.startsWith('chevron://')
};
