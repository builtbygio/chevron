'use strict';

const fs = require('fs-extra');
const glob = require('glob');
const path = require('path');

const CONFIG = require('../config');

module.exports = function() {
  if (process.platform === 'win32') {
    console.log(
      'Skipping symbol dumping because minidump is not supported on Windows'
        .gray
    );
    return Promise.resolve();
  } else {
    console.log(`Dumping symbols in ${CONFIG.symbolsPath}`);
    const binaryPaths = glob.sync(
      path.join(CONFIG.intermediateAppPath, 'node_modules', '**', '*.node')
    );
    return Promise.all(binaryPaths.map(dumpSymbol));
  }
};

function isForeignPlatformBinary(binaryPath) {
  // prebuild-install layout: .../prebuilds/<platform>-<arch>/*.node
  const match = binaryPath.match(
    /[/\\]prebuilds[/\\]([^/\\]+)[/\\][^/\\]+\.node$/i
  );
  if (!match) {
    return false;
  }
  const tag = match[1].toLowerCase(); // e.g. darwin-x64, win32-ia32, linux-arm64
  const platform = process.platform.toLowerCase();
  // Accept tags that start with the current platform (darwin, linux, win32)
  return tag.indexOf(platform) !== 0;
}

function dumpSymbol(binaryPath) {
  const minidump = require('minidump');

  return new Promise(function(resolve, reject) {
    // AtomNova: nested deps (e.g. leveldown under github) ship multi-platform
    // prebuilds; minidump only understands the host Mach-O/ELF format.
    if (isForeignPlatformBinary(binaryPath)) {
      return resolve();
    }

    minidump.dumpSymbol(binaryPath, function(error, content) {
      if (error) {
        // fswin.node is only used on windows, ignore the error on other platforms
        if (process.platform !== 'win32' && binaryPath.match(/fswin.node/))
          return resolve();
        // Soft-fail other unloadable binaries (wrong arch, corrupted, etc.)
        console.warn(
          `Skipping symbols for ${path.relative(
            CONFIG.intermediateAppPath,
            binaryPath
          )}: ${error}`
        );
        return resolve();
      } else {
        const moduleLine = /MODULE [^ ]+ [^ ]+ ([0-9A-F]+) (.*)\n/.exec(
          content
        );
        if (moduleLine.length !== 3) {
          const errorMessage = `Invalid output when dumping symbol for ${binaryPath}`;
          console.error(errorMessage);
          throw new Error(errorMessage);
        } else {
          const filename = moduleLine[2];
          const symbolDirPath = path.join(
            CONFIG.symbolsPath,
            filename,
            moduleLine[1]
          );
          const symbolFilePath = path.join(symbolDirPath, `${filename}.sym`);
          fs.mkdirpSync(symbolDirPath);
          fs.writeFileSync(symbolFilePath, content);
          resolve();
        }
      }
    });
  });
}
