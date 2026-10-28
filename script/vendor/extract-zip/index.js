'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

/**
 * Drop-in CJS wrapper for the Electron-hardened extractor.
 * electron-mksnapshot and @electron/packager 18 still `require('extract-zip')`
 * (CommonJS). The patched package is ESM-only, so load it via dynamic import.
 *
 * Resolve the real package from the script tree (direct dep) so nested
 * override installs still find it when this shim is copied without its
 * own node_modules.
 */
module.exports = async function extract(zipPath, opts = {}) {
  const dir = opts.dir;
  if (!dir || !path.isAbsolute(dir)) {
    throw new Error(
      'The "dir" option is required and must be an absolute path'
    );
  }

  const requireFromScript = createRequire(
    path.join(__dirname, '..', '..', 'package.json')
  );
  const entry = requireFromScript.resolve('@electron-internal/extract-zip');
  const mod = await import(pathToFileURL(entry).href);
  const extractZip = mod.default || mod.extract;
  return extractZip(zipPath, { dir });
};
